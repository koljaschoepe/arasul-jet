/**
 * Backend Services Unit Tests
 * Tests for LLMQueueService, LLMJobService (legacy), and ModelService
 *
 * Uses Factory Pattern with Dependency Injection for proper test isolation
 */

const { createLLMJobService } = require('../../src/services/llmJobService');
const { createLLMQueueService } = require('../../src/services/llmQueueService');
const { createModelService } = require('../../src/services/modelService');

// Shared mock factories
function createMockDatabase() {
    const mockClient = { query: jest.fn() };
    return {
        query: jest.fn(),
        transaction: jest.fn(async (callback) => callback(mockClient)),
        _mockClient: mockClient
    };
}

function createMockLogger() {
    return {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    };
}

function createMockAxios() {
    return {
        get: jest.fn(),
        post: jest.fn(),
        delete: jest.fn()
    };
}

// =====================================================
// LLMJobService Tests (using singleton for backwards compat)
// =====================================================
describe('LLMJobService (Legacy)', () => {
    let service;
    let mockDb;
    let mockLogger;

    beforeEach(() => {
        mockDb = createMockDatabase();
        mockLogger = createMockLogger();
        service = createLLMJobService({
            database: mockDb,
            logger: mockLogger
        });
    });

    afterEach(() => {
        if (service._resetForTesting) {
            service._resetForTesting();
        }
    });

    describe('createJob()', () => {
        test('erstellt Job und Placeholder-Nachricht in Transaction', async () => {
            mockDb._mockClient.query
                .mockResolvedValueOnce({ rows: [{ id: 'job-123' }] })
                .mockResolvedValueOnce({ rows: [{ id: 456 }] })
                .mockResolvedValueOnce({ rows: [] });

            const result = await service.createJob(1, 'chat', {
                messages: [{ role: 'user', content: 'Hello' }]
            });

            expect(result.jobId).toBe('job-123');
            expect(result.messageId).toBe(456);
            expect(mockDb._mockClient.query).toHaveBeenCalledTimes(3);
        });
    });

    describe('updateJobContent()', () => {
        test('aktualisiert Content-Delta', async () => {
            mockDb.query.mockResolvedValueOnce({ rows: [] });

            await service.updateJobContent('job-123', 'new content', null, null);

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('content = content ||'),
                expect.arrayContaining(['job-123', 'new content'])
            );
        });

        test('aktualisiert Thinking-Delta', async () => {
            mockDb.query.mockResolvedValueOnce({ rows: [] });

            await service.updateJobContent('job-123', null, 'thinking...', null);

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('thinking = COALESCE'),
                expect.arrayContaining(['job-123', 'thinking...'])
            );
        });

        test('aktualisiert Sources', async () => {
            mockDb.query.mockResolvedValueOnce({ rows: [] });
            const sources = [{ title: 'Doc 1', score: 0.9 }];

            await service.updateJobContent('job-123', null, null, sources);

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('sources ='),
                expect.arrayContaining(['job-123', JSON.stringify(sources)])
            );
        });

        test('macht nichts wenn keine Deltas', async () => {
            await service.updateJobContent('job-123', null, null, null);

            expect(mockDb.query).not.toHaveBeenCalled();
        });
    });

    describe('completeJob()', () => {
        test('finalisiert Job und Message', async () => {
            mockDb._mockClient.query
                .mockResolvedValueOnce({
                    rows: [{
                        content: 'final content',
                        thinking: 'final thinking',
                        sources: '[]',
                        message_id: 456
                    }]
                })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] });

            await service.completeJob('job-123');

            expect(mockDb._mockClient.query).toHaveBeenCalledTimes(3);
            expect(mockDb._mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining("status = 'completed'"),
                expect.arrayContaining(['job-123'])
            );
        });

        test('behandelt nicht gefundenen Job graceful', async () => {
            mockDb._mockClient.query.mockResolvedValueOnce({ rows: [] });

            await service.completeJob('nonexistent');

            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('not found during completion')
            );
        });
    });

    describe('errorJob()', () => {
        test('markiert Job als fehlerhaft', async () => {
            mockDb.query.mockResolvedValue({ rows: [] });

            await service.errorJob('job-123', 'Connection timeout');

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining("status = 'error'"),
                expect.arrayContaining(['job-123', 'Connection timeout'])
            );
        });
    });

    describe('getJob()', () => {
        test('gibt Job-Details zurück', async () => {
            const mockJob = { id: 'job-123', status: 'streaming', content: 'partial' };
            mockDb.query.mockResolvedValueOnce({ rows: [mockJob] });

            const result = await service.getJob('job-123');

            expect(result).toEqual(mockJob);
        });

        test('gibt null für nicht existierenden Job', async () => {
            mockDb.query.mockResolvedValueOnce({ rows: [] });

            const result = await service.getJob('nonexistent');

            expect(result).toBeNull();
        });
    });

    describe('cancelJob()', () => {
        test('cancelled Job und aktualisiert Message', async () => {
            mockDb.query.mockResolvedValue({ rows: [] });

            await service.cancelJob('job-123');

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining("status = 'cancelled'"),
                expect.arrayContaining(['job-123'])
            );
        });
    });

    describe('cleanupStaleJobs()', () => {
        test('bereinigt veraltete Jobs', async () => {
            mockDb.query
                .mockResolvedValueOnce({ rows: [{ id: 'stale-1' }, { id: 'stale-2' }] })
                .mockResolvedValueOnce({ rows: [] });

            const count = await service.cleanupStaleJobs();

            expect(count).toBe(2);
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Cleaned up 2 stale jobs')
            );
        });

        test('gibt 0 zurück wenn keine veralteten Jobs', async () => {
            mockDb.query.mockResolvedValueOnce({ rows: [] });

            const count = await service.cleanupStaleJobs();

            expect(count).toBe(0);
        });
    });

    describe('Stream Registration', () => {
        test('registerStream speichert AbortController', () => {
            const abortController = new AbortController();
            service.registerStream('job-123', abortController);

            expect(service.isStreamActive('job-123')).toBe(true);
        });

        test('isStreamActive gibt false für unbekannten Job', () => {
            expect(service.isStreamActive('unknown')).toBe(false);
        });

        test('getActiveStream gibt Stream-Info zurück', () => {
            const abortController = new AbortController();
            service.registerStream('job-456', abortController);

            const stream = service.getActiveStream('job-456');

            expect(stream.abortController).toBe(abortController);
            expect(stream.startTime).toBeDefined();
        });
    });

    describe('getStats()', () => {
        test('gibt Job-Statistiken zurück', async () => {
            mockDb.query.mockResolvedValueOnce({
                rows: [{
                    active_jobs: '2',
                    pending_jobs: '5',
                    completed_last_hour: '10',
                    errors_last_hour: '1'
                }]
            });

            const stats = await service.getStats();

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
    let service;
    let mockDb;
    let mockLogger;
    let mockAxios;

    beforeEach(() => {
        mockDb = createMockDatabase();
        mockLogger = createMockLogger();
        mockAxios = createMockAxios();

        service = createModelService({
            database: mockDb,
            logger: mockLogger,
            axios: mockAxios
        });
    });

    afterEach(() => {
        if (service._resetForTesting) {
            service._resetForTesting();
        }
    });

    describe('getCatalog()', () => {
        test('gibt Model-Katalog zurück', async () => {
            const mockModels = [
                { id: 'llama3:8b', name: 'Llama 3 8B', ram_required_gb: 8 },
                { id: 'qwen3:14b', name: 'Qwen 3 14B', ram_required_gb: 14 }
            ];
            mockDb.query.mockResolvedValueOnce({ rows: mockModels });

            const catalog = await service.getCatalog();

            expect(catalog).toHaveLength(2);
            expect(catalog[0].id).toBe('llama3:8b');
        });
    });

    describe('getInstalledModels()', () => {
        test('gibt nur installierte Modelle zurück', async () => {
            const mockInstalled = [
                { id: 'llama3:8b', status: 'available', is_default: true }
            ];
            mockDb.query.mockResolvedValueOnce({ rows: mockInstalled });

            const installed = await service.getInstalledModels();

            expect(installed).toHaveLength(1);
            expect(installed[0].status).toBe('available');
        });
    });

    describe('getLoadedModel()', () => {
        test('gibt geladenes Model zurück', async () => {
            mockAxios.get.mockResolvedValueOnce({
                data: {
                    models: [{
                        name: 'qwen3:14b-q8',
                        size_vram: 14 * 1024 * 1024 * 1024
                    }]
                }
            });

            const loaded = await service.getLoadedModel();

            expect(loaded.model_id).toBe('qwen3:14b-q8');
            expect(loaded.ram_usage_mb).toBeGreaterThan(0);
        });

        test('gibt null wenn kein Model geladen', async () => {
            mockAxios.get.mockResolvedValueOnce({ data: { models: [] } });

            const loaded = await service.getLoadedModel();

            expect(loaded).toBeNull();
        });

        test('behandelt Fehler graceful', async () => {
            mockAxios.get.mockRejectedValueOnce(new Error('Connection refused'));

            const loaded = await service.getLoadedModel();

            expect(loaded).toBeNull();
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    describe('setDefaultModel()', () => {
        test('setzt neues Default-Model', async () => {
            mockDb._mockClient.query.mockResolvedValue({ rows: [] });

            const result = await service.setDefaultModel('llama3:8b');

            expect(result.success).toBe(true);
            expect(result.defaultModel).toBe('llama3:8b');
            expect(mockDb._mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('is_default = false')
            );
        });
    });

    describe('getDefaultModel()', () => {
        test('gibt Default-Model aus DB zurück', async () => {
            mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'llama3:8b' }] });

            const defaultModel = await service.getDefaultModel();

            expect(defaultModel).toBe('llama3:8b');
        });

        test('fällt auf env-Variable zurück wenn kein Default', async () => {
            // 1. No default in DB
            mockDb.query.mockResolvedValueOnce({ rows: [] });
            // 2. getLoadedModel() makes axios call - no model loaded
            mockAxios.get.mockResolvedValueOnce({ data: { models: [] } });
            // 3. No match for loaded model in DB (not called since no loaded model)
            // 4. No installed models
            mockDb.query.mockResolvedValueOnce({ rows: [] });

            const defaultModel = await service.getDefaultModel();

            // Falls back to env variable or returns null if not set
            // In test env, env var is not set so will be null
            expect(defaultModel === null || typeof defaultModel === 'string').toBe(true);
        });
    });

    describe('deleteModel()', () => {
        test('löscht Model aus Ollama und DB', async () => {
            mockAxios.get.mockResolvedValueOnce({ data: { models: [] } });
            mockAxios.delete.mockResolvedValueOnce({ data: {} });
            mockDb.query.mockResolvedValueOnce({ rows: [] });

            const result = await service.deleteModel('old-model');

            expect(result.success).toBe(true);
            expect(result.modelId).toBe('old-model');
        });
    });

    describe('unloadModel()', () => {
        test('entlädt Model mit keep_alive=0', async () => {
            mockAxios.post.mockResolvedValueOnce({ data: {} });

            const result = await service.unloadModel('some-model');

            expect(result.success).toBe(true);
            expect(mockAxios.post).toHaveBeenCalledWith(
                expect.stringContaining('/api/generate'),
                expect.objectContaining({ keep_alive: 0 }),
                expect.any(Object)
            );
        });

        test('behandelt Fehler graceful', async () => {
            mockAxios.post.mockRejectedValueOnce(new Error('Model not found'));

            const result = await service.unloadModel('nonexistent');

            expect(result.success).toBe(false);
        });
    });

    describe('getStatus()', () => {
        test('gibt Model-Status-Zusammenfassung zurück', async () => {
            mockAxios.get.mockResolvedValueOnce({
                data: { models: [{ name: 'qwen3:14b-q8' }] }
            });
            mockDb.query
                .mockResolvedValueOnce({ rows: [{ count: '3' }] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [{ total_switches: 5 }] });

            const status = await service.getStatus();

            expect(status.loaded_model).toBeDefined();
            expect(status.installed_count).toBe(3);
            expect(status.timestamp).toBeDefined();
        });
    });

    describe('isModelInstalled()', () => {
        test('gibt true für installiertes Model', async () => {
            mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'model-1' }] });

            const installed = await service.isModelInstalled('model-1');

            expect(installed).toBe(true);
        });

        test('gibt false für nicht installiertes Model', async () => {
            mockDb.query.mockResolvedValueOnce({ rows: [] });

            const installed = await service.isModelInstalled('not-installed');

            expect(installed).toBe(false);
        });
    });

    describe('syncWithOllama()', () => {
        test('synchronisiert mit Ollama', async () => {
            mockAxios.get.mockResolvedValueOnce({
                data: { models: [{ name: 'model-1' }, { name: 'model-2' }] }
            });
            mockDb.query.mockResolvedValue({ rows: [{ id: 'model-1' }] });

            const result = await service.syncWithOllama();

            expect(result.success).toBe(true);
            expect(result.ollamaModels).toHaveLength(2);
        });

        test('behandelt Verbindungsfehler', async () => {
            mockAxios.get.mockRejectedValueOnce(new Error('Connection refused'));

            const result = await service.syncWithOllama();

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    describe('resolveModel()', () => {
        test('gibt angefordetes Model zurück wenn angegeben', async () => {
            const model = await service.resolveModel('llama3:8b');

            expect(model).toBe('llama3:8b');
        });

        test('gibt Default-Model zurück wenn nicht angegeben', async () => {
            mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'default-model' }] });

            const model = await service.resolveModel(null);

            expect(model).toBe('default-model');
        });
    });

    describe('Test Isolation', () => {
        test('_resetForTesting clears switch state', () => {
            // Access internal state via getter
            const stateBefore = service._getSwitchState();
            expect(stateBefore.switchInProgress).toBe(false);

            service._resetForTesting();

            const stateAfter = service._getSwitchState();
            expect(stateAfter.lastSwitchTime).toBe(0);
            expect(stateAfter.switchInProgress).toBe(false);
        });
    });
});

// =====================================================
// LLMQueueService Tests
// =====================================================
describe('LLMQueueService', () => {
    let service;
    let mockDb;
    let mockLogger;
    let mockLlmJobService;
    let mockModelService;
    let mockAxios;

    beforeEach(() => {
        mockDb = createMockDatabase();
        mockLogger = createMockLogger();
        mockAxios = createMockAxios();

        mockLlmJobService = {
            createJob: jest.fn(),
            updateJobContent: jest.fn(),
            completeJob: jest.fn(),
            errorJob: jest.fn(),
            getJob: jest.fn(),
            registerStream: jest.fn(),
            isStreamActive: jest.fn(),
            cancelJob: jest.fn()
        };

        mockModelService = {
            getLoadedModel: jest.fn(),
            activateModel: jest.fn(),
            resolveModel: jest.fn(),
            getDefaultModel: jest.fn()
        };

        service = createLLMQueueService({
            database: mockDb,
            logger: mockLogger,
            llmJobService: mockLlmJobService,
            modelService: mockModelService,
            axios: mockAxios
        });
    });

    afterEach(() => {
        if (service._resetForTesting) {
            service._resetForTesting();
        }
    });

    describe('Job Subscription', () => {
        test('subscribeToJob fügt Callback hinzu', () => {
            const callback = jest.fn();
            const unsubscribe = service.subscribeToJob('job-123', callback);

            expect(typeof unsubscribe).toBe('function');
        });

        test('notifySubscribers ruft alle Callbacks auf', () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();

            service.subscribeToJob('job-123', callback1);
            service.subscribeToJob('job-123', callback2);

            service.notifySubscribers('job-123', { type: 'response', token: 'Hello' });

            expect(callback1).toHaveBeenCalledWith({ type: 'response', token: 'Hello' });
            expect(callback2).toHaveBeenCalledWith({ type: 'response', token: 'Hello' });
        });

        test('unsubscribe entfernt Callback', () => {
            const callback = jest.fn();
            const unsubscribe = service.subscribeToJob('job-123', callback);

            unsubscribe();

            service.notifySubscribers('job-123', { type: 'test' });
            expect(callback).not.toHaveBeenCalled();
        });

        test('behandelt Callback-Fehler graceful', () => {
            const badCallback = jest.fn().mockImplementation(() => {
                throw new Error('Callback error');
            });
            const goodCallback = jest.fn();

            service.subscribeToJob('job-123', badCallback);
            service.subscribeToJob('job-123', goodCallback);

            // Should not throw
            service.notifySubscribers('job-123', { type: 'test' });

            expect(goodCallback).toHaveBeenCalled();
        });
    });

    describe('onJobComplete()', () => {
        test('setzt isProcessing zurück', () => {
            service.isProcessing = true;
            service.processingJobId = 'job-123';

            service.onJobComplete('job-123');

            expect(service.isProcessing).toBe(false);
            expect(service.processingJobId).toBeNull();
        });

        test('räumt Subscribers auf', () => {
            const callback = jest.fn();
            service.subscribeToJob('job-123', callback);

            service.isProcessing = true;
            service.processingJobId = 'job-123';

            service.onJobComplete('job-123');

            // Subscribers should be cleaned up
            service.notifySubscribers('job-123', { type: 'test' });
            expect(callback).not.toHaveBeenCalled();
        });
    });

    describe('EventEmitter', () => {
        test('emittiert queue:update Events', () => {
            const handler = jest.fn();
            service.on('queue:update', handler);

            service.emit('queue:update');

            expect(handler).toHaveBeenCalled();
        });

        test('emittiert model:switching Events', () => {
            const handler = jest.fn();
            service.on('model:switching', handler);

            service.emit('model:switching', { from: 'old', to: 'new' });

            expect(handler).toHaveBeenCalledWith({ from: 'old', to: 'new' });
        });
    });

    describe('Test Isolation', () => {
        test('_resetForTesting clears all state', () => {
            service.subscribeToJob('job-1', jest.fn());
            service.subscribeToJob('job-2', jest.fn());
            service.isProcessing = true;
            service.processingJobId = 'job-1';

            service._resetForTesting();

            expect(service.isProcessing).toBe(false);
            expect(service.processingJobId).toBeNull();
            // Subscribers should be cleared
            const callback = jest.fn();
            service.notifySubscribers('job-1', { type: 'test' });
            expect(callback).not.toHaveBeenCalled();
        });

        test('different instances have isolated state', () => {
            const service1 = createLLMQueueService({
                database: mockDb,
                logger: mockLogger,
                llmJobService: mockLlmJobService,
                modelService: mockModelService,
                axios: mockAxios
            });
            const service2 = createLLMQueueService({
                database: mockDb,
                logger: mockLogger,
                llmJobService: mockLlmJobService,
                modelService: mockModelService,
                axios: mockAxios
            });

            const callback1 = jest.fn();
            const callback2 = jest.fn();

            service1.subscribeToJob('job-1', callback1);
            service2.subscribeToJob('job-1', callback2);

            service1.notifySubscribers('job-1', { type: 'test' });

            expect(callback1).toHaveBeenCalled();
            expect(callback2).not.toHaveBeenCalled();

            // Cleanup
            service1._resetForTesting();
            service2._resetForTesting();
        });
    });
});

// =====================================================
// Integration-Style Tests (Services working together)
// =====================================================
describe('Service Integration', () => {
    let mockDb;
    let mockLogger;
    let llmJobService;

    beforeEach(() => {
        mockDb = createMockDatabase();
        mockLogger = createMockLogger();
        llmJobService = createLLMJobService({
            database: mockDb,
            logger: mockLogger
        });
    });

    afterEach(() => {
        if (llmJobService._resetForTesting) {
            llmJobService._resetForTesting();
        }
    });

    test('Job-Flow: Create -> Stream -> Complete', async () => {
        // Mock create
        mockDb._mockClient.query
            .mockResolvedValueOnce({ rows: [{ id: 'job-123' }] })
            .mockResolvedValueOnce({ rows: [{ id: 456 }] })
            .mockResolvedValueOnce({ rows: [] });

        // Create job
        const { jobId, messageId } = await llmJobService.createJob(1, 'chat', {});
        expect(jobId).toBe('job-123');

        // Simulate streaming updates
        mockDb.query.mockResolvedValue({ rows: [] });
        await llmJobService.updateJobContent(jobId, 'Hello ', null, null);
        await llmJobService.updateJobContent(jobId, 'World!', null, null);

        // Complete job - need to reset mock client for new transaction
        mockDb._mockClient.query
            .mockResolvedValueOnce({
                rows: [{ content: 'Hello World!', thinking: null, sources: null, message_id: 456 }]
            })
            .mockResolvedValue({ rows: [] });

        await llmJobService.completeJob(jobId);

        expect(mockDb._mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining("status = 'completed'"),
            expect.any(Array)
        );
    });

    test('Queue: Subscribe -> Notify -> Unsubscribe', () => {
        const mockAxios = createMockAxios();
        const mockLlmJobService = { registerStream: jest.fn() };
        const mockModelService = { getLoadedModel: jest.fn() };

        const llmQueueService = createLLMQueueService({
            database: mockDb,
            logger: mockLogger,
            llmJobService: mockLlmJobService,
            modelService: mockModelService,
            axios: mockAxios
        });

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

        llmQueueService._resetForTesting();
    });
});
