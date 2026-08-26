/**
 * LLM Job Service Unit Tests
 * Uses Factory Pattern with Dependency Injection for true unit test isolation
 *
 * Seit Phase B6 (26.08.2026) ist ein Auftrag zustandslos: kein Chat, keine
 * Platzhalter-Nachricht, keine Transaktion. Die Antwort steht am Auftrag.
 */

const { createLLMJobService } = require('../../src/services/llm/llmJobService');

describe('LLMJobService (DI)', () => {
    let service;
    let mockDatabase;
    let mockLogger;

    beforeEach(() => {
        mockDatabase = {
            query: jest.fn(),
            transaction: jest.fn(),
        };

        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        };

        service = createLLMJobService({
            database: mockDatabase,
            logger: mockLogger
        });
    });

    afterEach(() => {
        if (service._resetForTesting) {
            service._resetForTesting();
        }
    });

    // =====================================================
    // createJob
    // =====================================================
    describe('createJob()', () => {
        test('legt den Auftrag mit Besitzer an, ohne Nachricht und ohne Transaktion', async () => {
            mockDatabase.query.mockResolvedValueOnce({ rows: [{ id: 'job-uuid-123' }] });

            const result = await service.createJob(1, 'chat', {
                messages: [{ role: 'user', content: 'Hello' }]
            });

            expect(result).toEqual({ jobId: 'job-uuid-123' });
            expect(mockDatabase.query).toHaveBeenCalledTimes(1);
            expect(mockDatabase.transaction).not.toHaveBeenCalled();
            expect(mockDatabase.query.mock.calls[0][0]).not.toContain('chat_');
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Created LLM job job-uuid-123')
            );
        });

        test('should pass request data as JSON', async () => {
            const requestData = { messages: [{ role: 'user', content: 'Test' }], model: 'llama3:8b' };
            mockDatabase.query.mockResolvedValueOnce({ rows: [{ id: 'job-1' }] });

            await service.createJob(7, 'chat', requestData);

            expect(mockDatabase.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO llm_jobs (user_id'),
                [7, 'chat', JSON.stringify(requestData)]
            );
        });

        test('ein verwaister Schluessel darf einen Auftrag ohne Besitzer anlegen (NULL)', async () => {
            mockDatabase.query.mockResolvedValueOnce({ rows: [{ id: 'job-2' }] });

            await service.createJob(null, 'chat', {});

            expect(mockDatabase.query.mock.calls[0][1][0]).toBeNull();
        });
    });

    // =====================================================
    // updateJobContent
    // =====================================================
    describe('updateJobContent()', () => {
        test('should append content delta', async () => {
            mockDatabase.query.mockResolvedValueOnce({ rows: [] });

            await service.updateJobContent('job-123', 'new content', null);

            expect(mockDatabase.query).toHaveBeenCalledWith(
                expect.stringContaining('content = content ||'),
                expect.arrayContaining(['job-123', 'new content'])
            );
        });

        test('should append thinking delta with COALESCE', async () => {
            mockDatabase.query.mockResolvedValueOnce({ rows: [] });

            await service.updateJobContent('job-123', null, 'thinking...');

            expect(mockDatabase.query).toHaveBeenCalledWith(
                expect.stringContaining('thinking = COALESCE'),
                expect.arrayContaining(['job-123', 'thinking...'])
            );
        });

        test('should update both fields at once', async () => {
            mockDatabase.query.mockResolvedValueOnce({ rows: [] });

            await service.updateJobContent('job-123', 'content', 'thinking');

            expect(mockDatabase.query).toHaveBeenCalledTimes(1);
            const [query] = mockDatabase.query.mock.calls[0];
            expect(query).toContain('content = content ||');
            expect(query).toContain('thinking = COALESCE');
        });

        test('should not query if no deltas provided', async () => {
            await service.updateJobContent('job-123', null, null);

            expect(mockDatabase.query).not.toHaveBeenCalled();
        });

        test('should not query with empty string content', async () => {
            await service.updateJobContent('job-123', '', '');

            expect(mockDatabase.query).not.toHaveBeenCalled();
        });

        test('wiederholt eine gescheiterte Schreibung und gibt danach auf', async () => {
            mockDatabase.query.mockRejectedValue(new Error('lock'));

            await expect(service.updateJobContent('job-123', 'x', null)).rejects.toThrow('lock');
            expect(mockDatabase.query).toHaveBeenCalledTimes(3);
            expect(mockLogger.warn).toHaveBeenCalledTimes(2);
        });
    });

    // =====================================================
    // completeJob
    // =====================================================
    describe('completeJob()', () => {
        test('setzt nur den Status; die Antwort bleibt am Auftrag', async () => {
            mockDatabase.query.mockResolvedValueOnce({
                rows: [{ content_length: 13, thinking_length: 9 }]
            });

            const ok = await service.completeJob('job-123');

            expect(ok).toBe(true);
            expect(mockDatabase.query).toHaveBeenCalledTimes(1);
            expect(mockDatabase.query).toHaveBeenCalledWith(
                expect.stringContaining("status = 'completed'"),
                ['job-123']
            );
            expect(mockDatabase.query.mock.calls[0][0]).not.toContain('chat_messages');
            expect(mockLogger.info).toHaveBeenCalledWith(
                '[JOB job-123] completed: 13 chars, 9 thinking chars'
            );
        });

        test('should handle job not found gracefully', async () => {
            mockDatabase.query.mockResolvedValueOnce({ rows: [] });

            const ok = await service.completeJob('nonexistent');

            expect(ok).toBe(false);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                '[JOB nonexistent] Not found during completion'
            );
        });

        test('should clean up active streams', async () => {
            service.registerStream('job-123', new AbortController());
            expect(service.isStreamActive('job-123')).toBe(true);

            mockDatabase.query.mockResolvedValueOnce({
                rows: [{ content_length: 4, thinking_length: null }]
            });

            await service.completeJob('job-123');

            expect(service.isStreamActive('job-123')).toBe(false);
        });
    });

    // =====================================================
    // errorJob
    // =====================================================
    describe('errorJob()', () => {
        test('should mark job as errored with message', async () => {
            mockDatabase.query.mockResolvedValue({ rows: [] });

            await service.errorJob('job-123', 'Connection timeout');

            expect(mockDatabase.transaction).not.toHaveBeenCalled();
            expect(mockDatabase.query).toHaveBeenCalledWith(
                expect.stringContaining("status = 'error'"),
                ['job-123', 'Connection timeout']
            );
            expect(mockLogger.error).toHaveBeenCalledWith(
                'LLM job job-123 errored: Connection timeout'
            );
        });

        test('should clean up active streams', async () => {
            service.registerStream('job-123', new AbortController());

            mockDatabase.query.mockResolvedValue({ rows: [] });
            await service.errorJob('job-123', 'Error');

            expect(service.isStreamActive('job-123')).toBe(false);
        });
    });

    // =====================================================
    // getJob
    // =====================================================
    describe('getJob()', () => {
        test('should return job details including the owner', async () => {
            const mockJob = {
                id: 'job-123',
                user_id: 4,
                status: 'streaming',
                content: 'partial',
                queue_position: 1
            };
            mockDatabase.query.mockResolvedValueOnce({ rows: [mockJob] });

            const result = await service.getJob('job-123');

            expect(result).toEqual(mockJob);
            expect(mockDatabase.query.mock.calls[0][0]).not.toContain('JOIN');
        });

        test('should return null for non-existent job', async () => {
            mockDatabase.query.mockResolvedValueOnce({ rows: [] });

            const result = await service.getJob('nonexistent');

            expect(result).toBeNull();
        });
    });

    // =====================================================
    // cancelJob
    // =====================================================
    describe('cancelJob()', () => {
        test('should cancel only a non-terminal job', async () => {
            mockDatabase.query.mockResolvedValue({ rows: [] });

            await service.cancelJob('job-123');

            expect(mockDatabase.query).toHaveBeenCalledWith(
                expect.stringContaining("status IN ('pending', 'streaming')"),
                ['job-123']
            );
            expect(mockLogger.info).toHaveBeenCalledWith('Cancelled LLM job job-123');
        });

        test('should abort active stream', async () => {
            const abortController = new AbortController();
            const abortSpy = jest.spyOn(abortController, 'abort');
            service.registerStream('job-123', abortController);

            mockDatabase.query.mockResolvedValue({ rows: [] });
            await service.cancelJob('job-123');

            expect(abortSpy).toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith('Aborted stream for job job-123');
        });

        test('should handle non-existent stream gracefully', async () => {
            mockDatabase.query.mockResolvedValue({ rows: [] });

            await expect(service.cancelJob('nonexistent')).resolves.toBeUndefined();
        });
    });

    // =====================================================
    // Stream Registration
    // =====================================================
    describe('Stream Registration', () => {
        test('registerStream should store AbortController with timestamp', () => {
            const abortController = new AbortController();
            const beforeTime = Date.now();

            service.registerStream('job-123', abortController);

            expect(service.isStreamActive('job-123')).toBe(true);
            const stream = service.getActiveStream('job-123');
            expect(stream.abortController).toBe(abortController);
            expect(stream.startTime).toBeGreaterThanOrEqual(beforeTime);
        });

        test('isStreamActive should return false for unknown job', () => {
            expect(service.isStreamActive('unknown')).toBe(false);
        });

        test('getActiveStream should return undefined for unknown job', () => {
            expect(service.getActiveStream('unknown')).toBeUndefined();
        });

        test('multiple streams can be registered', () => {
            service.registerStream('job-1', new AbortController());
            service.registerStream('job-2', new AbortController());
            service.registerStream('job-3', new AbortController());

            expect(service._getActiveStreamsCount()).toBe(3);
        });
    });

    // =====================================================
    // cleanupStaleJobs
    // =====================================================
    describe('cleanupStaleJobs()', () => {
        test('should mark stale jobs older than 10 minutes as error', async () => {
            mockDatabase.query
                .mockResolvedValueOnce({ rows: [{ id: 'stale-1' }, { id: 'stale-2' }] })
                .mockResolvedValue({ rows: [] });

            const count = await service.cleanupStaleJobs();

            expect(count).toBe(2);
            expect(mockDatabase.query).toHaveBeenCalledWith(
                expect.stringContaining("status = 'error'"),
                ['stale-1']
            );
            expect(mockLogger.info).toHaveBeenCalledWith('Stale job cleanup: 2 marked as error');
        });

        test('should return 0 if no stale jobs', async () => {
            mockDatabase.query.mockResolvedValueOnce({ rows: [] });

            const count = await service.cleanupStaleJobs();

            expect(count).toBe(0);
            expect(mockLogger.info).not.toHaveBeenCalled();
        });

        test('vergisst den Strom eines veralteten Auftrags', async () => {
            service.registerStream('stale-1', new AbortController());
            mockDatabase.query
                .mockResolvedValueOnce({ rows: [{ id: 'stale-1' }] })
                .mockResolvedValue({ rows: [] });

            await service.cleanupStaleJobs();

            expect(service.isStreamActive('stale-1')).toBe(false);
        });
    });

    // =====================================================
    // cleanupOldJobs
    // =====================================================
    describe('cleanupOldJobs()', () => {
        test('should delete completed jobs older than 1 hour, in one query', async () => {
            mockDatabase.query.mockResolvedValueOnce({
                rows: [{ id: 'old-1' }, { id: 'old-2' }, { id: 'old-3' }]
            });

            const count = await service.cleanupOldJobs();

            expect(count).toBe(3);
            expect(mockDatabase.query).toHaveBeenCalledTimes(1);
            expect(mockDatabase.query).toHaveBeenCalledWith(
                expect.stringContaining('DELETE FROM llm_jobs')
            );
        });
    });

    // =====================================================
    // Test Isolation
    // =====================================================
    describe('Test Isolation', () => {
        test('_resetForTesting clears all state', () => {
            service.registerStream('job-1', new AbortController());
            service.registerStream('job-2', new AbortController());

            expect(service._getActiveStreamsCount()).toBe(2);

            service._resetForTesting();

            expect(service._getActiveStreamsCount()).toBe(0);
        });

        test('different instances have isolated state', () => {
            const service1 = createLLMJobService({ database: mockDatabase, logger: mockLogger });
            const service2 = createLLMJobService({ database: mockDatabase, logger: mockLogger });

            service1.registerStream('job-1', new AbortController());

            expect(service1.isStreamActive('job-1')).toBe(true);
            expect(service2.isStreamActive('job-1')).toBe(false);
        });
    });
});
