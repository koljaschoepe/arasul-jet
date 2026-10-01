/**
 * Der Schluesselwaechter (J37): sagt dem Admin, wenn der Schluessel dieses
 * Geraets nicht mehr zur letzten Sicherung passt.
 *
 * WARUM ES DAS BRAUCHT. Eine verschluesselte Sicherung ist nur so viel wert wie
 * der Schluessel, der sie oeffnet. Wird das Geraet neu aufgesetzt, bekommt es
 * einen neuen Schluessel -- und die Sicherungen davor sind ohne den
 * Wiederherstellungscode des frueheren Schluessels nicht mehr lesbar. Das darf
 * nicht erst am Tag der Wiederherstellung auffallen. Der Sicherungsdienst
 * prueft es bei jedem Lauf und schreibt das Ergebnis nach
 * `schluessel_pruefung.json`; dieser Baustein liest es alle fuenf Minuten.
 *
 * WO ES SICHTBAR WIRD. In `notification_events` (critical, `backup`): die
 * Kachel „Zustand des Geraets" (`SystemHealthWidget`) zaehlt dort die nicht
 * zugestellten kritischen Meldungen, und der Telegram-Weg liest dieselbe
 * Tabelle. Zusaetzlich zeigt `Sicherung.tsx` oben eine Warnung aus demselben
 * Befund -- die Tabelle allein waere nur eine Zahl.
 *
 * EINMAL JE PRUEFUNG. Der Waechter laeuft zwanzigmal pro Stunde, die Pruefung
 * aber nur einmal pro Sicherung. Entdoppelt wird nach dem Zeitpunkt der
 * Pruefung, im Prozess UND in der Tabelle: ein Neustart des Backends darf
 * dieselbe Meldung nicht noch einmal anlegen.
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const sicherungsdienst = require('./sicherungsdienst');

const INTERVALL_MS = 5 * 60 * 1000;

const TITEL = 'Sicherungsschlüssel passt nicht';
const TEXT =
  'Der Schlüssel dieses Geräts passt nicht zur letzten Sicherung. Ohne den ' +
  'Wiederherstellungscode des früheren Schlüssels lässt sie sich nicht ' +
  'zurückholen. Der Code wird beim Zurückholen eingegeben (siehe Handbuch).';

/** Zeitpunkt der Pruefung, zu der zuletzt gemeldet wurde. */
let zuletztGemeldet = null;

/**
 * Einmal nachsehen. Gibt `true` zurueck, wenn eine Meldung angelegt wurde.
 * Wirft nicht: ein Waechter, der das Backend umwirft, waere schlimmer als der
 * Fund.
 */
async function pruefe() {
  try {
    const p = await sicherungsdienst.leseSchluesselPruefung();
    if (!p || p.passt !== false) {
      return false;
    }
    const kennung = String(p.zeitpunkt ?? 'unbekannt');
    if (kennung === zuletztGemeldet) {
      return false;
    }
    const { rows } = await db.query(
      `SELECT 1 FROM notification_events
        WHERE event_type = 'backup' AND metadata->>'pruefung' = $1
        LIMIT 1`,
      [kennung]
    );
    if (rows.length === 0) {
      await db.query(
        `INSERT INTO notification_events
           (event_type, event_category, source_service, severity, title, message, metadata)
         VALUES ('backup', 'failure', 'backup-service', 'critical', $1, $2, $3::jsonb)`,
        [TITEL, `${TEXT}${p.grund ? ` (${p.grund})` : ''}`, JSON.stringify({ pruefung: kennung })]
      );
      logger.warn('Sicherungsschluessel passt nicht zur letzten Sicherung -- Admin benachrichtigt');
    }
    zuletztGemeldet = kennung;
    return rows.length === 0;
  } catch (fehler) {
    logger.warn(`Schluesselwaechter: ${fehler.message}`);
    return false;
  }
}

/** Startet den Waechter und gibt den Zeitgeber zurueck (fuer `globalIntervals`). */
function starten() {
  pruefe();
  return setInterval(pruefe, INTERVALL_MS);
}

/** Nur fuer Tests. */
function zuruecksetzen() {
  zuletztGemeldet = null;
}

module.exports = { pruefe, starten, zuruecksetzen, INTERVALL_MS, TEXT };
