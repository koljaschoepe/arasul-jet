/**
 * Was der Administrator am Geraet an einem Flow einer App geaendert hat
 * (Phase C6 des Umbaus vom 26.08.2026).
 *
 * Zwei Menschen entscheiden ueber einen Flow, und sie entscheiden ueber
 * Verschiedenes:
 *
 *   der Partner   WAS der Flow tut, und womit er gemeint war
 *                 -> `flows/<name>.md` im App-Paket, Frontmatter `modell:`
 *   der Kunde     WOMIT er auf DIESEM Geraet laeuft
 *                 -> diese Tabelle
 *
 * DIE UEBERSCHREIBUNG LIEGT NICHT IN DER DATEI, und das ist der ganze Punkt.
 * Schriebe der Administrator sie in die Flow-Datei, waere sie beim naechsten
 * App-Update weg -- das Paket bringt die Datei mit, und ein Deploy, der eine
 * Datei des Kunden aussparen muesste, waere ein Deploy, der etwas anderes
 * ausliefert als das Paket. So bleibt beides ganz: die Datei gehoert dem
 * Partner, die Zeile hier dem Kunden, und ein Update fasst nur die Datei an.
 *
 * OHNE `stand`. Die Entscheidung "welches Modell treibt diesen Flow" gilt dem
 * Flow, nicht der Fassung, mit der jemand gerade testet. Je Stand eine Zeile
 * hiesse: wer im Teststand einstellt, stellt im Livestand nichts ein -- und
 * merkt es erst beim Schalten.
 */

const db = require('../../database');
const logger = require('../../utils/logger');

/**
 * Die Einstellung zu einem Flow, oder `null`, wenn der Administrator nichts
 * geaendert hat.
 */
async function hole({ appId, flowName }) {
  const { rows } = await db.query(
    `SELECT app_id, flow_name, modell, extern_anbieter, extern_modell, extern_endet_auf,
            geaendert_am, geaendert_von
       FROM public.flow_settings
      WHERE app_id = $1 AND flow_name = $2`,
    [appId, flowName]
  );
  return rows[0] || null;
}

/**
 * Alle Einstellungen einer App als `Map` von Flow-Name auf Zeile.
 *
 * Eine Abfrage statt einer je Flow: die Liste einer App fragt fuer jeden ihrer
 * Flows dasselbe, und eine App mit zwanzig Flows waere sonst zwanzig
 * Abfragen fuer eine Ansicht.
 */
async function listeFuer(appId) {
  const { rows } = await db.query(
    `SELECT flow_name, modell, extern_anbieter, extern_modell, extern_endet_auf
       FROM public.flow_settings
      WHERE app_id = $1`,
    [appId]
  );
  return new Map(rows.map(z => [z.flow_name, z]));
}

/**
 * Das Modell eines Flows setzen oder die Ueberschreibung zuruecknehmen.
 *
 * `modell: null` LOESCHT die Zeile, statt sie mit einem leeren Feld stehen zu
 * lassen. Der Unterschied ist nicht kosmetisch: eine Zeile mit `modell IS
 * NULL` und keine Zeile bedeuten dasselbe ("es gilt das Paket"), und zwei
 * Schreibweisen fuer dieselbe Aussage sind eine Stelle, an der ein
 * Vergleich eines Tages danebengreift. Solange `modell` das einzige Feld ist,
 * das jemand setzt, ist die Zeile ihr eigener Inhalt.
 *
 * Sobald die D-Phasen die `extern_`-Felder fuellen, gilt das nicht mehr -- dann
 * ist "kein Modell, aber ein externer Anbieter" ein gueltiger Zustand. Der
 * Aufruf hier bekommt an dieser Stelle dann eine Bedingung mehr, und das ist
 * der Grund, warum diese Ueberlegung hier steht und nicht nur in einem Commit.
 *
 * @param {{appId: string, flowName: string, modell: string|null, durch: number|null}} was
 * @returns {Promise<object|null>} die gespeicherte Zeile, oder null bei Ruecknahme
 */
async function setzeModell({ appId, flowName, modell, durch = null }) {
  if (modell == null || modell === '') {
    const weg = await db.query(
      'DELETE FROM public.flow_settings WHERE app_id = $1 AND flow_name = $2',
      [appId, flowName]
    );
    if (weg.rowCount > 0) {
      logger.info(`Flow-Modell zurueckgenommen: ${appId}/${flowName}`);
    }
    return null;
  }

  const { rows } = await db.query(
    `INSERT INTO public.flow_settings (app_id, flow_name, modell, geaendert_von)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (app_id, flow_name) DO UPDATE
        SET modell = EXCLUDED.modell,
            geaendert_am = NOW(),
            geaendert_von = EXCLUDED.geaendert_von
     RETURNING app_id, flow_name, modell, geaendert_am, geaendert_von`,
    [appId, flowName, modell, durch]
  );
  logger.info(`Flow-Modell gesetzt: ${appId}/${flowName} -> ${modell}`);
  return rows[0];
}

module.exports = { hole, listeFuer, setzeModell };
