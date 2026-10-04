/**
 * Das Profil einer Person (M5, Auftrag verwaltung-personen).
 *
 * Fuenf Felder stehen an jedem Konto: Vorname, Nachname, Funktion, Kuerzel und
 * ein Bild. Sie fahren mit jeder Auskunft ueber den Angemeldeten mit
 * (`/auth/login`, `/auth/me`, `/auth/session`), damit die Shell den Namen
 * kennt, bevor sie malt -- eine eigene Anfrage waere die dritte auf jedem
 * Seitenaufbau. Das Bild selbst faehrt NICHT mit, nur ob es eins gibt; es
 * kommt ueber `GET /api/profil/bild` (oder `/api/benutzer/:id/bild`).
 */

/** Die Spalten, die zur Auskunft ueber eine Person gehoeren (ohne das Bild selbst). */
const PROFIL_SPALTEN = 'vorname, nachname, funktion, kuerzel, (bild_daten IS NOT NULL) AS hat_bild';

/** Der Name, wie er sichtbar wird: „Vorname Nachname", sonst der Benutzername. */
function anzeigeName(zeile) {
  const name = [zeile.vorname, zeile.nachname]
    .filter(t => t && String(t).trim())
    .join(' ')
    .trim();
  return name || zeile.username;
}

/** Die Profilfelder einer Zeile, so wie sie nach aussen gehen. */
function profilVon(zeile) {
  return {
    vorname: zeile.vorname ?? null,
    nachname: zeile.nachname ?? null,
    funktion: zeile.funktion ?? null,
    kuerzel: zeile.kuerzel ?? null,
    hatBild: zeile.hat_bild === true,
    anzeigeName: anzeigeName(zeile),
  };
}

module.exports = { PROFIL_SPALTEN, anzeigeName, profilVon };
