/**
 * Der Abschluss eines Flows: die Uebergabe an die App (M5, Kontrakt 11).
 *
 * Nennt der Flow-Kopf eine `abschluss.route`, ist ein Lauf nach seiner letzten
 * Stufe NICHT fertig, sondern ruft die Route der App mit dem Ergebnis. Erst die
 * Empfangsbestaetigung (2xx) macht ihn `fertig`; antwortet die App nicht oder
 * mit einem Fehler, steht er auf `nicht_uebergeben`, und ein Admin loest mit
 * „erneut" nur die Uebergabe noch einmal aus -- die Schritte laufen nicht neu,
 * das Ergebnis steht in `flow_runs.result`.
 *
 * Alles, was die App bekommt, liest dieses Modul aus der Datenbank, nicht aus
 * dem Speicher des Laufs: der erste Versuch und jedes „erneut" schicken
 * dieselben Daten, und beides funktioniert nach einem Neustart.
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const runStore = require('./runStore');
const appAbschluss = require('../app/appAbschluss');
const { NotFoundError, ConflictError } = require('../../utils/errors');

/**
 * Die Felder, die ein Mensch in den Freigaben des Laufs bestaetigt hat: je
 * Feld der Wert, der GILT (Vorschlag der KI, wo nichts geaendert wurde, sonst
 * die Korrektur), und die Korrekturen mit wer und wann.
 *
 * @returns {Promise<{felder: object, korrekturen: object[]}|null>} null, wenn
 *   keine Freigabe des Laufs Felder trug.
 */
async function felderDesLaufs(runId, datenbank = db) {
  const { rows } = await datenbank.query(
    `SELECT a.felder, a.korrekturen
       FROM public.approvals a
      WHERE a.run_id = $1 AND a.status = 'bestaetigt' AND a.felder IS NOT NULL
      ORDER BY a.id ASC`,
    [runId]
  );
  if (rows.length === 0) {
    return null;
  }
  const felder = {};
  const korrekturen = [];
  for (const zeile of rows) {
    const eigene = {};
    for (const f of zeile.felder || []) {
      eigene[f.name] = String(f.vorschlag ?? '');
    }
    for (const k of Array.isArray(zeile.korrekturen) ? zeile.korrekturen : []) {
      if (Object.prototype.hasOwnProperty.call(eigene, k.feld)) {
        eigene[k.feld] = String(k.wert ?? '');
      }
      korrekturen.push({
        feld: k.feld,
        vorschlag: k.vorschlag ?? null,
        wert: k.wert ?? null,
        von: k.von ?? null,
        am: k.am ?? null,
      });
    }
    Object.assign(felder, eigene);
  }
  return { felder, korrekturen };
}

/** Der Body, den die App bekommt (Kontrakt 11, `abschluss.nutzlast`). */
function baueNutzlast(lauf, felder) {
  return {
    lauf: Number(lauf.id),
    flow: lauf.flow_name,
    app: lauf.app_id,
    stand: lauf.stand,
    argumente: lauf.arguments || {},
    ergebnis: lauf.result ?? '',
    felder: felder ? felder.felder : null,
    korrekturen: felder ? felder.korrekturen : null,
    angenommen: lauf.annahmen ?? null,
  };
}

/**
 * Ein Uebergabeversuch fuer einen Lauf, dessen Abschluss-Route in
 * `flow_runs.abschluss` steht. Wirft nie wegen der App: ob sie antwortet, steht
 * danach im Zustand des Laufs.
 *
 * @param {{runId: number}} p
 * @returns {Promise<object|null>} die Lauf-Zeile nach dem Versuch, oder null,
 *   wenn der Lauf in keinem uebergabefaehigen Zustand war (abgebrochen o. ae.).
 */
async function uebergebe({ runId }, deps = {}) {
  const { store = runStore, aufruf = appAbschluss.uebergebe, lesen = felderDesLaufs } = deps;
  const { rows } = await (deps.db || db).query(
    `SELECT id, flow_name, app_id, stand, arguments, result, annahmen, abschluss, status
       FROM flow_runs WHERE id = $1`,
    [runId]
  );
  const lauf = rows[0];
  if (!lauf || !lauf.abschluss?.route || !lauf.app_id) {
    return null;
  }
  const felder = await lesen(runId, deps.db || db);
  let antwort;
  try {
    antwort = await aufruf({
      appId: lauf.app_id,
      stand: lauf.stand,
      route: lauf.abschluss.route,
      laufId: Number(lauf.id),
      nutzlast: baueNutzlast(lauf, felder),
    });
  } catch (err) {
    antwort = { ok: false, statusCode: null, fehler: `Uebergabe gescheitert: ${err.message}` };
  }
  const nachher = await store.abschlussErgebnis({
    runId,
    ok: antwort.ok,
    statusCode: antwort.statusCode,
    fehler: antwort.fehler,
  });
  if (antwort.ok) {
    logger.info(
      `Flow-Lauf ${runId} (${lauf.flow_name}) an ${lauf.app_id}/${lauf.stand} uebergeben`
    );
  } else {
    logger.warn(
      `Flow-Lauf ${runId} (${lauf.flow_name}) nicht uebergeben an ${lauf.app_id}/${lauf.stand}: ${antwort.fehler}`
    );
  }
  return nachher;
}

/**
 * „Erneut" (Verwaltung): die Uebergabe eines Laufs auf `nicht_uebergeben` noch
 * einmal ausloesen, ohne die Schritte neu zu laufen.
 *
 * @param {{runId: number, appId: string}} p
 * @throws {NotFoundError} der Lauf gehoert nicht zu dieser App
 * @throws {ConflictError} der Lauf steht nicht auf `nicht_uebergeben`
 */
async function erneut({ runId, appId }, deps = {}) {
  const { rows } = await (deps.db || db).query(
    'SELECT status FROM flow_runs WHERE id = $1 AND app_id = $2',
    [runId, appId]
  );
  if (rows.length === 0) {
    throw new NotFoundError(`Flow-Lauf ${runId} nicht gefunden`);
  }
  if (rows[0].status !== 'nicht_uebergeben') {
    throw new ConflictError(
      `Nur ein Lauf, der nicht übergeben ist, lässt sich erneut übergeben (Status: ${rows[0].status})`
    );
  }
  const nachher = await uebergebe({ runId }, deps);
  if (!nachher) {
    throw new ConflictError('Der Lauf ist nicht mehr übergebbar (inzwischen abgebrochen?)');
  }
  return nachher;
}

module.exports = { uebergebe, erneut, felderDesLaufs, baueNutzlast };
