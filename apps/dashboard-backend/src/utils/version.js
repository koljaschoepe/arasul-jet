/**
 * Die Version des Systems, an einer Stelle.
 *
 * Warum es diese Datei gibt: dieselbe Frage wurde am 20.08.2026 an FUENFZEHN
 * Stellen im Backend beantwortet, und nicht einmal einheitlich: dreizehnmal mit
 * `process.env.SYSTEM_VERSION || '1.0.0'`, zweimal mit `|| 'unknown'` in
 * derselben Datenbankspalte `update_events.version_from`. Der Rueckfallwert behauptet damit
 * ueberall eine fertige 1.0.0, obwohl von sieben Verkaufs-Gates keines
 * geschlossen ist. Ein Partner, der das in den Einstellungen liest, bekommt
 * eine Zusage, die niemand gemacht hat (Befund F-19).
 *
 * Zwei Werte, weil zwei Dinge gebraucht werden und sie nicht dasselbe sind:
 *
 * - `versionFuerAnzeige()` ist das, was ein Mensch liest. Ohne gesetzte
 *   Umgebungsvariable sagt sie „Vorserie", also die Wahrheit ueber die Reife.
 * - `versionFuerVergleich()` ist das, was die Aktualisierungspruefung mit
 *   einer Zielversion vergleicht und was im Aktualisierungsbuch steht. Das
 *   muss eine Zahl bleiben, sonst laesst sich nichts vergleichen und die
 *   Protokollzeilen werden unbrauchbar. Die beiden Stellen, die vorher
 *   'unknown' schrieben, nehmen jetzt denselben Wert wie die uebrigen
 *   Schreiber derselben Spalte.
 *
 * Sobald die Auslieferung versioniert ist, setzt der Bau `SYSTEM_VERSION`,
 * und beide liefern dieselbe Zahl. Bis dahin ist die Vergleichszahl `0.0.0`
 * (Phase B7 des Umbaus, 26.08.2026): ein Geraet ohne Version ist aelter als
 * jede Fassung, die je ausgeliefert wird.
 */

/** Was ein Mensch liest. Ohne gesetzte Version die Wahrheit ueber die Reife. */
function versionFuerAnzeige() {
  const gesetzt = process.env.SYSTEM_VERSION;
  return gesetzt && gesetzt.trim() ? gesetzt.trim() : 'Vorserie';
}

/**
 * Was verglichen und protokolliert wird. Bleibt eine Zahl.
 *
 * Der Rueckfall war bis Phase B7 '1.0.0', aus Vorsicht: `updateService`
 * vergleicht diesen Wert mit der angebotenen Fassung, und mit '0.0.0' gilt
 * auf einem Geraet ohne gesetzte Version jede Fassung als neuer. Genau das
 * stimmt aber: eine Vorserie hat keine Fassung, jede ausgelieferte ist neuer.
 * Die Kehrseite steht in `validateManifest`: ein Paket mit `min_version`
 * ueber 0.0.0 lehnt ein Vorseriengeraet ab, bis `SYSTEM_VERSION` gesetzt ist.
 */
function versionFuerVergleich() {
  const gesetzt = process.env.SYSTEM_VERSION;
  return gesetzt && gesetzt.trim() ? gesetzt.trim() : '0.0.0';
}

module.exports = { versionFuerAnzeige, versionFuerVergleich };
