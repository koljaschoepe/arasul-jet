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
const ENDZUSTAENDE = new Set(['fertig', 'fehler', 'abgebrochen']);

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
  { userId, flowName, appId = null, stand = null, arguments: args = {} },
  { db = database } = {}
) {
  const { rows } = await db.query(
    `INSERT INTO flow_runs (user_id, flow_name, app_id, stand, arguments)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING *`,
    [userId, flowName, appId, stand, JSON.stringify(args || {})]
  );
  return rows[0];
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
        AND status = 'laeuft'
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
async function cancelRun({ runId, userId }, { db = database } = {}) {
  // Erst den Lauf — nur wenn er dem Nutzer gehört UND noch läuft.
  const { rows } = await db.query(
    `UPDATE flow_runs
        SET status = 'abgebrochen', finished_at = NOW()
      WHERE id = $1
        AND user_id = $2
        AND status = 'laeuft'
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
 * @param {number} p.userId
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
  const params = [runId, userId];
  let filter = '';
  if (appId != null) {
    params.push(appId, stand);
    filter = `AND app_id = $${params.length - 1} AND stand = $${params.length}`;
  }
  const runRes = await db.query(
    `SELECT * FROM flow_runs WHERE id = $1 AND user_id = $2 ${filter}`,
    params
  );
  if (runRes.rows.length === 0) {
    throw new NotFoundError(`Flow-Lauf ${runId} nicht gefunden`);
  }
  const spalten = includeRaw
    ? '*'
    : 'id, run_id, position, kind, name, input, output, status, created_at, finished_at, parent_step_id, modell';
  const stepsRes = await db.query(
    `SELECT ${spalten} FROM flow_run_steps WHERE run_id = $1 ORDER BY position ASC`,
    [runId]
  );
  return { ...runRes.rows[0], steps: stepsRes.rows };
}

/**
 * Lädt die neuesten Läufe eines Nutzers (ohne Schritte, für eine Übersicht).
 *
 * `appId` engt auf eine App und ihren Stand ein (C6) — derselbe Schnitt wie in
 * `getRun`.
 */
async function listRuns(
  { userId, limit = 50, status = null, flowName = null, appId = null, stand = null },
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
  if (appId != null) {
    params.push(appId, stand);
    filter += `AND app_id = $${params.length - 1} AND stand = $${params.length} `;
  }
  params.push(Math.min(Math.max(1, limit), 200));
  const { rows } = await db.query(
    `SELECT id, flow_name, app_id, stand, status, steps_used, created_at, finished_at, arguments
       FROM flow_runs
      WHERE user_id = $1 ${filter}
      ORDER BY id DESC
      LIMIT $${params.length}`,
    params
  );
  return rows;
}

module.exports = {
  createRun,
  startStep,
  finishStep,
  finishRun,
  saveChanges,
  bumpSteps,
  cancelRun,
  getRun,
  listRuns,
  ENDZUSTAENDE,
};
