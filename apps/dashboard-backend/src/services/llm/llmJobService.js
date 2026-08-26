/* eslint-disable no-promise-executor-return */
/**
 * LLM Job Service
 *
 * Ein Auftrag an das Sprachmodell (`llm_jobs`) ist seit Phase B6 (26.08.2026)
 * zustandslos: er traegt seinen Besitzer (`user_id`), seine Anfrage
 * (`request_data`) und seine Antwort (`content`, `thinking`) selbst. Es gibt
 * keine Konversation und keine Platzhalter-Nachricht mehr, in die die Antwort
 * am Ende umkopiert werden muesste; `cleanup_old_llm_jobs()` (Migration 159)
 * raeumt fertige Auftraege nach einer Stunde weg.
 *
 * Supports Dependency Injection for testing:
 *   const { createLLMJobService } = require('./llmJobService');
 *   const testService = createLLMJobService({ database: mockDb, logger: mockLogger });
 */

/**
 * Factory function to create LLMJobService with injected dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.database - Database module (default: require('../../database'))
 * @param {Object} deps.logger - Logger module (default: require('../../utils/logger'))
 * @returns {LLMJobService} Service instance
 */
function createLLMJobService(deps = {}) {
  const { database = require('../../database'), logger = require('../../utils/logger') } = deps;

  // In-memory tracking of active streams (for abort control)
  const activeStreams = new Map(); // jobId -> { abortController, startTime }

  class LLMJobService {
    /**
     * Create a new LLM job
     * @param {number|null} userId - Besitzer des Auftrags (admin_users.id)
     * @param {string} jobType - 'chat'
     * @param {object} requestData - Original request parameters
     * @returns {Promise<{jobId: string}>}
     */
    async createJob(userId, jobType, requestData) {
      const result = await database.query(
        `INSERT INTO llm_jobs (user_id, job_type, request_data, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING id`,
        [userId, jobType, JSON.stringify(requestData)]
      );
      const jobId = result.rows[0].id;
      logger.info(`Created LLM job ${jobId} for user ${userId}`);
      return { jobId };
    }

    /**
     * Ersetzt den Job-Inhalt KOMPLETT (statt anzuhängen), wenn der bereinigte
     * Endtext statt des gestreamten Roh-Puffers stehen bleiben soll.
     */
    async setJobContent(jobId, content) {
      await database.query(
        `UPDATE llm_jobs SET content = $2, last_update_at = NOW() WHERE id = $1`,
        [jobId, String(content ?? '')]
      );
    }

    /**
     * Update job content incrementally
     * Called during streaming to persist partial content
     * @param {string} jobId - Job UUID
     * @param {string|null} contentDelta - New content to append
     * @param {string|null} thinkingDelta - New thinking content to append
     */
    async updateJobContent(jobId, contentDelta = null, thinkingDelta = null) {
      const updates = ['last_update_at = NOW()'];
      const values = [jobId];
      let paramIndex = 2;

      if (contentDelta) {
        updates.push(`content = content || $${paramIndex}`);
        values.push(contentDelta);
        paramIndex++;
      }

      if (thinkingDelta) {
        updates.push(`thinking = COALESCE(thinking, '') || $${paramIndex}`);
        values.push(thinkingDelta);
        paramIndex++;
      }

      if (updates.length > 1) {
        // Retry with backoff: DB writes during streaming can hit transient lock contention
        const MAX_RETRIES = 3;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            await database.query(`UPDATE llm_jobs SET ${updates.join(', ')} WHERE id = $1`, values);
            return;
          } catch (err) {
            if (attempt < MAX_RETRIES - 1) {
              const delay = Math.min(100 * Math.pow(2, attempt), 1000);
              await new Promise(r => setTimeout(r, delay));
              logger.warn(
                `updateJobContent retry ${attempt + 1}/${MAX_RETRIES} for job ${jobId}: ${err.message}`
              );
            } else {
              logger.error(
                `updateJobContent failed after ${MAX_RETRIES} attempts for job ${jobId}: ${err.message}`
              );
              throw err;
            }
          }
        }
      }
    }

    /**
     * Complete a job. Die Antwort steht bereits in `llm_jobs.content`; hier
     * wird nur der Status gesetzt. Retries with backoff, weil der Abschluss
     * nach einem langen Strom nicht an einer kurzen Sperre scheitern soll.
     * @param {string} jobId - Job UUID
     * @returns {Promise<boolean>} true if the job was marked completed
     */
    async completeJob(jobId) {
      const MAX_RETRIES = 5;
      const BACKOFF_BASE_MS = 500; // 500ms, 1s, 2s, 4s, 8s

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const result = await database.query(
            `UPDATE llm_jobs SET status = 'completed', completed_at = NOW()
             WHERE id = $1
             RETURNING length(content) AS content_length, length(thinking) AS thinking_length`,
            [jobId]
          );
          activeStreams.delete(jobId);
          if (result.rows.length === 0) {
            logger.warn(`[JOB ${jobId}] Not found during completion`);
            return false;
          }
          const { content_length, thinking_length } = result.rows[0];
          logger.info(
            `[JOB ${jobId}] completed: ${content_length || 0} chars, ${thinking_length || 0} thinking chars`
          );
          return true;
        } catch (err) {
          logger.error(
            `[JOB ${jobId}] completeJob attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`
          );
          if (attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, BACKOFF_BASE_MS * Math.pow(2, attempt - 1)));
          }
        }
      }

      activeStreams.delete(jobId);
      logger.error(`[JOB ${jobId}] completeJob PERMANENTLY FAILED`);
      return false;
    }

    /**
     * Mark job as errored
     * @param {string} jobId - Job UUID
     * @param {string} errorMessage - Error description
     */
    async errorJob(jobId, errorMessage) {
      await database.query(
        `UPDATE llm_jobs
         SET status = 'error', error_message = $2, completed_at = NOW()
         WHERE id = $1`,
        [jobId, errorMessage]
      );
      activeStreams.delete(jobId);
      logger.error(`LLM job ${jobId} errored: ${errorMessage}`);
    }

    /**
     * Get job status and current content. Returns `user_id` so callers can
     * enforce per-user ownership (no IDOR across users).
     * @param {string} jobId - Job UUID
     * @returns {Promise<object|null>} Job data or null if not found
     */
    async getJob(jobId) {
      const result = await database.query(
        `SELECT id, user_id, job_type, status, content, thinking,
                created_at, started_at, completed_at, last_update_at,
                error_message, queue_position, queued_at, priority
           FROM llm_jobs
          WHERE id = $1`,
        [jobId]
      );
      return result.rows[0] || null;
    }

    /**
     * Cancel a job (abort streaming)
     * @param {string} jobId - Job UUID
     */
    async cancelJob(jobId) {
      // Abort the stream if active
      const stream = activeStreams.get(jobId);
      if (stream && stream.abortController) {
        stream.abortController.abort();
        logger.info(`Aborted stream for job ${jobId}`);
      }

      // Nur nicht-terminale Jobs canceln — ein nachlaufender Cancel (z. B.
      // Aufräum-DELETE eines Clients nach Verbindungsabriss) darf einen bereits
      // abgeschlossenen Job nicht zurück auf 'cancelled' setzen.
      await database.query(
        `UPDATE llm_jobs SET status = 'cancelled', completed_at = NOW()
         WHERE id = $1 AND status IN ('pending', 'streaming')`,
        [jobId]
      );

      activeStreams.delete(jobId);
      logger.info(`Cancelled LLM job ${jobId}`);
    }

    /**
     * Register an active stream (for abort control)
     * @param {string} jobId - Job UUID
     * @param {AbortController} abortController - Controller to abort the stream
     */
    registerStream(jobId, abortController) {
      activeStreams.set(jobId, {
        abortController,
        startTime: Date.now(),
      });
    }

    /**
     * Check if a stream is active
     * @param {string} jobId - Job UUID
     * @returns {boolean}
     */
    isStreamActive(jobId) {
      return activeStreams.has(jobId);
    }

    /**
     * Get active stream info
     * @param {string} jobId - Job UUID
     * @returns {object|undefined}
     */
    getActiveStream(jobId) {
      return activeStreams.get(jobId);
    }

    /**
     * Cleanup stale jobs (called on startup). Ein Auftrag, der seit zehn
     * Minuten weder laeuft noch aktualisiert wurde, gehoert keinem Prozess
     * mehr; er wird als Fehler geschlossen, der Teiltext bleibt stehen.
     */
    async cleanupStaleJobs() {
      const staleJobs = await database.query(
        `SELECT id FROM llm_jobs
          WHERE status IN ('pending', 'streaming')
            AND last_update_at < NOW() - INTERVAL '10 minutes'`
      );

      let errored = 0;
      for (const job of staleJobs.rows) {
        activeStreams.delete(job.id);
        try {
          await database.query(
            `UPDATE llm_jobs SET status = 'error',
               error_message = 'Job timed out (backend restart or connection lost)',
               completed_at = NOW() WHERE id = $1`,
            [job.id]
          );
          errored++;
        } catch (err) {
          logger.error(`Failed to process stale job ${job.id}: ${err.message}`);
        }
      }

      if (errored > 0) {
        logger.info(`Stale job cleanup: ${errored} marked as error`);
      }

      return errored;
    }

    /**
     * Cleanup old completed jobs (older than 1 hour)
     */
    async cleanupOldJobs() {
      const result = await database.query(
        `DELETE FROM llm_jobs
          WHERE status IN ('completed', 'error', 'cancelled')
            AND completed_at < NOW() - INTERVAL '1 hour'
          RETURNING id`
      );

      if (result.rows.length > 0) {
        logger.debug(`Cleaned up ${result.rows.length} old completed jobs`);
      }

      return result.rows.length;
    }

    /**
     * Reset internal state for testing
     * Only available in test environment
     */
    _resetForTesting() {
      if (process.env.NODE_ENV !== 'test') {
        throw new Error('_resetForTesting is only available in test environment');
      }
      activeStreams.clear();
    }

    /**
     * Get active streams map size (for testing)
     */
    _getActiveStreamsCount() {
      return activeStreams.size;
    }
  }

  return new LLMJobService();
}

// Create default singleton instance with real dependencies
const defaultInstance = createLLMJobService();

// Export singleton for production use, factory for testing
module.exports = defaultInstance;
module.exports.createLLMJobService = createLLMJobService;
