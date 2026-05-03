/**
 * Security Audit Log utility (Phase 1.5)
 *
 * Schreibt high-value Audit-Einträge in `audit_logs` (separate Tabelle vom
 * generischen api_audit_logs-Middleware). Aufbewahrung: 7 Jahre (StBerG/BRAO).
 *
 * Verhalten:
 *   - Asynchron, blockiert NIE den Request.
 *   - Bei DB-Failure: Retry mit exponential backoff (max 5 Versuche, max 10 Min).
 *   - In-Memory-Queue (max 1000 Einträge) puffert während DB down ist.
 *   - Bei voller Queue: ältester Eintrag wird verworfen, audit_log_health
 *     bekommt einen Failure-Counter-Increment.
 *   - Health-Tabelle (audit_log_health) hält Counter + last_failure_reason.
 */

const db = require('../database');
const logger = require('./logger');

const MAX_QUEUE_SIZE = 1000;
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1000;

const queue = [];
let processing = false;

async function recordHealth({ success, reason }) {
  try {
    if (success) {
      await db.query(`UPDATE audit_log_health SET last_success_at = NOW() WHERE id = 1`);
    } else {
      await db.query(
        `UPDATE audit_log_health
           SET failure_count = failure_count + 1,
               last_failure_at = NOW(),
               last_failure_reason = $1
         WHERE id = 1`,
        [String(reason).slice(0, 500)]
      );
    }
  } catch {
    // Wenn die Health-Tabelle selbst nicht erreichbar ist, gibt es nichts zu tun.
  }
}

async function writeOne(entry) {
  await db.query(
    `INSERT INTO audit_logs (user_id, action, details, ip_address, request_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      entry.userId,
      entry.action,
      JSON.stringify(entry.details || {}),
      entry.ipAddress,
      entry.requestId,
    ]
  );
}

async function processQueue() {
  if (processing) {return;}
  processing = true;
  try {
    while (queue.length > 0) {
      const entry = queue[0];
      try {
        await writeOne(entry);
        queue.shift();
        await recordHealth({ success: true });
      } catch (err) {
        entry.retries = (entry.retries || 0) + 1;
        if (entry.retries >= MAX_RETRIES) {
          // Aufgegeben — der Eintrag ist verloren. Loggen mit ERROR-Level
          // damit ops-monitoring (Self-Healing-Agent / Logger-File-Tail)
          // anschlagen kann.
          logger.error(
            `Audit-Log dauerhaft verloren nach ${MAX_RETRIES} Retries: ` +
              `action=${entry.action} reason=${err.message}`,
            { action: entry.action, userId: entry.userId, error: err.message }
          );
          queue.shift();
          await recordHealth({ success: false, reason: err.message });
        } else {
          const delay = BASE_RETRY_DELAY_MS * Math.pow(2, entry.retries - 1);
          logger.warn(
            `Audit-Log retry ${entry.retries}/${MAX_RETRIES} nach ${delay}ms: ${err.message}`
          );
          await new Promise(r => {
            setTimeout(r, delay);
          });
        }
      }
    }
  } finally {
    processing = false;
  }
}

/**
 * Schreibt einen Security-Audit-Eintrag asynchron. Blockiert nie.
 * @param {Object} params
 * @param {number|null} params.userId - User ID (null für unauthenticated)
 * @param {string} params.action - Semantische Aktion
 * @param {Object} [params.details] - Aktion-spezifischer Kontext
 * @param {string} [params.ipAddress] - Client-IP
 * @param {string} [params.requestId] - Korrelations-ID
 */
function logSecurityEvent({ userId, action, details = {}, ipAddress = null, requestId = null }) {
  if (queue.length >= MAX_QUEUE_SIZE) {
    // Queue voll — ältester Eintrag wird verworfen. Das ist ein Datenleck im
    // Audit-Trail und muss laut werden.
    const dropped = queue.shift();
    logger.error(
      `Audit-Log-Queue voll (${MAX_QUEUE_SIZE}). Eintrag verworfen: ` +
        `action=${dropped.action} userId=${dropped.userId}`
    );
    recordHealth({ success: false, reason: 'queue_overflow' });
  }
  queue.push({ userId, action, details, ipAddress, requestId, retries: 0 });
  // setImmediate stellt sicher, dass der Caller nicht blockiert wird.
  setImmediate(() =>
    processQueue().catch(err => {
      logger.error(`processQueue crashed: ${err.message}`);
    })
  );
}

/**
 * Health-Snapshot für /api/admin/audit/health.
 */
async function getAuditHealth() {
  const result = await db.query(
    `SELECT failure_count, last_failure_at, last_failure_reason, last_success_at
       FROM audit_log_health WHERE id = 1`
  );
  return {
    queue_depth: queue.length,
    queue_max: MAX_QUEUE_SIZE,
    ...(result.rows[0] || {}),
  };
}

module.exports = { logSecurityEvent, getAuditHealth };
