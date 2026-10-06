/**
 * Speicher für Flow-Läufe (Plan 011, Schritt 9).
 *
 * Ein Lauf lebte bisher nur im Speicher des Requests: Bricht die Verbindung ab,
 * ist er weg. Dieser Speicher legt jeden Lauf und jeden seiner Schritte in die
 * Datenbank (Migration 112), während er läuft. Damit überlebt ein Lauf das
 * Schließen des Browser-Tabs, und die Live-Übertragung (Schritt 12) kann beim
 * Wiederverbinden den gespeicherten Verlauf nachladen.
 *
 * Bewusst dünn: Dieses Modul KENNT die Flow-Logik nicht. Es schreibt und liest
 * Zeilen, mehr nicht. Der Runner (Schritt 10) und die Subagenten (Schritt 11)
 * rufen es auf; die Regeln liegen dort, nicht hier.
 *
 * Die Trennung von `output` und `raw_output` ist die eine inhaltliche Zusage,
 * die dieses Modul mitträgt (§3): Das verdichtete Ergebnis fließt in den
 * Orchestrator-Kontext, die Rohdaten NUR ins Protokoll. Der Aufrufer entscheidet,
 * was wohin gehört; dieses Modul hält beide Felder getrennt, damit die Grenze
 * überhaupt existieren kann.
 */

const database = require('../../database');
const logger = require('../../utils/logger');
const { NotFoundError, ValidationError } = require('../../utils/errors');

/** Zustände, die einen Lauf beenden — von hier an ändert sich sein Status nicht mehr. */
const ENDZUSTAENDE = new Set([
  'fertig',
  'fehler',
  'abgebrochen',
  'abgelaufen',
  // Das Ergebnis steht, die App hat den Empfang nicht bestaetigt (M5, Migration
  // 198). Fuer den Strom und den Aufrufer ist der Lauf zu Ende; ein Admin kann
  // die Uebergabe mit `abschlussErgebnis` noch zu `fertig` fuehren.
  'nicht_uebergeben',
]);

/**
 * Zustände, in denen ein Lauf noch nicht vorbei ist (Phase C7).
 *
 * `wartend` ist der zweite davon: der Lauf haelt an einer Freigabe und tut
 * nichts, aber er ist NICHT beendet -- derselbe Lauf laeuft nach der
 * Bestaetigung weiter, ab dem Schritt, an dem er stehengeblieben ist. Wer die
 * beiden Zustaende an einer Stelle vergisst, baut genau einen von zwei
 * Fehlern: ein wartender Lauf laesst sich nicht mehr abbrechen, oder eine
 * Live-Verbindung meldet „Ende", waehrend der Lauf noch da ist.
 */
const LAEUFT_NOCH = new Set(['laeuft', 'wartend']);

/**
 * Legt einen neuen Lauf an (Status 'laeuft').
 *
 * `appId`/`stand` (Migration 173, Phase C6) sagen, WESSEN Flow hier lief. Sie
 * stehen ohne Fremdschlüssel da — dieselbe Begründung, mit der `flow_name`
 * seit Migration 112 keinen hat: ein Lauf ist Geschichte und soll lesbar
 * bleiben, wenn die App längst weg ist.
 *
 * @param {object} p
 * @param {number} p.userId
 * @param {string} p.flowName
 * @param {string|null} [p.appId]
 * @param {'test'|'live'|null} [p.stand]
 * @param {object} [p.arguments]
 * @param {object} [deps]
 * @returns {Promise<object>} Die angelegte Lauf-Zeile.
 */
async function createRun(
  {
    userId,
    flowName,
    appId = null,
    stand = null,
    arguments: args = {},
    // Wer ausgeloest hat und wer freigeben darf (J35, Migration 185). Geprueft
    // ist beides schon (`freigabeAnfragen.pruefeRegel`); hier wird es nur
    // festgehalten.
    einreicherId = null,
    freigabeRegel = null,
    // Wodurch der Lauf entstand (Migration 203): `hand`, `zeitplan` oder
    // `ereignis` (Migration 204, dann mit dem Namen des Ereignisses).
    ausloeser = 'hand',
    ereignis = null,
    // Ein kurzer Titel, den die App beim Start mitgibt (Kontrakt 14, Migration
    // 211): er steht vorn an jeder Freigabe des Laufs.
    titel = null,
  },
  { db = database } = {}
) {
  const { rows } = await db.query(
    `INSERT INTO flow_runs (user_id, flow_name, app_id, stand, arguments,
                            einreicher_id, freigabe_regel, ausloeser, ereignis, titel)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9, $10)
     RETURNING *`,
    [
      userId,
      flowName,
      appId,
      stand,
      JSON.stringify(args || {}),
      einreicherId,
      freigabeRegel ? JSON.stringify(freigabeRegel) : null,
      ausloeser,
      ereignis,
      titel ? String(titel).trim().slice(0, 120) || null : null,
    ]
  );
  return rows[0];
}

/**
 * Den Titel eines Laufs setzen, wenn er noch keinen hat (M5, Kontrakt 14):
 * aus den erkannten Feldern, wenn die App beim Start keinen mitgab. Was die App
 * nannte, bleibt.
 *
 * @returns {Promise<string|null>} der Titel, der jetzt gilt
 */
async function titelSetzen({ runId, titel }, { db = database } = {}) {
  const text = String(titel || '')
    .trim()
    .slice(0, 120);
  const { rows } = await db.query(
    `UPDATE flow_runs SET titel = COALESCE(titel, NULLIF($2, ''))
      WHERE id = $1
      RETURNING titel`,
    [runId, text]
  );
  return rows[0]?.titel ?? null;
}

/**
 * Hängt einen Schritt an einen Lauf an und gibt ihn zurück.
 *
 * Die `position` wird NICHT vom Aufrufer bestimmt, sondern hier aus dem aktuellen
 * Höchststand abgeleitet (`MAX(position)+1` in derselben Anweisung).
 *
 * ZUR NEBENLÄUFIGKEIT, ehrlich: `MAX(position)+1` unter READ COMMITTED ist NICHT
 * für sich race-frei. Läsen zwei Inserts für DENSELBEN Lauf gleichzeitig, bekämen
 * beide dieselbe Position; der UNIQUE(run_id, position) fängt das ab, aber der
 * Verlierer scheitert dann (PG 23505 → 409) — der Schritt ginge verloren, das
 * ist keine echte Lösung. Verlassen wird sich deshalb auf eine EIGENSCHAFT des
 * Runners, nicht auf diese Anweisung: Ein Lauf hat genau EINEN Schreiber. Alle
 * Modell-Aufrufe eines Laufs gehen durch die GPU-Warteschlange mit einem Platz
 * (Schritt 10), und auch die zwei Subagent-Ebenen (Schritt 11) laufen
 * sequenziell über denselben Orchestrator — nie zwei Schritte desselben Laufs
 * zugleich. Der UNIQUE-Constraint bleibt als Wächter: Bricht diese Annahme je,
 * scheitert der Insert laut, statt still die Reihenfolge zu verfälschen.
 *
 * @param {object} p
 * @param {number} p.runId
 * @param {'werkzeug'|'subagent'|'modell'|'hinweis'} p.kind
 * @param {string} [p.name]
 * @param {object} [p.input]
 * @param {number|null} [p.parentStepId] - Eltern-Schritt (Subagent), dessen
 *   innerer Werkzeug-Aufruf dieser Schritt ist. NULL = oberste Ebene.
 * @param {string|null} [p.modell] - Das Modell, das diesen Schritt treibt
 *   (Subagent-Rolle / Modell-Schritt). NULL bei reinen Werkzeug-Schritten.
 * @returns {Promise<object>} Der angelegte Schritt (Status 'laeuft').
 */
async function startStep(
  { runId, kind, name = '', input = {}, parentStepId = null, modell = null },
  { db = database } = {}
) {
  const { rows } = await db.query(
    `INSERT INTO flow_run_steps (run_id, position, kind, name, input, parent_step_id, modell)
     SELECT $1,
            COALESCE(MAX(position) + 1, 0),
            $2, $3, $4::jsonb, $5, $6
       FROM flow_run_steps
      WHERE run_id = $1
     RETURNING *`,
    [runId, kind, name, JSON.stringify(input || {}), parentStepId, modell]
  );
  return rows[0];
}

/**
 * Schließt einen Schritt ab: verdichtetes Ergebnis (`output`) und optional die
 * Rohdaten (`rawOutput`, NUR fürs Protokoll — siehe Kopf).
 *
 * @param {object} p
 * @param {number} p.stepId
 * @param {string} [p.output]
 * @param {string|null} [p.rawOutput]
 * @param {'fertig'|'fehler'|'abgebrochen'} [p.status]
 * @returns {Promise<object>} Der aktualisierte Schritt.
 */
async function finishStep(
  { stepId, output = null, rawOutput = null, status = 'fertig' },
  { db = database } = {}
) {
  // NUR einen noch laufenden Schritt abschließen. Wichtig beim Abbruch: Bricht
  // der Nutzer ab, während ein Werkzeug noch rechnet, markiert `cancelRun` den
  // offenen Schritt bereits als 'abgebrochen'. Läuft das Werkzeug danach doch
  // noch zu Ende, darf sein 'fertig' den Abbruch NICHT übertünchen. Die
  // Bedingung `status = 'laeuft'` fällt dann ins Leere — der Schritt bleibt
  // abgebrochen. (Gleiche Idempotenz wie bei finishRun.)
  const { rows } = await db.query(
    `UPDATE flow_run_steps
        SET output = $2, raw_output = $3, status = $4, finished_at = NOW()
      WHERE id = $1
        AND status = 'laeuft'
      RETURNING *`,
    [stepId, output, rawOutput, status]
  );
  // Kein Treffer heißt: Der Schritt existiert nicht ODER wurde bereits beendet
  // (z. B. durch einen Abbruch). Beides ist hier kein Fehler — der Aufrufer
  // (die Werkzeug-Schleife) darf daran nicht scheitern. Wir prüfen die Existenz
  // getrennt, damit ein echter Programmierfehler (falsche ID) sichtbar bleibt.
  if (rows.length === 0) {
    const da = await db.query(`SELECT id FROM flow_run_steps WHERE id = $1`, [stepId]);
    if (da.rows.length === 0) {
      throw new NotFoundError(`Flow-Schritt ${stepId} nicht gefunden`);
    }
    return da.rows[0]; // schon beendet — unverändert lassen
  }
  return rows[0];
}

/**
 * Beendet einen Lauf. Setzt Status, Ergebnis/Fehler, finished_at.
 *
 * Idempotent gegenüber Endzuständen: Ein bereits beendeter Lauf wird NICHT
 * überschrieben — sonst könnte ein spät eintreffender Abschluss einen
 * zwischenzeitlichen Abbruch übertünchen. Die Bedingung steht im WHERE, damit
 * die Entscheidung atomar in der DB fällt, nicht in einer Lese-dann-Schreib-Lücke.
 *
 * @param {object} p
 * @param {number} p.runId
 * @param {'fertig'|'fehler'|'abgebrochen'} p.status
 * @param {string|null} [p.result]
 * @param {string|null} [p.error]
 * @param {number} [p.stepsUsed]
 * @returns {Promise<object|null>} Der aktualisierte Lauf, oder null wenn er
 *   bereits beendet war.
 */
async function finishRun(
  { runId, status, result = null, error = null, stepsUsed, annahmen = null },
  { db = database } = {}
) {
  if (!ENDZUSTAENDE.has(status)) {
    // Custom-Error statt `throw new Error` (Backend-Regel): Ruft der Runner
    // (Schritt 10) das je falsch auf, wird daraus ein sauberer 400, kein 500.
    throw new ValidationError(`finishRun: "${status}" ist kein Endzustand`);
  }
  const { rows } = await db.query(
    `UPDATE flow_runs
        SET status = $2,
            result = $3,
            error = $4,
            steps_used = COALESCE($5, steps_used),
            annahmen = $6::jsonb,
            finished_at = NOW()
      WHERE id = $1
        AND status IN ('laeuft', 'wartend')
      RETURNING *`,
    [
      runId,
      status,
      result,
      error,
      stepsUsed ?? null,
      // Annahmen-Protokoll (Plan 014, Phase 2): NULL = kein Prüfschritt gelaufen.
      annahmen == null ? null : JSON.stringify(annahmen),
    ]
  );
  return rows[0] || null;
}

/**
 * Haelt fest, dass die Uebergabe an die Abschluss-Route der App beginnt (M5,
 * Migration 198): Ergebnis, Schrittzaehler und Annahmen werden JETZT
 * geschrieben, der Lauf bleibt `laeuft`. Stirbt das Backend mitten im Aufruf,
 * steht das Ergebnis in der Datenbank, und der Lauf wird beim Hochfahren
 * `nicht_uebergeben` statt `fehler` (`flowRunner.verwaisteAufraeumen`).
 */
async function beginneAbschluss(
  { runId, route, result, stepsUsed, annahmen = null },
  { db = database } = {}
) {
  const { rows } = await db.query(
    `UPDATE flow_runs
        SET result = $2,
            steps_used = COALESCE($3, steps_used),
            annahmen = $4::jsonb,
            abschluss = jsonb_build_object('route', $5::text, 'versuche', 0)
      WHERE id = $1 AND status = 'laeuft'
      RETURNING id`,
    [runId, result, stepsUsed ?? null, annahmen == null ? null : JSON.stringify(annahmen), route]
  );
  return rows.length > 0;
}

/**
 * Schreibt den Ausgang EINES Uebergabeversuchs (M5): 2xx der App macht den Lauf
 * `fertig`, alles andere `nicht_uebergeben`. Gilt fuer den ersten Versuch
 * (`laeuft`) und fuer „erneut" (`nicht_uebergeben`); ein abgebrochener Lauf
 * bleibt abgebrochen, ein bereits uebergebener fertig. Die Bedingung steht im
 * WHERE: zwei gleichzeitige „erneut" schreiben nacheinander, nie
 * durcheinander.
 *
 * @returns {Promise<object|null>} die Lauf-Zeile, oder null, wenn der Lauf in
 *   keinem dieser zwei Zustaende mehr war.
 */
async function abschlussErgebnis(
  { runId, ok, statusCode = null, fehler = null },
  { db = database } = {}
) {
  const { rows } = await db.query(
    `UPDATE flow_runs
        SET status = (CASE WHEN $2::boolean THEN 'fertig' ELSE 'nicht_uebergeben' END)::flow_run_status,
            error = CASE WHEN $2::boolean THEN NULL ELSE $4::text END,
            finished_at = NOW(),
            abschluss = COALESCE(abschluss, '{}'::jsonb) || jsonb_build_object(
              'versuche', COALESCE((abschluss->>'versuche')::int, 0) + 1,
              'letzter_versuch', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
              'status_code', $3::int,
              'fehler', $4::text,
              'uebergeben_am', CASE WHEN $2::boolean
                THEN to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') END
            )
      WHERE id = $1 AND status IN ('laeuft', 'nicht_uebergeben')
      RETURNING *`,
    [runId, Boolean(ok), statusCode, fehler]
  );
  return rows[0] || null;
}

/**
 * Legt die Datei-Änderungs-Übersicht eines Laufs ab (Plan 011, Schritt 16).
 *
 * Bewusst OHNE `status = 'laeuft'`-Bedingung: Die Übersicht wird beim Abschluss
 * geschrieben, wenn der Lauf-Status u. U. schon terminal ist (finishRun lief
 * zuerst). Sie ist reine Nachschau, überschreibt keinen Status und darf einen
 * bereits beendeten Lauf ergänzen.
 *
 * @param {object} p
 * @param {number} p.runId
 * @param {object[]} p.changes - [{ pfad, art, vorher, nachher, gekuerzt, hinweis }]
 * @returns {Promise<void>}
 */
async function saveChanges({ runId, changes = [] }, { db = database } = {}) {
  await db.query(`UPDATE flow_runs SET changes = $2::jsonb WHERE id = $1`, [
    runId,
    JSON.stringify(changes || []),
  ]);
}

/** Zählt den Rundenzähler eines laufenden Laufs um `n` hoch (Standard 1). */
async function bumpSteps({ runId, by = 1 }, { db = database } = {}) {
  const { rows } = await db.query(
    `UPDATE flow_runs SET steps_used = steps_used + $2 WHERE id = $1 RETURNING steps_used`,
    [runId, by]
  );
  return rows[0] ? rows[0].steps_used : null;
}

/**
 * Bricht einen laufenden Lauf ab. Markiert den Lauf UND seine noch laufenden
 * Schritte als 'abgebrochen'. Gibt null zurück, wenn der Lauf gar nicht (mehr)
 * lief — der Aufrufer kann daraus einen 404/409 machen.
 */
async function cancelRun({ runId, userId = null }, { db = database } = {}) {
  // Erst den Lauf — nur wenn er dem Nutzer gehört UND noch läuft. Ohne `userId`
  // (der Administrator, M5) gilt jeder Lauf: Läufe aus Zeitplan und Ereignis
  // gehören keinem Menschen, und ein Admin muss auch sie abbrechen können.
  const { rows } = await db.query(
    `UPDATE flow_runs
        SET status = 'abgebrochen', finished_at = NOW()
      WHERE id = $1
        AND ($2::bigint IS NULL OR user_id = $2)
        AND status IN ('laeuft', 'wartend', 'nicht_uebergeben')
      RETURNING *`,
    [runId, userId]
  );
  if (rows.length === 0) {
    return null;
  }
  // Dann die offenen Schritte. Ein bereits fertiger Schritt bleibt fertig.
  await db.query(
    `UPDATE flow_run_steps
        SET status = 'abgebrochen', finished_at = NOW()
      WHERE run_id = $1 AND status = 'laeuft'`,
    [runId]
  );
  logger.info(`Flow-Lauf ${runId} abgebrochen (Nutzer ${userId})`);
  return rows[0];
}

/**
 * Schritte und Freigaben eines Laufs, den der Aufrufer schon gefunden hat.
 * `getRun` (eigene Laeufe) und `getRunFuerApp` (Laeufe-Ansicht der
 * Verwaltung) zeigen dasselbe; bis zum 04.10.2026 fehlten der Verwaltung
 * die Freigaben, am Orin gemessen.
 */
async function schritteUndFreigaben(runId, includeRaw, db) {
  const spalten = includeRaw
    ? '*'
    : 'id, run_id, position, kind, name, input, output, status, created_at, finished_at, parent_step_id, modell';
  const stepsRes = await db.query(
    `SELECT ${spalten} FROM flow_run_steps WHERE run_id = $1 ORDER BY position ASC`,
    [runId]
  );
  // Die Freigaben des Laufs mit ihren Feldern (M5, Migration 197): was die KI
  // vorschlug und was der Mensch beim Bestaetigen aenderte, wer und wann. Die
  // Ansicht des Laufs zeigt beides nebeneinander.
  const freigabenRes = await db.query(
    `SELECT a.id, a.titel, a.stufe, a.status, a.angefragt_am, a.entschieden_am,
            u.username AS entschieden_von, a.begruendung,
            a.felder_schritt, a.felder, a.korrekturen
       FROM public.approvals a
       LEFT JOIN public.admin_users u ON u.id = a.entschieden_von
      WHERE a.run_id = $1
      ORDER BY a.id ASC`,
    [runId]
  );
  return { steps: stepsRes.rows, freigaben: freigabenRes.rows };
}

/**
 * Lädt einen Lauf samt Schritten. Der Lauf muss dem Nutzer gehören — sonst
 * NotFound (nicht Forbidden: die Existenz fremder Läufe wird nicht verraten;
 * gleiche Linie wie beim Workspace-Zugriff).
 *
 * `appId`/`stand` engen ZUSÄTZLICH ein (Phase C6). Ein App-Schlüssel gehört
 * dem Administrator, der die App eingespielt hat — über `user_id` allein sähe
 * die App damit auch seine eigenen Läufe und die jeder anderen App desselben
 * Geräts. „Nur eigene Flows" heißt: nur die dieser App in diesem Stand.
 *
 * @param {object} p
 * @param {number} p.runId
 * @param {number|null} p.userId `null`: der Administrator, jeder Lauf zählt.
 * @param {string|null} [p.appId] Wenn gesetzt, muss der Lauf zu dieser App
 *   und diesem Stand gehören.
 * @param {'test'|'live'|null} [p.stand]
 * @param {boolean} [p.includeRaw=false] Rohdaten der Schritte mitliefern? Für
 *   die Nachschau ja, für die normale Anzeige nein — sie können groß sein.
 */
async function getRun(
  { runId, userId, appId = null, stand = null, includeRaw = false },
  { db = database } = {}
) {
  const params = [runId, userId ?? null];
  let filter = '';
  if (appId != null) {
    params.push(appId, stand);
    filter = `AND app_id = $${params.length - 1} AND stand = $${params.length}`;
  }
  // `userId` null heißt: der Administrator, der jeden Lauf sieht (M5).
  const runRes = await db.query(
    `SELECT * FROM flow_runs WHERE id = $1 AND ($2::bigint IS NULL OR user_id = $2) ${filter}`,
    params
  );
  if (runRes.rows.length === 0) {
    throw new NotFoundError(`Flow-Lauf ${runId} nicht gefunden`);
  }
  return { ...runRes.rows[0], ...(await schritteUndFreigaben(runId, includeRaw, db)) };
}

/**
 * Lädt die neuesten Läufe eines Nutzers (ohne Schritte, für eine Übersicht).
 *
 * `app_id`/`stand` stehen seit C6 in der Auswahl, aber es gibt keinen Filter
 * darauf — die Liste eines Nutzers ist die Liste eines Nutzers, und ein Lauf,
 * den eine seiner Apps gestartet hat, gehört sichtbar dazu. Die Spalten sagen,
 * WOHER er kam. Ein Filter ohne Aufrufer wäre eine Verzweigung, die niemand je
 * durchläuft und die beim nächsten Umbau falsch stehenbleibt; wenn die
 * D-Phasen eine Ansicht je App bauen, kommt er mit ihr.
 */
async function listRuns(
  { userId, limit = 50, status = null, flowName = null },
  { db = database } = {}
) {
  const params = [userId];
  let filter = '';
  if (status != null) {
    params.push(status);
    filter += `AND status = $${params.length} `;
  }
  if (flowName != null) {
    params.push(flowName);
    filter += `AND flow_name = $${params.length} `;
  }
  params.push(Math.min(Math.max(1, limit), 200));
  const { rows } = await db.query(
    `SELECT id, flow_name, app_id, stand, status, steps_used, created_at, finished_at, arguments,
            ausloeser, ereignis
       FROM flow_runs
      WHERE user_id = $1 ${filter}
      ORDER BY id DESC
      LIMIT $${params.length}`,
    params
  );
  return rows;
}

/**
 * Wer hinter einem Lauf steht, als eine Spalte: der Mensch, für den eine App
 * ihn auslöste (`einreicher_id`), bei einem Lauf der Plattform ohne App der
 * Nutzer selbst. Ein Lauf aus Zeitplan oder Ereignis hat keinen: sein
 * `user_id` ist nur der Admin, unter dem er technisch startet.
 */
const PERSON_ID = `COALESCE(r.einreicher_id, CASE WHEN r.app_id IS NULL THEN r.user_id END)`;

/**
 * Läufe über ALLE Apps für die Verwaltung (M5), gefiltert nach App, Ergebnis,
 * Person und Zeitraum. Fehler und „nicht übergeben" stehen oben, darin und
 * danach das Neueste zuerst. Die Berechtigung steht an der Route.
 *
 * @param {{app?: string|null, status?: string|null, person?: number|'ohne'|null,
 *          von?: string|null, bis?: string|null, limit?: number, offset?: number}} p
 * @returns {Promise<{laeufe: object[], gesamt: number}>}
 */
async function listRunsAlle(
  { app = null, status = null, person = null, von = null, bis = null, limit = 50, offset = 0 },
  { db = database } = {}
) {
  const params = [];
  const bedingungen = [];
  const dazu = (sql, wert) => {
    params.push(wert);
    bedingungen.push(sql.replace('?', `$${params.length}`));
  };
  if (app != null) {
    dazu('r.app_id = ?', app);
  }
  if (status != null) {
    dazu('r.status = ?', status);
  }
  if (person === 'ohne') {
    bedingungen.push(`${PERSON_ID} IS NULL`);
  } else if (person != null) {
    dazu(`${PERSON_ID} = ?`, person);
  }
  if (von != null) {
    dazu('r.created_at >= ?::timestamptz', von);
  }
  if (bis != null) {
    dazu('r.created_at < ?::timestamptz', bis);
  }
  const wo = bedingungen.length ? `WHERE ${bedingungen.join(' AND ')}` : '';
  const gesamt = await db.query(`SELECT count(*)::int AS n FROM flow_runs r ${wo}`, [...params]);
  params.push(Math.min(Math.max(1, limit), 200), Math.max(0, offset));
  const { rows } = await db.query(
    `SELECT r.id, r.flow_name, r.app_id, r.stand, r.status, r.steps_used, r.created_at,
            r.finished_at, r.error, r.ausloeser, r.ereignis, r.abschluss,
            ${PERSON_ID} AS person_id,
            NULLIF(trim(coalesce(u.vorname, '') || ' ' || coalesce(u.nachname, '')), '') AS person_name,
            u.username AS person_konto
       FROM flow_runs r
       LEFT JOIN public.admin_users u ON u.id = ${PERSON_ID}
       ${wo}
      ORDER BY (r.status IN ('fehler', 'nicht_uebergeben')) DESC, r.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { laeufe: rows, gesamt: gesamt.rows[0].n };
}

/**
 * Ein Lauf mit Schritten, Freigaben und der Person dahinter, aus jeder App
 * oder von der Plattform (M5). Für die Verwaltung; die Berechtigung steht an
 * der Route.
 */
async function getRunAlle({ runId, includeRaw = false }, { db = database } = {}) {
  const { rows } = await db.query(
    `SELECT r.*, ${PERSON_ID} AS person_id,
            NULLIF(trim(coalesce(u.vorname, '') || ' ' || coalesce(u.nachname, '')), '') AS person_name,
            u.username AS person_konto
       FROM flow_runs r
       LEFT JOIN public.admin_users u ON u.id = ${PERSON_ID}
      WHERE r.id = $1`,
    [runId]
  );
  if (rows.length === 0) {
    throw new NotFoundError(`Flow-Lauf ${runId} nicht gefunden`);
  }
  return { ...rows[0], ...(await schritteUndFreigaben(runId, includeRaw, db)) };
}

module.exports = {
  titelSetzen,
  createRun,
  getRunAlle,
  listRunsAlle,
  startStep,
  finishStep,
  finishRun,
  beginneAbschluss,
  abschlussErgebnis,
  saveChanges,
  bumpSteps,
  cancelRun,
  getRun,
  listRuns,
  ENDZUSTAENDE,
  LAEUFT_NOCH,
};
