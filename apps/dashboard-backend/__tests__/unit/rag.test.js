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

// Mock axios for external service calls (spellcheck, etc.)
jest.mock('axios');

// Mock ragCore - isolates route tests from internal ragCore axios calls
jest.mock('../../src/services/rag/ragCore', () => ({
  getEmbedding: jest.fn().mockResolvedValue(new Array(768).fill(0.1)),
  getEmbeddings: jest.fn().mockResolvedValue([]),
  getSparseVector: jest.fn().mockResolvedValue({ indices: [], values: [] }),
  getCompanyContext: jest.fn().mockResolvedValue(''),
  cosineSimilarity: jest.fn().mockReturnValue(0.5),
  routeToSpaces: jest.fn().mockResolvedValue({ spaces: [], method: 'none' }),
  buildSpaceFilter: jest.fn().mockReturnValue(null),
  hybridSearch: jest.fn().mockResolvedValue([]),
  rerankResults: jest.fn().mockResolvedValue([]),
  filterByRelevance: jest.fn().mockImplementation((results) => ({ relevant: results, marginal: [], filtered: 0 })),
  deduplicateByDocument: jest.fn().mockImplementation((results) => results),
  graphEnrichedRetrieval: jest.fn().mockResolvedValue({ graphContext: '', graphEntities: [] }),
  getParentChunks: jest.fn().mockResolvedValue([]),
  buildHierarchicalContext: jest.fn().mockReturnValue('No documents found.'),
  ENABLE_RERANKING: false,
}));

// Mock query optimizer (RAG 3.0)
jest.mock('../../src/services/context/queryOptimizer', () => ({
  optimizeQuery: jest.fn().mockResolvedValue({
    decompounded: 'test query',
    queryVariants: ['test query'],
    hydeText: null,
    details: {
      duration: 50,
      decompoundEnabled: true,
      decompoundResult: null,
      multiQueryEnabled: true,
      multiQueryVariants: [],
      hydeEnabled: true,
      hydeGenerated: false
    }
  })
}));

// Mock LLM services
jest.mock('../../src/services/llm/llmJobService', () => ({
  createJob: jest.fn(),
  updateJobContent: jest.fn(),
  completeJob: jest.fn()
}));

jest.mock('../../src/services/llm/llmQueueService', () => ({
  enqueue: jest.fn(),
  subscribeToJob: jest.fn()
}));

const db = require('../../src/database');
const axios = require('axios');
const ragCore = require('../../src/services/rag/ragCore');
const llmJobService = require('../../src/services/llm/llmJobService');
const llmQueueService = require('../../src/services/llm/llmQueueService');
const { app } = require('../../src/server');

// Import auth mock helpers
const {
  mockUser,
  mockSession,
  generateTestToken,
  setupAuthMocks
} = require('../helpers/authMock');

/**
 * Helper to get auth token directly (fast, no bcrypt)
 */
function getAuthToken() {
  return generateTestToken();
}

/**
 * Setup RAG-specific mocks using pattern matching (auth + RAG queries)
 * This handles all database queries based on content, not call order.
 *
 * @param {Object} options - Mock configuration
 * @param {Array} options.companyContext - Company context rows
 * @param {Array} options.spaces - Knowledge spaces rows
 * @param {Array} options.keywordResults - Keyword search results
 */
function setupRagMocks(options = {}) {
  const {
    companyContext = [],
    spaces = [],
    keywordResults = []
  } = options;

  // Clear any previous mock implementation
  db.query.mockReset();

  db.query.mockImplementation((query) => {
    const queryLower = query.toLowerCase();

    // Auth queries - must match exactly what jwt.js and auth.js use
    // 1. Blacklist check: SELECT id FROM token_blacklist WHERE token_jti = $1
    if (queryLower.includes('token_blacklist')) {
      return Promise.resolve({ rows: [] }); // Not blacklisted
    }

    // 2. Session check: SELECT id FROM active_sessions WHERE token_jti = $1 AND expires_at > NOW()
    if (queryLower.includes('active_sessions') && queryLower.includes('select')) {
      return Promise.resolve({ rows: [{ id: 1 }] }); // Session exists
    }

    // 3. Session activity update: SELECT update_session_activity($1)
    if (queryLower.includes('update_session_activity')) {
      return Promise.resolve({ rows: [] });
    }

    // 4. User lookup: SELECT id, username, email, is_active FROM admin_users WHERE id = $1
    if (queryLower.includes('admin_users')) {
      return Promise.resolve({ rows: [mockUser] });
    }

    // RAG-specific queries
    // Company context query: SELECT content FROM company_context WHERE id = 1
    if (queryLower.includes('company_context')) {
      return Promise.resolve({ rows: companyContext });
    }

    // Knowledge spaces query (with embeddings for routing)
    if (queryLower.includes('knowledge_spaces') && queryLower.includes('description_embedding')) {
      return Promise.resolve({ rows: spaces });
    }

    // Knowledge spaces query (by IDs): WHERE id = ANY($1::uuid[])
    if (queryLower.includes('knowledge_spaces') && queryLower.includes('any')) {
      return Promise.resolve({ rows: spaces });
    }

    // General knowledge spaces fallback
    if (queryLower.includes('knowledge_spaces')) {
      return Promise.resolve({ rows: spaces });
    }

    // Keyword/fulltext search query (document_chunks with ts_rank/plainto_tsquery)
    if (queryLower.includes('document_chunks') || queryLower.includes('ts_rank') || queryLower.includes('plainto_tsquery')) {
      return Promise.resolve({ rows: keywordResults });
    }

    // Default: return empty result for any unmatched query
    return Promise.resolve({ rows: [] });
  });
}

describe('RAG Routes', () => {
  // Reset all mocks before each test to clear mockResolvedValueOnce queues
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset();
    axios.get.mockReset();
    axios.post.mockReset();
    // Reset ragCore mocks to defaults
    ragCore.getEmbedding.mockResolvedValue(new Array(768).fill(0.1));
    ragCore.getEmbeddings.mockResolvedValue([]);
    ragCore.getCompanyContext.mockResolvedValue('');
    ragCore.routeToSpaces.mockResolvedValue({ spaces: [], method: 'none' });
    ragCore.buildSpaceFilter.mockReturnValue(null);
    ragCore.hybridSearch.mockResolvedValue([]);
    ragCore.rerankResults.mockResolvedValue([]);
    ragCore.filterByRelevance.mockImplementation((results) => ({ relevant: results, marginal: [], filtered: 0 }));
    ragCore.buildHierarchicalContext.mockReturnValue('No documents found.');
    ragCore.deduplicateByDocument.mockImplementation((results) => results);
    ragCore.graphEnrichedRetrieval.mockResolvedValue({ graphContext: '', graphEntities: [] });
    ragCore.getParentChunks.mockResolvedValue([]);
    llmJobService.createJob.mockReset();
    llmJobService.updateJobContent.mockReset();
    llmJobService.completeJob.mockReset();
    llmQueueService.enqueue.mockReset();
  });

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
      const token = getAuthToken();
      setupAuthMocks(db);

      const response = await request(app)
        .post('/api/rag/query')
        .set('Authorization', `Bearer ${token}`)
        .send({ conversation_id: 1 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Query');
    });

    test('should return 400 if query is not a string', async () => {
      const token = getAuthToken();
      setupAuthMocks(db);

      const response = await request(app)
        .post('/api/rag/query')
        .set('Authorization', `Bearer ${token}`)
        .send({ query: 123, conversation_id: 1 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('string');
    });

    test('should return 400 if conversation_id is missing', async () => {
      const token = getAuthToken();
      setupAuthMocks(db);

      const response = await request(app)
        .post('/api/rag/query')
        .set('Authorization', `Bearer ${token}`)
        .send({ query: 'test query' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('conversation_id');
    });

    test('should handle embedding service error', async () => {
      const token = getAuthToken();
      setupAuthMocks(db);

      // Mock spellcheck (silent fail is OK)
      axios.post.mockRejectedValueOnce(new Error('Spellcheck down'));
      // Mock ragCore embedding failure
      ragCore.getEmbedding.mockRejectedValueOnce(new Error('Embedding service down'));

      const response = await request(app)
        .post('/api/rag/query')
        .set('Authorization', `Bearer ${token}`)
        .send({ query: 'test query', conversation_id: 1 });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('error');
    });

    test('should return no documents message when search returns empty', async () => {
      const token = getAuthToken();
      setupRagMocks({
        companyContext: [],
        spaces: [],
        keywordResults: []
      });

      // Spellcheck (fails silently)
      axios.post.mockRejectedValueOnce(new Error('Spellcheck unavailable'));

      // ragCore mocks already return empty results by default
      // hybridSearch returns [], rerankResults returns [], etc.

      // Mock job creation for "no documents" path
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

      expect(response.status).not.toBe(401);

      // Should be SSE response with no-documents message
      if (response.headers['content-type'] && response.headers['content-type'].includes('text/event-stream')) {
        expect(response.text).toContain('job_started');
        expect(response.text).toContain('keine relevanten Dokumente');
        expect(response.text).toContain('done');
      } else {
        expect(response.status).toBe(200);
      }
    });

    test('should process RAG query with documents found', async () => {
      const token = getAuthToken();
      setupRagMocks({
        companyContext: [{ content: 'Wir sind eine Test-Firma' }],
        spaces: [],
        keywordResults: []
      });

      // Spellcheck (fails silently)
      axios.post.mockRejectedValueOnce(new Error('Spellcheck unavailable'));

      // ragCore mocks: return documents found
      ragCore.getCompanyContext.mockResolvedValueOnce('Wir sind eine Test-Firma');
      const mockSearchResult = {
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
      };
      ragCore.hybridSearch.mockResolvedValueOnce([mockSearchResult]);
      ragCore.rerankResults.mockResolvedValueOnce([mockSearchResult]);
      ragCore.buildHierarchicalContext.mockReturnValueOnce('Context with documents.');

      // Mock queue enqueue
      llmQueueService.enqueue.mockResolvedValueOnce({
        jobId: 'job-123',
        messageId: 'msg-123',
        queuePosition: 1
      });

      // Mock subscribe to job
      llmQueueService.subscribeToJob.mockImplementation((jobId, callback) => {
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

      expect(response.status).not.toBe(401);

      // Should be SSE response
      if (response.headers['content-type'] && response.headers['content-type'].includes('text/event-stream')) {
        expect(response.text).toContain('job_started');
        expect(response.text).toContain('sources');
        expect(response.text).toContain('matchedSpaces');
      } else {
        expect(response.status).toBe(200);
      }
    });

    test('should support manual space selection', async () => {
      const token = getAuthToken();
      const selectedSpaces = [{
        id: 'space-1',
        name: 'Test Space',
        slug: 'test-space',
        description: 'Test space description'
      }];
      setupRagMocks({
        companyContext: [],
        spaces: selectedSpaces,
        keywordResults: []
      });

      // Spellcheck (fails silently)
      axios.post.mockRejectedValueOnce(new Error('Spellcheck unavailable'));

      // ragCore mocks return empty by default (no documents)

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

      // Verify space query was made via db.query (WHERE id = ANY($1::uuid[]))
      const spaceCalls = db.query.mock.calls.filter(call =>
        call[0] && call[0].includes('knowledge_spaces')
      );
      expect(spaceCalls.length).toBeGreaterThan(0);
    });

    test('should disable auto routing when specified', async () => {
      const token = getAuthToken();
      setupRagMocks({
        companyContext: [],
        spaces: [],
        keywordResults: []
      });

      // Spellcheck (fails silently)
      axios.post.mockRejectedValueOnce(new Error('Spellcheck unavailable'));

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

      // When auto_routing is false, routeToSpaces should NOT be called
      expect(ragCore.routeToSpaces).not.toHaveBeenCalled();
    });

    test('should use default top_k of 5', async () => {
      const token = getAuthToken();
      setupRagMocks();

      llmJobService.createJob.mockResolvedValueOnce({
        jobId: 'job-123',
        messageId: 'msg-123'
      });

      await request(app)
        .post('/api/rag/query')
        .set('Authorization', `Bearer ${token}`)
        .send({
          query: 'test query',
          conversation_id: 1
          // No top_k specified — should default to 5
        });

      // hybridSearch should be called with top_k = 5 (3rd argument)
      expect(ragCore.hybridSearch).toHaveBeenCalledWith(
        expect.any(String),     // query
        expect.any(Array),      // embedding
        5,                      // top_k default
        null,                   // spaceFilter (no spaces configured)
        expect.any(Object)      // options
      );
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
      const token = getAuthToken();
      setupAuthMocks(db);

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
      const token = getAuthToken();
      setupAuthMocks(db);

      axios.get.mockRejectedValueOnce(new Error('Connection refused'));

      const response = await request(app)
        .get('/api/rag/status')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('degraded');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should handle timeout gracefully', async () => {
      const token = getAuthToken();
      setupAuthMocks(db);

      const timeoutError = new Error('Timeout');
      timeoutError.code = 'ECONNABORTED';
      axios.get.mockRejectedValueOnce(timeoutError);

      const response = await request(app)
        .get('/api/rag/status')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('error');
    });
  });

  // ============================================================================
  // Hybrid Search Tests
  // ============================================================================
  describe('Hybrid Search', () => {
    test('should combine vector and keyword results', async () => {
      const token = getAuthToken();
      setupRagMocks({
        companyContext: [],
        spaces: [],
        keywordResults: []
      });

      // Spellcheck (fails silently)
      axios.post.mockRejectedValueOnce(new Error('Spellcheck unavailable'));

      // ragCore mocks: return documents via hybrid search
      const mockResult = {
        id: 'chunk-1',
        score: 0.9,
        payload: {
          document_id: 'doc-1',
          document_name: 'test1.pdf',
          chunk_index: 0,
          text: 'Vector match content',
          space_id: null,
          space_name: null
        }
      };
      ragCore.hybridSearch.mockResolvedValueOnce([mockResult]);
      ragCore.rerankResults.mockResolvedValueOnce([mockResult]);
      ragCore.filterByRelevance.mockReturnValueOnce({ relevant: [mockResult], marginal: [], filtered: 0 });
      ragCore.buildHierarchicalContext.mockReturnValueOnce('Context from hybrid search.');

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

      expect(response.status).not.toBe(401);

      // Should contain sources in the response
      if (response.headers['content-type'] && response.headers['content-type'].includes('text/event-stream')) {
        expect(response.text).toContain('sources');
      } else {
        expect(response.status).toBe(200);
      }
    });
  });

  // ============================================================================
  // Error Response Format
  // ============================================================================
  describe('Error Response Format', () => {
    test('should always include timestamp in error responses', async () => {
      const token = getAuthToken();
      setupAuthMocks(db);

      const response = await request(app)
        .post('/api/rag/query')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.body).toHaveProperty('timestamp');
    });
  });
});
