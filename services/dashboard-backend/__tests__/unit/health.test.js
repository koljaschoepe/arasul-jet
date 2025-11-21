/**
 * Unit tests for health check endpoint
 */

const request = require('supertest');
process.env.JWT_SECRET = 'test-secret-for-unit-tests';
const { app } = require('../../src/server');

describe('Health Check Endpoint', () => {
  describe('GET /api/health', () => {
    test('should return 200 OK', async () => {
      const response = await request(app)
        .get('/api/health');

      expect(response.status).toBe(200);
    });

    test('should return status OK', async () => {
      const response = await request(app)
        .get('/api/health');

      expect(response.body).toHaveProperty('status', 'OK');
    });

    test('should return timestamp', async () => {
      const response = await request(app)
        .get('/api/health');

      expect(response.body).toHaveProperty('timestamp');
      expect(typeof response.body.timestamp).toBe('string');

      // Verify it's a valid ISO timestamp
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });

    test('should return service name', async () => {
      const response = await request(app)
        .get('/api/health');

      expect(response.body).toHaveProperty('service', 'dashboard-backend');
    });

    test('should return version', async () => {
      const response = await request(app)
        .get('/api/health');

      expect(response.body).toHaveProperty('version');
      expect(typeof response.body.version).toBe('string');
    });

    test('should respond quickly (< 100ms)', async () => {
      const start = Date.now();
      await request(app).get('/api/health');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    test('should not require authentication', async () => {
      const response = await request(app)
        .get('/api/health');

      // Should succeed without Authorization header
      expect(response.status).toBe(200);
    });

    test('should return correct content type', async () => {
      const response = await request(app)
        .get('/api/health');

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });
});
