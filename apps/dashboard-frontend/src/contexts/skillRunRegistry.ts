/**
 * Reine Helfer für die Skill-Lauf-Registry im ChatContext (Plan 011, Schritt 15).
 *
 * Kernpunkt: Die BIGINT-Lauf-ID erreicht den Client je nach Endpunkt als Zahl
 * (Start-POST) oder als String (Liste). Beide Wege MÜSSEN zur selben Zahl
 * normalisiert werden — sonst scheitert der Dublettenschutz (10 !== "10") und
 * derselbe Lauf erscheint doppelt im Verlauf (auf dem Jetson gefunden).
 */

/**
 * Fügt eine Lauf-ID vorn ein (neueste zuerst), ohne Dublette. Gibt das
 * unveränderte Array zurück, wenn die ID schon bekannt ist (spart einen Render).
 */
export function addSkillRun(vorhanden: number[], runId: number | string): number[] {
  const id = Number(runId);
  // Unbrauchbare ID (kein gültiger Zahlwert) lieber verwerfen als einen
  // NaN-Eintrag in die Registry zu schreiben, den nichts je wieder trifft.
  if (!Number.isFinite(id) || vorhanden.includes(id)) return vorhanden;
  return [id, ...vorhanden];
}

/**
 * Mischt die Server-Liste (neueste zuerst) mit lokal schon bekannten IDs, die
 * die Liste noch nicht kennt — ein gerade gestarteter Lauf darf nicht kurz
 * verschwinden. Alles zu Number normalisiert, damit nichts doppelt zählt.
 */
export function mergeSkillRuns(vorhanden: number[], serverIds: (number | string)[]): number[] {
  const ids = serverIds.map(Number).filter(Number.isFinite);
  const zusatz = vorhanden.filter(id => !ids.includes(id));
  return [...zusatz, ...ids];
}
