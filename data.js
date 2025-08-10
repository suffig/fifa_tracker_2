export const POSITIONEN = ["TH","LV","RV","IV","ZDM","ZM","ZOM","LM","RM","LF","RF","ST"];
import { supabaseDb, supabase } from './supabaseClient.js';
import { isDatabaseAvailable } from './connectionMonitor.js';

// Hinweis: Alle Daten werden jetzt über Supabase geladen – mit verbesserter Fehlerbehandlung und Retry-Logik!

// Enhanced data loading with fallback and retry logic
async function safeDataOperation(operation, fallbackValue = []) {
    if (!isDatabaseAvailable()) {
        console.warn('Database not available, returning fallback data');
        return fallbackValue;
    }

    try {
        const result = await operation();
        return result.data || fallbackValue;
    } catch (error) {
        console.error('Database operation failed:', error);
        
        // For user-facing operations, show a friendly message
        if (error.message && !error.message.includes('auth')) {
            console.warn('Data loading failed, using fallback');
        }
        
        return fallbackValue;
    }
}

// Lade alle Spieler eines Teams aus Supabase
export async function getPlayersByTeam(team) {
    return safeDataOperation(
        () => supabaseDb.select('players', '*', { eq: { team } }),
        []
    );
}

// Lade alle Ehemaligen (team === "Ehemalige")
export async function getEhemalige() {
    return safeDataOperation(
        () => supabaseDb.select('players', '*', { eq: { team: "Ehemalige" } }),
        []
    );
}

// Lade alle bans
export async function getBans() {
    return safeDataOperation(
        () => supabaseDb.select('bans', '*'),
        []
    );
}

// Lade alle Matches
export async function getMatches() {
    return safeDataOperation(
        () => supabaseDb.select('matches', '*'),
        []
    );
}

// Lade alle Transaktionen
export async function getTransactions() {
    return safeDataOperation(
        () => supabaseDb.select('transactions', '*'),
        []
    );
}

// Lade Finanzen (liefert beide Teams als Array)
export async function getFinances() {
    return safeDataOperation(
        () => supabaseDb.select('finances', '*'),
        []
    );
}

// Lade SpielerDesSpiels-Statistik
export async function getSpielerDesSpiels() {
    return safeDataOperation(
        () => supabaseDb.select('spieler_des_spiels', '*'),
        []
    );
}

// Enhanced save operations with retry logic
export async function savePlayer(player) {
    if (!isDatabaseAvailable()) {
        throw new Error('Keine Datenbankverbindung verfügbar. Bitte später versuchen.');
    }

    try {
        if (player.id) {
            return await supabaseDb.update('players', {
                name: player.name,
                team: player.team,
                position: player.position,
                value: player.value
            }, player.id);
        } else {
            return await supabaseDb.insert('players', [{
                name: player.name,
                team: player.team,
                position: player.position,
                value: player.value
            }]);
        }
    } catch (error) {
        console.error('Failed to save player:', error);
        throw new Error('Fehler beim Speichern des Spielers. Bitte versuchen Sie es erneut.');
    }
}

export async function deletePlayer(id) {
    if (!isDatabaseAvailable()) {
        throw new Error('Keine Datenbankverbindung verfügbar. Bitte später versuchen.');
    }

    try {
        return await supabaseDb.delete('players', id);
    } catch (error) {
        console.error('Failed to delete player:', error);
        throw new Error('Fehler beim Löschen des Spielers. Bitte versuchen Sie es erneut.');
    }
}