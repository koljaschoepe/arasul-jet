/**
 * Unit tests for LLM Routes
 *
 * Tests all LLM endpoints:
 * - POST /api/llm/chat
 * - GET /api/llm/queue
 * - POST /api/llm/queue/prioritize
 * - GET /api/llm/jobs/:jobId
 * - GET /api/llm/jobs/:jobId/stream
 * - DELETE /api/llm/jobs/:jobId
 * - GET /api/llm/jobs
 * - GET /api/llm/models
 */

const request = require('supertest');

// Mock database module
jest.mock('../../src/database', () => ({
  query: jest.fn(),
  initialize: jest.fn().mockResolvedValue(true),
  getPoolStats: jest.fn().mockReturnValue({ total: 10, idle: 5, waiting: 0 })
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

// Mock axios for LLM service calls
jest.mock('axios');

// Mock LLM services
jest.mock('../../src/services/llmJobService', () => ({
  getJob: jest.fn(),
  getActiveJobsForConversation: jest.fn(),
  getAllActiveJobs: jest.fn()
}));

jest.mock('../../src/services/llmQueueService', () => ({
  enqueue: jest.fn(),
  getQueueStatus: jest.fn(),
  prioritizeJob: jest.fn(),
  cancelJob: jest.fn(),
  subscribeToJob: jest.fn()
}));

const db = require('../../src/database');
const axios = require('axios');
const llmJobService = require('../../src/services/llmJobService');
const llmQueueService = require('../../src/services/llmQueueService');
const { app } = require('../../src/server');

// Import auth mock helpers
const {
  mockUser,
  setupAuthMocks,
  setupAuthMocksSequential,
  setupLoginMocks
} = require('../helpers/authMock');

/**
 * Helper to get auth token via login
 * Uses the standardized auth mock helper
 */
async function getAuthToken() {
  const bcrypt = require('bcrypt');
  const hash = await bcrypt.hash('TestPassword123!', 12);
  setupLoginMocks(db, hash);

  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'TestPassword123!' });

  return loginResponse.body.token;
}

describe('LLM Routes', () => {
  // Note: jest.clearAllMocks() is called globally in jest.setup.js

  // ============================================================================
  // POST /api/llm/chat
  // ============================================================================
  describe('POST /api/llm/chat', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/llm/chat')
        .send({ messages: [{ role: 'user', content: 'Hello' }] });

      expect(response.status).toBe(401);
    });

    test('should return 400 if messages is missing', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      const response = await request(app)
        .post('/api/llm/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ conversation_id: 1 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Messages');
    });

    test('should return 400 if messages is not an array', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      const response = await request(app)
        .post('/api/llm/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ messages: 'not an array', conversation_id: 1 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('array');
    });

    test('should return 400 if conversation_id is missing', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      const response = await request(app)
        .post('/api/llm/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({ messages: [{ role: 'user', content: 'Hello' }] });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('conversation_id');
    });

    test('should enqueue job and return job info for non-streaming', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      llmQueueService.enqueue.mockResolvedValueOnce({
        jobId: 'job-123',
        messageId: 'msg-123',
        queuePosition: 1,
        model: 'qwen3:14b'
      });

      const response = await request(app)
        .post('/api/llm/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          conversation_id: 1,
          stream: false
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jobId', 'job-123');
      expect(response.body).toHaveProperty('messageId', 'msg-123');
      expect(response.body).toHaveProperty('queuePosition', 1);
      expect(response.body).toHaveProperty('model', 'qwen3:14b');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should handle LLM service unavailable', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      const error = new Error('Connection refused');
      error.code = 'ECONNREFUSED';
      llmQueueService.enqueue.mockRejectedValueOnce(error);

      const response = await request(app)
        .post('/api/llm/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          conversation_id: 1,
          stream: false
        });

      expect(response.status).toBe(503);
      expect(response.body.error).toContain('not available');
    });

    test('should handle generic errors', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      llmQueueService.enqueue.mockRejectedValueOnce(new Error('Queue error'));

      const response = await request(app)
        .post('/api/llm/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          conversation_id: 1,
          stream: false
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('enqueue');
    });

    test('should accept model parameter', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      llmQueueService.enqueue.mockResolvedValueOnce({
        jobId: 'job-123',
        messageId: 'msg-123',
        queuePosition: 1,
        model: 'llama3:8b'
      });

      const response = await request(app)
        .post('/api/llm/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          conversation_id: 1,
          model: 'llama3:8b',
          stream: false
        });

      expect(response.status).toBe(200);
      expect(response.body.model).toBe('llama3:8b');
      expect(llmQueueService.enqueue).toHaveBeenCalledWith(
        1,
        'chat',
        expect.any(Object),
        expect.objectContaining({ model: 'llama3:8b' })
      );
    });

    test('should accept priority parameter', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      llmQueueService.enqueue.mockResolvedValueOnce({
        jobId: 'job-123',
        messageId: 'msg-123',
        queuePosition: 1,
        model: 'qwen3:14b'
      });

      await request(app)
        .post('/api/llm/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          conversation_id: 1,
          priority: 1,
          stream: false
        });

      expect(llmQueueService.enqueue).toHaveBeenCalledWith(
        1,
        'chat',
        expect.any(Object),
        expect.objectContaining({ priority: 1 })
      );
    });
  });

  // ============================================================================
  // GET /api/llm/queue
  // ============================================================================
  describe('GET /api/llm/queue', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/llm/queue');

      expect(response.status).toBe(401);
    });

    test('should return queue status', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      llmQueueService.getQueueStatus.mockResolvedValueOnce({
        queueLength: 3,
        processingJob: 'job-1',
        waitingJobs: ['job-2', 'job-3'],
        currentModel: 'qwen3:14b'
      });

      const response = await request(app)
        .get('/api/llm/queue')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('queueLength', 3);
      expect(response.body).toHaveProperty('processingJob', 'job-1');
    });

    test('should handle errors', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      llmQueueService.getQueueStatus.mockRejectedValueOnce(new Error('DB error'));

      const response = await request(app)
        .get('/api/llm/queue')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(500);
    });
  });

  // ============================================================================
  // POST /api/llm/queue/prioritize
  // ============================================================================
  describe('POST /api/llm/queue/prioritize', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/llm/queue/prioritize')
        .send({ job_id: 'job-123' });

      expect(response.status).toBe(401);
    });

    test('should return 400 if job_id is missing', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      const response = await request(app)
        .post('/api/llm/queue/prioritize')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('job_id');
    });

    test('should prioritize job successfully', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      llmQueueService.prioritizeJob.mockResolvedValueOnce();

      const response = await request(app)
        .post('/api/llm/queue/prioritize')
        .set('Authorization', `Bearer ${token}`)
        .send({ job_id: 'job-123' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(llmQueueService.prioritizeJob).toHaveBeenCalledWith('job-123');
    });
  });

  // ============================================================================
  // GET /api/llm/jobs/:jobId
  // ============================================================================
  describe('GET /api/llm/jobs/:jobId', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/llm/jobs/job-123');

      expect(response.status).toBe(401);
    });

    test('should return 404 if job not found', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      llmJobService.getJob.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/llm/jobs/job-123')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    test('should return job details', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      llmJobService.getJob.mockResolvedValueOnce({
        id: 'job-123',
        status: 'streaming',
        content: 'Hello, I am',
        thinking: 'Processing query...',
        queue_position: 1
      });

      const response = await request(app)
        .get('/api/llm/jobs/job-123')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', 'job-123');
      expect(response.body).toHaveProperty('status', 'streaming');
      expect(response.body).toHaveProperty('content');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ============================================================================
  // DELETE /api/llm/jobs/:jobId
  // ============================================================================
  describe('DELETE /api/llm/jobs/:jobId', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .delete('/api/llm/jobs/job-123');

      expect(response.status).toBe(401);
    });

    test('should return 404 if job not found', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      llmJobService.getJob.mockResolvedValueOnce(null);

      const response = await request(app)
        .delete('/api/llm/jobs/job-123')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    test('should cancel job successfully', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      llmJobService.getJob.mockResolvedValueOnce({
        id: 'job-123',
        status: 'pending'
      });
      llmQueueService.cancelJob.mockResolvedValueOnce();

      const response = await request(app)
        .delete('/api/llm/jobs/job-123')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('jobId', 'job-123');
      expect(llmQueueService.cancelJob).toHaveBeenCalledWith('job-123');
    });
  });

  // ============================================================================
  // GET /api/llm/jobs
  // ============================================================================
  describe('GET /api/llm/jobs', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/llm/jobs');

      expect(response.status).toBe(401);
    });

    test('should return all active jobs', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      llmJobService.getAllActiveJobs.mockResolvedValueOnce([
        { id: 'job-1', status: 'streaming' },
        { id: 'job-2', status: 'pending' }
      ]);

      const response = await request(app)
        .get('/api/llm/jobs')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jobs');
      expect(response.body.jobs).toHaveLength(2);
      expect(llmJobService.getAllActiveJobs).toHaveBeenCalled();
    });

    test('should filter jobs by conversation_id', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      llmJobService.getActiveJobsForConversation.mockResolvedValueOnce([
        { id: 'job-1', status: 'streaming', conversation_id: 5 }
      ]);

      const response = await request(app)
        .get('/api/llm/jobs?conversation_id=5')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jobs');
      expect(response.body.jobs).toHaveLength(1);
      expect(llmJobService.getActiveJobsForConversation).toHaveBeenCalledWith(5);
    });
  });

  // ============================================================================
  // GET /api/llm/models
  // ============================================================================
  describe('GET /api/llm/models', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/llm/models');

      expect(response.status).toBe(401);
    });

    test('should return available models', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      axios.get.mockResolvedValueOnce({
        data: {
          models: [
            { name: 'qwen3:14b', size: 14000000000 },
            { name: 'llama3:8b', size: 8000000000 }
          ]
        }
      });

      const response = await request(app)
        .get('/api/llm/models')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('models');
      expect(response.body.models).toHaveLength(2);
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should handle LLM service unavailable', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      axios.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const response = await request(app)
        .get('/api/llm/models')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(503);
      expect(response.body.error).toContain('Failed');
    });

    test('should return empty array if no models', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      axios.get.mockResolvedValueOnce({ data: {} });

      const response = await request(app)
        .get('/api/llm/models')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.models).toEqual([]);
    });
  });

  // ============================================================================
  // GET /api/llm/jobs/:jobId/stream (Reconnection)
  // ============================================================================
  describe('GET /api/llm/jobs/:jobId/stream', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/llm/jobs/job-123/stream');

      expect(response.status).toBe(401);
    });

    test('should return 404 if job not found', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      llmJobService.getJob.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/llm/jobs/job-123/stream')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    test('should set correct SSE headers', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      llmJobService.getJob.mockResolvedValueOnce({
        id: 'job-123',
        status: 'completed',
        content: 'Hello world!',
        thinking: ''
      });

      const response = await request(app)
        .get('/api/llm/jobs/job-123/stream')
        .set('Authorization', `Bearer ${token}`);

      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
    });

    test('should immediately close for completed jobs', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      llmJobService.getJob.mockResolvedValueOnce({
        id: 'job-123',
        status: 'completed',
        content: 'Done!',
        thinking: ''
      });

      // For SSE responses, we need to handle the streaming
      const response = await request(app)
        .get('/api/llm/jobs/job-123/stream')
        .set('Authorization', `Bearer ${token}`);

      // SSE response should contain reconnect and done events
      expect(response.text).toContain('reconnect');
      expect(response.text).toContain('done');
    });

    test('should return error for errored jobs', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      llmJobService.getJob.mockResolvedValueOnce({
        id: 'job-123',
        status: 'error',
        error_message: 'Model overloaded',
        content: ''
      });

      const response = await request(app)
        .get('/api/llm/jobs/job-123/stream')
        .set('Authorization', `Bearer ${token}`);

      expect(response.text).toContain('error');
      expect(response.text).toContain('done');
    });
  });

  // ============================================================================
  // Error Response Format
  // ============================================================================
  describe('Error Response Format', () => {
    test('should always include timestamp in error responses', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      const response = await request(app)
        .post('/api/llm/chat')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.body).toHaveProperty('timestamp');
    });
  });
});
