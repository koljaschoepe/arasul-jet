/**
 * DB-Schicht der Flow-Auslöser (Plan 013, B8).
 *
 * Dünne, eigentümer-geprüfte CRUD-Schicht über `flow_schedules`. Fachlogik
 * (Cron berechnen, fällige starten, Ereignis feuern) liegt im `scheduler.js` —
 * hier steht nur der Datenzugriff, damit beide für Tests einzeln stehen.
 *
 * Wie überall im Flow-Layer: ein Auslöser gehört einem Nutzer; ein fremder Zugriff
 * liefert `null` statt „verboten" (die Existenz fremder Zeilen wird nicht verraten).
 */

const database = require('../../database');
const { ValidationError } = require('../../utils/errors');
const { naechsteFaelligkeit } = require('./cronExpr');

/** Spalten, die nach außen gehen (kein internes Rauschen). */
const SPALTEN = `id, flow_name, trigger_type, cron, event_name, args, enabled,
  next_run_at, last_run_at, last_run_id, last_error, created_at, updated_at`;

/**
 * Legt einen Auslöser an. Bei einem Zeitplan wird `next_run_at` sofort aus dem
 * Cron berechnet, damit der Tick ihn ohne weiteren Parser-Lauf findet.
 */
async function createSchedule(
  { userId, flowName, triggerType, cron = null, eventName = null, args = {}, enabled = true },
  { db = database, jetzt = new Date() } = {}
) {
  const nextRun = triggerType === 'zeitplan' && enabled ? naechsteFaelligkeit(cron, jetzt) : null;
  const { rows } = await db.query(
    `INSERT INTO flow_schedules
       (user_id, flow_name, trigger_type, cron, event_name, args, enabled, next_run_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
     RETURNING ${SPALTEN}`,
    [userId, flowName, triggerType, cron, eventName, JSON.stringify(args || {}), enabled, nextRun]
  );
  return rows[0];
}

/** Alle Auslöser eines Nutzers, neueste zuerst. */
async function listSchedules({ userId }, { db = database } = {}) {
  const { rows } = await db.query(
    `SELECT ${SPALTEN} FROM flow_schedules WHERE user_id = $1 ORDER BY id DESC`,
    [userId]
  );
  return rows;
}

/** Ein einzelner Auslöser (eigentümer-geprüft) oder null. */
async function getSchedule({ id, userId }, { db = database } = {}) {
  const { rows } = await db.query(
    `SELECT ${SPALTEN} FROM flow_schedules WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] || null;
}

/**
 * Ändert einen Auslöser zusammenführend (nur übergebene Felder). Ändert sich
 * Cron oder wird ein Zeitplan (wieder) aktiviert, wird `next_run_at` neu
 * berechnet; wird er deaktiviert, auf NULL gesetzt.
 *
 * @returns {Promise<object|null>} der aktualisierte Auslöser oder null (fremd/weg).
 */
async function updateSchedule({ id, userId, patch }, { db = database, jetzt = new Date() } = {}) {
  const bestehend = await getSchedule({ id, userId }, { db });
  if (!bestehend) {
    return null;
  }
  // Felder des jeweils ANDEREN Trigger-Typs nicht stillschweigend verwerfen
  // (der Aufrufer bekäme sonst 200, obwohl sein Feld wirkungslos blieb):
  if (bestehend.trigger_type === 'ereignis' && patch.cron !== undefined) {
    throw new ValidationError('Dieser Auslöser reagiert auf ein Ereignis — "cron" gilt hier nicht');
  }
  if (bestehend.trigger_type === 'zeitplan' && patch.event_name !== undefined) {
    throw new ValidationError('Dieser Auslöser läuft nach Zeitplan — "event_name" gilt hier nicht');
  }
  const naechst = { ...bestehend, ...patch };
  let nextRun = bestehend.next_run_at;
  if (naechst.trigger_type === 'zeitplan') {
    nextRun = naechst.enabled ? naechsteFaelligkeit(naechst.cron, jetzt) : null;
  } else {
    nextRun = null;
  }
  const { rows } = await db.query(
    `UPDATE flow_schedules
        SET flow_name = $3, cron = $4, event_name = $5, args = $6::jsonb,
            enabled = $7, next_run_at = $8, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING ${SPALTEN}`,
    [
      id,
      userId,
      naechst.flow_name,
      naechst.trigger_type === 'zeitplan' ? naechst.cron : null,
      naechst.trigger_type === 'ereignis' ? naechst.event_name : null,
      JSON.stringify(naechst.args || {}),
      naechst.enabled,
      nextRun,
    ]
  );
  return rows[0] || null;
}

/** Löscht einen Auslöser (eigentümer-geprüft). @returns true, wenn gelöscht. */
async function deleteSchedule({ id, userId }, { db = database } = {}) {
  const { rowCount } = await db.query(`DELETE FROM flow_schedules WHERE id = $1 AND user_id = $2`, [
    id,
    userId,
  ]);
  return rowCount > 0;
}

/**
 * Alle Zeitpläne, die JETZT fällig sind (aktiv, next_run_at erreicht).
 * OHNE Nutzer-Filter — der Tick läuft systemweit.
 */
async function faelligeZeitplaene({ jetzt = new Date() } = {}, { db = database } = {}) {
  const { rows } = await db.query(
    `SELECT ${SPALTEN}, user_id FROM flow_schedules
      WHERE enabled AND trigger_type = 'zeitplan'
        AND next_run_at IS NOT NULL AND next_run_at <= $1
      ORDER BY next_run_at ASC`,
    [jetzt]
  );
  return rows;
}

/** Alle aktiven Ereignis-Auslöser mit diesem Namen (systemweit). */
async function ereignisAusloeser({ eventName }, { db = database } = {}) {
  const { rows } = await db.query(
    `SELECT ${SPALTEN}, user_id FROM flow_schedules
      WHERE enabled AND trigger_type = 'ereignis' AND event_name = $1
      ORDER BY id ASC`,
    [eventName]
  );
  return rows;
}

/**
 * Schreibt das Ergebnis eines automatischen Feuerns zurück: den zuletzt
 * gestarteten Lauf, den nächsten Fälligkeits-Zeitpunkt (bei Zeitplänen) und
 * eine etwaige Fehlerursache. Bewusst OHNE Eigentümer-Filter: der Scheduler
 * ist systemweit und kennt die Zeile aus der Fälligkeits-Abfrage.
 */
async function markiereGefeuert(
  { id, runId = null, nextRunAt = null, error = null },
  { db = database } = {}
) {
  await db.query(
    `UPDATE flow_schedules
        SET last_run_at = NOW(), last_run_id = $2, next_run_at = $3,
            last_error = $4, updated_at = NOW()
      WHERE id = $1`,
    [id, runId, nextRunAt, error]
  );
}

module.exports = {
  createSchedule,
  listSchedules,
  getSchedule,
  updateSchedule,
  deleteSchedule,
  faelligeZeitplaene,
  ereignisAusloeser,
  markiereGefeuert,
  SPALTEN,
};
