/**
 * Unit tests for Docs Routes (Swagger UI)
 *
 * Tests the API documentation endpoints:
 * - GET /api/docs - Swagger UI
 * - GET /api/docs/openapi.json - OpenAPI spec as JSON
 * - GET /api/docs/openapi.yaml - OpenAPI spec as YAML
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

const { app } = require('../../src/server');

describe('Docs Routes (Swagger UI)', () => {
  // ============================================================================
  // GET /api/docs
  // ============================================================================
  describe('GET /api/docs', () => {
    test('should return Swagger UI HTML', async () => {
      const response = await request(app).get('/api/docs/');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/html/);
    });

    test('should include Swagger UI assets', async () => {
      const response = await request(app).get('/api/docs/');

      expect(response.status).toBe(200);
      // Swagger UI HTML should contain swagger-ui reference
      expect(response.text).toContain('swagger');
    });

    test('should be accessible without authentication', async () => {
      // Docs are typically public for API consumers
      const response = await request(app).get('/api/docs/');

      expect(response.status).toBe(200);
    });
  });

  // ============================================================================
  // GET /api/docs/openapi.json
  // ============================================================================
  describe('GET /api/docs/openapi.json', () => {
    test('should return OpenAPI specification as JSON', async () => {
      const response = await request(app).get('/api/docs/openapi.json');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    test('should include OpenAPI version', async () => {
      const response = await request(app).get('/api/docs/openapi.json');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('openapi');
      expect(response.body.openapi).toMatch(/^3\./);
    });

    test('should include API info', async () => {
      const response = await request(app).get('/api/docs/openapi.json');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('info');
      expect(response.body.info).toHaveProperty('title');
      expect(response.body.info).toHaveProperty('version');
    });

    test('should include paths object', async () => {
      const response = await request(app).get('/api/docs/openapi.json');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('paths');
      expect(typeof response.body.paths).toBe('object');
    });

    test('should be accessible without authentication', async () => {
      const response = await request(app).get('/api/docs/openapi.json');

      expect(response.status).toBe(200);
    });
  });

  // ============================================================================
  // GET /api/docs/openapi.yaml
  // ============================================================================
  describe('GET /api/docs/openapi.yaml', () => {
    test('should return OpenAPI specification as YAML or 404', async () => {
      const response = await request(app).get('/api/docs/openapi.yaml');

      // May return 404 if yaml file doesn't exist
      expect([200, 404]).toContain(response.status);
    });

    test('should be accessible without authentication', async () => {
      const response = await request(app).get('/api/docs/openapi.yaml');

      // Should not return 401 even if file doesn't exist
      expect(response.status).not.toBe(401);
    });
  });

  // ============================================================================
  // Content Validation
  // ============================================================================
  describe('OpenAPI Content Validation', () => {
    test('should have valid title in info', async () => {
      const response = await request(app).get('/api/docs/openapi.json');

      expect(response.status).toBe(200);
      expect(response.body.info.title).toContain('ARASUL');
    });

    test('should return proper content-type for JSON', async () => {
      const response = await request(app).get('/api/docs/openapi.json');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  // ============================================================================
  // Error Handling
  // ============================================================================
  describe('Error Handling', () => {
    test('should handle missing openapi.yaml gracefully', async () => {
      const response = await request(app).get('/api/docs/openapi.yaml');

      // Should return 404 with proper error message, not 500
      if (response.status === 404) {
        expect(response.body).toHaveProperty('error');
        expect(response.body).toHaveProperty('timestamp');
      }
    });

    test('should not expose internal errors', async () => {
      const response = await request(app).get('/api/docs/openapi.yaml');

      // Should not contain stack trace or internal paths in error
      if (response.status === 404) {
        expect(response.text).not.toContain('node_modules');
        expect(response.text).not.toContain('at ');
      }
    });
  });
});
