/**
 * LLM Job Service
 * Manages background LLM streaming jobs with database persistence
 * Enables tab-switch resilience and multi-chat concurrent streaming
 */

const db = require('../database');
const logger = require('../utils/logger');

// In-memory tracking of active streams (for abort control)
const activeStreams = new Map(); // jobId -> { abortController, startTime }

// Batching configuration
const BATCH_INTERVAL_MS = 500;
const BATCH_SIZE_CHARS = 100;

class LLMJobService {
    /**
     * Create a new LLM job and placeholder message
     * @param {number} conversationId - Chat conversation ID
     * @param {string} jobType - 'chat' or 'rag'
     * @param {object} requestData - Original request parameters
     * @returns {Promise<{jobId: string, messageId: number}>}
     */
    async createJob(conversationId, jobType, requestData) {
        return db.transaction(async (client) => {
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

            // Update job with message ID and status
            await client.query(
                `UPDATE llm_jobs
                 SET message_id = $1, status = 'streaming', started_at = NOW()
                 WHERE id = $2`,
                [messageId, jobId]
            );

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
     */
    async updateJobContent(jobId, contentDelta = null, thinkingDelta = null, sources = null) {
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

        if (updates.length > 1) {
            await db.query(
                `UPDATE llm_jobs SET ${updates.join(', ')} WHERE id = $1`,
                values
            );
        }
    }

    /**
     * Complete a job and finalize the message
     * @param {string} jobId - Job UUID
     */
    async completeJob(jobId) {
        await db.transaction(async (client) => {
            // Get final content
            const jobResult = await client.query(
                `SELECT content, thinking, sources, message_id FROM llm_jobs WHERE id = $1`,
                [jobId]
            );

            if (jobResult.rows.length === 0) {
                logger.warn(`Job ${jobId} not found during completion`);
                return;
            }

            const { content, thinking, sources, message_id } = jobResult.rows[0];

            // Update the message with final content including sources
            await client.query(
                `UPDATE chat_messages
                 SET content = $1, thinking = $2, sources = $3, status = 'completed'
                 WHERE id = $4`,
                [content, thinking, sources, message_id]
            );

            // Mark job as completed
            await client.query(
                `UPDATE llm_jobs SET status = 'completed', completed_at = NOW() WHERE id = $1`,
                [jobId]
            );

            logger.info(`Completed LLM job ${jobId}`);
        });

        // Clean up in-memory tracking
        activeStreams.delete(jobId);
    }

    /**
     * Mark job as errored
     * @param {string} jobId - Job UUID
     * @param {string} errorMessage - Error description
     */
    async errorJob(jobId, errorMessage) {
        await db.query(
            `UPDATE llm_jobs
             SET status = 'error', error_message = $2, completed_at = NOW()
             WHERE id = $1`,
            [jobId, errorMessage]
        );

        await db.query(
            `UPDATE chat_messages SET status = 'error'
             WHERE job_id = $1`,
            [jobId]
        );

        activeStreams.delete(jobId);
        logger.error(`LLM job ${jobId} errored: ${errorMessage}`);
    }

    /**
     * Get job status and current content
     * @param {string} jobId - Job UUID
     * @returns {Promise<object|null>} Job data or null if not found
     */
    async getJob(jobId) {
        const result = await db.query(
            `SELECT id, conversation_id, job_type, status, content, thinking, sources,
                    created_at, started_at, completed_at, last_update_at, error_message,
                    message_id
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
        const result = await db.query(
            `SELECT id, job_type, status, content, thinking, sources, last_update_at, message_id
             FROM llm_jobs
             WHERE conversation_id = $1 AND status IN ('pending', 'streaming')
             ORDER BY created_at DESC`,
            [conversationId]
        );
        return result.rows;
    }

    /**
     * Get all active jobs across all conversations
     * @returns {Promise<Array>} All active jobs
     */
    async getAllActiveJobs() {
        const result = await db.query(
            `SELECT j.id, j.conversation_id, j.job_type, j.status, j.last_update_at,
                    c.title as conversation_title
             FROM llm_jobs j
             JOIN chat_conversations c ON j.conversation_id = c.id
             WHERE j.status IN ('pending', 'streaming')
             ORDER BY j.created_at DESC`
        );
        return result.rows;
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

        await db.query(
            `UPDATE llm_jobs SET status = 'cancelled', completed_at = NOW() WHERE id = $1`,
            [jobId]
        );

        await db.query(
            `UPDATE chat_messages SET status = 'error' WHERE job_id = $1`,
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
            startTime: Date.now()
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
     * Cleanup stale jobs (called on startup or periodically)
     * Marks old streaming jobs as error
     */
    async cleanupStaleJobs() {
        const result = await db.query(
            `UPDATE llm_jobs
             SET status = 'error',
                 error_message = 'Job timed out (backend restart or connection lost)',
                 completed_at = NOW()
             WHERE status IN ('pending', 'streaming')
             AND last_update_at < NOW() - INTERVAL '10 minutes'
             RETURNING id`
        );

        if (result.rows.length > 0) {
            const jobIds = result.rows.map(r => r.id);
            logger.info(`Cleaned up ${jobIds.length} stale jobs: ${jobIds.join(', ')}`);

            // Update corresponding messages
            await db.query(
                `UPDATE chat_messages
                 SET status = 'error'
                 WHERE job_id = ANY($1::uuid[])`,
                [jobIds]
            );
        }

        return result.rows.length;
    }

    /**
     * Cleanup old completed jobs (older than 1 hour)
     */
    async cleanupOldJobs() {
        const result = await db.query(
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
        const result = await db.query(`
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
            timestamp: new Date().toISOString()
        };
    }
}

// Export singleton instance
module.exports = new LLMJobService();
