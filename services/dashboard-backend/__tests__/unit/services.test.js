/**
 * Backend Services Unit Tests
 * Tests für LLMQueueService, LLMJobService und ModelService
 */

// Mock dependencies before requiring modules
jest.mock('../../src/database');
jest.mock('../../src/utils/logger');
jest.mock('axios');

const db = require('../../src/database');
const logger = require('../../src/utils/logger');
const axios = require('axios');

// Mock logger methods
logger.info = jest.fn();
logger.warn = jest.fn();
logger.error = jest.fn();
logger.debug = jest.fn();

// Mock db.transaction
db.transaction = jest.fn(async (callback) => {
    const mockClient = {
        query: jest.fn()
    };
    return callback(mockClient);
});

describe('LLMJobService', () => {
    // Fresh import for each test suite
    let llmJobService;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();

        // Re-mock after reset
        jest.mock('../../src/database');
        jest.mock('../../src/utils/logger');

        llmJobService = require('../../src/services/llmJobService');
    });

    // =====================================================
    // createJob
    // =====================================================
    describe('createJob()', () => {
        test('erstellt Job und Placeholder-Nachricht in Transaction', async () => {
            const mockClient = {
                query: jest.fn()
                    .mockResolvedValueOnce({ rows: [{ id: 'job-123' }] })  // Insert job
                    .mockResolvedValueOnce({ rows: [{ id: 456 }] })  // Insert message
                    .mockResolvedValueOnce({ rows: [] })  // Update job with message_id
            };

            db.transaction.mockImplementationOnce(async (callback) => {
                return callback(mockClient);
            });

            const result = await llmJobService.createJob(
                1,  // conversationId
                'chat',  // jobType
                { messages: [{ role: 'user', content: 'Hello' }] }
            );

            expect(result.jobId).toBe('job-123');
            expect(result.messageId).toBe(456);
            expect(mockClient.query).toHaveBeenCalledTimes(3);
        });
    });

    // =====================================================
    // updateJobContent
    // =====================================================
    describe('updateJobContent()', () => {
        test('aktualisiert Content-Delta', async () => {
            db.query.mockResolvedValueOnce({ rows: [] });

            await llmJobService.updateJobContent('job-123', 'new content', null, null);

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('content = content ||'),
                expect.arrayContaining(['job-123', 'new content'])
            );
        });

        test('aktualisiert Thinking-Delta', async () => {
            db.query.mockResolvedValueOnce({ rows: [] });

            await llmJobService.updateJobContent('job-123', null, 'thinking...', null);

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('thinking = COALESCE'),
                expect.arrayContaining(['job-123', 'thinking...'])
            );
        });

        test('aktualisiert Sources', async () => {
            db.query.mockResolvedValueOnce({ rows: [] });
            const sources = [{ title: 'Doc 1', score: 0.9 }];

            await llmJobService.updateJobContent('job-123', null, null, sources);

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('sources ='),
                expect.arrayContaining(['job-123', JSON.stringify(sources)])
            );
        });

        test('macht nichts wenn keine Deltas', async () => {
            await llmJobService.updateJobContent('job-123', null, null, null);

            // Should not call query since no updates
            expect(db.query).not.toHaveBeenCalled();
        });
    });

    // =====================================================
    // completeJob
    // =====================================================
    describe('completeJob()', () => {
        test('finalisiert Job und Message', async () => {
            const mockClient = {
                query: jest.fn()
                    .mockResolvedValueOnce({
                        rows: [{
                            content: 'final content',
                            thinking: 'final thinking',
                            sources: '[]',
                            message_id: 456
                        }]
                    })  // Get job
                    .mockResolvedValueOnce({ rows: [] })  // Update message
                    .mockResolvedValueOnce({ rows: [] })  // Mark job completed
            };

            db.transaction.mockImplementationOnce(async (callback) => {
                return callback(mockClient);
            });

            await llmJobService.completeJob('job-123');

            expect(mockClient.query).toHaveBeenCalledTimes(3);
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining("status = 'completed'"),
                expect.arrayContaining(['job-123'])
            );
        });

        test('behandelt nicht gefundenen Job graceful', async () => {
            const mockClient = {
                query: jest.fn().mockResolvedValueOnce({ rows: [] })
            };

            db.transaction.mockImplementationOnce(async (callback) => {
                return callback(mockClient);
            });

            await llmJobService.completeJob('nonexistent');

            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('not found during completion')
            );
        });
    });

    // =====================================================
    // errorJob
    // =====================================================
    describe('errorJob()', () => {
        test('markiert Job als fehlerhaft', async () => {
            db.query.mockResolvedValue({ rows: [] });

            await llmJobService.errorJob('job-123', 'Connection timeout');

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining("status = 'error'"),
                expect.arrayContaining(['job-123', 'Connection timeout'])
            );
        });
    });

    // =====================================================
    // getJob
    // =====================================================
    describe('getJob()', () => {
        test('gibt Job-Details zurück', async () => {
            const mockJob = { id: 'job-123', status: 'streaming', content: 'partial' };
            db.query.mockResolvedValueOnce({ rows: [mockJob] });

            const result = await llmJobService.getJob('job-123');

            expect(result).toEqual(mockJob);
        });

        test('gibt null für nicht existierenden Job', async () => {
            db.query.mockResolvedValueOnce({ rows: [] });

            const result = await llmJobService.getJob('nonexistent');

            expect(result).toBeNull();
        });
    });

    // =====================================================
    // cancelJob
    // =====================================================
    describe('cancelJob()', () => {
        test('cancelled Job und aktualisiert Message', async () => {
            db.query.mockResolvedValue({ rows: [] });

            await llmJobService.cancelJob('job-123');

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining("status = 'cancelled'"),
                expect.arrayContaining(['job-123'])
            );
        });
    });

    // =====================================================
    // cleanupStaleJobs
    // =====================================================
    describe('cleanupStaleJobs()', () => {
        test('bereinigt veraltete Jobs', async () => {
            db.query
                .mockResolvedValueOnce({ rows: [{ id: 'stale-1' }, { id: 'stale-2' }] })
                .mockResolvedValueOnce({ rows: [] });

            const count = await llmJobService.cleanupStaleJobs();

            expect(count).toBe(2);
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Cleaned up 2 stale jobs')
            );
        });

        test('gibt 0 zurück wenn keine veralteten Jobs', async () => {
            db.query.mockResolvedValueOnce({ rows: [] });

            const count = await llmJobService.cleanupStaleJobs();

            expect(count).toBe(0);
        });
    });

    // =====================================================
    // Stream Registration
    // =====================================================
    describe('Stream Registration', () => {
        test('registerStream speichert AbortController', () => {
            const abortController = new AbortController();
            llmJobService.registerStream('job-123', abortController);

            expect(llmJobService.isStreamActive('job-123')).toBe(true);
        });

        test('isStreamActive gibt false für unbekannten Job', () => {
            expect(llmJobService.isStreamActive('unknown')).toBe(false);
        });

        test('getActiveStream gibt Stream-Info zurück', () => {
            const abortController = new AbortController();
            llmJobService.registerStream('job-456', abortController);

            const stream = llmJobService.getActiveStream('job-456');

            expect(stream.abortController).toBe(abortController);
            expect(stream.startTime).toBeDefined();
        });
    });

    // =====================================================
    // getStats
    // =====================================================
    describe('getStats()', () => {
        test('gibt Job-Statistiken zurück', async () => {
            db.query.mockResolvedValueOnce({
                rows: [{
                    active_jobs: '2',
                    pending_jobs: '5',
                    completed_last_hour: '10',
                    errors_last_hour: '1'
                }]
            });

            const stats = await llmJobService.getStats();

            expect(stats.active_jobs).toBe('2');
            expect(stats.pending_jobs).toBe('5');
            expect(stats.timestamp).toBeDefined();
        });
    });
});

// =====================================================
// ModelService Tests
// =====================================================
describe('ModelService', () => {
    let modelService;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();

        // Re-setup mocks
        jest.mock('../../src/database');
        jest.mock('axios');

        modelService = require('../../src/services/modelService');
    });

    // =====================================================
    // getCatalog
    // =====================================================
    describe('getCatalog()', () => {
        test('gibt Model-Katalog zurück', async () => {
            const mockModels = [
                { id: 'llama3:8b', name: 'Llama 3 8B', ram_required_gb: 8 },
                { id: 'qwen3:14b', name: 'Qwen 3 14B', ram_required_gb: 14 }
            ];
            db.query.mockResolvedValueOnce({ rows: mockModels });

            const catalog = await modelService.getCatalog();

            expect(catalog).toHaveLength(2);
            expect(catalog[0].id).toBe('llama3:8b');
        });
    });

    // =====================================================
    // getInstalledModels
    // =====================================================
    describe('getInstalledModels()', () => {
        test('gibt nur installierte Modelle zurück', async () => {
            const mockInstalled = [
                { id: 'llama3:8b', status: 'available', is_default: true }
            ];
            db.query.mockResolvedValueOnce({ rows: mockInstalled });

            const installed = await modelService.getInstalledModels();

            expect(installed).toHaveLength(1);
            expect(installed[0].status).toBe('available');
        });
    });

    // =====================================================
    // getLoadedModel
    // =====================================================
    describe('getLoadedModel()', () => {
        test('gibt geladenes Model zurück', async () => {
            axios.get.mockResolvedValueOnce({
                data: {
                    models: [{
                        name: 'qwen3:14b-q8',
                        size_vram: 14 * 1024 * 1024 * 1024
                    }]
                }
            });

            const loaded = await modelService.getLoadedModel();

            expect(loaded.model_id).toBe('qwen3:14b-q8');
            expect(loaded.ram_usage_mb).toBeGreaterThan(0);
        });

        test('gibt null wenn kein Model geladen', async () => {
            axios.get.mockResolvedValueOnce({ data: { models: [] } });

            const loaded = await modelService.getLoadedModel();

            expect(loaded).toBeNull();
        });

        test('behandelt Fehler graceful', async () => {
            axios.get.mockRejectedValueOnce(new Error('Connection refused'));

            const loaded = await modelService.getLoadedModel();

            expect(loaded).toBeNull();
            expect(logger.error).toHaveBeenCalled();
        });
    });

    // =====================================================
    // setDefaultModel
    // =====================================================
    describe('setDefaultModel()', () => {
        test('setzt neues Default-Model', async () => {
            const mockClient = {
                query: jest.fn().mockResolvedValue({ rows: [] })
            };
            db.transaction.mockImplementationOnce(async (callback) => {
                return callback(mockClient);
            });

            const result = await modelService.setDefaultModel('llama3:8b');

            expect(result.success).toBe(true);
            expect(result.defaultModel).toBe('llama3:8b');
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('is_default = false'),
            );
        });
    });

    // =====================================================
    // getDefaultModel
    // =====================================================
    describe('getDefaultModel()', () => {
        test('gibt Default-Model aus DB zurück', async () => {
            db.query.mockResolvedValueOnce({ rows: [{ id: 'llama3:8b' }] });

            const defaultModel = await modelService.getDefaultModel();

            expect(defaultModel).toBe('llama3:8b');
        });

        test('fällt auf env-Variable zurück wenn kein Default', async () => {
            db.query.mockResolvedValueOnce({ rows: [] });

            const defaultModel = await modelService.getDefaultModel();

            // Falls back to env or hardcoded default
            expect(defaultModel).toBeDefined();
        });
    });

    // =====================================================
    // deleteModel
    // =====================================================
    describe('deleteModel()', () => {
        test('löscht Model aus Ollama und DB', async () => {
            axios.get.mockResolvedValueOnce({ data: { models: [] } });  // getLoadedModel
            axios.delete.mockResolvedValueOnce({ data: {} });
            db.query.mockResolvedValueOnce({ rows: [] });

            const result = await modelService.deleteModel('old-model');

            expect(result.success).toBe(true);
            expect(result.modelId).toBe('old-model');
        });
    });

    // =====================================================
    // unloadModel
    // =====================================================
    describe('unloadModel()', () => {
        test('entlädt Model mit keep_alive=0', async () => {
            axios.post.mockResolvedValueOnce({ data: {} });

            const result = await modelService.unloadModel('some-model');

            expect(result.success).toBe(true);
            expect(axios.post).toHaveBeenCalledWith(
                expect.stringContaining('/api/generate'),
                expect.objectContaining({ keep_alive: 0 }),
                expect.any(Object)
            );
        });

        test('behandelt Fehler graceful', async () => {
            axios.post.mockRejectedValueOnce(new Error('Model not found'));

            const result = await modelService.unloadModel('nonexistent');

            expect(result.success).toBe(false);
        });
    });

    // =====================================================
    // getStatus
    // =====================================================
    describe('getStatus()', () => {
        test('gibt Model-Status-Zusammenfassung zurück', async () => {
            axios.get.mockResolvedValueOnce({
                data: { models: [{ name: 'qwen3:14b-q8' }] }
            });
            db.query
                .mockResolvedValueOnce({ rows: [{ count: '3' }] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [{ total_switches: 5 }] });

            const status = await modelService.getStatus();

            expect(status.loaded_model).toBeDefined();
            expect(status.installed_count).toBe(3);
            expect(status.timestamp).toBeDefined();
        });
    });

    // =====================================================
    // isModelInstalled
    // =====================================================
    describe('isModelInstalled()', () => {
        test('gibt true für installiertes Model', async () => {
            db.query.mockResolvedValueOnce({ rows: [{ id: 'model-1' }] });

            const installed = await modelService.isModelInstalled('model-1');

            expect(installed).toBe(true);
        });

        test('gibt false für nicht installiertes Model', async () => {
            db.query.mockResolvedValueOnce({ rows: [] });

            const installed = await modelService.isModelInstalled('not-installed');

            expect(installed).toBe(false);
        });
    });

    // =====================================================
    // syncWithOllama
    // =====================================================
    describe('syncWithOllama()', () => {
        test('synchronisiert mit Ollama', async () => {
            axios.get.mockResolvedValueOnce({
                data: { models: [{ name: 'model-1' }, { name: 'model-2' }] }
            });
            db.query.mockResolvedValue({ rows: [{ id: 'model-1' }] });

            const result = await modelService.syncWithOllama();

            expect(result.success).toBe(true);
            expect(result.ollamaModels).toHaveLength(2);
        });

        test('behandelt Verbindungsfehler', async () => {
            axios.get.mockRejectedValueOnce(new Error('Connection refused'));

            const result = await modelService.syncWithOllama();

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    // =====================================================
    // resolveModel
    // =====================================================
    describe('resolveModel()', () => {
        test('gibt angefordetes Model zurück wenn angegeben', async () => {
            const model = await modelService.resolveModel('llama3:8b');

            expect(model).toBe('llama3:8b');
        });

        test('gibt Default-Model zurück wenn nicht angegeben', async () => {
            db.query.mockResolvedValueOnce({ rows: [{ id: 'default-model' }] });

            const model = await modelService.resolveModel(null);

            expect(model).toBe('default-model');
        });
    });
});

// =====================================================
// LLMQueueService Tests
// =====================================================
describe('LLMQueueService', () => {
    let llmQueueService;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();

        // Setup mocks
        jest.mock('../../src/database');
        jest.mock('../../src/services/llmJobService');
        jest.mock('../../src/services/modelService');
        jest.mock('axios');

        llmQueueService = require('../../src/services/llmQueueService');
    });

    // =====================================================
    // subscribeToJob / notifySubscribers
    // =====================================================
    describe('Job Subscription', () => {
        test('subscribeToJob fügt Callback hinzu', () => {
            const callback = jest.fn();
            const unsubscribe = llmQueueService.subscribeToJob('job-123', callback);

            expect(typeof unsubscribe).toBe('function');
        });

        test('notifySubscribers ruft alle Callbacks auf', () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();

            llmQueueService.subscribeToJob('job-123', callback1);
            llmQueueService.subscribeToJob('job-123', callback2);

            llmQueueService.notifySubscribers('job-123', { type: 'response', token: 'Hello' });

            expect(callback1).toHaveBeenCalledWith({ type: 'response', token: 'Hello' });
            expect(callback2).toHaveBeenCalledWith({ type: 'response', token: 'Hello' });
        });

        test('unsubscribe entfernt Callback', () => {
            const callback = jest.fn();
            const unsubscribe = llmQueueService.subscribeToJob('job-123', callback);

            unsubscribe();

            llmQueueService.notifySubscribers('job-123', { type: 'test' });
            expect(callback).not.toHaveBeenCalled();
        });

        test('behandelt Callback-Fehler graceful', () => {
            const badCallback = jest.fn().mockImplementation(() => {
                throw new Error('Callback error');
            });
            const goodCallback = jest.fn();

            llmQueueService.subscribeToJob('job-123', badCallback);
            llmQueueService.subscribeToJob('job-123', goodCallback);

            // Should not throw
            llmQueueService.notifySubscribers('job-123', { type: 'test' });

            expect(goodCallback).toHaveBeenCalled();
        });
    });

    // =====================================================
    // onJobComplete
    // =====================================================
    describe('onJobComplete()', () => {
        test('setzt isProcessing zurück', () => {
            // Set processing state manually
            llmQueueService.isProcessing = true;
            llmQueueService.processingJobId = 'job-123';

            llmQueueService.onJobComplete('job-123');

            expect(llmQueueService.isProcessing).toBe(false);
            expect(llmQueueService.processingJobId).toBeNull();
        });

        test('räumt Subscribers auf', () => {
            const callback = jest.fn();
            llmQueueService.subscribeToJob('job-123', callback);

            llmQueueService.isProcessing = true;
            llmQueueService.processingJobId = 'job-123';

            llmQueueService.onJobComplete('job-123');

            // Subscribers should be cleaned up
            llmQueueService.notifySubscribers('job-123', { type: 'test' });
            expect(callback).not.toHaveBeenCalled();
        });
    });

    // =====================================================
    // EventEmitter functionality
    // =====================================================
    describe('EventEmitter', () => {
        test('emittiert queue:update Events', () => {
            const handler = jest.fn();
            llmQueueService.on('queue:update', handler);

            llmQueueService.emit('queue:update');

            expect(handler).toHaveBeenCalled();
        });

        test('emittiert model:switching Events', () => {
            const handler = jest.fn();
            llmQueueService.on('model:switching', handler);

            llmQueueService.emit('model:switching', { from: 'old', to: 'new' });

            expect(handler).toHaveBeenCalledWith({ from: 'old', to: 'new' });
        });
    });
});

// =====================================================
// Integration-Style Tests (Services working together)
// =====================================================
describe('Service Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('Job-Flow: Create -> Stream -> Complete', async () => {
        const llmJobService = require('../../src/services/llmJobService');

        // Mock create
        const mockClient = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [{ id: 'job-123' }] })
                .mockResolvedValueOnce({ rows: [{ id: 456 }] })
                .mockResolvedValueOnce({ rows: [] })
        };
        db.transaction.mockImplementationOnce(async (cb) => cb(mockClient));

        // Create job
        const { jobId, messageId } = await llmJobService.createJob(1, 'chat', {});
        expect(jobId).toBe('job-123');

        // Simulate streaming updates
        db.query.mockResolvedValue({ rows: [] });
        await llmJobService.updateJobContent(jobId, 'Hello ', null, null);
        await llmJobService.updateJobContent(jobId, 'World!', null, null);

        // Complete job
        const completeClient = {
            query: jest.fn()
                .mockResolvedValueOnce({
                    rows: [{ content: 'Hello World!', thinking: null, sources: null, message_id: 456 }]
                })
                .mockResolvedValue({ rows: [] })
        };
        db.transaction.mockImplementationOnce(async (cb) => cb(completeClient));

        await llmJobService.completeJob(jobId);

        expect(completeClient.query).toHaveBeenCalledWith(
            expect.stringContaining("status = 'completed'"),
            expect.any(Array)
        );
    });

    test('Queue: Subscribe -> Notify -> Unsubscribe', () => {
        const llmQueueService = require('../../src/services/llmQueueService');
        const events = [];

        const unsubscribe = llmQueueService.subscribeToJob('test-job', (event) => {
            events.push(event);
        });

        llmQueueService.notifySubscribers('test-job', { type: 'status', status: 'streaming' });
        llmQueueService.notifySubscribers('test-job', { type: 'response', token: 'Hi' });

        expect(events).toHaveLength(2);
        expect(events[0].type).toBe('status');
        expect(events[1].token).toBe('Hi');

        unsubscribe();

        llmQueueService.notifySubscribers('test-job', { type: 'done' });
        expect(events).toHaveLength(2);  // No new events
    });
});
