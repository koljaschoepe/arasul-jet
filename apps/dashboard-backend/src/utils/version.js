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
 * Sobald die Auslieferung versioniert ist (Ziel J3 im Steuer-Repo, Frist
 * 15.09.2026), setzt der Bau `SYSTEM_VERSION`, und beide liefern dieselbe Zahl.
 */

/** Was ein Mensch liest. Ohne gesetzte Version die Wahrheit ueber die Reife. */
function versionFuerAnzeige() {
  const gesetzt = process.env.SYSTEM_VERSION;
  return gesetzt && gesetzt.trim() ? gesetzt.trim() : 'Vorserie';
}

/**
 * Was verglichen und protokolliert wird. Bleibt eine Zahl.
 *
 * Der Rueckfall ist bewusst weiter '1.0.0' und nicht '0.0.0', obwohl '0.0.0'
 * ehrlicher waere. `updateService.checkForUpdates` vergleicht diesen Wert mit
 * der angebotenen Fassung; ein Wechsel auf '0.0.0' wuerde auf jedem Geraet
 * ohne gesetzte Version plötzlich jede Fassung als neuer gelten lassen. Das
 * ist eine Aenderung am Aktualisierungsverhalten und gehoert zu Ziel J3, nicht
 * in einen Schritt ueber Beschriftungen. Bis dahin luegt nur noch die
 * Vergleichszahl, und die liest kein Mensch.
 */
function versionFuerVergleich() {
  const gesetzt = process.env.SYSTEM_VERSION;
  return gesetzt && gesetzt.trim() ? gesetzt.trim() : '1.0.0';
}

module.exports = { versionFuerAnzeige, versionFuerVergleich };
