/**
 * Unit tests for Docs Routes (Swagger UI)
 *
 * Tests the API documentation endpoints:
 * - GET /api/docs - Swagger UI (requires auth); das Dokument steht inline,
 *   openapi.json und openapi.yaml als eigene Wege sind am 06.10.2026 gefallen
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

const db = require('../../src/database');
const { app } = require('../../src/server');
const { setupAuthMocks, generateTestToken } = require('../helpers/authMock');

describe('Docs Routes (Swagger UI)', () => {
  let token;

  beforeEach(() => {
    jest.clearAllMocks();
    setupAuthMocks(db);
    token = generateTestToken();
  });

  // ============================================================================
  // GET /api/docs
  // ============================================================================
  describe('GET /api/docs', () => {
    test('should return Swagger UI HTML', async () => {
      const response = await request(app)
        .get('/api/docs/')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/html/);
    });

    test('should include Swagger UI assets', async () => {
      const response = await request(app)
        .get('/api/docs/')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      // Swagger UI HTML should contain swagger-ui reference
      expect(response.text).toContain('swagger');
    });

    test('should require authentication', async () => {
      // Docs are protected behind admin auth
      const response = await request(app).get('/api/docs/');

      expect(response.status).toBe(401);
    });
  });

});
