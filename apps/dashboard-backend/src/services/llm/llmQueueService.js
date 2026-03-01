/**
 * LLM Queue Service
 * Manages a FIFO queue for LLM requests to ensure sequential processing
 * Only ONE active stream at a time to prevent GPU memory overload
 *
 * Supports Dependency Injection for testing:
 *   const { createLLMQueueService } = require('./llmQueueService');
 *   const testService = createLLMQueueService({ database: mockDb, llmJobService: mockJobService });
 */

const EventEmitter = require('events');
const services = require('../../config/services');
const AsyncMutex = require('./AsyncMutex');
const { processChatJob, processRAGJob, onJobComplete } = require('./llmJobProcessor');

// Configuration from environment
const MODEL_BATCHING_ENABLED = process.env.MODEL_BATCHING_ENABLED !== 'false';
const DEFAULT_MAX_WAIT_SECONDS = parseInt(process.env.MODEL_MAX_WAIT_SECONDS || '120');

/**
 * Factory function to create LLMQueueService with injected dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.database - Database module
 * @param {Object} deps.logger - Logger module
 * @param {Object} deps.llmJobService - LLM Job Service
 * @param {Object} deps.modelService - Model Service
 * @param {Object} deps.axios - Axios HTTP client
 * @param {Object} deps.ollamaReadiness - Ollama Readiness Service (optional)
 * @returns {LLMQueueService} Service instance
 */
function createLLMQueueService(deps = {}) {
  const {
    database = require('../../database'),
    logger = require('../../utils/logger'),
    llmJobService = require('./llmJobService'),
    modelService = require('./modelService'),
    axios = require('axios'),
    // Lazy-load ollamaReadiness to avoid circular dependency
    getOllamaReadiness = () => {
      try {
        return require('./ollamaReadiness');
      } catch (e) {
        return null;
      }
    },
  } = deps;

  const LLM_SERVICE_URL = services.llm.url;

  /**
   * Build the context object passed to extracted job processor functions.
   * Contains all dependencies and references they need.
   */
  function buildProcessorContext(service) {
    return {
      service,
      deps: { database, logger, llmJobService, modelService, axios, getOllamaReadiness },
      config: { LLM_SERVICE_URL },
    };
  }

  class LLMQueueService extends EventEmitter {
    constructor() {
      super();
      this.processingJobId = null;
      this.isProcessing = false;
      this.jobSubscribers = new Map(); // jobId -> Set of callbacks
      this.jobSubscriberTimestamps = new Map(); // jobId -> timestamp for cleanup
      this.initialized = false;
      this.subscriberCleanupInterval = null;
      this.timeoutInterval = null;
      // P2-004: Mutex for queue position protection during burst traffic
      this.enqueueMutex = new AsyncMutex();
    }

    /**
     * Start the service (call after construction)
     */
    start() {
      // Start subscriber cleanup interval (clean stale subscribers every 5 minutes)
      this.subscriberCleanupInterval = setInterval(
        () => this.cleanupStaleSubscribers(),
        5 * 60 * 1000
      );
    }

    /**
     * Clean up subscribers for jobs that are no longer active
     * Prevents memory leak from disconnected clients or failed jobs
     */
    async cleanupStaleSubscribers() {
      const now = Date.now();
      const maxAge = 30 * 60 * 1000; // 30 minutes max subscriber lifetime

      for (const [jobId, timestamp] of this.jobSubscriberTimestamps.entries()) {
        if (now - timestamp > maxAge) {
          // Check if job is still active
          try {
            const result = await database.query(`SELECT status FROM llm_jobs WHERE id = $1`, [
              jobId,
            ]);

            const job = result.rows[0];
            if (!job || ['completed', 'error', 'cancelled'].includes(job.status)) {
              // Job is done or doesn't exist, clean up subscribers
              this.jobSubscribers.delete(jobId);
              this.jobSubscriberTimestamps.delete(jobId);
              logger.debug(`Cleaned up stale subscribers for job ${jobId}`);
            }
          } catch (err) {
            // On error, still clean up to prevent memory leak
            this.jobSubscribers.delete(jobId);
            this.jobSubscriberTimestamps.delete(jobId);
          }
        }
      }
    }

    /**
     * Initialize the queue service
     * Called on backend startup
     */
    async initialize() {
      if (this.initialized) {
        return;
      }

      logger.info('LLM Queue Service: Initializing...');

      // 1. Cleanup stale streaming jobs
      await llmJobService.cleanupStaleJobs();

      // 2. Recalculate queue positions for pending jobs
      await database.query(`
                WITH ranked AS (
                    SELECT id, ROW_NUMBER() OVER (ORDER BY queued_at ASC) as new_pos
                    FROM llm_jobs
                    WHERE status = 'pending'
                )
                UPDATE llm_jobs j
                SET queue_position = r.new_pos
                FROM ranked r
                WHERE j.id = r.id
            `);

      // 3. Start processing if jobs in queue
      this.initialized = true;
      this.processNext();

      // 4. Start timeout checker
      this.startTimeoutChecker();

      logger.info('LLM Queue Service: Ready');
    }

    /**
     * Add a job to the queue
     * @param {number} conversationId - Chat conversation ID
     * @param {string} jobType - 'chat' or 'rag'
     * @param {object} requestData - Original request parameters
     * @param {object} options - Optional: model, modelSequence, priority, maxWaitSeconds
     * @returns {Promise<{jobId: string, messageId: number, queuePosition: number, model: string}>}
     */
    async enqueue(conversationId, jobType, requestData, options = {}) {
      const {
        model = null,
        modelSequence = null,
        priority = 0,
        maxWaitSeconds = DEFAULT_MAX_WAIT_SECONDS,
      } = options;

      // Resolve model: explicit > default
      const resolvedModel = model || (await modelService.getDefaultModel());

      // Validate model is available
      if (!resolvedModel) {
        throw new Error(
          'Kein LLM-Model verfügbar. Bitte laden Sie ein Model im Model Store herunter.'
        );
      }

      // Check if model exists in Ollama
      const isAvailable = await modelService.isModelAvailable(resolvedModel);
      if (!isAvailable) {
        throw new Error(
          `Model "${resolvedModel}" ist nicht in Ollama verfügbar. Bitte im Model Store synchronisieren oder erneut herunterladen.`
        );
      }

      // P2-004: Use mutex to prevent race conditions during burst traffic
      // This ensures queue positions are assigned atomically
      const { jobId, messageId, queuePosition } = await this.enqueueMutex.withLock(async () => {
        // Get next queue position (protected by mutex)
        const posResult = await database.query(`SELECT get_next_queue_position() as pos`);
        const queuePos = posResult.rows[0].pos;

        // Create job in database
        const { jobId: jId, messageId: mId } = await llmJobService.createJob(
          conversationId,
          jobType,
          requestData
        );

        // Update with queue info and model data
        await database.query(
          `UPDATE llm_jobs
                     SET queue_position = $1, queued_at = NOW(), status = 'pending',
                         requested_model = $2, model_sequence = $3, max_wait_seconds = $4, priority = $5
                     WHERE id = $6`,
          [queuePos, resolvedModel, JSON.stringify(modelSequence), maxWaitSeconds, priority, jId]
        );

        return { jobId: jId, messageId: mId, queuePosition: queuePos };
      });

      logger.info(`Job ${jobId} enqueued for model ${resolvedModel} at position ${queuePosition}`);

      // Start processing if queue was empty
      setImmediate(() => this.processNext());

      return { jobId, messageId, queuePosition, model: resolvedModel };
    }

    /**
     * Subscribe to job updates
     * @param {string} jobId - Job UUID
     * @param {function} callback - Called with each event
     */
    subscribeToJob(jobId, callback) {
      if (!this.jobSubscribers.has(jobId)) {
        this.jobSubscribers.set(jobId, new Set());
        this.jobSubscriberTimestamps.set(jobId, Date.now());
      }
      this.jobSubscribers.get(jobId).add(callback);

      // Return unsubscribe function
      return () => {
        const subscribers = this.jobSubscribers.get(jobId);
        if (subscribers) {
          subscribers.delete(callback);
          if (subscribers.size === 0) {
            this.jobSubscribers.delete(jobId);
            this.jobSubscriberTimestamps.delete(jobId);
          }
        }
      };
    }

    /**
     * Notify all subscribers of a job event
     */
    notifySubscribers(jobId, event) {
      const subscribers = this.jobSubscribers.get(jobId);
      if (subscribers) {
        for (const callback of subscribers) {
          try {
            callback(event);
          } catch (err) {
            logger.debug(`Error notifying subscriber for job ${jobId}: ${err.message}`);
          }
        }
      }
    }

    /**
     * Process the next job in the queue
     * Uses smart model batching to minimize model switches
     */
    async processNext() {
      if (this.isProcessing) {
        logger.debug('Already processing a job, skipping processNext');
        return;
      }

      try {
        let nextJobInfo;
        let currentModel = null;

        // Get currently loaded model for batching decision
        if (MODEL_BATCHING_ENABLED) {
          const loadedModel = await modelService.getLoadedModel();
          currentModel = loadedModel?.model_id || null;

          // Use smart batching function
          const batchResult = await database.query('SELECT * FROM get_next_batched_job($1)', [
            currentModel,
          ]);

          if (batchResult.rows.length === 0 || !batchResult.rows[0].job_id) {
            logger.debug('No pending jobs in queue');
            return;
          }

          nextJobInfo = batchResult.rows[0];
        } else {
          // Fallback: simple FIFO without batching
          const result = await database.query(`
                        SELECT id as job_id, requested_model, false as should_switch, 'no_batching' as switch_reason
                        FROM llm_jobs
                        WHERE status = 'pending'
                        ORDER BY priority DESC, queue_position ASC
                        LIMIT 1
                    `);

          if (result.rows.length === 0) {
            logger.debug('No pending jobs in queue');
            return;
          }
          nextJobInfo = result.rows[0];
        }

        const { job_id: jobId, requested_model, should_switch, switch_reason } = nextJobInfo;

        // Get full job details
        const jobResult = await database.query('SELECT * FROM llm_jobs WHERE id = $1', [jobId]);

        if (jobResult.rows.length === 0) {
          logger.error(`Job ${jobId} not found`);
          return;
        }

        const job = jobResult.rows[0];

        this.isProcessing = true;
        this.processingJobId = job.id;

        // Model switch if needed - P2-006: With retry logic
        if (should_switch && requested_model && requested_model !== currentModel) {
          logger.info(
            `Switching model: ${currentModel || 'none'} -> ${requested_model} (reason: ${switch_reason})`
          );

          // Notify waiting clients about model switch
          this.emit('model:switching', {
            from: currentModel,
            to: requested_model,
            reason: switch_reason,
          });

          // P2-006: Retry logic for transient failures
          const MAX_SWITCH_RETRIES = 2;
          const RETRY_DELAY_MS = 5000;
          let switchSuccess = false;
          let lastError = null;

          for (let attempt = 1; attempt <= MAX_SWITCH_RETRIES; attempt++) {
            try {
              await modelService.activateModel(requested_model, 'queue');
              this.emit('model:switched', { model: requested_model });
              switchSuccess = true;
              break;
            } catch (switchError) {
              lastError = switchError;
              const errMsg = switchError.message.toLowerCase();

              // Don't retry on permanent errors (model not found, out of memory)
              const isPermanentError =
                errMsg.includes('nicht gefunden') ||
                errMsg.includes('not found') ||
                errMsg.includes('nicht genügend') ||
                errMsg.includes('speicher');

              if (isPermanentError || attempt === MAX_SWITCH_RETRIES) {
                // Final failure - don't retry
                break;
              }

              // Transient error - retry after delay
              logger.warn(
                `[QUEUE] Model switch attempt ${attempt}/${MAX_SWITCH_RETRIES} failed: ${switchError.message}. Retrying in ${RETRY_DELAY_MS / 1000}s...`
              );
              this.notifySubscribers(jobId, {
                type: 'retry',
                message: `Modell-Wechsel fehlgeschlagen, Wiederholung ${attempt + 1}/${MAX_SWITCH_RETRIES}...`,
                attempt: attempt + 1,
                maxAttempts: MAX_SWITCH_RETRIES,
              });
              await new Promise(resolve => {
                setTimeout(resolve, RETRY_DELAY_MS);
              });
            }
          }

          if (!switchSuccess) {
            // All retries failed - classify error for better UX
            let userMessage;
            const errMsg = lastError?.message?.toLowerCase() || '';

            if (errMsg.includes('nicht gefunden') || errMsg.includes('not found')) {
              userMessage = `Modell "${requested_model}" nicht verfügbar. Bitte im Model Store erneut herunterladen.`;
            } else if (
              errMsg.includes('timeout') ||
              errMsg.includes('econnrefused') ||
              errMsg.includes('nicht erreichbar')
            ) {
              userMessage = `LLM-Service nicht erreichbar. Bitte Systemstatus prüfen.`;
            } else if (errMsg.includes('nicht genügend') || errMsg.includes('speicher')) {
              userMessage =
                lastError?.message || `Nicht genügend Speicher für Modell "${requested_model}".`;
            } else {
              userMessage = `Modell-Wechsel fehlgeschlagen nach ${MAX_SWITCH_RETRIES} Versuchen: ${lastError?.message}`;
            }

            logger.error(
              `Failed to switch model after ${MAX_SWITCH_RETRIES} attempts: ${lastError?.message}`
            );
            await llmJobService.errorJob(jobId, userMessage);
            this.notifySubscribers(jobId, {
              error: userMessage,
              errorCode: 'MODEL_SWITCH_FAILED',
              done: true,
            });
            this.isProcessing = false;
            this.processingJobId = null;
            setImmediate(() => this.processNext());
            return;
          }
        }

        logger.info(
          `Processing job ${job.id} (type: ${job.job_type}, model: ${requested_model || 'default'})`
        );

        // Update status to streaming
        await database.query(
          `UPDATE llm_jobs SET status = 'streaming', started_at = NOW()
                     WHERE id = $1`,
          [job.id]
        );

        // Track request start for smart unloading
        const ollamaReadiness = getOllamaReadiness();
        if (ollamaReadiness) {
          ollamaReadiness.trackRequestStart(job.id, requested_model || currentModel);
        }

        // Update queue positions for remaining jobs
        await this.updateQueuePositions();

        // Broadcast queue update
        this.emit('queue:update');

        // Notify subscribers that job is starting
        this.notifySubscribers(job.id, {
          type: 'status',
          status: 'streaming',
          queuePosition: 0,
          model: requested_model,
        });

        // Build processor context for extracted functions
        const ctx = buildProcessorContext(this);

        // Process the job based on type
        if (job.job_type === 'chat') {
          await processChatJob(ctx, job);
        } else if (job.job_type === 'rag') {
          await processRAGJob(ctx, job);
        }
      } catch (error) {
        logger.error(`Error in processNext: ${error.message}`);
        this.isProcessing = false;
        this.processingJobId = null;
      }
    }

    /**
     * Update queue positions after a job starts or completes
     * Also broadcasts position updates to all waiting subscribers
     */
    async updateQueuePositions() {
      // Update positions and get affected jobs
      const result = await database.query(`
                WITH ranked AS (
                    SELECT id, ROW_NUMBER() OVER (ORDER BY priority DESC, queued_at ASC) as new_pos
                    FROM llm_jobs
                    WHERE status = 'pending'
                )
                UPDATE llm_jobs j
                SET queue_position = r.new_pos
                FROM ranked r
                WHERE j.id = r.id
                RETURNING j.id, r.new_pos as queue_position
            `);

      // Broadcast position updates to all waiting jobs
      for (const row of result.rows) {
        this.notifySubscribers(row.id, {
          type: 'queue_position',
          queuePosition: row.queue_position,
          status: 'pending',
        });
      }
    }

    /**
     * Get current queue status
     */
    async getQueueStatus() {
      const result = await database.query(`
                SELECT j.id, j.conversation_id, j.job_type, j.status, j.queue_position,
                       j.queued_at, j.started_at, j.requested_model, c.title as chat_title
                FROM llm_jobs j
                JOIN chat_conversations c ON j.conversation_id = c.id
                WHERE j.status IN ('pending', 'streaming')
                ORDER BY
                    CASE WHEN j.status = 'streaming' THEN 0 ELSE 1 END,
                    j.queue_position ASC
            `);

      const processing = result.rows.find(j => j.status === 'streaming') || null;
      const pending = result.rows.filter(j => j.status === 'pending');

      // Group pending by model for batching insight
      const pendingByModel = pending.reduce((acc, job) => {
        const model = job.requested_model || 'default';
        acc[model] = (acc[model] || 0) + 1;
        return acc;
      }, {});

      return {
        queue: result.rows,
        processing,
        pending_count: pending.length,
        pending_by_model: pendingByModel,
        timestamp: new Date().toISOString(),
      };
    }

    /**
     * Get detailed queue metrics (for monitoring burst traffic)
     */
    async getQueueMetrics() {
      const result = await database.query(`
                SELECT
                    COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
                    COUNT(*) FILTER (WHERE status = 'streaming') as streaming_count,
                    COUNT(*) FILTER (WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '1 minute') as completed_last_minute,
                    COUNT(*) FILTER (WHERE status = 'error' AND completed_at > NOW() - INTERVAL '1 minute') as errors_last_minute,
                    AVG(EXTRACT(EPOCH FROM (started_at - queued_at)))::INTEGER FILTER (WHERE started_at IS NOT NULL AND queued_at IS NOT NULL) as avg_wait_seconds,
                    MAX(queue_position) FILTER (WHERE status = 'pending') as max_queue_position
                FROM llm_jobs
                WHERE queued_at > NOW() - INTERVAL '1 hour'
            `);

      const metrics = result.rows[0] || {};

      return {
        pending: parseInt(metrics.pending_count) || 0,
        streaming: parseInt(metrics.streaming_count) || 0,
        completed_per_minute: parseInt(metrics.completed_last_minute) || 0,
        errors_per_minute: parseInt(metrics.errors_last_minute) || 0,
        avg_wait_seconds: parseInt(metrics.avg_wait_seconds) || 0,
        queue_depth: parseInt(metrics.max_queue_position) || 0,
        is_processing: this.isProcessing,
        subscriber_count: this._getSubscriberCount(),
        timestamp: new Date().toISOString(),
      };
    }

    /**
     * Cancel a job
     */
    async cancelJob(jobId) {
      const job = await llmJobService.getJob(jobId);
      if (!job) {
        return false;
      }

      await llmJobService.cancelJob(jobId);

      // If this was the processing job, trigger next
      if (this.processingJobId === jobId) {
        this.onJobComplete(jobId);
      }

      // Notify subscribers
      this.notifySubscribers(jobId, {
        type: 'cancelled',
        done: true,
        error: 'Job was cancelled',
      });

      return true;
    }

    /**
     * Called when a job completes (success, error, or cancel)
     * Delegates to the extracted onJobComplete function in llmJobProcessor.js
     */
    onJobComplete(jobId) {
      onJobComplete(buildProcessorContext(this), jobId);
    }

    /**
     * Prioritize a job (move to front of queue)
     */
    async prioritizeJob(jobId) {
      await database.query(
        `UPDATE llm_jobs SET priority = 1 WHERE id = $1 AND status = 'pending'`,
        [jobId]
      );
      await this.updateQueuePositions();
      this.emit('queue:update');
    }

    /**
     * Start periodic timeout checker
     */
    startTimeoutChecker() {
      this.timeoutInterval = setInterval(async () => {
        try {
          const result = await database.query(`
                        UPDATE llm_jobs
                        SET status = 'error',
                            error_message = 'Job timed out in queue (30 minutes)',
                            completed_at = NOW()
                        WHERE status = 'pending'
                        AND queued_at < NOW() - INTERVAL '30 minutes'
                        RETURNING id
                    `);

          if (result.rows.length > 0) {
            logger.warn(`Timed out ${result.rows.length} jobs in queue`);
            for (const row of result.rows) {
              this.notifySubscribers(row.id, {
                type: 'error',
                error: 'Job timed out in queue',
                done: true,
              });
            }
          }
        } catch (err) {
          logger.error(`Error in timeout checker: ${err.message}`);
        }
      }, 60000); // Check every minute
    }

    /**
     * Reset internal state for testing
     * Only available in test environment
     */
    _resetForTesting() {
      if (process.env.NODE_ENV !== 'test') {
        throw new Error('_resetForTesting is only available in test environment');
      }

      this.jobSubscribers.clear();
      this.jobSubscriberTimestamps.clear();
      this.processingJobId = null;
      this.isProcessing = false;
      this.initialized = false;

      // Clear intervals
      if (this.subscriberCleanupInterval) {
        clearInterval(this.subscriberCleanupInterval);
        this.subscriberCleanupInterval = null;
      }
      if (this.timeoutInterval) {
        clearInterval(this.timeoutInterval);
        this.timeoutInterval = null;
      }

      // Remove all event listeners
      this.removeAllListeners();
    }

    /**
     * Stop the service (cleanup intervals)
     */
    stop() {
      if (this.subscriberCleanupInterval) {
        clearInterval(this.subscriberCleanupInterval);
        this.subscriberCleanupInterval = null;
      }
      if (this.timeoutInterval) {
        clearInterval(this.timeoutInterval);
        this.timeoutInterval = null;
      }
    }

    /**
     * Get subscriber count (for testing)
     */
    _getSubscriberCount() {
      let total = 0;
      for (const subscribers of this.jobSubscribers.values()) {
        total += subscribers.size;
      }
      return total;
    }
  }

  const service = new LLMQueueService();
  // Auto-start for production (not for test instances)
  if (process.env.NODE_ENV !== 'test') {
    service.start();
  }
  return service;
}

// Create default singleton instance with real dependencies
const defaultInstance = createLLMQueueService();

// Export singleton for production use, factory for testing
module.exports = defaultInstance;
module.exports.createLLMQueueService = createLLMQueueService;
