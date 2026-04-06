/**
 * LLM Queue Service Unit Tests
 * Tests queue management, job lifecycle, subscriber handling, and cleanup
 *
 * Uses Factory Pattern with Dependency Injection (same as services.test.js)
 */

const { createLLMQueueService } = require('../../src/services/llm/llmQueueService');
const { createLLMJobService } = require('../../src/services/llm/llmJobService');

// Shared mock factories
function createMockDatabase() {
  const mockClient = { query: jest.fn() };
  return {
    query: jest.fn(),
    transaction: jest.fn(async (callback) => callback(mockClient)),
    _mockClient: mockClient,
  };
}

function createMockLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

function createMockModelService() {
  return {
    getDefaultModel: jest.fn().mockResolvedValue('llama3:8b'),
    isModelAvailable: jest.fn().mockResolvedValue(true),
    getLoadedModel: jest.fn().mockResolvedValue({ model_id: 'llama3:8b' }),
    activateModel: jest.fn().mockResolvedValue({ success: true }),
  };
}

function createMockJobService() {
  return {
    createJob: jest.fn().mockResolvedValue({ jobId: 'job-123', messageId: 456 }),
    cleanupStaleJobs: jest.fn().mockResolvedValue(0),
    recoverOrphanedMessages: jest.fn().mockResolvedValue(0),
    errorJob: jest.fn().mockResolvedValue(true),
    cancelJob: jest.fn().mockResolvedValue(true),
    getJob: jest.fn(),
    updateJobContent: jest.fn(),
    completeJob: jest.fn(),
  };
}

describe('LLMQueueService', () => {
  let service;
  let mockDb;
  let mockLogger;
  let mockModelService;
  let mockJobService;

  beforeEach(() => {
    mockDb = createMockDatabase();
    mockLogger = createMockLogger();
    mockModelService = createMockModelService();
    mockJobService = createMockJobService();

    service = createLLMQueueService({
      database: mockDb,
      logger: mockLogger,
      llmJobService: mockJobService,
      modelService: mockModelService,
      axios: { get: jest.fn(), post: jest.fn() },
      getOllamaReadiness: () => null,
    });
  });

  afterEach(() => {
    if (service._resetForTesting) {
      service._resetForTesting();
    }
  });

  // =====================================================
  // subscribeToJob / notifySubscribers
  // =====================================================
  describe('subscribeToJob()', () => {
    test('registers subscriber and returns unsubscribe function', () => {
      const callback = jest.fn();
      const unsubscribe = service.subscribeToJob('job-123', callback);

      expect(typeof unsubscribe).toBe('function');
      expect(service._getSubscriberCount()).toBe(1);
    });

    test('notifies registered subscribers', () => {
      const callback = jest.fn();
      service.subscribeToJob('job-123', callback);

      service.notifySubscribers('job-123', { type: 'token', data: 'hello' });

      expect(callback).toHaveBeenCalledWith({ type: 'token', data: 'hello' });
    });

    test('supports multiple subscribers for same job', () => {
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      service.subscribeToJob('job-123', cb1);
      service.subscribeToJob('job-123', cb2);

      service.notifySubscribers('job-123', { type: 'token' });

      expect(cb1).toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
      expect(service._getSubscriberCount()).toBe(2);
    });

    test('unsubscribe removes callback', () => {
      const callback = jest.fn();
      const unsubscribe = service.subscribeToJob('job-123', callback);

      unsubscribe();

      service.notifySubscribers('job-123', { type: 'token' });
      expect(callback).not.toHaveBeenCalled();
      expect(service._getSubscriberCount()).toBe(0);
    });

    test('does not throw when notifying non-existent job', () => {
      expect(() => {
        service.notifySubscribers('nonexistent-job', { type: 'token' });
      }).not.toThrow();
    });

    test('handles subscriber callback errors gracefully', () => {
      const failingCallback = jest.fn(() => {
        throw new Error('Callback error');
      });
      const goodCallback = jest.fn();

      service.subscribeToJob('job-123', failingCallback);
      service.subscribeToJob('job-123', goodCallback);

      service.notifySubscribers('job-123', { type: 'token' });

      // Good callback should still be called despite first one failing
      expect(goodCallback).toHaveBeenCalled();
    });

    test('evicts oldest subscriber when limit reached', () => {
      // Fill up to near the limit by adding many job subscribers
      for (let i = 0; i < 500; i++) {
        service.subscribeToJob(`job-${i}`, jest.fn());
      }

      // This should evict the oldest entry
      const newCallback = jest.fn();
      service.subscribeToJob('job-overflow', newCallback);

      // The new subscriber should be registered
      service.notifySubscribers('job-overflow', { type: 'test' });
      expect(newCallback).toHaveBeenCalled();
    });
  });

  // =====================================================
  // enqueue
  // =====================================================
  describe('enqueue()', () => {
    test('enqueues job with correct parameters', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ cnt: '0' }] }) // Queue size check
        .mockResolvedValueOnce({ rows: [{ pos: 1 }] }) // get_next_queue_position
        .mockResolvedValueOnce({ rows: [] }); // UPDATE llm_jobs with queue info

      const result = await service.enqueue(1, 'chat', { messages: [] });

      expect(result).toHaveProperty('jobId', 'job-123');
      expect(result).toHaveProperty('messageId', 456);
      expect(result).toHaveProperty('queuePosition', 1);
      expect(result).toHaveProperty('model', 'llama3:8b');
      expect(mockJobService.createJob).toHaveBeenCalledWith(1, 'chat', { messages: [] });
    });

    test('resolves default model when none specified', async () => {
      mockModelService.getDefaultModel.mockResolvedValue('qwen3:14b');
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ cnt: '0' }] })
        .mockResolvedValueOnce({ rows: [{ pos: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.enqueue(1, 'chat', {});

      expect(result.model).toBe('qwen3:14b');
    });

    test('uses explicit model when provided', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ cnt: '0' }] })
        .mockResolvedValueOnce({ rows: [{ pos: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.enqueue(1, 'chat', {}, { model: 'mistral:7b' });

      expect(result.model).toBe('mistral:7b');
    });

    test('throws error when no model is available', async () => {
      mockModelService.getDefaultModel.mockResolvedValue(null);

      await expect(
        service.enqueue(1, 'chat', {}, { model: null })
      ).rejects.toThrow('Kein LLM-Model verfügbar');
    });

    test('throws error when queue is full', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ cnt: '20' }] }); // Queue full

      await expect(service.enqueue(1, 'chat', {})).rejects.toThrow('Warteschlange ist voll');
    });

    test('throws error when model is not available in Ollama', async () => {
      mockModelService.isModelAvailable.mockResolvedValue(false);
      mockDb.query.mockResolvedValueOnce({ rows: [{ cnt: '0' }] }); // Queue size check

      await expect(
        service.enqueue(1, 'chat', {}, { model: 'nonexistent:model' })
      ).rejects.toThrow('nicht in Ollama verfügbar');
    });
  });

  // =====================================================
  // cancelJob
  // =====================================================
  describe('cancelJob()', () => {
    test('cancels existing job', async () => {
      mockJobService.getJob.mockResolvedValue({
        id: 'job-123',
        status: 'pending',
      });

      const result = await service.cancelJob('job-123');

      expect(result).toBe(true);
      expect(mockJobService.cancelJob).toHaveBeenCalledWith('job-123');
    });

    test('returns false for non-existent job', async () => {
      mockJobService.getJob.mockResolvedValue(null);

      const result = await service.cancelJob('nonexistent');

      expect(result).toBe(false);
      expect(mockJobService.cancelJob).not.toHaveBeenCalled();
    });

    test('notifies subscribers on cancellation', async () => {
      mockJobService.getJob.mockResolvedValue({ id: 'job-123', status: 'pending' });

      const callback = jest.fn();
      service.subscribeToJob('job-123', callback);

      await service.cancelJob('job-123');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'cancelled',
          done: true,
        })
      );
    });
  });

  // =====================================================
  // getQueueStatus
  // =====================================================
  describe('getQueueStatus()', () => {
    test('returns status with pending and processing info', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'job-1',
            conversation_id: 1,
            job_type: 'chat',
            status: 'streaming',
            queue_position: 0,
            requested_model: 'llama3:8b',
            chat_title: 'Test Chat',
          },
          {
            id: 'job-2',
            conversation_id: 2,
            job_type: 'chat',
            status: 'pending',
            queue_position: 1,
            requested_model: 'llama3:8b',
            chat_title: 'Other Chat',
          },
        ],
      });

      const status = await service.getQueueStatus();

      expect(status).toHaveProperty('queue');
      expect(status).toHaveProperty('processing');
      expect(status).toHaveProperty('pending_count', 1);
      expect(status).toHaveProperty('pending_by_model');
      expect(status).toHaveProperty('timestamp');
      expect(status.processing.id).toBe('job-1');
      expect(status.pending_by_model['llama3:8b']).toBe(1);
    });

    test('returns empty queue when no jobs', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const status = await service.getQueueStatus();

      expect(status.queue).toEqual([]);
      expect(status.processing).toBeNull();
      expect(status.pending_count).toBe(0);
    });
  });

  // =====================================================
  // getQueueMetrics
  // =====================================================
  describe('getQueueMetrics()', () => {
    test('returns metrics with all fields', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            pending_count: '3',
            streaming_count: '1',
            completed_last_minute: '5',
            errors_last_minute: '0',
            avg_wait_seconds: '2',
            max_queue_position: '3',
          },
        ],
      });

      const metrics = await service.getQueueMetrics();

      expect(metrics.pending).toBe(3);
      expect(metrics.streaming).toBe(1);
      expect(metrics.completed_per_minute).toBe(5);
      expect(metrics.errors_per_minute).toBe(0);
      expect(metrics.avg_wait_seconds).toBe(2);
      expect(metrics.queue_depth).toBe(3);
      expect(metrics).toHaveProperty('is_processing');
      expect(metrics).toHaveProperty('subscriber_count');
      expect(metrics).toHaveProperty('timestamp');
    });

    test('returns zero defaults when no data', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{}] });

      const metrics = await service.getQueueMetrics();

      expect(metrics.pending).toBe(0);
      expect(metrics.streaming).toBe(0);
      expect(metrics.completed_per_minute).toBe(0);
      expect(metrics.errors_per_minute).toBe(0);
    });
  });

  // =====================================================
  // prioritizeJob
  // =====================================================
  describe('prioritizeJob()', () => {
    test('updates job priority and reorders queue', async () => {
      // updateQueuePositions: ranked update + returning
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // UPDATE priority
        .mockResolvedValueOnce({ rows: [] }); // updateQueuePositions

      await service.prioritizeJob('job-123');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('priority = 1'),
        ['job-123']
      );
    });
  });

  // =====================================================
  // cleanupStaleSubscribers
  // =====================================================
  describe('cleanupStaleSubscribers()', () => {
    test('removes subscribers for completed jobs', async () => {
      service.subscribeToJob('job-old', jest.fn());

      // Mock the job as completed
      mockDb.query.mockResolvedValueOnce({
        rows: [{ status: 'completed' }],
      });

      await service.cleanupStaleSubscribers();

      expect(service._getSubscriberCount()).toBe(0);
    });

    test('keeps subscribers for active jobs', async () => {
      service.subscribeToJob('job-active', jest.fn());

      // Mock the job as still streaming
      mockDb.query.mockResolvedValueOnce({
        rows: [{ status: 'streaming' }],
      });

      await service.cleanupStaleSubscribers();

      expect(service._getSubscriberCount()).toBe(1);
    });

    test('removes subscribers when database query fails', async () => {
      service.subscribeToJob('job-broken', jest.fn());

      // Mock database error
      mockDb.query.mockRejectedValueOnce(new Error('DB error'));

      await service.cleanupStaleSubscribers();

      // Should clean up on error to prevent memory leak
      expect(service._getSubscriberCount()).toBe(0);
    });
  });

  // =====================================================
  // processNext
  // =====================================================
  describe('processNext()', () => {
    test('skips when already processing a job', async () => {
      service.processingJobId = 'existing-job';

      await service.processNext();

      expect(mockDb.query).not.toHaveBeenCalled();
    });

    test('resets processingJobId when no jobs in queue', async () => {
      // get_next_batched_job returns no rows
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await service.processNext();

      expect(service.processingJobId).toBeNull();
    });
  });

  // =====================================================
  // initialize
  // =====================================================
  describe('initialize()', () => {
    test('initializes queue and starts processing', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // recalculate positions
        .mockResolvedValueOnce({ rows: [] }); // processNext (no jobs)

      await service.initialize();

      expect(service.initialized).toBe(true);
      expect(mockJobService.cleanupStaleJobs).toHaveBeenCalled();
    });

    test('does not reinitialize if already initialized', async () => {
      service.initialized = true;

      await service.initialize();

      expect(mockJobService.cleanupStaleJobs).not.toHaveBeenCalled();
    });
  });

  // =====================================================
  // stop / _resetForTesting
  // =====================================================
  describe('stop()', () => {
    test('clears intervals on stop', () => {
      service.subscriberCleanupInterval = setInterval(() => {}, 1000);
      service.timeoutInterval = setInterval(() => {}, 1000);

      service.stop();

      expect(service.subscriberCleanupInterval).toBeNull();
      expect(service.timeoutInterval).toBeNull();
    });
  });

  describe('_resetForTesting()', () => {
    test('resets all internal state', () => {
      service.subscribeToJob('job-1', jest.fn());
      service.processingJobId = 'job-1';
      service.initialized = true;

      service._resetForTesting();

      expect(service._getSubscriberCount()).toBe(0);
      expect(service.processingJobId).toBeNull();
      expect(service.initialized).toBe(false);
    });
  });
});
