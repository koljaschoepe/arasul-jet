/**
 * Integration tests for Dashboard Backend API
 * Tests multiple endpoints and their interactions
 */

const request = require('supertest');
const app = require('../../src/server');

describe('API Integration Tests', () => {
  let authToken;

  beforeAll(async () => {
    // Wait for services to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  describe('Authentication Flow', () => {
    test('should complete full authentication flow', async () => {
      // 1. Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: process.env.ADMIN_PASSWORD || 'test_password'
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body).toHaveProperty('token');
      expect(loginResponse.body).toHaveProperty('expires_in', 86400);

      authToken = loginResponse.body.token;

      // 2. Use token to access protected endpoint
      const statusResponse = await request(app)
        .get('/api/system/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body).toHaveProperty('status');
      expect(['OK', 'WARNING', 'CRITICAL']).toContain(statusResponse.body.status);

      // 3. Verify token refresh works
      const infoResponse = await request(app)
        .get('/api/system/info')
        .set('Authorization', `Bearer ${authToken}`);

      expect(infoResponse.status).toBe(200);
      expect(infoResponse.body).toHaveProperty('version');
    });

    test('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    test('should reject requests without token', async () => {
      const response = await request(app)
        .get('/api/system/status');

      expect(response.status).toBe(401);
    });

    test('should reject requests with invalid token', async () => {
      const response = await request(app)
        .get('/api/system/status')
        .set('Authorization', 'Bearer invalid_token_here');

      expect(response.status).toBe(401);
    });
  });

  describe('System Status and Health', () => {
    test('should return complete system status', async () => {
      const response = await request(app)
        .get('/api/system/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('llm');
      expect(response.body).toHaveProperty('embeddings');
      expect(response.body).toHaveProperty('n8n');
      expect(response.body).toHaveProperty('minio');
      expect(response.body).toHaveProperty('postgres');
      expect(response.body).toHaveProperty('self_healing_active');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return system info with version', async () => {
      const response = await request(app)
        .get('/api/system/info')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('build_hash');
      expect(response.body).toHaveProperty('jetpack_version');
      expect(response.body).toHaveProperty('uptime_seconds');
    });

    test('should return network information', async () => {
      const response = await request(app)
        .get('/api/system/network')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('local_ip');
      expect(response.body).toHaveProperty('mdns_name');
      expect(response.body).toHaveProperty('internet_connected');
    });

    test('health check should be publicly accessible', async () => {
      const response = await request(app)
        .get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'OK');
    });
  });

  describe('Metrics Collection', () => {
    test('should return live metrics', async () => {
      const response = await request(app)
        .get('/api/metrics/live')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('cpu');
      expect(response.body).toHaveProperty('ram');
      expect(response.body).toHaveProperty('gpu');
      expect(response.body).toHaveProperty('temperature');
      expect(response.body).toHaveProperty('disk');
      expect(response.body).toHaveProperty('timestamp');

      // Validate ranges
      expect(response.body.cpu).toBeGreaterThanOrEqual(0);
      expect(response.body.cpu).toBeLessThanOrEqual(100);
      expect(response.body.ram).toBeGreaterThanOrEqual(0);
      expect(response.body.ram).toBeLessThanOrEqual(100);
      expect(response.body.gpu).toBeGreaterThanOrEqual(0);
      expect(response.body.gpu).toBeLessThanOrEqual(100);
    });

    test('should return historical metrics', async () => {
      const response = await request(app)
        .get('/api/metrics/history?range=1h')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('metrics');
      expect(Array.isArray(response.body.metrics)).toBe(true);
    });

    test('should validate time range parameter', async () => {
      const response = await request(app)
        .get('/api/metrics/history?range=invalid')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Service Management', () => {
    test('should return all service statuses', async () => {
      const response = await request(app)
        .get('/api/services')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('services');
      expect(response.body.services).toHaveProperty('llm');
      expect(response.body.services).toHaveProperty('embeddings');
      expect(response.body.services).toHaveProperty('n8n');
      expect(response.body.services).toHaveProperty('minio');
      expect(response.body.services).toHaveProperty('postgres');
    });

    test('should return AI services detail', async () => {
      const response = await request(app)
        .get('/api/services/ai')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('llm');
      expect(response.body).toHaveProperty('embeddings');
      expect(response.body).toHaveProperty('gpu_load');
    });
  });

  describe('Database Pool Management', () => {
    test('should return pool statistics', async () => {
      const response = await request(app)
        .get('/api/database/pool')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('pool_stats');
      expect(response.body.pool_stats).toHaveProperty('totalCount');
      expect(response.body.pool_stats).toHaveProperty('idleCount');
      expect(response.body.pool_stats).toHaveProperty('totalQueries');
    });

    test('should return database health', async () => {
      const response = await request(app)
        .get('/api/database/health')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('database_healthy');
      expect(response.body.database_healthy).toBe(true);
    });

    test('should return active connections', async () => {
      const response = await request(app)
        .get('/api/database/connections')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('connections');
      expect(Array.isArray(response.body.connections)).toBe(true);
    });
  });

  describe('Self-Healing Events', () => {
    test('should return self-healing events', async () => {
      const response = await request(app)
        .get('/api/self-healing/events')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('events');
      expect(Array.isArray(response.body.events)).toBe(true);
    });

    test('should return self-healing statistics', async () => {
      const response = await request(app)
        .get('/api/self-healing/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('total_events');
      expect(response.body).toHaveProperty('events_by_category');
      expect(response.body).toHaveProperty('events_by_severity');
    });

    test('should filter events by severity', async () => {
      const response = await request(app)
        .get('/api/self-healing/events?severity=CRITICAL')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('events');

      // All events should be CRITICAL
      response.body.events.forEach(event => {
        expect(event.severity).toBe('CRITICAL');
      });
    });
  });

  describe('Logs Management', () => {
    test('should return system logs', async () => {
      const response = await request(app)
        .get('/api/logs/system')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('logs');
      expect(Array.isArray(response.body.logs)).toBe(true);
    });

    test('should return service logs', async () => {
      const response = await request(app)
        .get('/api/logs/service/dashboard-backend')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('logs');
    });

    test('should paginate logs correctly', async () => {
      const response = await request(app)
        .get('/api/logs/system?limit=10&offset=0')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.logs.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce rate limits on metrics endpoint', async () => {
      // Make 25 rapid requests (limit is 20/s)
      const promises = [];
      for (let i = 0; i < 25; i++) {
        promises.push(
          request(app)
            .get('/api/metrics/live')
            .set('Authorization', `Bearer ${authToken}`)
        );
      }

      const responses = await Promise.all(promises);

      // At least one should be rate limited
      const rateLimited = responses.some(r => r.status === 429);
      expect(rateLimited).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for non-existent endpoints', async () => {
      const response = await request(app)
        .get('/api/nonexistent/endpoint')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    test('should return 400 for invalid request body', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          invalid: 'data'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    test('should return proper error format', async () => {
      const response = await request(app)
        .get('/api/nonexistent');

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('timestamp');
      expect(typeof response.body.error).toBe('string');
      expect(typeof response.body.timestamp).toBe('string');
    });
  });
});
