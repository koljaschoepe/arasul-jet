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

// Configuration from environment
const MODEL_BATCHING_ENABLED = process.env.MODEL_BATCHING_ENABLED !== 'false';
const DEFAULT_MAX_WAIT_SECONDS = parseInt(process.env.MODEL_MAX_WAIT_SECONDS || '120');

// Content batching configuration
const BATCH_INTERVAL_MS = 500;
const BATCH_SIZE_CHARS = 100;

/**
 * Factory function to create LLMQueueService with injected dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.database - Database module
 * @param {Object} deps.logger - Logger module
 * @param {Object} deps.llmJobService - LLM Job Service
 * @param {Object} deps.modelService - Model Service
 * @param {Object} deps.axios - Axios HTTP client
 * @returns {LLMQueueService} Service instance
 */
function createLLMQueueService(deps = {}) {
    const {
        database = require('../database'),
        logger = require('../utils/logger'),
        llmJobService = require('./llmJobService'),
        modelService = require('./modelService'),
        axios = require('axios')
    } = deps;

    const LLM_SERVICE_URL = `http://${process.env.LLM_SERVICE_HOST || 'llm-service'}:${process.env.LLM_SERVICE_PORT || '11434'}`;

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
        }

        /**
         * Start the service (call after construction)
         */
        start() {
            // Start subscriber cleanup interval (clean stale subscribers every 5 minutes)
            this.subscriberCleanupInterval = setInterval(() => this.cleanupStaleSubscribers(), 5 * 60 * 1000);
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
                        const result = await database.query(
                            `SELECT status FROM llm_jobs WHERE id = $1`,
                            [jobId]
                        );

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
            if (this.initialized) return;

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
                maxWaitSeconds = DEFAULT_MAX_WAIT_SECONDS
            } = options;

            // Resolve model: explicit > default
            const resolvedModel = model || await modelService.getDefaultModel();

            // Get next queue position
            const posResult = await database.query(`SELECT get_next_queue_position() as pos`);
            const queuePosition = posResult.rows[0].pos;

            // Create job in database
            const { jobId, messageId } = await llmJobService.createJob(
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
                [queuePosition, resolvedModel, JSON.stringify(modelSequence), maxWaitSeconds, priority, jobId]
            );

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
                    const batchResult = await database.query(
                        'SELECT * FROM get_next_batched_job($1)',
                        [currentModel]
                    );

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
                const jobResult = await database.query(
                    'SELECT * FROM llm_jobs WHERE id = $1',
                    [jobId]
                );

                if (jobResult.rows.length === 0) {
                    logger.error(`Job ${jobId} not found`);
                    return;
                }

                const job = jobResult.rows[0];

                this.isProcessing = true;
                this.processingJobId = job.id;

                // Model switch if needed
                if (should_switch && requested_model && requested_model !== currentModel) {
                    logger.info(`Switching model: ${currentModel || 'none'} -> ${requested_model} (reason: ${switch_reason})`);

                    // Notify waiting clients about model switch
                    this.emit('model:switching', { from: currentModel, to: requested_model, reason: switch_reason });

                    try {
                        await modelService.activateModel(requested_model, 'queue');
                        this.emit('model:switched', { model: requested_model });
                    } catch (switchError) {
                        // Classify error for better UX
                        let userMessage;
                        const errMsg = switchError.message.toLowerCase();

                        if (errMsg.includes('nicht gefunden') || errMsg.includes('not found')) {
                            userMessage = `Modell "${requested_model}" nicht verfügbar. Bitte im Model Store erneut herunterladen.`;
                        } else if (errMsg.includes('timeout') || errMsg.includes('econnrefused') || errMsg.includes('nicht erreichbar')) {
                            userMessage = `LLM-Service nicht erreichbar. Bitte Systemstatus prüfen.`;
                        } else {
                            userMessage = `Modell-Wechsel fehlgeschlagen: ${switchError.message}`;
                        }

                        logger.error(`Failed to switch model: ${switchError.message}`);
                        await llmJobService.errorJob(jobId, userMessage);
                        this.notifySubscribers(jobId, {
                            error: userMessage,
                            errorCode: 'MODEL_SWITCH_FAILED',
                            done: true
                        });
                        this.isProcessing = false;
                        this.processingJobId = null;
                        setImmediate(() => this.processNext());
                        return;
                    }
                }

                logger.info(`Processing job ${job.id} (type: ${job.job_type}, model: ${requested_model || 'default'})`);

                // Update status to streaming
                await database.query(
                    `UPDATE llm_jobs SET status = 'streaming', started_at = NOW()
                     WHERE id = $1`,
                    [job.id]
                );

                // Update queue positions for remaining jobs
                await this.updateQueuePositions();

                // Broadcast queue update
                this.emit('queue:update');

                // Notify subscribers that job is starting
                this.notifySubscribers(job.id, {
                    type: 'status',
                    status: 'streaming',
                    queuePosition: 0,
                    model: requested_model
                });

                // Process the job based on type
                if (job.job_type === 'chat') {
                    await this.processChatJob(job);
                } else if (job.job_type === 'rag') {
                    await this.processRAGJob(job);
                }

            } catch (error) {
                logger.error(`Error in processNext: ${error.message}`);
                this.isProcessing = false;
                this.processingJobId = null;
            }
        }

        /**
         * Process a chat job
         */
        async processChatJob(job) {
            const { id: jobId, request_data: requestData, requested_model } = job;
            const { messages, temperature, max_tokens, thinking } = requestData;
            const enableThinking = thinking !== false;

            // Build prompt
            const thinkingPrefix = enableThinking ? '' : '/no_think\n';
            const prompt = thinkingPrefix + messages.map(m => `${m.role}: ${m.content}`).join('\n');

            await this.streamFromOllama(jobId, prompt, enableThinking, temperature, max_tokens, requested_model);
        }

        /**
         * Process a RAG job
         */
        async processRAGJob(job) {
            const { id: jobId, request_data: requestData, requested_model } = job;
            const { query, context, thinking, sources } = requestData;
            const enableThinking = thinking !== false;

            // Build RAG prompt
            const thinkingInstruction = enableThinking ? '' : '/no_think\n';
            const systemPrompt = `${thinkingInstruction}You are a helpful assistant. Answer the user's question based on the following context from documents. If the answer is not in the context, say so.

Context:
${context}`;

            const prompt = `${systemPrompt}\n\nUser: ${query}\nAssistant:`;

            // Store sources in job (don't notify - rag.js already sent sources event)
            if (sources) {
                await llmJobService.updateJobContent(jobId, null, null, sources);
            }

            await this.streamFromOllama(jobId, prompt, enableThinking, 0.7, 32768, requested_model);
        }

        /**
         * Stream from Ollama and persist to database
         */
        async streamFromOllama(jobId, prompt, enableThinking, temperature, maxTokens, model = null) {
            // Use specified model or fall back to default
            const catalogModelId = model || process.env.LLM_MODEL || 'qwen3:14b-q8';

            // Resolve ollama_name from catalog (catalog ID -> Ollama registry name)
            let ollamaName = catalogModelId;
            try {
                const catalogResult = await database.query(
                    `SELECT COALESCE(ollama_name, id) as effective_ollama_name
                     FROM llm_model_catalog WHERE id = $1`,
                    [catalogModelId]
                );
                if (catalogResult.rows.length > 0) {
                    ollamaName = catalogResult.rows[0].effective_ollama_name;
                }
            } catch (err) {
                logger.warn(`Could not resolve ollama_name for ${catalogModelId}, using as-is: ${err.message}`);
            }

            let contentBuffer = '';
            let thinkingBuffer = '';
            let lastDbWrite = Date.now();

            // Promise queue to serialize database writes
            let flushPromise = Promise.resolve();

            const flushToDatabase = (force = false) => {
                const now = Date.now();
                const shouldFlush = force ||
                    (now - lastDbWrite > BATCH_INTERVAL_MS) ||
                    (contentBuffer.length >= BATCH_SIZE_CHARS) ||
                    (thinkingBuffer.length >= BATCH_SIZE_CHARS);

                if (shouldFlush && (contentBuffer || thinkingBuffer)) {
                    const contentToFlush = contentBuffer;
                    const thinkingToFlush = thinkingBuffer;
                    contentBuffer = '';
                    thinkingBuffer = '';
                    lastDbWrite = now;

                    flushPromise = flushPromise.then(async () => {
                        try {
                            await llmJobService.updateJobContent(jobId, contentToFlush || null, thinkingToFlush || null);
                        } catch (dbError) {
                            logger.error(`Failed to flush content to DB for job ${jobId}: ${dbError.message}`);
                        }
                    });
                }

                return flushPromise;
            };

            try {
                const abortController = new AbortController();
                llmJobService.registerStream(jobId, abortController);

                logger.info(`[QUEUE] Starting Ollama stream for job ${jobId} with model ${catalogModelId} (Ollama: ${ollamaName})`);

                const response = await axios({
                    method: 'post',
                    url: `${LLM_SERVICE_URL}/api/generate`,
                    data: {
                        model: ollamaName,
                        prompt: prompt,
                        stream: true,
                        keep_alive: parseInt(process.env.LLM_KEEP_ALIVE_SECONDS || '300'),
                        options: {
                            temperature: temperature || 0.7,
                            num_predict: maxTokens || 32768
                        }
                    },
                    responseType: 'stream',
                    timeout: 600000,
                    signal: abortController.signal
                });

                let buffer = '';
                let inThinkBlock = false;

                response.data.on('data', async (chunk) => {
                    buffer += chunk.toString();

                    const lines = buffer.split('\n');
                    buffer = lines.pop();

                    for (const line of lines) {
                        if (!line.trim()) continue;

                        try {
                            const data = JSON.parse(line);

                            if (data.response) {
                                const token = data.response;

                                // Process thinking blocks
                                if (!enableThinking) {
                                    if (token.includes('<think>')) {
                                        inThinkBlock = true;
                                        const parts = token.split('<think>');
                                        if (parts[0]) {
                                            contentBuffer += parts[0];
                                            this.notifySubscribers(jobId, { type: 'response', token: parts[0] });
                                        }
                                        continue;
                                    }
                                    if (token.includes('</think>')) {
                                        inThinkBlock = false;
                                        const parts = token.split('</think>');
                                        if (parts[1]) {
                                            contentBuffer += parts[1];
                                            this.notifySubscribers(jobId, { type: 'response', token: parts[1] });
                                        }
                                        continue;
                                    }
                                    if (inThinkBlock) continue;

                                    contentBuffer += token;
                                    this.notifySubscribers(jobId, { type: 'response', token });
                                } else {
                                    if (token.includes('<think>')) {
                                        inThinkBlock = true;
                                        const parts = token.split('<think>');
                                        if (parts[0]) {
                                            contentBuffer += parts[0];
                                            this.notifySubscribers(jobId, { type: 'response', token: parts[0] });
                                        }
                                        if (parts[1]) {
                                            thinkingBuffer += parts[1];
                                            this.notifySubscribers(jobId, { type: 'thinking', token: parts[1] });
                                        }
                                    } else if (token.includes('</think>')) {
                                        inThinkBlock = false;
                                        const parts = token.split('</think>');
                                        if (parts[0]) {
                                            thinkingBuffer += parts[0];
                                            this.notifySubscribers(jobId, { type: 'thinking', token: parts[0] });
                                        }
                                        this.notifySubscribers(jobId, { type: 'thinking_end' });
                                        if (parts[1]) {
                                            contentBuffer += parts[1];
                                            this.notifySubscribers(jobId, { type: 'response', token: parts[1] });
                                        }
                                    } else if (inThinkBlock) {
                                        thinkingBuffer += token;
                                        this.notifySubscribers(jobId, { type: 'thinking', token });
                                    } else {
                                        contentBuffer += token;
                                        this.notifySubscribers(jobId, { type: 'response', token });
                                    }
                                }

                                await flushToDatabase();
                            }

                            if (data.done) {
                                logger.info(`[QUEUE] Job ${jobId} stream complete`);
                                await flushToDatabase(true);
                                await llmJobService.completeJob(jobId);

                                this.notifySubscribers(jobId, {
                                    done: true,
                                    model: data.model || catalogModelId || 'unknown',
                                    jobId,
                                    timestamp: new Date().toISOString()
                                });

                                this.onJobComplete(jobId);
                            }
                        } catch (parseError) {
                            // Ignore parse errors for incomplete JSON
                        }
                    }
                });

                response.data.on('error', async (error) => {
                    logger.error(`[QUEUE] Stream error for job ${jobId}: ${error.message}`);
                    await flushToDatabase(true);
                    await llmJobService.errorJob(jobId, error.message);

                    this.notifySubscribers(jobId, { error: error.message, done: true });
                    this.onJobComplete(jobId);
                });

                response.data.on('end', async () => {
                    if (contentBuffer || thinkingBuffer) {
                        await flushToDatabase(true);
                    }
                });

            } catch (error) {
                logger.error(`[QUEUE] Error streaming for job ${jobId}: ${error.message}`);
                await llmJobService.errorJob(jobId, error.message);

                this.notifySubscribers(jobId, { error: error.message, done: true });
                this.onJobComplete(jobId);
            }
        }

        /**
         * Called when a job completes (success, error, or cancel)
         */
        onJobComplete(jobId) {
            if (this.processingJobId === jobId) {
                this.isProcessing = false;
                this.processingJobId = null;

                // Clean up subscribers AND timestamps
                this.jobSubscribers.delete(jobId);
                this.jobSubscriberTimestamps.delete(jobId);

                // Emit queue update
                this.emit('queue:update');

                // Process next job
                setImmediate(() => this.processNext());
            }
        }

        /**
         * Update queue positions after a job starts or completes
         */
        async updateQueuePositions() {
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
        }

        /**
         * Get current queue status
         */
        async getQueueStatus() {
            const result = await database.query(`
                SELECT j.id, j.conversation_id, j.job_type, j.status, j.queue_position,
                       j.queued_at, j.started_at, c.title as chat_title
                FROM llm_jobs j
                JOIN chat_conversations c ON j.conversation_id = c.id
                WHERE j.status IN ('pending', 'streaming')
                ORDER BY
                    CASE WHEN j.status = 'streaming' THEN 0 ELSE 1 END,
                    j.queue_position ASC
            `);

            const processing = result.rows.find(j => j.status === 'streaming') || null;
            const pending = result.rows.filter(j => j.status === 'pending');

            return {
                queue: result.rows,
                processing,
                pending_count: pending.length,
                timestamp: new Date().toISOString()
            };
        }

        /**
         * Cancel a job
         */
        async cancelJob(jobId) {
            const job = await llmJobService.getJob(jobId);
            if (!job) return false;

            await llmJobService.cancelJob(jobId);

            // If this was the processing job, trigger next
            if (this.processingJobId === jobId) {
                this.onJobComplete(jobId);
            }

            // Notify subscribers
            this.notifySubscribers(jobId, {
                type: 'cancelled',
                done: true,
                error: 'Job was cancelled'
            });

            return true;
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
                                done: true
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
