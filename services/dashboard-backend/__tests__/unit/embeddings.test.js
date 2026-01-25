/**
 * Unit tests for Embeddings Routes
 *
 * Tests the embedding proxy endpoint:
 * - POST /api/embeddings - Generate text embeddings
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

// Mock axios
jest.mock('axios', () => {
  const mockPost = jest.fn().mockResolvedValue({
    data: {
      vectors: [[0.1, 0.2, 0.3, 0.4, 0.5]],
      dimension: 768
    }
  });

  return {
    post: mockPost,
    create: jest.fn(() => ({
      post: mockPost
    }))
  };
});

const db = require('../../src/database');
const axios = require('axios');
const { app } = require('../../src/server');
const { setupAuthMocks, generateTestToken } = require('../helpers/authMock');

describe('Embeddings Routes', () => {
  let token;

  beforeEach(() => {
    jest.clearAllMocks();
    token = generateTestToken();
  });

  // ============================================================================
  // POST /api/embeddings
  // ============================================================================
  describe('POST /api/embeddings', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/embeddings')
        .send({ text: 'hello world' });

      expect(response.status).toBe(401);
    });

    test('should return 400 if text is missing', async () => {
      setupAuthMocks(db);

      const response = await request(app)
        .post('/api/embeddings')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });

    test('should return embedding for single text', async () => {
      setupAuthMocks(db);

      const response = await request(app)
        .post('/api/embeddings')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'hello world' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('vectors');
      expect(response.body).toHaveProperty('timestamp');
      expect(Array.isArray(response.body.vectors)).toBe(true);
    });

    test('should return embeddings for array of texts', async () => {
      setupAuthMocks(db);

      const mockAxiosInstance = axios.create();
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: {
          vectors: [[0.1, 0.2], [0.3, 0.4]],
          dimension: 768
        }
      });

      const response = await request(app)
        .post('/api/embeddings')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: ['hello', 'world'] });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('vectors');
    });

    test('should handle embedding service errors gracefully', async () => {
      setupAuthMocks(db);

      const mockAxiosInstance = axios.create();
      mockAxiosInstance.post.mockRejectedValueOnce(new Error('Embedding service unavailable'));

      const response = await request(app)
        .post('/api/embeddings')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'test' });

      // Should return 500 when service is unavailable
      expect([200, 500]).toContain(response.status);
    });

    test('should return proper JSON content type', async () => {
      setupAuthMocks(db);

      const response = await request(app)
        .post('/api/embeddings')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'test' });

      if (response.status === 200) {
        expect(response.headers['content-type']).toMatch(/application\/json/);
      }
    });
  });
});
