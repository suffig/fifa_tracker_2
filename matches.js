import { showModal, hideModal } from './modal.js';
import { decrementBansAfterMatch } from './bans.js';
import { supabase } from './supabaseClient.js';

// Globale Daten
let matches = [];
let aekAthen = [];
let realMadrid = [];
let bans = [];
let finances = {
    aekAthen: { balance: 0 },
    realMadrid: { balance: 0 }
};
let spielerDesSpiels = [];
let transactions = [];
let matchesInitialized = false;

// Hilfsfunktion: App-Matchnummer (laufende Nummer, wie Übersicht)
export function getAppMatchNumber(matchId) {
    // matches ist absteigend sortiert (neueste zuerst)
    const idx = matches.findIndex(m => m.id === matchId);
    return idx >= 0 ? matches.length - idx : null;
}

async function loadAllData(renderFn = renderMatchesList) {
    const { data: matchesData } = await supabase.from('matches').select('*').order('id', { ascending: false });
    matches = matchesData || [];
    const { data: players } = await supabase.from('players').select('*');
    aekAthen = players ? players.filter(p => p.team === "AEK") : [];
    realMadrid = players ? players.filter(p => p.team === "Real") : [];
    const { data: bansData } = await supabase.from('bans').select('*');
    bans = bansData || [];
    const { data: finData } = await supabase.from('finances').select('*');
    finances = {
        aekAthen: finData?.find(f => f.team === "AEK") || { balance: 0 },
        realMadrid: finData?.find(f => f.team === "Real") || { balance: 0 }
    };
    const { data: sdsData } = await supabase.from('spieler_des_spiels').select('*');
    spielerDesSpiels = sdsData || [];
    const { data: transData } = await supabase.from('transactions').select('*').order('id', { ascending: false });
    transactions = transData || [];
    renderFn();
}

export function renderMatchesTab(containerId = "app") {
	console.log("renderMatchesTab aufgerufen!", { containerId });
    const app = document.getElementById(containerId);
    app.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:justify-between mb-4 gap-2">
            <h2 class="text-lg font-semibold">Matches</h2>
            <button id="add-match-btn" class="bg-green-600 text-white w-full sm:w-auto px-4 py-2 rounded-lg text-base flex items-center justify-center gap-2 active:scale-95 transition">
                <i class="fas fa-plus"></i> <span>Match hinzufügen</span>
            </button>
        </div>
        <div id="matches-list" class="space-y-3"></div>
    `;
    document.getElementById("add-match-btn").onclick = () => openMatchForm();
    loadAllData(renderMatchesList);
}

let matchesChannel;
function subscribeMatches(renderFn = renderMatchesList) {
    if (matchesChannel) return;
    matchesChannel = supabase
        .channel('matches_live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => loadAllData(renderFn))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'spieler_des_spiels' }, () => loadAllData(renderFn))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'finances' }, () => loadAllData(renderFn))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => loadAllData(renderFn))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => loadAllData(renderFn))
        .subscribe();
}

let matchViewDate = new Date().toISOString().slice(0, 10); // Standard: heute

function renderMatchesList() {
    const container = document.getElementById('matches-list');
    if (!container) {
        console.warn("Element #matches-list nicht gefunden!");
        return;
    }
    if (!matches.length) {
        container.innerHTML = `<div class="text-gray-400 text-sm">Noch keine Matches eingetragen.</div>`;
        return;
    }

    // Alle Daten nach Datum gruppieren
    const uniqueDates = [...new Set(matches.map(m => m.date))].sort((a, b) => b.localeCompare(a));
    // matchViewDate initialisieren, falls leer
    if (!matchViewDate && uniqueDates.length) matchViewDate = uniqueDates[0];

    // Nur Matches des aktuellen Tages anzeigen
    const filteredMatches = matches.filter(m => m.date === matchViewDate);

    // Überschrift mit Datum, schön formatiert
    let dateStr = matchViewDate ? matchViewDate.split('-').reverse().join('.') : '';
    let html = `<div class="text-center font-semibold text-base mb-2">Spiele am <span class="text-sky-700 dark:text-sky-400">${dateStr}</span></div>`;

    if (!filteredMatches.length) {
        html += `<div class="text-gray-400 text-sm">Keine Spiele für diesen Tag.</div>`;
    } else {
        html += filteredMatches.map(match => {
            // Durchgehende Nummerierung, unabhängig vom Tag!
            const nr = matches.length - matches.findIndex(m => m.id === match.id);
            return matchHtml(match, nr);
        }).join('');
    }

    // Navigation Buttons
    let navHtml = `<div class="flex gap-2 justify-center mt-4">`;
    const currIdx = uniqueDates.indexOf(matchViewDate);
    if (currIdx < uniqueDates.length - 1) {
        navHtml += `<button id="older-matches-btn" class="bg-gray-300 dark:bg-gray-700 px-4 py-2 rounded-lg font-semibold">Ältere Spiele anzeigen</button>`;
    }
    if (currIdx > 0) {
        navHtml += `<button id="newer-matches-btn" class="bg-gray-300 dark:bg-gray-700 px-4 py-2 rounded-lg font-semibold">Neuere Spiele anzeigen</button>`;
    }
    navHtml += `</div>`;
    container.innerHTML = html + navHtml;

    // Button-Handler für Seitenwechsel
    if (currIdx < uniqueDates.length - 1) {
        document.getElementById('older-matches-btn').onclick = () => {
            matchViewDate = uniqueDates[currIdx + 1];
            renderMatchesList();
        };
    }
    if (currIdx > 0) {
        document.getElementById('newer-matches-btn').onclick = () => {
            matchViewDate = uniqueDates[currIdx - 1];
            renderMatchesList();
        };
    }

    document.querySelectorAll('.edit-match-btn').forEach(btn => {
        btn.onclick = () => openMatchForm(parseInt(btn.getAttribute('data-id')));
    });
    document.querySelectorAll('.delete-match-btn').forEach(btn => {
        btn.onclick = () => deleteMatch(parseInt(btn.getAttribute('data-id')));
    });
}

function matchHtml(match, nr) {
    function goalsHtml(goals) {
        if (!goals || !goals.length) return `<span class="text-gray-400 text-xs">(keine Torschützen)</span>`;
        return goals
            .map(g => `<span class="inline-block bg-gray-100 rounded px-2 mx-0.5">${g.player} (${g.count})</span>`)
            .join('');
    }
    function prizeHtml(amount, team) {
        const isPos = amount >= 0;
        const tClass = team === "AEK" ? "bg-blue-100" : "bg-red-100";
        const color = isPos ? "text-green-700" : "text-red-700";
        return `<span class="inline-block px-2 rounded ${tClass} ${color} font-bold">${isPos ? '+' : ''}${amount.toLocaleString('de-DE')} €</span>`;
    }
    return `
    <div class="bg-white border rounded-lg p-2 mt-1">
      <div class="flex justify-between items-center mb-1">
        <div>
          <span class="font-bold">#${nr} ${match.date}:</span>
          <span>${match.teama} <b>${match.goalsa}</b> : <b>${match.goalsb}</b> ${match.teamb}</span>
        </div>
        <div class="flex gap-2">
          <button class="edit-match-btn bg-blue-500 text-white px-3 py-1 rounded-md text-sm flex items-center justify-center active:scale-95 transition" title="Bearbeiten" data-id="${match.id}">
            <i class="fas fa-edit"></i>
          </button>
          <button class="delete-match-btn bg-red-500 text-white px-3 py-1 rounded-md text-sm flex items-center justify-center active:scale-95 transition" title="Löschen" data-id="${match.id}">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      <div class="text-xs mb-1">
        <b>${match.teama} Torschützen:</b> ${goalsHtml(match.goalslista || [])}
      </div>
      <div class="text-xs mb-1">
        <b>${match.teamb} Torschützen:</b> ${goalsHtml(match.goalslistb || [])}
      </div>
      <div class="text-xs">
        <b>${match.teama} Karten:</b> <span class="inline-block bg-yellow-100 text-yellow-800 rounded px-2 mx-0.5 text-xs">Gelb: ${match.yellowa || 0}</span>
        <span class="inline-block bg-red-100 text-red-800 rounded px-2 mx-0.5 text-xs">Rot: ${match.reda || 0}</span>
      </div>
      <div class="text-xs">
        <b>${match.teamb} Karten:</b> <span class="inline-block bg-yellow-100 text-yellow-800 rounded px-2 mx-0.5 text-xs">Gelb: ${match.yellowb || 0}</span>
        <span class="inline-block bg-red-100 text-red-800 rounded px-2 mx-0.5 text-xs">Rot: ${match.redb || 0}</span>
      </div>
      <div class="text-xs mt-2">
        <b>Preisgelder:</b>
        ${prizeHtml(match.prizeaek ?? 0, "AEK")}
        ${prizeHtml(match.prizereal ?? 0, "Real")}
      </div>
      <div class="text-xs mt-1">
        <b>Spieler des Spiels:</b> ${match.manofthematch ? match.manofthematch : '<span class="text-gray-400">-</span>'}
      </div>
    </div>
    `;
}

// --- MODERNES, KOMPAKTES POPUP, ABER MIT ALLER ALTER LOGIK ---
function openMatchForm(id) {
    let match = null, edit = false;
    if (typeof id === "number") {
        match = matches.find(m => m.id === id);
        edit = !!match;
    }

    // Spieler-Optionen SORTIERT nach Toren (goals, absteigend)
    const aekSorted = aekAthen.slice().sort((a, b) => (b.goals || 0) - (a.goals || 0));
    const realSorted = realMadrid.slice().sort((a, b) => (b.goals || 0) - (a.goals || 0));
    const aekSpieler = aekSorted.map(p => `<option value="${p.name}">${p.name} (${p.goals || 0} Tore)</option>`).join('');
    const realSpieler = realSorted.map(p => `<option value="${p.name}">${p.name} (${p.goals || 0} Tore)</option>`).join('');
    const goalsListA = match?.goalslista || [];
    const goalsListB = match?.goalslistb || [];
    const manofthematch = match?.manofthematch || "";
    const dateVal = match ? match.date : (new Date()).toISOString().slice(0,10);

    // NEUES DESIGN für oberen Teil (Datum + Teams + Tore), inkl. schönerer "Torschützen hinzufügen"-Button
    showModal(`
    <form id="match-form" class="space-y-4 px-2 max-w-[420px] mx-auto bg-white dark:bg-gray-900 dark:text-gray-100 rounded-2xl shadow-lg py-6 relative w-full" style="max-width:98vw;">
        <h3 class="font-bold text-lg mb-2 text-center">${edit ? "Match bearbeiten" : "Match hinzufügen"}</h3>
        <div class="flex flex-col gap-3 items-center mb-2">
            <div class="flex flex-row items-center gap-2 w-full justify-center">
                <button type="button" id="show-date" class="flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-sky-600 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none" tabindex="0">
                    <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                    <span id="date-label">${dateVal.split('-').reverse().join('.')}</span>
                </button>
                <input type="date" name="date" id="date-input" class="hidden" value="${dateVal}">
            </div>
            <div class="flex flex-row items-center gap-3 w-full justify-center">
                <div class="flex flex-col items-center">
                    <span class="font-bold text-blue-700 text-base">AEK</span>
                </div>
                <input type="number" min="0" name="goalsa" class="border rounded-lg p-3 w-16 text-center text-base focus:ring-2 focus:ring-sky-500" required placeholder="Tore" value="${match ? match.goalsa : ""}">
                <span class="font-bold text-lg">:</span>
                <input type="number" min="0" name="goalsb" class="border rounded-lg p-3 w-16 text-center text-base focus:ring-2 focus:ring-sky-500" required placeholder="Tore" value="${match ? match.goalsb : ""}">
                <div class="flex flex-col items-center">
                    <span class="font-bold text-red-700 text-base">Real</span>
                </div>
            </div>
        </div>
        <!-- AB HIER UNTERER TEIL -->
        <div id="scorersA-block" class="bg-blue-50 p-2 rounded">
            <b>Torschützen AEK</b>
            <div id="scorersA">
                ${scorerFields("goalslista", goalsListA, aekSpieler)}
            </div>
            <button type="button" id="addScorerA" class="w-full mt-2 flex items-center justify-center gap-2 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-black font-semibold py-2 px-4 rounded-lg text-base shadow transition active:scale-95">
                <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                <span>Torschütze hinzufügen</span>
            </button>
        </div>
        <div id="scorersB-block" class="bg-red-50 p-2 rounded">
            <b>Torschützen Real</b>
            <div id="scorersB">
                ${scorerFields("goalslistb", goalsListB, realSpieler)}
            </div>
            <button type="button" id="addScorerB" class="w-full mt-2 flex items-center justify-center gap-2 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-black font-semibold py-2 px-4 rounded-lg text-base shadow transition active:scale-95">
                <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                <span>Torschütze hinzufügen</span>
            </button>
        </div>
        <div class="bg-blue-50 p-2 rounded">
            <b>Karten AEK</b>
            <div class="flex space-x-2 items-center mb-1">
                <label>🟨</label>
                <input type="number" min="0" name="yellowa" class="border rounded-lg p-2 w-16 h-10 text-base" value="${match?.yellowa || 0}">
                <label>🟥</label>
                <input type="number" min="0" name="reda" class="border rounded-lg p-2 w-16 h-10 text-base" value="${match?.reda || 0}">
            </div>
        </div>
        <div class="bg-red-50 p-2 rounded">
            <b>Karten Real</b>
            <div class="flex space-x-2 items-center mb-1">
                <label>🟨</label>
                <input type="number" min="0" name="yellowb" class="border rounded-lg p-2 w-16 h-10 text-base" value="${match?.yellowb || 0}">
                <label>🟥</label>
                <input type="number" min="0" name="redb" class="border rounded-lg p-2 w-16 h-10 text-base" value="${match?.redb || 0}">
            </div>
        </div>
        <div>
            <label class="font-semibold">Spieler des Spiels (SdS):</label>
            <select name="manofthematch" class="border rounded-lg p-3 w-full h-12 text-base">
                <option value="">Keiner</option>
                ${aekSorted.map(p => `<option value="${p.name}"${manofthematch===p.name?' selected':''}>${p.name} (AEK)</option>`).join('')}
                ${realSorted.map(p => `<option value="${p.name}"${manofthematch===p.name?' selected':''}>${p.name} (Real)</option>`).join('')}
            </select>
        </div>
        <div class="flex gap-2">
            <button type="submit" class="bg-green-600 text-white w-full px-4 py-2 rounded-lg text-base active:scale-95 transition">${edit ? "Speichern" : "Anlegen"}</button>
            <button type="button" class="bg-gray-300 w-full px-4 py-2 rounded-lg text-base" onclick="window.hideModal()">Abbrechen</button>
        </div>
    </form>
    `);

    // Datum-Show/Hide (wie gehabt)
    document.getElementById('show-date').onclick = function() {
        document.getElementById('date-input').classList.toggle('hidden');
        document.getElementById('date-input').focus();
    };
    document.getElementById('date-input').onchange = function() {
        document.getElementById('date-label').innerText = this.value.split('-').reverse().join('.');
        this.classList.add('hidden');
    };

    // --- Restliche Logik ---
    function addScorerHandler(scorersId, name, spielerOpts) {
        const container = document.getElementById(scorersId);
        const div = document.createElement("div");
        div.className = "flex space-x-2 mb-1 scorer-row";
        div.innerHTML = `
            <select name="${name}-player" class="border rounded-lg p-2 h-10 text-base" style="min-width:100px;">
                <option value="">Spieler</option>
                ${spielerOpts}
            </select>
            <input type="number" min="1" name="${name}-count" placeholder="Tore" class="border rounded-lg p-2 w-16 h-10 text-base" value="1">
            <button type="button" class="remove-goal-btn bg-red-200 text-red-700 px-2 rounded" title="Entfernen">-</button>
        `;
        div.querySelector('.remove-goal-btn').onclick = function() {
            if(container.querySelectorAll('.scorer-row').length > 1)
                div.remove();
        };
        container.appendChild(div);
    }
    document.querySelectorAll("#scorersA .remove-goal-btn").forEach(btn => {
        btn.onclick = function() {
            const parent = document.getElementById('scorersA');
            if(parent.querySelectorAll('.scorer-row').length > 1)
                btn.closest('.scorer-row').remove();
        };
    });
    document.querySelectorAll("#scorersB .remove-goal-btn").forEach(btn => {
        btn.onclick = function() {
            const parent = document.getElementById('scorersB');
            if(parent.querySelectorAll('.scorer-row').length > 1)
                btn.closest('.scorer-row').remove();
        };
    });
    document.getElementById("addScorerA").onclick = () => addScorerHandler("scorersA", "goalslista", aekSpieler);
    document.getElementById("addScorerB").onclick = () => addScorerHandler("scorersB", "goalslistb", realSpieler);

    function toggleScorerFields() {
        const goalsA = parseInt(document.querySelector('input[name="goalsa"]').value) || 0;
        const goalsB = parseInt(document.querySelector('input[name="goalsb"]').value) || 0;
        const scorersABlock = document.getElementById('scorersA-block');
        const scorersBBlock = document.getElementById('scorersB-block');
        scorersABlock.style.display = goalsA > 0 ? '' : 'none';
        scorersBBlock.style.display = goalsB > 0 ? '' : 'none';
    }
    document.querySelector('input[name="goalsa"]').addEventListener('input', toggleScorerFields);
    document.querySelector('input[name="goalsb"]').addEventListener('input', toggleScorerFields);
    toggleScorerFields();

    document.getElementById("match-form").onsubmit = (e) => submitMatchForm(e, id);
}

function scorerFields(name, arr, spielerOpts) {
    if (!arr.length) arr = [{ player: "", count: 1 }];
    return arr.map((g, i) => `
        <div class="flex space-x-2 mb-1 scorer-row">
            <select name="${name}-player" class="border rounded-lg p-2 h-10 text-base" style="min-width:100px;">
                <option value="">Spieler</option>
                ${spielerOpts.replace(`value="${g.player}"`, `value="${g.player}" selected`)}
            </select>
            <input type="number" min="1" name="${name}-count" placeholder="Tore" class="border rounded-lg p-2 w-16 h-10 text-base" value="${g.count||1}">
            <button type="button" class="remove-goal-btn bg-red-200 text-red-700 px-2 rounded" title="Entfernen" ${arr.length===1 ? 'disabled' : ''}>-</button>
        </div>
    `).join('');
}

async function updatePlayersGoals(goalslist, team) {
    for (const scorer of goalslist) {
        if (!scorer.player) continue;
        // Spieler laden, aktueller Stand
        const { data: player } = await supabase.from('players').select('goals').eq('name', scorer.player).eq('team', team).single();
        let newGoals = scorer.count;
        if (player && typeof player.goals === 'number') {
            newGoals = player.goals + scorer.count;
        }
        await supabase.from('players').update({ goals: newGoals }).eq('name', scorer.player).eq('team', team);
    }
}

async function submitMatchForm(event, id) {
    event.preventDefault();
    const form = event.target;
    const date = form.date.value;
    const teama = "AEK";
    const teamb = "Real";
    const goalsa = parseInt(form.goalsa.value);
    const goalsb = parseInt(form.goalsb.value);
    const yellowa = parseInt(form.yellowa.value) || 0;
    const reda = parseInt(form.reda.value) || 0;
    const yellowb = parseInt(form.yellowb.value) || 0;
    const redb = parseInt(form.redb.value) || 0;
    const manofthematch = form.manofthematch.value || "";

    function getScorers(group, name) {
        return Array.from(group.querySelectorAll('.scorer-row')).map(d => ({
            player: d.querySelector(`select[name="${name}-player"]`).value,
            count: parseInt(d.querySelector(`input[name="${name}-count"]`).value) || 1
        })).filter(g => g.player);
    }

    let goalslista = [];
    let goalslistb = [];
    if (goalsa > 0) {
        const groupA = form.querySelector("#scorersA");
        goalslista = getScorers(groupA, "goalslista");
        const sumA = goalslista.reduce((sum, g) => sum + (g.count || 0), 0);
        if (sumA > goalsa) {
            alert(`Die Summe der Torschützen-Tore für ${teama} (${sumA}) darf nicht größer als die Gesamtanzahl der Tore (${goalsa}) sein!`);
            return;
        }
    }
    if (goalsb > 0) {
        const groupB = form.querySelector("#scorersB");
        goalslistb = getScorers(groupB, "goalslistb");
        const sumB = goalslistb.reduce((sum, g) => sum + (g.count || 0), 0);
        if (sumB > goalsb) {
            alert(`Die Summe der Torschützen-Tore für ${teamb} (${sumB}) darf nicht größer als die Gesamtanzahl der Tore (${goalsb}) sein!`);
            return;
        }
    }

    // Preisgeld-Berechnung
    let prizeaek = 0, prizereal = 0;
    let winner = null, loser = null;
    if (goalsa > goalsb) { winner = "AEK"; loser = "Real"; }
    else if (goalsa < goalsb) { winner = "Real"; loser = "AEK"; }

    if (winner && loser) {
        if (winner === "AEK") {
            prizeaek = 1000000 - (goalsb*50000) - (yellowa*20000) - (reda*50000);
            prizereal = - (500000 + goalsa*50000 + yellowb*20000 + redb*50000);
        } else {
            prizereal = 1000000 - (goalsa*50000) - (yellowb*20000) - (redb*50000);
            prizeaek = - (500000 + goalsb*50000 + yellowa*20000 + reda*50000);
        }
    }
    // SdS Bonus
    let sdsBonusAek = 0, sdsBonusReal = 0;
    if (manofthematch) {
        if (aekAthen.find(p => p.name === manofthematch)) sdsBonusAek = 100000;
        if (realMadrid.find(p => p.name === manofthematch)) sdsBonusReal = 100000;
    }

    // Spieler des Spiels-Statistik (Tabelle spieler_des_spiels)
    if (manofthematch) {
        let t = aekAthen.find(p => p.name === manofthematch) ? "AEK" : "Real";
        const { data: existing } = await supabase.from('spieler_des_spiels').select('*').eq('name', manofthematch).eq('team', t);
        if (existing && existing.length > 0) {
            await supabase.from('spieler_des_spiels').update({ count: existing[0].count + 1 }).eq('id', existing[0].id);
        } else {
            await supabase.from('spieler_des_spiels').insert([{ name: manofthematch, team: t, count: 1 }]);
        }
    }

    // Edit-Modus: Vorherigen Match löschen (und zugehörige Transaktionen an diesem Tag!)
    if (id && matches.find(m => m.id === id)) {
        const { data: matchOld } = await supabase.from('matches').select('date').eq('id', id).single();
        if (matchOld && matchOld.date) {
            await supabase.from('transactions').delete().or(`type.eq.Preisgeld,type.eq.Bonus SdS,type.eq.Echtgeld-Ausgleich`).eq('date', matchOld.date);
        }
        await supabase.from('matches').delete().eq('id', id);
    }

    // Save Match (JSON für goalslista/goalslistb)
    const insertObj = {
        date,
        teama,
        teamb,
        goalsa,
        goalsb,
        goalslista,
        goalslistb,
        yellowa,
        reda,
        yellowb,
        redb,
        manofthematch,
        prizeaek,
        prizereal
    };

    // Insert Match und ID zurückgeben
    const { data: inserted, error } = await supabase
        .from('matches')
        .insert([insertObj])
        .select('id')
        .single();
    if (error) {
        alert('Fehler beim Insert: ' + error.message);
        console.error(error);
        return;
    }
    const matchId = inserted?.id;

    // Nach Insert: ALLE Daten laden (damit matches aktuell ist)
    await loadAllData(() => {});

    // Hole App-Matchnummer (laufende Nummer)
    const appMatchNr = getAppMatchNumber(matchId);

    // Spieler-Tore aufaddieren!
    if (goalsa > 0) await updatePlayersGoals(goalslista, "AEK");
    if (goalsb > 0) await updatePlayersGoals(goalslistb, "Real");

    await decrementBansAfterMatch();

    // Transaktionen buchen (Preisgelder & SdS Bonus, inkl. Finanzen update)
    const now = new Date().toISOString().slice(0,10);

    async function getTeamFinance(team) {
        const { data } = await supabase.from('finances').select('balance').eq('team', team).single();
        return (data && typeof data.balance === "number") ? data.balance : 0;
    }

    // Preisgelder buchen & neuen Kontostand berechnen (niemals unter 0)
    let aekOldBalance = await getTeamFinance("AEK");
    let realOldBalance = await getTeamFinance("Real");
    let aekNewBalance = aekOldBalance + (prizeaek || 0) + (sdsBonusAek || 0);
    let realNewBalance = realOldBalance + (prizereal || 0) + (sdsBonusReal || 0);

    // 1. SdS Bonus
    if (sdsBonusAek) {
        aekOldBalance += sdsBonusAek;
        await supabase.from('transactions').insert([{
            date: now,
            type: "Bonus SdS",
            team: "AEK",
            amount: sdsBonusAek,
            match_id: matchId,
            info: `Match #${appMatchNr}`
        }]);
        await supabase.from('finances').update({ balance: aekOldBalance }).eq('team', "AEK");
    }
    if (sdsBonusReal) {
        realOldBalance += sdsBonusReal;
        await supabase.from('transactions').insert([{
            date: now,
            type: "Bonus SdS",
            team: "Real",
            amount: sdsBonusReal,
            match_id: matchId,
            info: `Match #${appMatchNr}`
        }]);
        await supabase.from('finances').update({ balance: realOldBalance }).eq('team', "Real");
    }

    // 2. Preisgeld
    if (prizeaek !== 0) {
        aekOldBalance += prizeaek;
        if (aekOldBalance < 0) aekOldBalance = 0;
        await supabase.from('transactions').insert([{
            date: now,
            type: "Preisgeld",
            team: "AEK",
            amount: prizeaek,
            match_id: matchId,
            info: `Match #${appMatchNr}`
        }]);
        await supabase.from('finances').update({ balance: aekOldBalance }).eq('team', "AEK");
    }
    if (prizereal !== 0) {
        realOldBalance += prizereal;
        if (realOldBalance < 0) realOldBalance = 0;
        await supabase.from('transactions').insert([{
            date: now,
            type: "Preisgeld",
            team: "Real",
            amount: prizereal,
            match_id: matchId,
            info: `Match #${appMatchNr}`
        }]);
        await supabase.from('finances').update({ balance: realOldBalance }).eq('team', "Real");
    }

    // --- Berechne für beide Teams den Echtgeldbetrag nach deiner Formel ---
    function calcEchtgeldbetrag(balance, preisgeld, sdsBonus) {
        let konto = balance;
        if (sdsBonus) konto += 100000;
        let zwischenbetrag = (Math.abs(preisgeld) - konto) / 100000;
        if (zwischenbetrag < 0) zwischenbetrag = 0;
        return 5 + Math.round(zwischenbetrag);
    }

    if (winner && loser) {
        const debts = {
            AEK: finances.aekAthen.debt || 0,
            Real: finances.realMadrid.debt || 0,
        };
        const aekSds = manofthematch && aekAthen.find(p => p.name === manofthematch) ? 1 : 0;
        const realSds = manofthematch && realMadrid.find(p => p.name === manofthematch) ? 1 : 0;

        const aekBetrag = calcEchtgeldbetrag(aekOldBalance, prizeaek, aekSds);
        const realBetrag = calcEchtgeldbetrag(realOldBalance, prizereal, realSds);

        let gewinner = winner === "AEK" ? "AEK" : "Real";
        let verlierer = loser === "AEK" ? "AEK" : "Real";
        let gewinnerBetrag = gewinner === "AEK" ? aekBetrag : realBetrag;
        let verliererBetrag = verlierer === "AEK" ? aekBetrag : realBetrag;

        let gewinnerDebt = debts[gewinner];
        let verliererDebt = debts[verlierer];

        let verrechnet = Math.min(gewinnerDebt, verliererBetrag * 1);
        let neuerGewinnerDebt = Math.max(0, gewinnerDebt - verrechnet);
        let restVerliererBetrag = verliererBetrag * 1 - verrechnet;

        let neuerVerliererDebt = verliererDebt + Math.max(0, restVerliererBetrag);

        await supabase.from('finances').update({ debt: neuerGewinnerDebt }).eq('team', gewinner);

        if (restVerliererBetrag > 0) {
            await supabase.from('transactions').insert([{
                date: now,
                type: "Echtgeld-Ausgleich",
                team: verlierer,
                amount: Math.max(0, restVerliererBetrag),
                match_id: matchId,
                info: `Match #${appMatchNr}`
            }]);
            await supabase.from('finances').update({ debt: neuerVerliererDebt }).eq('team', verlierer);
        }

        if (verrechnet > 0) {
            await supabase.from('transactions').insert([{
                date: now,
                type: "Echtgeld-Ausgleich (getilgt)",
                team: gewinner,
                amount: -verrechnet,
                match_id: matchId,
                info: `Match #${appMatchNr}`
            }]);
        }
    }

    hideModal();
    // Kein manuelles Neuladen nötig – Live-Sync!
}

// ---------- DELETE ----------

async function deleteMatch(id) {
    // 1. Hole alle Infos des Matches
    const { data: match } = await supabase
        .from('matches')
        .select('date,prizeaek,prizereal,goalslista,goalslistb,manofthematch,yellowa,reda,yellowb,redb')
        .eq('id', id)
        .single();

    if (!match) return;

    // 2. Transaktionen zu diesem Match löschen (inkl. Echtgeld-Ausgleich)
    await supabase
        .from('transactions')
        .delete()
        .or(`type.eq.Preisgeld,type.eq.Bonus SdS,type.eq.Echtgeld-Ausgleich,type.eq.Echtgeld-Ausgleich (getilgt)`)
        .eq('match_id', id);

    // 3. Finanzen zurückrechnen (niemals unter 0!)
    if (typeof match.prizeaek === "number" && match.prizeaek !== 0) {
        const { data: aekFin } = await supabase.from('finances').select('balance').eq('team', 'AEK').single();
        let newBal = (aekFin?.balance || 0) - match.prizeaek;
        if (newBal < 0) newBal = 0;
        await supabase.from('finances').update({
            balance: newBal
        }).eq('team', 'AEK');
    }
    if (typeof match.prizereal === "number" && match.prizereal !== 0) {
        const { data: realFin } = await supabase.from('finances').select('balance').eq('team', 'Real').single();
        let newBal = (realFin?.balance || 0) - match.prizereal;
        if (newBal < 0) newBal = 0;
        await supabase.from('finances').update({
            balance: newBal
        }).eq('team', 'Real');
    }
    // Bonus SdS rückrechnen
    const { data: bonusTrans } = await supabase.from('transactions')
        .select('team,amount')
        .eq('match_id', id)
        .eq('type', 'Bonus SdS');
    if (bonusTrans) {
        for (const t of bonusTrans) {
            const { data: fin } = await supabase.from('finances').select('balance').eq('team', t.team).single();
            let newBal = (fin?.balance || 0) - t.amount;
            if (newBal < 0) newBal = 0;
            await supabase.from('finances').update({
                balance: newBal
            }).eq('team', t.team);
        }
    }

    // 4. Spieler-Tore abziehen
    const removeGoals = async (goalslist, team) => {
        if (!goalslist || !Array.isArray(goalslist)) return;
        for (const scorer of goalslist) {
            if (!scorer.player) continue;
            const { data: player } = await supabase.from('players').select('goals').eq('name', scorer.player).eq('team', team).single();
            let newGoals = (player?.goals || 0) - scorer.count;
            if (newGoals < 0) newGoals = 0;
            await supabase.from('players').update({ goals: newGoals }).eq('name', scorer.player).eq('team', team);
        }
    };
    await removeGoals(match.goalslista, "AEK");
    await removeGoals(match.goalslistb, "Real");

    // 5. Spieler des Spiels rückgängig machen
    if (match.manofthematch) {
        let sdsTeam = null;
        if (match.goalslista && match.goalslista.find(g => g.player === match.manofthematch)) sdsTeam = "AEK";
        else if (match.goalslistb && match.goalslistb.find(g => g.player === match.manofthematch)) sdsTeam = "Real";
        else {
            const { data: p } = await supabase.from('players').select('team').eq('name', match.manofthematch).single();
            sdsTeam = p?.team;
        }
        if (sdsTeam) {
            const { data: sds } = await supabase.from('spieler_des_spiels').select('count').eq('name', match.manofthematch).eq('team', sdsTeam).single();
            if (sds) {
                const newCount = Math.max(0, sds.count - 1);
                await supabase.from('spieler_des_spiels').update({ count: newCount }).eq('name', match.manofthematch).eq('team', sdsTeam);
            }
        }
    }

    // 6. Karten zurücksetzen (Spieler-Kartenzähler updaten, falls du sowas hast)
    // Falls du Karten pro Spieler speicherst, musst du analog zu removeGoals abziehen!

    // 7. Match löschen
    await supabase.from('matches').delete().eq('id', id);
    // Kein manuelles Neuladen nötig – Live-Sync!
}

export function resetMatchesState() {
    matches = [];
    aekAthen = [];
    realMadrid = [];
    bans = [];
    finances = { aekAthen: { balance: 0 }, realMadrid: { balance: 0 } };
    spielerDesSpiels = [];
    transactions = [];
    matchesInitialized = false;
    if (matchesChannel && typeof matchesChannel.unsubscribe === "function") {
        try { matchesChannel.unsubscribe(); } catch (e) {}
    }
    matchesChannel = undefined;
}

export {matches};