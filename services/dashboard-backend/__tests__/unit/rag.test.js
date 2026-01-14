/**
 * Unit tests for RAG Routes
 *
 * Tests RAG endpoints:
 * - POST /api/rag/query
 * - GET /api/rag/status
 *
 * Tests RAG 2.0 features:
 * - Hierarchical context
 * - Knowledge space routing
 * - Hybrid search (vector + keyword)
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

// Mock axios for external service calls
jest.mock('axios');

// Mock LLM services
jest.mock('../../src/services/llmJobService', () => ({
  createJob: jest.fn(),
  updateJobContent: jest.fn(),
  completeJob: jest.fn()
}));

jest.mock('../../src/services/llmQueueService', () => ({
  enqueue: jest.fn(),
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

describe('RAG Routes', () => {
  // Note: jest.clearAllMocks() is called globally in jest.setup.js

  // ============================================================================
  // POST /api/rag/query
  // ============================================================================
  describe('POST /api/rag/query', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/rag/query')
        .send({ query: 'test query' });

      expect(response.status).toBe(401);
    });

    test('should return 400 if query is missing', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      const response = await request(app)
        .post('/api/rag/query')
        .set('Authorization', `Bearer ${token}`)
        .send({ conversation_id: 1 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Query');
    });

    test('should return 400 if query is not a string', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      const response = await request(app)
        .post('/api/rag/query')
        .set('Authorization', `Bearer ${token}`)
        .send({ query: 123, conversation_id: 1 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('string');
    });

    test('should return 400 if conversation_id is missing', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      const response = await request(app)
        .post('/api/rag/query')
        .set('Authorization', `Bearer ${token}`)
        .send({ query: 'test query' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('conversation_id');
    });

    test('should handle embedding service error', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      // Mock embedding service failure
      axios.post.mockRejectedValueOnce(new Error('Embedding service down'));

      const response = await request(app)
        .post('/api/rag/query')
        .set('Authorization', `Bearer ${token}`)
        .send({ query: 'test query', conversation_id: 1 });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('error');
    });

    test('should return no documents message when search returns empty', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      // Mock embedding generation
      axios.post.mockResolvedValueOnce({
        data: { vectors: [new Array(768).fill(0.1)] }
      });

      // Mock company context
      db.query.mockResolvedValueOnce({ rows: [] });

      // Mock no spaces found
      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [] });

      // Mock Qdrant search - empty results
      axios.post.mockResolvedValueOnce({ data: { result: [] } });

      // Mock keyword search - empty results
      db.query.mockResolvedValueOnce({ rows: [] });

      // Mock job creation
      llmJobService.createJob.mockResolvedValueOnce({
        jobId: 'job-123',
        messageId: 'msg-123'
      });
      llmJobService.updateJobContent.mockResolvedValueOnce();
      llmJobService.completeJob.mockResolvedValueOnce();

      const response = await request(app)
        .post('/api/rag/query')
        .set('Authorization', `Bearer ${token}`)
        .send({ query: 'test query', conversation_id: 1 });

      // Should be SSE response
      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.text).toContain('job_started');
      expect(response.text).toContain('keine relevanten Dokumente');
      expect(response.text).toContain('done');
    });

    test('should process RAG query with documents found', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      // Mock embedding generation
      axios.post.mockResolvedValueOnce({
        data: { vectors: [new Array(768).fill(0.1)] }
      });

      // Mock company context
      db.query.mockResolvedValueOnce({
        rows: [{ content: 'Wir sind eine Test-Firma' }]
      });

      // Mock space routing - no spaces with embeddings
      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [] }); // all spaces fallback

      // Mock Qdrant search - documents found
      axios.post.mockResolvedValueOnce({
        data: {
          result: [
            {
              id: 'chunk-1',
              score: 0.95,
              payload: {
                document_id: 'doc-1',
                document_name: 'test.pdf',
                chunk_index: 0,
                text: 'This is test content from the document.',
                space_id: null,
                space_name: null
              }
            }
          ]
        }
      });

      // Mock keyword search
      db.query.mockResolvedValueOnce({ rows: [] });

      // Mock queue enqueue
      llmQueueService.enqueue.mockResolvedValueOnce({
        jobId: 'job-123',
        messageId: 'msg-123',
        queuePosition: 1
      });

      // Mock subscribe to job
      llmQueueService.subscribeToJob.mockImplementation((jobId, callback) => {
        // Simulate job completion
        setTimeout(() => {
          callback({ type: 'response', token: 'Test response' });
          callback({ done: true });
        }, 10);
        return jest.fn();
      });

      const response = await request(app)
        .post('/api/rag/query')
        .set('Authorization', `Bearer ${token}`)
        .send({
          query: 'What is the test about?',
          conversation_id: 1,
          top_k: 3
        });

      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.text).toContain('job_started');
      expect(response.text).toContain('sources');
      expect(response.text).toContain('matched_spaces');
    });

    test('should support manual space selection', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      // Mock embedding generation
      axios.post.mockResolvedValueOnce({
        data: { vectors: [new Array(768).fill(0.1)] }
      });

      // Mock company context
      db.query.mockResolvedValueOnce({ rows: [] });

      // Mock selected spaces query
      db.query.mockResolvedValueOnce({
        rows: [{
          id: 'space-1',
          name: 'Test Space',
          slug: 'test-space',
          description: 'Test space description'
        }]
      });

      // Mock Qdrant search with space filter
      axios.post.mockResolvedValueOnce({ data: { result: [] } });

      // Mock keyword search
      db.query.mockResolvedValueOnce({ rows: [] });

      // Mock job creation for no results
      llmJobService.createJob.mockResolvedValueOnce({
        jobId: 'job-123',
        messageId: 'msg-123'
      });
      llmJobService.updateJobContent.mockResolvedValueOnce();
      llmJobService.completeJob.mockResolvedValueOnce();

      await request(app)
        .post('/api/rag/query')
        .set('Authorization', `Bearer ${token}`)
        .send({
          query: 'test query',
          conversation_id: 1,
          space_ids: ['space-1']
        });

      // Verify space query was made
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('knowledge_spaces'),
        expect.arrayContaining([['space-1']])
      );
    });

    test('should disable auto routing when specified', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      // Mock embedding
      axios.post.mockResolvedValueOnce({
        data: { vectors: [new Array(768).fill(0.1)] }
      });

      // Mock company context
      db.query.mockResolvedValueOnce({ rows: [] });

      // Mock search - no routing query should be made
      axios.post.mockResolvedValueOnce({ data: { result: [] } });
      db.query.mockResolvedValueOnce({ rows: [] });

      llmJobService.createJob.mockResolvedValueOnce({
        jobId: 'job-123',
        messageId: 'msg-123'
      });
      llmJobService.updateJobContent.mockResolvedValueOnce();
      llmJobService.completeJob.mockResolvedValueOnce();

      await request(app)
        .post('/api/rag/query')
        .set('Authorization', `Bearer ${token}`)
        .send({
          query: 'test query',
          conversation_id: 1,
          auto_routing: false
        });

      // Should not query for spaces
      const spacesQueryCalls = db.query.mock.calls.filter(call =>
        call[0].includes('knowledge_spaces') && call[0].includes('description_embedding')
      );
      expect(spacesQueryCalls.length).toBe(0);
    });

    test('should use default top_k of 5', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      axios.post.mockResolvedValueOnce({
        data: { vectors: [new Array(768).fill(0.1)] }
      });

      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [] });

      axios.post.mockResolvedValueOnce({ data: { result: [] } });
      db.query.mockResolvedValueOnce({ rows: [] });

      llmJobService.createJob.mockResolvedValueOnce({
        jobId: 'job-123',
        messageId: 'msg-123'
      });
      llmJobService.updateJobContent.mockResolvedValueOnce();
      llmJobService.completeJob.mockResolvedValueOnce();

      await request(app)
        .post('/api/rag/query')
        .set('Authorization', `Bearer ${token}`)
        .send({
          query: 'test query',
          conversation_id: 1
          // No top_k specified
        });

      // Qdrant should be called with limit = top_k * 2 = 10
      const qdrantCalls = axios.post.mock.calls.filter(call =>
        call[0].includes('qdrant') && call[0].includes('search')
      );
      expect(qdrantCalls.length).toBe(1);
      expect(qdrantCalls[0][1].limit).toBe(10);
    });
  });

  // ============================================================================
  // GET /api/rag/status
  // ============================================================================
  describe('GET /api/rag/status', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/rag/status');

      expect(response.status).toBe(401);
    });

    test('should return operational status when Qdrant is healthy', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      axios.get.mockResolvedValueOnce({
        data: {
          result: {
            points_count: 100,
            vectors_count: 100
          }
        }
      });

      const response = await request(app)
        .get('/api/rag/status')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'operational');
      expect(response.body).toHaveProperty('qdrant');
      expect(response.body.qdrant).toHaveProperty('connected', true);
      expect(response.body.qdrant).toHaveProperty('points_count', 100);
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return degraded status when Qdrant is unavailable', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      axios.get.mockRejectedValueOnce(new Error('Connection refused'));

      const response = await request(app)
        .get('/api/rag/status')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('status', 'degraded');
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should handle timeout gracefully', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      const timeoutError = new Error('Timeout');
      timeoutError.code = 'ECONNABORTED';
      axios.get.mockRejectedValueOnce(timeoutError);

      const response = await request(app)
        .get('/api/rag/status')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('degraded');
    });
  });

  // ============================================================================
  // Hybrid Search Tests
  // ============================================================================
  describe('Hybrid Search', () => {
    test('should combine vector and keyword results', async () => {
      const token = await getAuthToken();
      setupAuthMocksSequential(db);

      axios.post.mockResolvedValueOnce({
        data: { vectors: [new Array(768).fill(0.1)] }
      });

      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [] });

      // Mock Qdrant results
      axios.post.mockResolvedValueOnce({
        data: {
          result: [
            {
              id: 'chunk-1',
              score: 0.9,
              payload: {
                document_id: 'doc-1',
                document_name: 'test1.pdf',
                chunk_index: 0,
                text: 'Vector match content'
              }
            }
          ]
        }
      });

      // Mock keyword results
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'chunk-2',
            document_id: 'doc-2',
            document_name: 'test2.pdf',
            chunk_index: 0,
            text: 'Keyword match content',
            keyword_score: 0.8
          }
        ]
      });

      llmQueueService.enqueue.mockResolvedValueOnce({
        jobId: 'job-123',
        messageId: 'msg-123',
        queuePosition: 1
      });

      llmQueueService.subscribeToJob.mockImplementation((jobId, callback) => {
        setTimeout(() => callback({ done: true }), 10);
        return jest.fn();
      });

      const response = await request(app)
        .post('/api/rag/query')
        .set('Authorization', `Bearer ${token}`)
        .send({ query: 'test query', conversation_id: 1 });

      expect(response.text).toContain('sources');
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
        .post('/api/rag/query')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.body).toHaveProperty('timestamp');
    });
  });
});
