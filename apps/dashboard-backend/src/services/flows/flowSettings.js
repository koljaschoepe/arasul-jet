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
 *
 * SEIT PHASE D4 GIBT ES ZWEI ARTEN VON UEBERSCHREIBUNG, und sie schliessen
 * einander aus:
 *
 *   modell        ein Modell aus der Kurzliste des Geraets (C8). Es rechnet
 *                 hier, auf der GPU, und die Daten bleiben im Haus.
 *   extern_*      ein Modell bei einem Anbieter draussen: Name, Adresse,
 *                 Schluessel. Der Flow schickt seinen Prompt aus dem Haus.
 *
 * Beides zugleich gaebe es nicht: ein Flow laeuft auf EINEM Modell. Deshalb
 * raeumt jedes Setzen das jeweils andere Feld -- eine Zeile, in der beides
 * steht, waere eine Frage ohne Antwort ("welches gilt?"), und die Antwort
 * darauf faende jeder Leser ein bisschen anders.
 *
 * DER SCHLUESSEL LIEGT VERSCHLUESSELT (AES-256-GCM aus `utils/tokenCrypto.js`,
 * Schluessel aus JWT_SECRET) und verlaesst dieses Modul NIE im Klartext. Was
 * die Oberflaeche zeigen darf, sind die letzten vier Zeichen; sie stehen als
 * eigene Spalte da, damit die Anzeige nichts entschluesseln muss. Nur
 * `externerZugang` gibt den Klartext heraus, und sein einziger Aufrufer ist
 * der Runner, kurz bevor er das Modell anwaehlt.
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const { encryptToken, decryptToken } = require('../../utils/tokenCrypto');
const { ValidationError } = require('../../utils/errors');

/**
 * Die Spalten, die eine Ansicht sehen darf. `extern_schluessel` steht bewusst
 * nicht dabei -- er ist an keiner Stelle Teil einer Antwort, und eine Abfrage,
 * die ihn gar nicht erst holt, kann ihn auch nicht versehentlich durchreichen.
 */
const SICHTBAR = `app_id, flow_name, modell,
            extern_anbieter, extern_modell, extern_basis_url, extern_endet_auf,
            geaendert_am, geaendert_von`;

/**
 * Die Einstellung zu einem Flow, oder `null`, wenn der Administrator nichts
 * geaendert hat.
 */
async function hole({ appId, flowName }) {
  const { rows } = await db.query(
    `SELECT ${SICHTBAR}
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
    `SELECT ${SICHTBAR}
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
 * Vergleich eines Tages danebengreift.
 *
 * SEIT D4 NIMMT `null` AUCH DAS EXTERNE MODELL MIT, und das ist die
 * Bedingung, die C6 an dieser Stelle angekuendigt hat. "Zurueck zum Paket"
 * heisst: es gilt wieder, was im Frontmatter steht -- und ein hinterlegter
 * Anbieter, der die Zeile ueberlebte, waere genau das nicht. Ein Schluessel,
 * den niemand mehr sieht und der trotzdem noch wirkt, ist ausserdem der
 * Anfang einer unangenehmen Ueberraschung.
 *
 * Ein gesetztes lokales Modell raeumt die `extern_`-Felder aus demselben
 * Grund: ein Flow laeuft auf EINEM Modell.
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
            extern_anbieter = NULL,
            extern_modell = NULL,
            extern_basis_url = NULL,
            extern_schluessel = NULL,
            extern_endet_auf = NULL,
            geaendert_am = NOW(),
            geaendert_von = EXCLUDED.geaendert_von
     RETURNING ${SICHTBAR}`,
    [appId, flowName, modell, durch]
  );
  logger.info(`Flow-Modell gesetzt: ${appId}/${flowName} -> ${modell}`);
  return rows[0];
}

/**
 * Einen Flow auf ein externes Modell umstellen (Phase D4).
 *
 * Vier Angaben, drei davon Pflicht: wer rechnet (`anbieter`, ein Name fuer
 * Menschen), was rechnet (`modell`, der Name beim Anbieter) und wohin
 * (`basisUrl`, die OpenAI-kompatible Adresse ohne `/chat/completions`). Der
 * Schluessel ist optional -- ein Gateway im eigenen Netz verlangt keinen, und
 * einen zu erzwingen hiesse, eine Angabe zu erfinden.
 *
 * OHNE `schluessel` BLEIBT EIN HINTERLEGTER STEHEN. Der Administrator, der nur
 * den Modellnamen aendert, soll den Schluessel nicht erneut abtippen muessen --
 * und er KANN es auch nicht, denn er bekommt ihn nirgends zu sehen. Wer ihn
 * wirklich loswerden will, schaltet den Flow auf das Paket zurueck
 * (`setzeModell(null)`).
 *
 * @param {{appId: string, flowName: string, anbieter: string, modell: string,
 *          basisUrl: string, schluessel: string|null, durch: number|null}} was
 * @returns {Promise<object>} die gespeicherte Zeile, ohne Schluessel
 */
async function setzeExtern({
  appId,
  flowName,
  anbieter,
  modell,
  basisUrl,
  schluessel = null,
  durch = null,
}) {
  const adresse = String(basisUrl || '')
    .trim()
    .replace(/\/+$/, '');
  // Die Prueferei steht schon im Zod-Schema der Route. Hier steht sie noch
  // einmal, weil dieses Modul auch von Skripten und Tests gerufen wird und
  // eine halb gefuellte Zeile im Betrieb ein Flow ist, der nicht laufen kann.
  if (!anbieter || !modell || !adresse) {
    throw new ValidationError('Ein externes Modell braucht Anbieter, Modell und Basis-Adresse.');
  }
  if (!/^https?:\/\//i.test(adresse)) {
    throw new ValidationError('Die Basis-Adresse beginnt mit http:// oder https://.');
  }

  const klartext = schluessel == null ? null : String(schluessel).trim();
  const verschluesselt = klartext ? encryptToken(klartext) : null;
  const endetAuf = klartext ? klartext.slice(-4) : null;

  const { rows } = await db.query(
    `INSERT INTO public.flow_settings
       (app_id, flow_name, modell, extern_anbieter, extern_modell, extern_basis_url,
        extern_schluessel, extern_endet_auf, geaendert_von)
     VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (app_id, flow_name) DO UPDATE
        SET modell = NULL,
            extern_anbieter = EXCLUDED.extern_anbieter,
            extern_modell = EXCLUDED.extern_modell,
            extern_basis_url = EXCLUDED.extern_basis_url,
            -- COALESCE und nicht EXCLUDED: ohne neuen Schluessel bleibt der
            -- alte stehen. Siehe Kopf dieser Funktion.
            extern_schluessel =
              COALESCE(EXCLUDED.extern_schluessel, public.flow_settings.extern_schluessel),
            extern_endet_auf =
              COALESCE(EXCLUDED.extern_endet_auf, public.flow_settings.extern_endet_auf),
            geaendert_am = NOW(),
            geaendert_von = EXCLUDED.geaendert_von
     RETURNING ${SICHTBAR}`,
    [appId, flowName, anbieter, modell, adresse, verschluesselt, endetAuf, durch]
  );
  logger.info(
    `Flow-Modell extern gesetzt: ${appId}/${flowName} -> ${anbieter}/${modell} (${adresse})`
  );
  return rows[0];
}

/**
 * Der Zugang zum externen Modell eines Flows, MIT Schluessel im Klartext.
 *
 * Die einzige Stelle, die entschluesselt, und sie hat genau einen Aufrufer:
 * `services/app/appFlows.lade`, kurz bevor der Runner das Modell anwaehlt.
 * Alles andere in diesem Modul gibt den Schluessel nicht heraus.
 *
 * @returns {Promise<{anbieter:string, modell:string, basisUrl:string, schluessel:string|null}|null>}
 *   null, wenn dieser Flow lokal rechnet
 */
async function externerZugang({ appId, flowName }) {
  const { rows } = await db.query(
    `SELECT extern_anbieter, extern_modell, extern_basis_url, extern_schluessel
       FROM public.flow_settings
      WHERE app_id = $1 AND flow_name = $2`,
    [appId, flowName]
  );
  const zeile = rows[0];
  if (!zeile || !zeile.extern_anbieter) {
    return null;
  }
  return {
    anbieter: zeile.extern_anbieter,
    modell: zeile.extern_modell,
    basisUrl: zeile.extern_basis_url,
    schluessel: zeile.extern_schluessel ? decryptToken(zeile.extern_schluessel) : null,
  };
}

module.exports = { hole, listeFuer, setzeModell, setzeExtern, externerZugang };
