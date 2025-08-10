import { supabase } from './supabaseClient.js';

export async function renderSpielerTab(containerId = "app") {
	console.log("renderSpielerTab aufgerufen!", { containerId });
    const app = document.getElementById(containerId);
    app.innerHTML = `
    <div class="mb-4 flex items-center space-x-3">
        <h2 class="text-lg font-semibold flex-1">Spieler-Übersicht</h2>
        <button id="show-tore" class="transition-all duration-150 bg-gradient-to-r from-blue-400 to-blue-600 text-black font-bold rounded-xl px-4 py-2 shadow-lg hover:from-fuchsia-500 hover:to-blue-400 hover:scale-105 focus:ring-2 focus:ring-blue-300 focus:outline-none">
            <i class="fas fa-futbol mr-2"></i> Torschützen
        </button>
        <button id="show-sds" class="transition-all duration-150 bg-gradient-to-r from-yellow-300 to-yellow-500 text-yellow-900 font-bold rounded-xl px-4 py-2 shadow-lg hover:from-fuchsia-500 hover:to-yellow-400 hover:scale-105 focus:ring-2 focus:ring-yellow-300 focus:outline-none">
            <i class="fas fa-star mr-2"></i> Spieler des Spiels
        </button>
    </div>
    <div id="spieler-content"></div>
    `;

    document.getElementById('show-tore').onclick = () => renderTorschuetzen();
    document.getElementById('show-sds').onclick = () => renderSdS();

    // Initialanzeige
    renderTorschuetzen();

    // Hilfsfunktion für Card-Klasse nach Team
    function getCardClass(team) {
        if (team === "Ehemalige") return "text-gray-500";
        if (team === "AEK") return "text-blue-900";
        return "text-red-900";
    }

    function getBadge(idx) {
        if (idx === 0) return `<span class="inline-block text-2xl align-middle mr-1">🥇</span>`;
        if (idx === 1) return `<span class="inline-block text-2xl align-middle mr-1">🥈</span>`;
        if (idx === 2) return `<span class="inline-block text-2xl align-middle mr-1">🥉</span>`;
        return "";
    }

    async function renderTorschuetzen() {
        // Spieler laden
        const { data: players, error: errP } = await supabase.from('players').select('*');
        if (errP) {
            document.getElementById('spieler-content').innerHTML =
                `<div class="text-red-700 p-4">Fehler beim Laden der Daten: ${errP?.message || ''}</div>`;
            return;
        }

        let scorerArr = (players || [])
            .filter(p => p.goals && p.goals > 0)
            .map(p => ({
                team: p.team,
                name: p.name,
                goals: p.goals || 0
            }));
        scorerArr.sort((a, b) => b.goals - a.goals);

        // Top 3 mit Abzeichen
        const top3 = scorerArr.slice(0, 3);
        const rest = scorerArr.slice(3);

		// Card-Ansicht Top 3 - alle in einer Reihe, responsive (scrollbar auf ganz kleinen Screens)
		let top3Html = '';
		if (top3.length) {
			top3Html = `
			<div class="mb-4">
				<div class="text-md font-semibold mb-2">Top 3 Torschützen</div>
				<div class="flex flex-row gap-3 w-full overflow-x-auto pb-2">
					${top3.map((s, idx) => `
						<div class="flex-1 min-w-0 max-w-xs w-full p-4 rounded-2xl shadow-md flex flex-col items-center border-2 border-opacity-60
							${idx === 0 
								? 'border-yellow-400 bg-yellow-50'
								: idx === 1
									? 'border-gray-400 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-300 bg-gray-50'
									: 'border-orange-400 bg-orange-50'}">
							<div class="text-2xl font-extrabold mb-1">${getBadge(idx)}</div>
							<div class="font-bold mb-0.5 text-base truncate w-full text-center ${getCardClass(s.team)}">${s.name}</div>
							<div class="text-xs text-base mb-1 ${getCardClass(s.team)}">${s.team}</div>
							<div class="text-2xl text-base font-bold ${getCardClass(s.team)}">${s.goals}</div>
						</div>
					`).join('')}
				</div>
			</div>
			`;
		}

        // Restliche als Tabelle
        let tableHtml = '';
        if (rest.length) {
            tableHtml = `
            <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead>
                    <tr>
                        <th class="p-2 text-left">#</th>
                        <th class="p-2 text-left">Spieler</th>
                        <th class="p-2 text-left">Team</th>
                        <th class="p-2 text-left">Tore</th>
                    </tr>
                </thead>
                <tbody>
                    ${rest.map((s, idx) => {
                        let tClass = "";
                        if (s.team === "Ehemalige") tClass = "bg-gray-100 text-gray-500";
                        else if (s.team === "AEK") tClass = "bg-blue-100 text-blue-900";
                        else tClass = "bg-red-100 text-red-900";
                        return `
                            <tr>
                                <td class="p-2 text-center font-bold ${tClass} rounded">${idx + 4}</td>
                                <td class="p-2 font-semibold ${tClass} rounded">${s.name}</td>
                                <td class="p-2 ${tClass} rounded">${s.team}</td>
                                <td class="p-2 font-bold ${tClass} rounded">${s.goals}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
            </div>
            `;
        } else if (!top3.length) {
            tableHtml = `<div class="text-gray-400 p-2">Noch keine Tore</div>`;
        }

        document.getElementById('spieler-content').innerHTML = top3Html + tableHtml;
    }

    async function renderSdS() {
        const { data: sdsArr, error } = await supabase.from('spieler_des_spiels').select('*');
        if (error) {
            document.getElementById('spieler-content').innerHTML =
                `<div class="text-red-700 p-4">Fehler beim Laden der Spieler des Spiels: ${error.message}</div>`;
            return;
        }
        // Hole alle Spieler für aktuelle Teams
        const { data: players } = await supabase.from('players').select('name, team');
        let arr = [...sdsArr].sort((a, b) => b.count - a.count);

        // Team immer aktuell aus players, fallback auf SdS-Tabelle
        arr = arr.map(s => {
            const found = players?.find(p => p.name === s.name);
            return {
                ...s,
                team: found ? found.team : s.team
            };
        });

        // Top 3 Cards mit Abzeichen - alle in einer Reihe, responsive
        const top3 = arr.slice(0, 3);
        const rest = arr.slice(3);

        let top3Html = '';
        if (top3.length) {
            top3Html = `
            <div class="mb-4">
                <div class="text-md font-semibold mb-2">Top 3 Spieler des Spiels</div>
                <div class="flex flex-row gap-3 w-full overflow-x-auto pb-2">
                    ${top3.map((s, idx) => `
					<div class="flex-1 min-w-0 max-w-xs w-full p-4 rounded-2xl shadow-md flex flex-col items-center border-2 border-opacity-60
						${idx === 0 
							? 'border-yellow-400 bg-yellow-50'
							: idx === 1
								? 'border-gray-400 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-300 bg-gray-50'
								: 'border-orange-400 bg-orange-50'}">
                            <div class="text-2xl font-extrabold mb-1">${getBadge(idx)}</div>
                            <div class="font-bold mb-0.5 text-base truncate w-full text-center ${getCardClass(s.team)}">${s.name}</div>
                            <div class="text-xs text-base mb-1 ${getCardClass(s.team)}">${s.team}</div>
                            <div class="text-2xl text-base font-bold ${getCardClass(s.team)}">${s.count}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
            `;
        }

        // Restliche als Tabelle
        let tableHtml = '';
        if (rest.length) {
            tableHtml = `
            <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead>
                    <tr>
                        <th class="p-2 text-left">#</th>
                        <th class="p-2 text-left">Spieler</th>
                        <th class="p-2 text-left">Team</th>
                        <th class="p-2 text-left">Anzahl SdS</th>
                    </tr>
                </thead>
                <tbody>
                    ${rest.map((s, idx) => {
                        let tClass = "";
                        if (s.team === "Ehemalige") tClass = "bg-gray-100 text-gray-500";
                        else if (s.team === "AEK") tClass = "bg-blue-100 text-blue-900";
                        else tClass = "bg-red-100 text-red-900";
                        return `
                            <tr>
                                <td class="p-2 text-center font-bold ${tClass} rounded">${idx + 4}</td>
                                <td class="p-2 font-semibold ${tClass} rounded">${s.name}</td>
                                <td class="p-2 ${tClass} rounded">${s.team}</td>
                                <td class="p-2 font-bold ${tClass} rounded">${s.count}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
            </div>
            `;
        } else if (!top3.length) {
            tableHtml = `<div class="text-gray-400 p-2">Noch kein Spieler des Spiels vergeben</div>`;
        }

        document.getElementById('spieler-content').innerHTML = top3Html + tableHtml;
    }
}
export function resetSpielerState() {}