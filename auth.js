import { supabase } from './supabaseClient.js';
import { resetKaderState } from './kader.js';
import { resetBansState } from './bans.js';
import { resetFinanzenState } from './finanzen.js';
import { resetMatchesState } from './matches.js';

// Hilfsfunktion für sichere, freundlichere Fehlerausgabe
function showFriendlyError(error) {
    if (!error) return;
    // Supabase-Fehlertext nicht an Nutzer weitergeben
    console.error(error); // Entwicklersicht
    alert("Ein Fehler ist aufgetreten. Bitte versuche es erneut.");
}

export async function signUp(email, password) {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) showFriendlyError(error);
    else alert('Bitte bestätige deine Email und logge dich dann ein.');
}

export async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) showFriendlyError(error);
    else console.log('Angemeldet!');
}

export async function signOut() {
    await supabase.auth.signOut();
    if (typeof resetKaderState === "function") resetKaderState();
    if (typeof resetBansState === "function") resetBansState();
    if (typeof resetFinanzenState === "function") resetFinanzenState();
    if (typeof resetMatchesState === "function") resetMatchesState();
}