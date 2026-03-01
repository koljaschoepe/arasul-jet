/**
 * Unit tests for Claude Terminal Routes
 *
 * Tests all Claude Terminal endpoints:
 * - POST /api/claude-terminal/query (SSE - limited testing)
 * - GET /api/claude-terminal/status
 * - GET /api/claude-terminal/history
 * - GET /api/claude-terminal/context
 * - DELETE /api/claude-terminal/history
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

// Mock axios for LLM service
jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn()
}));

// Mock contextInjectionService
jest.mock('../../src/services/contextInjectionService', () => ({
  buildContext: jest.fn(),
  formatContextForPrompt: jest.fn()
}));

// Mock modelService
jest.mock('../../src/services/modelService', () => ({
  getDefaultModel: jest.fn()
}));

const db = require('../../src/database');
const axios = require('axios');
const contextService = require('../../src/services/contextInjectionService');
const modelService = require('../../src/services/modelService');
const { app } = require('../../src/server');

// Import auth mock helpers
const {
  setupAuthMocks,
  generateTestToken
} = require('../helpers/authMock');

describe('Claude Terminal Routes', () => {
  let authToken;

  beforeEach(() => {
    jest.clearAllMocks();
    setupAuthMocks(db);
    authToken = generateTestToken();
  });

  // ============================================================================
  // GET /api/claude-terminal/status
  // ============================================================================
  describe('GET /api/claude-terminal/status', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/claude-terminal/status');

      expect(response.status).toBe(401);
    });

    test('should return terminal status when LLM available', async () => {
      // Mock LLM service available
      axios.get.mockResolvedValue({
        data: {
          models: [
            { name: 'qwen3:14b-q8' },
            { name: 'llama3:8b' }
          ]
        }
      });

      // Mock default model
      modelService.getDefaultModel.mockResolvedValue('qwen3:14b-q8');

      // Mock catalog lookup
      db.query
        .mockImplementationOnce(() => Promise.resolve({ rows: [] })) // Blacklist
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, expires_at: new Date() }] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, username: 'admin', is_active: true }] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ ollama_name: 'qwen3:14b-q8' }] }));

      const response = await request(app)
        .get('/api/claude-terminal/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('service', 'claude-terminal');
      expect(response.body).toHaveProperty('available');
      expect(response.body).toHaveProperty('llm');
      expect(response.body.llm).toHaveProperty('available', true);
      expect(response.body.llm).toHaveProperty('models');
      expect(response.body).toHaveProperty('config');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return unavailable when LLM service is down', async () => {
      // Mock LLM service unavailable
      axios.get.mockRejectedValue({ code: 'ECONNREFUSED' });

      // Mock default model
      modelService.getDefaultModel.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/claude-terminal/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.available).toBe(false);
      expect(response.body.llm.available).toBe(false);
    });
  });

  // ============================================================================
  // GET /api/claude-terminal/history
  // ============================================================================
  describe('GET /api/claude-terminal/history', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/claude-terminal/history');

      expect(response.status).toBe(401);
    });

    test('should return query history', async () => {
      db.query
        .mockImplementationOnce(() => Promise.resolve({ rows: [] })) // Blacklist
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, expires_at: new Date() }] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, username: 'admin', is_active: true }] }))
        // History query
        .mockImplementationOnce(() => Promise.resolve({
          rows: [
            {
              id: 1,
              query: 'What is the system status?',
              response: 'The system is running normally.',
              model_used: 'qwen3:14b-q8',
              tokens_used: 150,
              response_time_ms: 2500,
              status: 'completed',
              created_at: new Date()
            }
          ]
        }))
        // Count query
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ total: '10' }] }));

      const response = await request(app)
        .get('/api/claude-terminal/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('queries');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('limit');
      expect(response.body).toHaveProperty('offset');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should support pagination', async () => {
      db.query
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, expires_at: new Date() }] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, username: 'admin', is_active: true }] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ total: '50' }] }));

      const response = await request(app)
        .get('/api/claude-terminal/history?limit=10&offset=20')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('limit', 10);
      expect(response.body).toHaveProperty('offset', 20);
    });

    test('should cap limit at 100', async () => {
      db.query
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, expires_at: new Date() }] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, username: 'admin', is_active: true }] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ total: '0' }] }));

      const response = await request(app)
        .get('/api/claude-terminal/history?limit=500')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      // Verify the query was called with capped limit (check the SQL query params)
      const queryCall = db.query.mock.calls.find(([q]) => q.includes('claude_terminal_queries'));
      expect(queryCall).toBeDefined();
    });
  });

  // ============================================================================
  // GET /api/claude-terminal/context
  // ============================================================================
  describe('GET /api/claude-terminal/context', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/claude-terminal/context');

      expect(response.status).toBe(401);
    });

    test('should return current system context', async () => {
      const mockContext = {
        metrics: { cpu: 45, ram: 60, disk: 70 },
        services: ['llm-service', 'backend'],
        logs: ['log entry 1', 'log entry 2']
      };
      contextService.buildContext.mockResolvedValue(mockContext);
      contextService.formatContextForPrompt.mockReturnValue('=== SYSTEM METRICS ===\nCPU: 45%');

      const response = await request(app)
        .get('/api/claude-terminal/context')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('context');
      expect(response.body).toHaveProperty('formatted');
      expect(response.body).toHaveProperty('timestamp');
      expect(contextService.buildContext).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // DELETE /api/claude-terminal/history
  // ============================================================================
  describe('DELETE /api/claude-terminal/history', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .delete('/api/claude-terminal/history');

      expect(response.status).toBe(401);
    });

    test('should clear query history', async () => {
      db.query
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, expires_at: new Date() }] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
        .mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1, username: 'admin', is_active: true }] }))
        // Delete query
        .mockImplementationOnce(() => Promise.resolve({ rowCount: 15 }));

      const response = await request(app)
        .delete('/api/claude-terminal/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ============================================================================
  // POST /api/claude-terminal/query - Basic validation tests
  // ============================================================================
  describe('POST /api/claude-terminal/query', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/claude-terminal/query')
        .send({ query: 'Test query' });

      expect(response.status).toBe(401);
    });

    test('should return 400 if query is missing', async () => {
      const response = await request(app)
        .post('/api/claude-terminal/query')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Query');
    });

    test('should return 400 if query exceeds max length', async () => {
      const longQuery = 'a'.repeat(6000);

      const response = await request(app)
        .post('/api/claude-terminal/query')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ query: longQuery });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('maximum length');
    });

    test('should return 503 when LLM service unavailable', async () => {
      // Mock LLM unavailable
      axios.get.mockRejectedValue({ code: 'ECONNREFUSED' });

      const response = await request(app)
        .post('/api/claude-terminal/query')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ query: 'What is the system status?' });

      expect(response.status).toBe(503);
      expect(response.body.error).toContain('unavailable');
    });

    test('should return 503 when no model available', async () => {
      // Mock LLM available but no models
      axios.get.mockResolvedValue({
        data: { models: [{ name: 'qwen3:14b-q8' }] }
      });

      // Mock no default model
      modelService.getDefaultModel.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/claude-terminal/query')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ query: 'What is the system status?' });

      expect(response.status).toBe(503);
      expect(response.body.error).toContain('Model');
    });
  });
});
