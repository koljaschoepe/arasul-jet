/**
 * Das Protokoll der Modellaufrufe (26.09.2026, J35, Migration 187).
 *
 * Ein Flow hinterlaesst einen Lauf mit Schritten. Alles andere, was ueber die
 * Schnittstelle ein Modell fragt -- `llm/chat`, `document/analyze`,
 * `document/extract-structured`, `/v1/chat/completions`, `/v1/embeddings` --,
 * hinterliess bis hierher nichts, was ein Administrator lesen konnte: Modell
 * und Zeit standen nur im Protokoll der App. Hier steht je Aufruf eine Zeile,
 * und zwar OHNE Inhalt: kein Dateiname, kein Text, keine Antwort, nur deren
 * sha256.
 *
 * Seit Migration 189 steht auch jeder Modellschritt eines Flows hier
 * (`flowSchritt`), mit seinem Lauf: ein Nachweis an einer Stelle, nicht an
 * zweien.
 *
 * DIE ZEILE ENTSTEHT VOR DEM AUFRUF. Scheitert sie, fragt niemand das Modell:
 * ein Aufruf ohne Zeile waere genau die Luecke, die das Protokoll schliessen
 * soll. Danach geht die Zeile mit dem Auftrag der Warteschlange mit, bis er
 * fertig ist -- das gilt fuer das Warten in der Route, fuer
 * `wait_for_result=false` und fuer den Strom gleichermassen, weil keiner der
 * drei Wege selbst Buch fuehrt.
 */

const crypto = require('crypto');
const db = require('../../database');
const logger = require('../../utils/logger');
const llmJobService = require('../llm/llmJobService');
const { ValidationError } = require('../../utils/errors');
const { KOPF_BENUTZER } = require('./appZugang');

// Node liefert Kopfzeilen klein geschrieben.
const KOPF = KOPF_BENUTZER.toLowerCase();
const ENDZUSTAENDE = new Set(['completed', 'error', 'cancelled']);
const TAKT_MS = 1000;
// Laenger wartet keine Route auf einen Auftrag (externalApi: 10 Minuten). Was
// danach noch laeuft, steht als `laeuft` da -- ehrlicher als ein Ende, das
// niemand gesehen hat.
const HOECHSTENS_MS = 15 * 60 * 1000;
// Was vor diesem Zeitpunkt begann, hat ein anderer Prozess angefangen -- und
// der verfolgt es nicht mehr (`schliesseVerwaiste`).
const PROZESS_START = new Date(Date.now() - process.uptime() * 1000);

/**
 * Der Mensch, fuer den eine App fragt.
 *
 * Die App kennt ihn aus `X-Arasul-User` (Forward-Auth, C4) und reicht ihn
 * weiter: als Feld `einreicher` wie beim Start eines Flows, oder einfach als
 * dieselbe Kopfzeile. Der Kopf steht als UTF-8 in einer latin1-Zeichenkette
 * (Kontrakt, `koepfe.hinweis`), das Feld nicht.
 */
function einreicherAus(req, feld = 'einreicher') {
  const imKoerper = req.body?.[feld];
  if (typeof imKoerper === 'string' && imKoerper.trim()) {
    return imKoerper.trim();
  }
  const kopf = req.headers?.[KOPF];
  if (typeof kopf === 'string' && kopf.trim()) {
    return Buffer.from(kopf.trim(), 'latin1').toString('utf8');
  }
  return null;
}

/**
 * Wer da fragt, als `{benutzerId, benutzerName}`.
 *
 * Bei einem Schluessel eines Menschen ist es sein Besitzer, und ein
 * mitgeschickter Name aendert daran nichts. Bei einem App-Schluessel ist es
 * der Mensch, den die App nennt -- und der muss ein aktives Konto sein, dem
 * die App freigegeben ist: dieselbe Regel wie `einreicher` am Flow
 * (`freigabeAnfragen.pruefeRegel`). Ein Protokoll, in das eine App beliebige
 * Namen schreibt, weist nichts nach. Nennt sie niemanden, steht dort niemand.
 */
async function werFragt(apiKey, name, { datenbank = db } = {}) {
  if (!apiKey.appId) {
    if (!apiKey.userId) {
      return { benutzerId: null, benutzerName: null };
    }
    const { rows } = await datenbank.query(
      'SELECT id, username FROM public.admin_users WHERE id = $1',
      [apiKey.userId]
    );
    return { benutzerId: Number(apiKey.userId), benutzerName: rows[0]?.username ?? null };
  }
  if (!name) {
    return { benutzerId: null, benutzerName: null };
  }

  const { rows } = await datenbank.query(
    `SELECT u.id, u.username
       FROM public.app_members m
       JOIN public.admin_users u ON u.id = m.user_id
      WHERE m.app_id = $1 AND u.username = $2 AND u.is_active = TRUE`,
    [apiKey.appId, name]
  );
  if (!rows[0]) {
    throw new ValidationError(
      `Einreicher "${name}": kein aktives Konto, dem die App ${apiKey.appId} freigegeben ist. ` +
        'Gemeint ist der Benutzername aus der Kopfzeile X-Arasul-User.'
    );
  }
  return { benutzerId: Number(rows[0].id), benutzerName: rows[0].username };
}

/**
 * Die Zeile anlegen, bevor das Modell gefragt wird.
 *
 * @param {object} was
 * @param {object} was.apiKey    `req.apiKey`
 * @param {string} was.endpunkt  der Weg relativ zur Schnittstelle
 * @param {string|null} [was.einreicher]
 * @param {string|null} [was.modell]  das erbetene Modell; das wirkliche kommt nach
 * @param {{mimetype?: string, size?: number}|null} [was.datei]
 * @returns {Promise<number>} die Kennung der Zeile
 */
async function beginne(
  { apiKey, endpunkt, einreicher = null, modell = null, datei = null },
  { datenbank = db } = {}
) {
  const { benutzerId, benutzerName } = await werFragt(apiKey, einreicher, { datenbank });
  const { rows } = await datenbank.query(
    `INSERT INTO public.ki_aufrufe
       (app_id, stand, schluessel_name, benutzer_id, benutzer_name, endpunkt, modell,
        datei_typ, datei_bytes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      apiKey.appId || null,
      apiKey.appId ? apiKey.stand : null,
      apiKey.name || null,
      benutzerId,
      benutzerName,
      endpunkt,
      modell || null,
      datei?.mimetype || null,
      Number.isFinite(datei?.size) ? datei.size : null,
    ]
  );
  return Number(rows[0].id);
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

/**
 * Die Zeile schliessen. Wirft nie: der Aufruf ist gelaufen, und seine Antwort
 * an der Buchfuehrung scheitern zu lassen, hiesse, dem Menschen ein Ergebnis
 * vorzuenthalten, das das Modell schon geliefert hat.
 */
async function beende(
  id,
  { status, fehler = null, antwort = null, modell = null, jobId = null },
  { datenbank = db } = {}
) {
  try {
    // `job_id` und `modell` noch einmal: stand der Auftrag beim Einreihen
    // nicht in der Zeile (`setzeAuftrag` scheiterte), kommt er hier nach.
    await datenbank.query(
      `UPDATE public.ki_aufrufe
          SET status = $2,
              fehler = $3,
              antwort_sha256 = $4,
              modell = COALESCE($5, modell),
              job_id = COALESCE(job_id, $6::uuid),
              beendet_am = NOW(),
              dauer_ms = GREATEST(0, (EXTRACT(EPOCH FROM (NOW() - begonnen_am)) * 1000)::int)
        WHERE id = $1 AND status = 'laeuft'`,
      [
        id,
        status,
        fehler ? String(fehler).slice(0, 500) : null,
        antwort == null ? null : sha256(antwort),
        modell,
        jobId,
      ]
    );
  } catch (err) {
    logger.error(`[KI-Protokoll] Zeile ${id} liess sich nicht schliessen: ${err.message}`);
  }
}

/**
 * Den Auftrag der Warteschlange eintragen, sobald es ihn gibt.
 *
 * Wirft nicht, aus demselben Grund wie `beende`: der Auftrag ist schon
 * eingereiht und rechnet. `verfolge` traegt ihn beim Schliessen nach.
 */
async function setzeAuftrag(id, { jobId, modell }, { datenbank = db } = {}) {
  try {
    await datenbank.query(
      'UPDATE public.ki_aufrufe SET job_id = $2, modell = COALESCE($3, modell) WHERE id = $1',
      [id, jobId, modell || null]
    );
  } catch (err) {
    logger.error(`[KI-Protokoll] Zeile ${id}: Auftrag ${jobId} nicht eingetragen: ${err.message}`);
  }
}

/**
 * Die Zeile nach dem Stand ihres Auftrags schliessen. `true`, wenn der
 * Auftrag zu Ende ist (oder nicht mehr da) und die Zeile damit geschlossen.
 */
async function schliesseNachAuftrag(id, jobId, job, { modell = null, datenbank = db } = {}) {
  if (!job) {
    await beende(
      id,
      { status: 'fehler', fehler: 'Auftrag verschwunden', jobId, modell },
      { datenbank }
    );
    return true;
  }
  if (!ENDZUSTAENDE.has(job.status)) {
    return false;
  }
  if (job.status === 'completed') {
    await beende(
      id,
      { status: 'fertig', antwort: job.content ?? '', jobId, modell },
      { datenbank }
    );
  } else {
    await beende(
      id,
      {
        status: 'fehler',
        fehler: job.status === 'cancelled' ? 'abgebrochen' : job.error_message || 'Fehler',
        jobId,
        modell,
      },
      { datenbank }
    );
  }
  return true;
}

/**
 * Dem Auftrag folgen, bis er fertig ist, und die Zeile dann schliessen.
 * Laeuft losgeloest. Ein Fehler beim Nachsehen ist ein Aussetzer, kein Ende:
 * gefragt wird im naechsten Takt wieder.
 */
async function verfolge(
  id,
  jobId,
  { jobs = llmJobService, takt = TAKT_MS, hoechstens = HOECHSTENS_MS, modell = null } = {}
) {
  const ende = Date.now() + hoechstens;
  const warte = () =>
    new Promise(resolve => {
      const t = setTimeout(resolve, takt);
      t.unref?.();
    });
  while (Date.now() < ende) {
    // Erst warten, dann fragen: kein Auftrag ist fertig, kaum dass er
    // eingereiht ist, und die Route, die wartet, fragt ohnehin schon.
    await warte();
    let job;
    try {
      job = await jobs.getJob(jobId);
    } catch (err) {
      logger.warn(`[KI-Protokoll] Auftrag ${jobId} nicht lesbar: ${err.message}`);
      continue;
    }
    if (await schliesseNachAuftrag(id, jobId, job, { modell })) {
      return;
    }
  }
}

/**
 * Zeilen schliessen, denen niemand mehr folgt.
 *
 * `verfolge` lebt im Prozess. Jeder Deploy startet das Backend neu, und was
 * in dem Augenblick lief, stuende sonst fuer immer auf `laeuft` -- in einem
 * Nachweis nicht zu unterscheiden von einem Aufruf, der haengt. Beim Start
 * (`beimStart`) wird jede Zeile aus einem frueheren Prozess nachgesehen: ist
 * ihr Auftrag zu Ende, schliesst sie danach, laeuft er noch, folgt ihm dieser
 * Prozess weiter, und ohne Auftrag ist sie `fehler`. Danach alle zehn Minuten
 * dasselbe fuer Zeilen, die laenger offen sind, als `verfolge` wartet.
 */
async function schliesseVerwaiste(
  { beimStart = false } = {},
  { datenbank = db, jobs = llmJobService } = {}
) {
  let rows;
  try {
    ({ rows } = await datenbank.query(
      `SELECT id, job_id, modell, begonnen_am < $1 AS aus_frueherem_prozess
         FROM public.ki_aufrufe
        WHERE status = 'laeuft'
          AND (begonnen_am < $1 OR begonnen_am < NOW() - $2::int * INTERVAL '1 millisecond')`,
      [PROZESS_START, HOECHSTENS_MS]
    ));
  } catch (err) {
    logger.warn(`[KI-Protokoll] offene Zeilen nicht lesbar: ${err.message}`);
    return 0;
  }
  let geschlossen = 0;
  for (const z of rows) {
    const id = Number(z.id);
    if (!z.job_id) {
      await beende(
        id,
        {
          status: 'fehler',
          fehler: 'unterbrochen: das Backend startete neu, bevor der Aufruf endete',
        },
        { datenbank }
      );
      geschlossen += 1;
      continue;
    }
    let job;
    try {
      job = await jobs.getJob(z.job_id);
    } catch (err) {
      logger.warn(`[KI-Protokoll] Auftrag ${z.job_id} nicht lesbar: ${err.message}`);
      continue;
    }
    if (await schliesseNachAuftrag(id, z.job_id, job, { datenbank })) {
      geschlossen += 1;
    } else if (beimStart && z.aus_frueherem_prozess) {
      verfolge(id, z.job_id, { jobs }).catch(err =>
        logger.warn(`[KI-Protokoll] Zeile ${id}: ${err.message}`)
      );
    }
  }
  if (geschlossen > 0) {
    logger.info(`[KI-Protokoll] ${geschlossen} offene Zeile(n) geschlossen`);
  }
  return geschlossen;
}

/**
 * Einen Auftrag an die Warteschlange geben, mit Zeile davor und danach.
 *
 * `einreihen` ist der Aufruf von `llmQueueService.enqueue` und liefert
 * `{jobId, model, ...}`; zurueck kommt genau das. Scheitert das Einreihen,
 * steht der Aufruf als `fehler` im Protokoll, und der Fehler geht weiter.
 */
async function einreihen(kontext, einreihenFn) {
  const id = await beginne(kontext);
  let auftrag;
  try {
    auftrag = await einreihenFn();
  } catch (err) {
    await beende(id, { status: 'fehler', fehler: err.message });
    throw err;
  }
  await setzeAuftrag(id, { jobId: auftrag.jobId, modell: auftrag.model });
  verfolge(id, auftrag.jobId, { modell: auftrag.model || null }).catch(err =>
    logger.warn(`[KI-Protokoll] Zeile ${id}: ${err.message}`)
  );
  return auftrag;
}

/**
 * Ein Aufruf ohne Warteschlange (Einbettungen): Zeile, Arbeit, Zeile.
 * `arbeit` liefert `{ergebnis, modell}`; zurueck kommt `ergebnis`.
 */
async function messen(kontext, arbeit) {
  const id = await beginne(kontext);
  let ausgang;
  try {
    ausgang = await arbeit();
  } catch (err) {
    await beende(id, { status: 'fehler', fehler: err.message });
    throw err;
  }
  await beende(id, { status: 'fertig', modell: ausgang.modell || null });
  return ausgang.ergebnis;
}

/**
 * Der Modellschritt eines Flow-Laufs (26.09.2026, J35, Migration 189).
 *
 * Ein Flow hat seinen Lauf mit Schritten, und bis hierher stand er deshalb
 * NICHT in diesem Protokoll. Die App-Bau-Probe vom 26.09.2026 fand genau
 * diese Luecke: nach einer Freigabe schrieb ein Flow einen Satz mit dem
 * Modell, und im Protokoll standen nur die Auslesungen. Ein Nachweis, der die
 * Haelfte der Vorschlaege an einer anderen Stelle fuehrt -- und dort ohne den
 * Menschen, fuer den der Lauf lief --, weist nichts nach.
 *
 * Kein Schluessel: der Lauf kennt App, Stand und Einreicher selbst
 * (`flowRunner.starten`), und `werFragt` wurde beim Start schon gefragt
 * (`freigabeAnfragen.pruefeRegel`). Hier steht nur noch der Name dazu.
 *
 * ANDERS ALS `beginne` WIRFT DIESE ZEILE NIE. Ein Flow ist schon unterwegs,
 * wenn er das Modell fragt, und ihn an der Buchfuehrung abbrechen hiesse,
 * einen halben Lauf mit einem geschriebenen, aber unbeantworteten Schritt zu
 * hinterlassen. Scheitert die Zeile, steht der Schritt im Lauf, und das Log
 * sagt, dass er hier fehlt.
 *
 * @param {object} lauf
 * @param {number|string} lauf.runId
 * @param {string} lauf.flowName
 * @param {string|null} [lauf.appId]
 * @param {'test'|'live'|null} [lauf.stand]
 * @param {number|null} [lauf.einreicherId]  wer den Lauf ausgeloest hat
 * @param {number|null} [lauf.userId]        ohne App: der Mensch, dem der Lauf gehoert
 * @param {string|null} modell
 * @param {() => Promise<object>} arbeit  der Aufruf; liefert das `message`-Objekt
 * @returns {Promise<object>} was `arbeit` liefert
 */
async function flowSchritt(lauf, modell, arbeit, { datenbank = db } = {}) {
  let id = null;
  try {
    // Mit einer App ist es der Einreicher -- NICHT der Besitzer des
    // Schluessels, der ist ein Administrator, der die App eingespielt hat.
    // Ohne App ist der Lauf der eines Menschen, und er ist es selbst.
    const benutzerId = lauf.appId ? (lauf.einreicherId ?? null) : (lauf.userId ?? null);
    let benutzerName = null;
    if (benutzerId != null) {
      const { rows } = await datenbank.query(
        'SELECT username FROM public.admin_users WHERE id = $1',
        [benutzerId]
      );
      benutzerName = rows[0]?.username ?? null;
    }
    const { rows } = await datenbank.query(
      `INSERT INTO public.ki_aufrufe
         (app_id, stand, benutzer_id, benutzer_name, endpunkt, modell, lauf_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        lauf.appId || null,
        lauf.appId ? lauf.stand : null,
        benutzerId == null ? null : Number(benutzerId),
        benutzerName,
        `flows/${lauf.flowName}`,
        modell || null,
        lauf.runId == null ? null : Number(lauf.runId),
      ]
    );
    id = Number(rows[0].id);
  } catch (err) {
    logger.error(
      `[KI-Protokoll] Modellschritt von Lauf ${lauf.runId} nicht eingetragen: ${err.message}`
    );
  }

  let message;
  try {
    message = await arbeit();
  } catch (err) {
    if (id != null) {
      await beende(id, { status: 'fehler', fehler: err.message }, { datenbank });
    }
    throw err;
  }
  if (id != null) {
    // Die Antwort ist, was das Modell sagte, und, wenn es ein Werkzeug rief,
    // welches mit welchen Argumenten -- auch das ist ein Vorschlag.
    const aufrufe = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
    const antwort =
      aufrufe.length > 0
        ? JSON.stringify({ content: message?.content || '', tool_calls: aufrufe })
        : message?.content || '';
    await beende(id, { status: 'fertig', antwort }, { datenbank });
  }
  return message;
}

/**
 * Die Zeile zu einem Auftrag, wenn er diesem Schluessel gehoert.
 *
 * Fuer das Abholen eines Ergebnisses (J35): gesucht wird nach App und Stand
 * des Schluessels, nicht nach dem Schluessel selbst -- der einer App wuerfelt
 * jedes Einspielen neu, und ein Auftrag, der waehrenddessen fertig wird,
 * gehoert trotzdem der App. Zwei Apps, die derselbe Administrator eingespielt
 * hat, sehen einander so nicht: `llm_jobs.user_id` allein waere bei beiden
 * derselbe Mensch.
 *
 * @returns {Promise<{modell: string|null}|null>}
 */
async function aufrufZumAuftrag({ jobId, apiKey, endpunkt }, { datenbank = db } = {}) {
  const { rows } = await datenbank.query(
    `SELECT modell
       FROM public.ki_aufrufe
      WHERE job_id = $1
        AND endpunkt = $2
        AND app_id IS NOT DISTINCT FROM $3
        AND stand IS NOT DISTINCT FROM $4
      ORDER BY id DESC
      LIMIT 1`,
    [jobId, endpunkt, apiKey.appId || null, apiKey.appId ? apiKey.stand : null]
  );
  return rows[0] ? { modell: rows[0].modell ?? null } : null;
}

/**
 * Die Aufrufe einer App, neueste zuerst -- fuer den Administrator.
 */
async function listeFuerApp({ appId, stand = null, limit = 50 }, { datenbank = db } = {}) {
  const { rows } = await datenbank.query(
    `SELECT id, begonnen_am, beendet_am, dauer_ms, app_id, stand, benutzer_id, benutzer_name,
            endpunkt, modell, job_id, lauf_id, status, fehler, antwort_sha256, datei_typ,
            datei_bytes
       FROM public.ki_aufrufe
      WHERE app_id = $1 AND ($2::text IS NULL OR stand = $2)
      ORDER BY begonnen_am DESC, id DESC
      LIMIT $3`,
    [appId, stand, limit]
  );
  return rows.map(r => ({
    ...r,
    id: Number(r.id),
    benutzer_id: r.benutzer_id == null ? null : Number(r.benutzer_id),
    lauf_id: r.lauf_id == null ? null : Number(r.lauf_id),
  }));
}

module.exports = {
  einreicherAus,
  werFragt,
  beginne,
  beende,
  verfolge,
  schliesseVerwaiste,
  einreihen,
  messen,
  flowSchritt,
  aufrufZumAuftrag,
  listeFuerApp,
};
