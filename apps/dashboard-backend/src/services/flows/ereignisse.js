/**
 * Ein Ereignis der App startet Flows (M5, 04.10.2026, Auftrag
 * ereignis-und-app-routen, Kontrakt 13).
 *
 * Ein Flow, dessen Kopf `ausloeser: [{typ: ereignis, ereignis: beleg.eingegangen}]`
 * nennt, laeuft, sobald seine App dieses Ereignis meldet. Die App meldet es
 * ueber den Weg, den sie schon hat: ihren Schluessel an der externen
 * Schnittstelle (`POST /api/v1/external/ereignisse/:name`). Ein zweiter Kanal
 * zwischen App und Geraet waere eine zweite Tuer mit eigenem Geheimnis.
 *
 * DIE REGELN, und jede steht auch in FLOWS.md und im Kontrakt:
 *
 *   NUR DIE EIGENE APP, NUR DER EIGENE STAND. Gesucht wird im Namensraum des
 *     Schluessels: der Teststand startet die Flows seines Teststandes, der
 *     Livestand die seines Livestandes. Eine App kann kein Ereignis einer
 *     anderen ausloesen.
 *   JEDER FLOW, DER HOERT. Hoeren mehrere Flows auf denselben Namen, startet
 *     jeder seinen eigenen Lauf. Hoert keiner, passiert nichts, und die Antwort
 *     sagt es.
 *   DIE DATEN SIND DIE ARGUMENTE. Was die App unter `daten` mitschickt, geht
 *     an die Argumente des Flows mit demselben Namen; was der Flow nicht
 *     deklariert, faellt weg. Fehlt ein Pflichtargument oder passt eine
 *     Auswahl nicht, startet DIESER Flow nicht, mit Grund in der Antwort; die
 *     anderen starten trotzdem.
 *   AUSGESCHALTET STARTET NICHT. Ein Flow, den der Administrator
 *     ausgeschaltet hat, startet auch auf ein Ereignis nicht (`flowRunner`).
 *   DER LAUF TRAEGT DEN AUSLOESER. `flow_runs.ausloeser = 'ereignis'` und der
 *     Name in `flow_runs.ereignis`. Einreicher ist, wen die App nennt (wie
 *     beim Start von Hand), sonst niemand.
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const { ApiError, ValidationError } = require('../../utils/errors');

/** Hoechstens so viele Flows startet ein Ereignis (ein Paket hat hoechstens 50). */
const MAX_LAEUFE_JE_EREIGNIS = 50;

/**
 * Die Flows dieser App und dieses Standes, die auf das Ereignis hoeren.
 *
 * `@>` auf das JSON des Kopfes: ein Auslöser-Eintrag mit genau diesem Typ und
 * Namen. Weitere Felder am Eintrag gibt es nicht (`.strict()` im Schema).
 */
async function hoerende({ appId, stand, name }, datenbank = db) {
  const { rows } = await datenbank.query(
    `SELECT f.name, f.definition
       FROM public.app_flows f
      WHERE f.app_id = $1 AND f.stand = $2
        AND f.definition->'ausloeser' @> $3::jsonb
      ORDER BY f.name ASC
      LIMIT ${MAX_LAEUFE_JE_EREIGNIS}`,
    [appId, stand, JSON.stringify([{ typ: 'ereignis', ereignis: name }])]
  );
  return rows;
}

/**
 * Ein Ereignis melden: jeden hoerenden Flow starten.
 *
 * @param {{appId: string, stand: string, name: string, daten?: object,
 *          userId: number, einreicherId?: number|null, freigabeRegel?: object|null}} p
 * @returns {Promise<{laeufe: {flow: string, run_id: number}[],
 *                    nicht_gestartet: {flow: string, grund: string}[]}>}
 */
async function melde(
  {
    appId,
    stand,
    name,
    daten = {},
    userId,
    einreicherId = null,
    freigabeRegel = null,
    titel = null,
  },
  deps = {}
) {
  const {
    datenbank = db,
    argumente = require('./runFlow').resolveArguments,
    starten = require('./flowRunner').starten,
  } = deps;
  if (!appId || !stand) {
    throw new ValidationError(
      'Ein Ereignis meldet eine App mit ihrem eigenen Schlüssel. Dieser Schlüssel gehört keiner App.'
    );
  }

  const laeufe = [];
  const nichtGestartet = [];
  for (const flow of await hoerende({ appId, stand, name }, datenbank)) {
    try {
      const { werte } = argumente(flow.definition?.argumente || [], daten || {});
      const { runId } = await starten({
        flowName: flow.name,
        args: werte,
        userId,
        appId,
        stand,
        einreicherId,
        freigabeRegel,
        ausloeser: 'ereignis',
        ereignis: name,
        titel,
      });
      laeufe.push({ flow: flow.name, run_id: runId });
    } catch (err) {
      // An die App geht nur ein Satz, den das Geraet selbst formuliert hat
      // (`ApiError`: Argument fehlt, Flow ausgeschaltet, Grenze erreicht). Ein
      // unerwarteter Fehler kann Interna tragen (Adresse der Datenbank, SQL);
      // der steht im Protokoll des Geraets, die App liest einen festen Satz.
      if (err instanceof ApiError) {
        nichtGestartet.push({ flow: flow.name, grund: err.message });
      } else {
        logger.error(`Ereignis "${name}": ${appId}/${flow.name} startete nicht: ${err.message}`);
        nichtGestartet.push({
          flow: flow.name,
          grund: 'Der Lauf startete nicht. Das Protokoll des Geräts nennt den Grund.',
        });
      }
    }
  }
  logger.info(
    `Ereignis "${name}" von ${appId}/${stand}: ${laeufe.length} Lauf/Läufe gestartet` +
      (nichtGestartet.length ? `, ${nichtGestartet.length} nicht` : '')
  );
  return { laeufe, nicht_gestartet: nichtGestartet };
}

module.exports = { melde, hoerende, MAX_LAEUFE_JE_EREIGNIS };
