/**
 * LLM Job Service Unit Tests
 * Uses Factory Pattern with Dependency Injection for true unit test isolation
 */

const { createLLMJobService } = require('../../src/services/llmJobService');

describe('LLMJobService (DI)', () => {
    let service;
    let mockDatabase;
    let mockLogger;
    let mockClient;

    beforeEach(() => {
        // Fresh mocks for each test
        mockClient = {
            query: jest.fn()
        };

        mockDatabase = {
            query: jest.fn(),
            transaction: jest.fn(async (callback) => callback(mockClient))
        };

        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        };

        // Create fresh service instance with injected dependencies
        service = createLLMJobService({
            database: mockDatabase,
            logger: mockLogger
        });
    });

    afterEach(() => {
        // Reset service state
        if (service._resetForTesting) {
            service._resetForTesting();
        }
    });

    // =====================================================
    // createJob
    // =====================================================
    describe('createJob()', () => {
        test('should create job and placeholder message in transaction', async () => {
            mockClient.query
                .mockResolvedValueOnce({ rows: [{ id: 'job-uuid-123' }] })  // Insert job
                .mockResolvedValueOnce({ rows: [{ id: 456 }] })              // Insert message
                .mockResolvedValueOnce({ rows: [] });                        // Update job

            const result = await service.createJob(1, 'chat', {
                messages: [{ role: 'user', content: 'Hello' }]
            });

            expect(result.jobId).toBe('job-uuid-123');
            expect(result.messageId).toBe(456);
            expect(mockClient.query).toHaveBeenCalledTimes(3);
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Created LLM job job-uuid-123')
            );
        });

        test('should pass request data as JSON', async () => {
            const requestData = { messages: [{ role: 'user', content: 'Test' }], model: 'llama3:8b' };

            mockClient.query
                .mockResolvedValueOnce({ rows: [{ id: 'job-1' }] })
                .mockResolvedValueOnce({ rows: [{ id: 1 }] })
                .mockResolvedValueOnce({ rows: [] });

            await service.createJob(1, 'rag', requestData);

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO llm_jobs'),
                [1, 'rag', JSON.stringify(requestData)]
            );
        });
    });

    // =====================================================
    // updateJobContent
    // =====================================================
    describe('updateJobContent()', () => {
        test('should append content delta', async () => {
            mockDatabase.query.mockResolvedValueOnce({ rows: [] });

            await service.updateJobContent('job-123', 'new content', null, null);

            expect(mockDatabase.query).toHaveBeenCalledWith(
                expect.stringContaining('content = content ||'),
                expect.arrayContaining(['job-123', 'new content'])
            );
        });

        test('should append thinking delta with COALESCE', async () => {
            mockDatabase.query.mockResolvedValueOnce({ rows: [] });

            await service.updateJobContent('job-123', null, 'thinking...', null);

            expect(mockDatabase.query).toHaveBeenCalledWith(
                expect.stringContaining('thinking = COALESCE'),
                expect.arrayContaining(['job-123', 'thinking...'])
            );
        });

        test('should replace sources (not append)', async () => {
            mockDatabase.query.mockResolvedValueOnce({ rows: [] });
            const sources = [{ title: 'Doc 1', score: 0.9 }];

            await service.updateJobContent('job-123', null, null, sources);

            expect(mockDatabase.query).toHaveBeenCalledWith(
                expect.stringContaining('sources ='),
                expect.arrayContaining(['job-123', JSON.stringify(sources)])
            );
        });

        test('should update multiple fields at once', async () => {
            mockDatabase.query.mockResolvedValueOnce({ rows: [] });
            const sources = [{ title: 'Test', score: 0.8 }];

            await service.updateJobContent('job-123', 'content', 'thinking', sources);

            // Should be single query with all fields
            expect(mockDatabase.query).toHaveBeenCalledTimes(1);
            const [query, params] = mockDatabase.query.mock.calls[0];
            expect(query).toContain('content = content ||');
            expect(query).toContain('thinking = COALESCE');
            expect(query).toContain('sources =');
        });

        test('should not query if no deltas provided', async () => {
            await service.updateJobContent('job-123', null, null, null);

            expect(mockDatabase.query).not.toHaveBeenCalled();
        });

        test('should not query with empty string content', async () => {
            await service.updateJobContent('job-123', '', '', null);

            // Empty strings are falsy, so no update should occur
            expect(mockDatabase.query).not.toHaveBeenCalled();
        });
    });

    // =====================================================
    // completeJob
    // =====================================================
    describe('completeJob()', () => {
        test('should finalize job and message in transaction', async () => {
            mockClient.query
                .mockResolvedValueOnce({
                    rows: [{
                        content: 'final content',
                        thinking: 'reasoning',
                        sources: JSON.stringify([{ title: 'Source' }]),
                        message_id: 456
                    }]
                })
                .mockResolvedValueOnce({ rows: [] })  // Update message
                .mockResolvedValueOnce({ rows: [] }); // Update job

            await service.completeJob('job-123');

            expect(mockClient.query).toHaveBeenCalledTimes(3);
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining("status = 'completed'"),
                expect.arrayContaining(['job-123'])
            );
            expect(mockLogger.info).toHaveBeenCalledWith('Completed LLM job job-123');
        });

        test('should handle job not found gracefully', async () => {
            mockClient.query.mockResolvedValueOnce({ rows: [] });

            await service.completeJob('nonexistent');

            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Job nonexistent not found during completion'
            );
            // Should not attempt to update message
            expect(mockClient.query).toHaveBeenCalledTimes(1);
        });

        test('should clean up active streams', async () => {
            // Register a stream first
            const abortController = new AbortController();
            service.registerStream('job-123', abortController);
            expect(service.isStreamActive('job-123')).toBe(true);

            mockClient.query
                .mockResolvedValueOnce({
                    rows: [{ content: 'done', thinking: null, sources: null, message_id: 1 }]
                })
                .mockResolvedValue({ rows: [] });

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

            expect(mockDatabase.query).toHaveBeenCalledWith(
                expect.stringContaining("status = 'error'"),
                expect.arrayContaining(['job-123', 'Connection timeout'])
            );
            expect(mockLogger.error).toHaveBeenCalledWith(
                'LLM job job-123 errored: Connection timeout'
            );
        });

        test('should update associated message status', async () => {
            mockDatabase.query.mockResolvedValue({ rows: [] });

            await service.errorJob('job-123', 'Error');

            // Second call should update messages
            expect(mockDatabase.query).toHaveBeenCalledWith(
                expect.stringContaining('chat_messages'),
                expect.arrayContaining(['job-123'])
            );
        });

        test('should clean up active streams', async () => {
            const abortController = new AbortController();
            service.registerStream('job-123', abortController);

            mockDatabase.query.mockResolvedValue({ rows: [] });
            await service.errorJob('job-123', 'Error');

            expect(service.isStreamActive('job-123')).toBe(false);
        });
    });

    // =====================================================
    // getJob
    // =====================================================
    describe('getJob()', () => {
        test('should return job details', async () => {
            const mockJob = {
                id: 'job-123',
                status: 'streaming',
                content: 'partial',
                queue_position: 1
            };
            mockDatabase.query.mockResolvedValueOnce({ rows: [mockJob] });

            const result = await service.getJob('job-123');

            expect(result).toEqual(mockJob);
        });

        test('should return null for non-existent job', async () => {
            mockDatabase.query.mockResolvedValueOnce({ rows: [] });

            const result = await service.getJob('nonexistent');

            expect(result).toBeNull();
        });
    });

    // =====================================================
    // getActiveJobsForConversation
    // =====================================================
    describe('getActiveJobsForConversation()', () => {
        test('should return active jobs for conversation', async () => {
            const mockJobs = [
                { id: 'job-1', status: 'streaming' },
                { id: 'job-2', status: 'pending' }
            ];
            mockDatabase.query.mockResolvedValueOnce({ rows: mockJobs });

            const result = await service.getActiveJobsForConversation(1);

            expect(result).toHaveLength(2);
            expect(mockDatabase.query).toHaveBeenCalledWith(
                expect.stringContaining("status IN ('pending', 'streaming')"),
                [1]
            );
        });
    });

    // =====================================================
    // cancelJob
    // =====================================================
    describe('cancelJob()', () => {
        test('should cancel job and update message', async () => {
            mockDatabase.query.mockResolvedValue({ rows: [] });

            await service.cancelJob('job-123');

            expect(mockDatabase.query).toHaveBeenCalledWith(
                expect.stringContaining("status = 'cancelled'"),
                expect.arrayContaining(['job-123'])
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

            // Should not throw
            await service.cancelJob('nonexistent');

            expect(mockDatabase.query).toHaveBeenCalled();
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

            expect(service.isStreamActive('job-1')).toBe(true);
            expect(service.isStreamActive('job-2')).toBe(true);
            expect(service.isStreamActive('job-3')).toBe(true);
            expect(service._getActiveStreamsCount()).toBe(3);
        });
    });

    // =====================================================
    // cleanupStaleJobs
    // =====================================================
    describe('cleanupStaleJobs()', () => {
        test('should clean up stale jobs older than 10 minutes', async () => {
            mockDatabase.query
                .mockResolvedValueOnce({ rows: [{ id: 'stale-1' }, { id: 'stale-2' }] })
                .mockResolvedValueOnce({ rows: [] });

            const count = await service.cleanupStaleJobs();

            expect(count).toBe(2);
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Cleaned up 2 stale jobs')
            );
        });

        test('should return 0 if no stale jobs', async () => {
            mockDatabase.query.mockResolvedValueOnce({ rows: [] });

            const count = await service.cleanupStaleJobs();

            expect(count).toBe(0);
            expect(mockLogger.info).not.toHaveBeenCalled();
        });

        test('should update associated messages to error status', async () => {
            mockDatabase.query
                .mockResolvedValueOnce({ rows: [{ id: 'stale-1' }] })
                .mockResolvedValueOnce({ rows: [] });

            await service.cleanupStaleJobs();

            expect(mockDatabase.query).toHaveBeenCalledWith(
                expect.stringContaining('chat_messages'),
                expect.arrayContaining([['stale-1']])
            );
        });
    });

    // =====================================================
    // cleanupOldJobs
    // =====================================================
    describe('cleanupOldJobs()', () => {
        test('should delete completed jobs older than 1 hour', async () => {
            mockDatabase.query.mockResolvedValueOnce({
                rows: [{ id: 'old-1' }, { id: 'old-2' }, { id: 'old-3' }]
            });

            const count = await service.cleanupOldJobs();

            expect(count).toBe(3);
            expect(mockDatabase.query).toHaveBeenCalledWith(
                expect.stringContaining('DELETE FROM llm_jobs')
            );
        });
    });

    // =====================================================
    // getStats
    // =====================================================
    describe('getStats()', () => {
        test('should return job statistics', async () => {
            mockDatabase.query.mockResolvedValueOnce({
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
            expect(stats.completed_last_hour).toBe('10');
            expect(stats.errors_last_hour).toBe('1');
            expect(stats.activeStreamsInMemory).toBeDefined();
            expect(stats.timestamp).toBeDefined();
        });

        test('should include in-memory stream count', async () => {
            service.registerStream('job-1', new AbortController());
            service.registerStream('job-2', new AbortController());

            mockDatabase.query.mockResolvedValueOnce({
                rows: [{ active_jobs: '2', pending_jobs: '0', completed_last_hour: '0', errors_last_hour: '0' }]
            });

            const stats = await service.getStats();

            expect(stats.activeStreamsInMemory).toBe(2);
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
