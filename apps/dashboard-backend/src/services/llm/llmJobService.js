/* eslint-disable no-promise-executor-return */
/**
 * LLM Job Service
 * Manages background LLM streaming jobs with database persistence
 * Enables tab-switch resilience and multi-chat concurrent streaming
 *
 * Supports Dependency Injection for testing:
 *   const { createLLMJobService } = require('./llmJobService');
 *   const testService = createLLMJobService({ database: mockDb, logger: mockLogger });
 */

// Batching configuration
const BATCH_INTERVAL_MS = 500;
const BATCH_SIZE_CHARS = 100;

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
     * Create a new LLM job and placeholder message
     * @param {number} conversationId - Chat conversation ID
     * @param {string} jobType - 'chat' or 'rag'
     * @param {object} requestData - Original request parameters
     * @returns {Promise<{jobId: string, messageId: number}>}
     */
    async createJob(conversationId, jobType, requestData) {
      return database.transaction(async client => {
        // Insert job record
        const jobResult = await client.query(
          `INSERT INTO llm_jobs (conversation_id, job_type, request_data, status)
                     VALUES ($1, $2, $3, 'pending')
                     RETURNING id`,
          [conversationId, jobType, JSON.stringify(requestData)]
        );

        const jobId = jobResult.rows[0].id;

        // Create placeholder assistant message
        const messageResult = await client.query(
          `INSERT INTO chat_messages (conversation_id, role, content, status, job_id)
                     VALUES ($1, 'assistant', '', 'streaming', $2)
                     RETURNING id`,
          [conversationId, jobId]
        );

        const messageId = messageResult.rows[0].id;

        // Link message to job (status stays 'pending' until queue processor starts it)
        await client.query(`UPDATE llm_jobs SET message_id = $1 WHERE id = $2`, [messageId, jobId]);

        logger.info(`Created LLM job ${jobId} for conversation ${conversationId}`);

        return { jobId, messageId };
      });
    }

    /**
     * Update job content incrementally
     * Called during streaming to persist partial content
     * @param {string} jobId - Job UUID
     * @param {string|null} contentDelta - New content to append
     * @param {string|null} thinkingDelta - New thinking content to append
     * @param {object|null} sources - RAG sources (replaces existing)
     * @param {object|null} matchedSpaces - RAG matched spaces (replaces existing)
     */
    async updateJobContent(
      jobId,
      contentDelta = null,
      thinkingDelta = null,
      sources = null,
      matchedSpaces = null
    ) {
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

      if (sources !== null) {
        updates.push(`sources = $${paramIndex}`);
        values.push(JSON.stringify(sources));
        paramIndex++;
      }

      if (matchedSpaces !== null) {
        updates.push(`matched_spaces = $${paramIndex}`);
        values.push(JSON.stringify(matchedSpaces));
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
     * Complete a job and finalize the message
     * Retries up to 5 times with exponential backoff, then falls back to non-transactional write
     * @param {string} jobId - Job UUID
     * @returns {Promise<boolean>} true if message was successfully persisted
     */
    async completeJob(jobId) {
      const MAX_RETRIES = 5;
      const BACKOFF_BASE_MS = 500; // 500ms, 1s, 2s, 4s, 8s

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          await database.transaction(async client => {
            // Get final content
            const jobResult = await client.query(
              `SELECT content, thinking, sources, matched_spaces, message_id FROM llm_jobs WHERE id = $1`,
              [jobId]
            );

            if (jobResult.rows.length === 0) {
              logger.warn(`[JOB ${jobId}] Not found during completion`);
              return;
            }

            const { content, thinking, sources, matched_spaces, message_id } = jobResult.rows[0];

            // Serialize JSONB values — pg returns JS objects from jsonb columns,
            // but expects JSON strings when writing back to jsonb parameters
            const sourcesJson = sources ? JSON.stringify(sources) : null;
            const spacesJson = matched_spaces ? JSON.stringify(matched_spaces) : null;

            // Update the message with final content including sources and matched spaces
            await client.query(
              `UPDATE chat_messages
                       SET content = $1, thinking = $2, sources = $3, matched_spaces = $4, status = 'completed'
                       WHERE id = $5`,
              [content, thinking, sourcesJson, spacesJson, message_id]
            );

            // Mark job as completed
            await client.query(
              `UPDATE llm_jobs SET status = 'completed', completed_at = NOW() WHERE id = $1`,
              [jobId]
            );

            const sourcesCount = Array.isArray(sources)
              ? sources.length
              : sources
                ? JSON.parse(sources).length
                : 0;
            logger.info(
              `[JOB ${jobId}] Message ${message_id} persisted: ${(content || '').length} chars, ` +
                `${(thinking || '').length} thinking chars, ${sourcesCount} sources`
            );
          });

          // Clean up in-memory tracking
          activeStreams.delete(jobId);
          return true; // Success — exit retry loop
        } catch (err) {
          logger.error(
            `[JOB ${jobId}] completeJob attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`
          );

          if (attempt < MAX_RETRIES) {
            const backoffMs = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
            await new Promise(r => setTimeout(r, backoffMs));
            continue;
          }

          // All retries failed — try non-transactional fallback with its own retries
          logger.warn(
            `[JOB ${jobId}] Transaction failed after ${MAX_RETRIES} attempts, trying direct fallback`
          );
          const fallbackSuccess = await this._completeJobFallback(jobId);
          activeStreams.delete(jobId);
          return fallbackSuccess;
        }
      }

      activeStreams.delete(jobId);
      return false;
    }

    /**
     * Non-transactional fallback for completeJob — last resort to prevent data loss
     * @param {string} jobId - Job UUID
     * @returns {Promise<boolean>} true if fallback succeeded
     * @private
     */
    async _completeJobFallback(jobId) {
      const FALLBACK_RETRIES = 3;

      for (let attempt = 1; attempt <= FALLBACK_RETRIES; attempt++) {
        try {
          const jobResult = await database.query(
            `SELECT content, thinking, sources, matched_spaces, message_id FROM llm_jobs WHERE id = $1`,
            [jobId]
          );
          if (jobResult.rows.length === 0) {
            logger.warn(`[JOB ${jobId}] Not found in fallback`);
            return false;
          }

          const { content, thinking, sources, matched_spaces, message_id } = jobResult.rows[0];

          const sourcesJson = sources ? JSON.stringify(sources) : null;
          const spacesJson = matched_spaces ? JSON.stringify(matched_spaces) : null;

          await database.query(
            `UPDATE chat_messages SET content = $1, thinking = $2, sources = $3, matched_spaces = $4, status = 'completed' WHERE id = $5`,
            [content, thinking, sourcesJson, spacesJson, message_id]
          );
          await database.query(
            `UPDATE llm_jobs SET status = 'completed', completed_at = NOW() WHERE id = $1`,
            [jobId]
          );
          logger.info(`[JOB ${jobId}] completeJob fallback succeeded on attempt ${attempt}`);
          return true;
        } catch (fallbackErr) {
          logger.error(
            `[JOB ${jobId}] completeJob fallback attempt ${attempt}/${FALLBACK_RETRIES} failed: ${fallbackErr.message}`
          );
          if (attempt < FALLBACK_RETRIES) {
            await new Promise(r => setTimeout(r, attempt * 500));
          }
        }
      }

      logger.error(`[JOB ${jobId}] completeJob PERMANENTLY FAILED — message may not be persisted`);
      return false;
    }

    /**
     * Mark job as errored (atomic transaction)
     * @param {string} jobId - Job UUID
     * @param {string} errorMessage - Error description
     */
    async errorJob(jobId, errorMessage) {
      await database.transaction(async client => {
        await client.query(
          `UPDATE llm_jobs
                   SET status = 'error', error_message = $2, completed_at = NOW()
                   WHERE id = $1`,
          [jobId, errorMessage]
        );

        await client.query(
          `UPDATE chat_messages SET status = 'error'
                   WHERE job_id = $1`,
          [jobId]
        );
      });

      activeStreams.delete(jobId);
      logger.error(`LLM job ${jobId} errored: ${errorMessage}`);
    }

    /**
     * Get job status and current content
     * @param {string} jobId - Job UUID
     * @returns {Promise<object|null>} Job data or null if not found
     */
    async getJob(jobId) {
      const result = await database.query(
        `SELECT id, conversation_id, job_type, status, content, thinking, sources, matched_spaces,
                        created_at, started_at, completed_at, last_update_at, error_message,
                        message_id, queue_position, queued_at, priority
                 FROM llm_jobs WHERE id = $1`,
        [jobId]
      );
      return result.rows[0] || null;
    }

    /**
     * Get all active/pending jobs for a conversation
     * @param {number} conversationId - Chat conversation ID
     * @returns {Promise<Array>} Active jobs
     */
    async getActiveJobsForConversation(conversationId) {
      const result = await database.query(
        `SELECT id, job_type, status, content, thinking, sources, last_update_at, message_id,
                        queue_position, queued_at, priority
                 FROM llm_jobs
                 WHERE conversation_id = $1 AND status IN ('pending', 'streaming')
                 ORDER BY queue_position ASC NULLS LAST, created_at DESC`,
        [conversationId]
      );
      return result.rows;
    }

    /**
     * Get all active jobs across all conversations
     * @returns {Promise<Array>} All active jobs
     */
    async getAllActiveJobs() {
      const result = await database.query(
        `SELECT j.id, j.conversation_id, j.job_type, j.status, j.last_update_at,
                        j.queue_position, j.queued_at, j.priority,
                        c.title as conversation_title
                 FROM llm_jobs j
                 JOIN chat_conversations c ON j.conversation_id = c.id
                 WHERE j.status IN ('pending', 'streaming')
                 ORDER BY
                    CASE WHEN j.status = 'streaming' THEN 0 ELSE 1 END,
                    j.queue_position ASC NULLS LAST`
      );
      return result.rows;
    }

    /**
     * Cancel a job (abort streaming, atomic transaction)
     * @param {string} jobId - Job UUID
     */
    async cancelJob(jobId) {
      // Abort the stream if active
      const stream = activeStreams.get(jobId);
      if (stream && stream.abortController) {
        stream.abortController.abort();
        logger.info(`Aborted stream for job ${jobId}`);
      }

      await database.transaction(async client => {
        await client.query(
          `UPDATE llm_jobs SET status = 'cancelled', completed_at = NOW() WHERE id = $1`,
          [jobId]
        );

        await client.query(`UPDATE chat_messages SET status = 'error' WHERE job_id = $1`, [jobId]);
      });

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
     * Recover orphaned messages stuck in 'streaming' status
     * Attempts to transfer content from llm_jobs before marking as error
     * Called on startup and periodically
     */
    async recoverOrphanedMessages() {
      const result = await database.query(
        `SELECT m.id AS message_id, m.job_id, m.conversation_id,
                j.id AS job_id_found, j.content AS job_content,
                j.thinking AS job_thinking, j.sources AS job_sources,
                j.matched_spaces AS job_matched_spaces, j.status AS job_status
         FROM chat_messages m
         LEFT JOIN llm_jobs j ON m.job_id = j.id
         WHERE m.status = 'streaming'
         AND m.created_at < NOW() - INTERVAL '2 minutes'`
      );

      let recovered = 0;
      for (const row of result.rows) {
        try {
          if (row.job_id_found && (row.job_content || row.job_thinking)) {
            // Job exists and has content — transfer it to chat_messages
            // Serialize JSONB values — pg returns JS objects from jsonb columns
            const srcJson = row.job_sources ? JSON.stringify(row.job_sources) : null;
            const spcJson = row.job_matched_spaces ? JSON.stringify(row.job_matched_spaces) : null;
            await database.query(
              `UPDATE chat_messages SET content = $1, thinking = $2, sources = $3, matched_spaces = $4, status = 'completed' WHERE id = $5`,
              [row.job_content || '', row.job_thinking, srcJson, spcJson, row.message_id]
            );
            if (row.job_status === 'streaming' || row.job_status === 'pending') {
              await database.query(
                `UPDATE llm_jobs SET status = 'completed', completed_at = NOW() WHERE id = $1`,
                [row.job_id_found]
              );
            }
            recovered++;
            logger.info(
              `Recovered orphaned message ${row.message_id} from job ${row.job_id_found} (conv: ${row.conversation_id})`
            );
          } else {
            // No job or no content — mark as error
            await database.query(
              `UPDATE chat_messages SET status = 'error',
               content = CASE WHEN content = '' THEN '[Nachricht konnte nicht gespeichert werden]' ELSE content END
               WHERE id = $1`,
              [row.message_id]
            );
            logger.warn(
              `Marked orphaned message ${row.message_id} as error (no recoverable content, conv: ${row.conversation_id})`
            );
          }
        } catch (err) {
          logger.error(`Failed to recover message ${row.message_id}: ${err.message}`);
        }
      }

      if (recovered > 0) {
        logger.info(`Recovered ${recovered} orphaned messages`);
      }
      return recovered;
    }

    /**
     * Cleanup stale jobs (called on startup or periodically)
     * First attempts recovery, then marks remaining as error
     */
    async cleanupStaleJobs() {
      // Step 1: Find stale jobs
      const staleJobs = await database.query(
        `SELECT j.id, j.content, j.thinking, j.sources, j.matched_spaces, j.message_id
         FROM llm_jobs j
         WHERE j.status IN ('pending', 'streaming')
         AND j.last_update_at < NOW() - INTERVAL '10 minutes'`
      );

      let recovered = 0;
      let errored = 0;

      for (const job of staleJobs.rows) {
        activeStreams.delete(job.id);
        try {
          if (job.message_id && (job.content || job.thinking)) {
            // Has content — try to complete rather than discard
            await database.query(
              `UPDATE chat_messages SET content = $1, thinking = $2, sources = $3, matched_spaces = $4, status = 'completed' WHERE id = $5`,
              [job.content || '', job.thinking, job.sources, job.matched_spaces, job.message_id]
            );
            await database.query(
              `UPDATE llm_jobs SET status = 'completed', completed_at = NOW(),
               error_message = 'Auto-recovered from stale state' WHERE id = $1`,
              [job.id]
            );
            recovered++;
            logger.info(`Auto-recovered stale job ${job.id} with content`);
          } else {
            // No content — mark as error
            await database.query(
              `UPDATE llm_jobs SET status = 'error',
               error_message = 'Job timed out (backend restart or connection lost)',
               completed_at = NOW() WHERE id = $1`,
              [job.id]
            );
            if (job.message_id) {
              await database.query(`UPDATE chat_messages SET status = 'error' WHERE id = $1`, [
                job.message_id,
              ]);
            }
            errored++;
          }
        } catch (err) {
          logger.error(`Failed to process stale job ${job.id}: ${err.message}`);
        }
      }

      if (recovered > 0 || errored > 0) {
        logger.info(`Stale job cleanup: ${recovered} recovered, ${errored} marked as error`);
      }

      return recovered + errored;
    }

    /**
     * Cleanup old completed jobs (older than 1 hour)
     * Safety: recovers any messages still stuck in 'streaming' before deleting their jobs
     */
    async cleanupOldJobs() {
      // Safety check: recover messages whose jobs are done but content wasn't transferred
      // Covers two cases:
      // 1. Message still in 'streaming' status (completeJob() never ran)
      // 2. Message has 'completed' status but empty content while job has content (partial transfer)
      try {
        const unrecovered = await database.query(
          `SELECT j.id, j.content, j.thinking, j.sources, j.matched_spaces, j.message_id,
                  m.status AS msg_status, m.content AS msg_content
           FROM llm_jobs j
           JOIN chat_messages m ON j.message_id = m.id
           WHERE j.status IN ('completed', 'error', 'cancelled')
           AND j.completed_at < NOW() - INTERVAL '1 hour'
           AND (j.content IS NOT NULL AND j.content != '')
           AND (
             m.status = 'streaming'
             OR (m.content IS NULL OR m.content = '')
             OR (j.sources IS NOT NULL AND m.sources IS NULL)
           )`
        );

        for (const job of unrecovered.rows) {
          try {
            const srcJson = job.sources ? JSON.stringify(job.sources) : null;
            const spcJson = job.matched_spaces ? JSON.stringify(job.matched_spaces) : null;
            await database.query(
              `UPDATE chat_messages SET content = $1, thinking = $2, sources = $3, matched_spaces = $4, status = 'completed' WHERE id = $5`,
              [job.content || '', job.thinking, srcJson, spcJson, job.message_id]
            );
            logger.info(
              `Recovered message ${job.message_id} before job ${job.id} cleanup ` +
                `(msg_status was: ${job.msg_status}, had content: ${(job.msg_content || '').length > 0})`
            );
          } catch (err) {
            logger.error(
              `Failed to recover message ${job.message_id} before cleanup: ${err.message}`
            );
          }
        }
      } catch (err) {
        logger.error(`Pre-cleanup recovery check failed: ${err.message}`);
      }

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
     * Get job statistics
     * @returns {Promise<object>}
     */
    async getStats() {
      const result = await database.query(`
                SELECT
                    COUNT(*) FILTER (WHERE status = 'streaming') as active_jobs,
                    COUNT(*) FILTER (WHERE status = 'pending') as pending_jobs,
                    COUNT(*) FILTER (WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '1 hour') as completed_last_hour,
                    COUNT(*) FILTER (WHERE status = 'error' AND completed_at > NOW() - INTERVAL '1 hour') as errors_last_hour
                FROM llm_jobs
            `);

      return {
        ...result.rows[0],
        activeStreamsInMemory: activeStreams.size,
        timestamp: new Date().toISOString(),
      };
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
