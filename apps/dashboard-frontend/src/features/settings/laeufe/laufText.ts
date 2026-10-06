/**
 * Was ein Lauf einem Menschen sagt, wo der Flow-Läufer Technik schreibt.
 *
 * Der Läufer schreibt in `error` den Grund so, wie er für eine Fehlersuche
 * taugt (`Route abgewiesen: POST /loeschen …`) und nennt Werkzeuge bei ihrem
 * Kennnamen (`route_aufrufen`). Beides gehört in den aufgeklappten Lauf; in
 * einer Liste stehen zwei Sätze: was passiert ist und was man tut.
 */

const WERKZEUGE: Record<string, string> = {
  route_aufrufen: 'App-Route aufrufen',
  dateien_lesen: 'Dateien lesen',
  dateien_suchen: 'Dateien suchen',
  dateien_schreiben: 'Datei schreiben',
  dateien_bearbeiten: 'Datei bearbeiten',
  dateien_anhaengen: 'An Datei anhängen',
  frage_nutzer: 'Rückfrage stellen',
  freigabe_anfordern: 'Freigabe anfordern',
  subagent: 'Hilfsagent',
};

/** Ein Werkzeugname in Worten; ein unbekannter bleibt, wie er ist. */
export function werkzeugText(name: string): string {
  return WERKZEUGE[name] ?? name;
}

/** Der Grund eines gescheiterten Laufs in zwei Sätzen, ohne Technik. */
export function laufFehlerKurz(error: string): string {
  if (error.startsWith('Route abgewiesen')) {
    return 'Ein Schritt durfte die Route der App nicht aufrufen. Öffnen Sie den Lauf, dort steht der Grund.';
  }
  return 'Der Lauf ist gescheitert. Öffnen Sie ihn, dort steht der Grund.';
}
