/**
 * Unit tests for Authentication Routes
 *
 * Tests all authentication endpoints:
 * - POST /api/auth/login
 * - POST /api/auth/logout
 * - POST /api/auth/logout-all
 * - POST /api/auth/change-password
 * - GET /api/auth/me
 * - GET /api/auth/sessions
 * - GET /api/auth/password-requirements
 * - GET /api/auth/verify
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

// Import auth mock helpers
const {
  mockUser,
  generateTestToken,
  setupAuthMocks,
  setupLoginMocks,
  setupLogoutMocks,
  setupPasswordChangeMocks
} = require('../helpers/authMock');

// Valid bcrypt hash for 'TestPassword123!' (generated with cost 12)
const validPasswordHash = '$2b$12$Z3DIUzPHNm5xStB/T1motO1FkeScrNYO1LSOgIAm0iqI8sFS/kmua';

describe('Authentication Routes', () => {
  // Note: jest.clearAllMocks() is called globally in jest.setup.js

  // ============================================================================
  // POST /api/auth/login
  // ============================================================================
  describe('POST /api/auth/login', () => {
    test('should return 400 if username is missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'TestPassword123!' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('required');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return 400 if password is missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('required');
    });

    test('should return 400 if both username and password are missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(response.status).toBe(400);
    });

    test('should return 403 if user is locked', async () => {
      setupLoginMocks(db, validPasswordHash, { accountLocked: true });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('locked');
    });

    test('should return 401 if user does not exist', async () => {
      // Reset mock to clear any leftover queued responses
      db.query.mockReset();
      // Mock not locked
      db.query.mockResolvedValueOnce({ rows: [{ locked: false }] });
      // Mock user not found
      db.query.mockResolvedValueOnce({ rows: [] });
      // Mock record login attempt
      db.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nonexistent', password: 'TestPassword123!' });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid');
    });

    test('should return 403 if user is inactive', async () => {
      // Reset mock to clear any leftover queued responses
      db.query.mockReset();
      // Mock not locked
      db.query.mockResolvedValueOnce({ rows: [{ locked: false }] });
      // Mock inactive user
      db.query.mockResolvedValueOnce({
        rows: [{ ...mockUser, is_active: false, password_hash: validPasswordHash }]
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('disabled');
    });

    test('should return 401 if password is incorrect', async () => {
      // Reset mock to clear any leftover queued responses
      db.query.mockReset();
      // Mock not locked
      db.query.mockResolvedValueOnce({ rows: [{ locked: false }] });
      // Mock user found with password hash that won't match
      db.query.mockResolvedValueOnce({
        rows: [{ ...mockUser, password_hash: validPasswordHash }]
      });
      // Mock record failed login attempt
      db.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'WrongPassword123!' });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid');
    });

    test('should return token on successful login', async () => {
      setupLoginMocks(db, validPasswordHash);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('expiresAt');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('username', 'admin');
    });

    test('should set HttpOnly cookie on successful login', async () => {
      setupLoginMocks(db, validPasswordHash);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      expect(response.headers['set-cookie']).toBeDefined();
      expect(response.headers['set-cookie'][0]).toContain('arasul_session');
      expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    });

    test('should return JSON content type', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'test' });

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  // ============================================================================
  // POST /api/auth/logout
  // ============================================================================
  describe('POST /api/auth/logout', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/auth/logout');

      expect(response.status).toBe(401);
    });

    test('should return 401 with invalid token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });

    test('should successfully logout with valid token', async () => {
      // First login to get token
      setupLoginMocks(db, validPasswordHash);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      const token = loginResponse.body.token;

      // Mock auth middleware checks for logout using pattern-based mocks
      setupLogoutMocks(db);

      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });
  });

  // ============================================================================
  // GET /api/auth/me
  // ============================================================================
  describe('GET /api/auth/me', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expect(response.status).toBe(401);
    });

    test('should return user info with valid token', async () => {
      // Login first
      setupLoginMocks(db, validPasswordHash);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      const token = loginResponse.body.token;

      // Mock auth middleware checks using pattern-based mocks
      setupAuthMocks(db);

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).toHaveProperty('username');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ============================================================================
  // POST /api/auth/change-password
  // ============================================================================
  describe('POST /api/auth/change-password', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword456!'
        });

      expect(response.status).toBe(401);
    });

    test('should return 400 if currentPassword is missing', async () => {
      // Login first
      setupLoginMocks(db, validPasswordHash);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      const token = loginResponse.body.token;

      // Mock auth middleware
      setupAuthMocks(db);

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ newPassword: 'NewPassword456!' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });

    test('should return 400 if newPassword is missing', async () => {
      setupLoginMocks(db, validPasswordHash);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      const token = loginResponse.body.token;

      setupAuthMocks(db);

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'TestPassword123!' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });

    test('should return 400 if newPassword does not meet complexity requirements', async () => {
      setupLoginMocks(db, validPasswordHash);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      const token = loginResponse.body.token;

      setupAuthMocks(db);

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'TestPassword123!', newPassword: 'abc' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('complexity');
    });

    test('should return 401 if currentPassword is incorrect', async () => {
      setupLoginMocks(db, validPasswordHash);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      const token = loginResponse.body.token;

      // Use pattern-based mock for password change flow
      setupPasswordChangeMocks(db, validPasswordHash);

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: 'WrongPassword123!',
          newPassword: 'NewSecurePassword456!'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('incorrect');
    });

    test('should return 400 if newPassword is same as currentPassword', async () => {
      setupLoginMocks(db, validPasswordHash);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      const token = loginResponse.body.token;

      // Use pattern-based mock for password change flow
      setupPasswordChangeMocks(db, validPasswordHash);

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: 'TestPassword123!',
          newPassword: 'TestPassword123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('different');
    });
  });

  // ============================================================================
  // GET /api/auth/sessions
  // ============================================================================
  describe('GET /api/auth/sessions', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/auth/sessions');

      expect(response.status).toBe(401);
    });

    test('should return sessions list with valid token', async () => {
      const token = generateTestToken();

      // Mock auth and sessions query
      db.query.mockImplementation((query) => {
        if (query.includes('token_blacklist')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('active_sessions') && query.includes('SELECT') && !query.includes('ORDER')) {
          return Promise.resolve({ rows: [{ id: 1, token_jti: 'test-jti-12345', expires_at: new Date(Date.now() + 86400000) }] });
        }
        if (query.includes('update_session_activity')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('admin_users')) {
          return Promise.resolve({ rows: [mockUser] });
        }
        // Sessions list query
        if (query.includes('ORDER BY')) {
          return Promise.resolve({
            rows: [{
              token_jti: 'test-jti',
              ip_address: '127.0.0.1',
              user_agent: 'test-agent',
              created_at: new Date(),
              expires_at: new Date(Date.now() + 86400000),
              last_activity: new Date()
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('sessions');
      expect(Array.isArray(response.body.sessions)).toBe(true);
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ============================================================================
  // GET /api/auth/verify (Forward Auth)
  // ============================================================================
  describe('GET /api/auth/verify', () => {
    test('should return 401 without token', async () => {
      const response = await request(app)
        .get('/api/auth/verify');

      expect(response.status).toBe(401);
    });

    test('should return 401 with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });

    test('should return 200 with valid token from cookie', async () => {
      setupLoginMocks(db, validPasswordHash);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      const token = loginResponse.body.token;

      // Mock auth middleware
      setupAuthMocks(db);

      const response = await request(app)
        .get('/api/auth/verify')
        .set('Cookie', `arasul_session=${token}`);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    test('should return 200 with valid Bearer token', async () => {
      setupLoginMocks(db, validPasswordHash);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      const token = loginResponse.body.token;

      // Mock auth middleware
      setupAuthMocks(db);

      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.headers['x-user-id']).toBeDefined();
      expect(response.headers['x-user-name']).toBeDefined();
    });

    test('should return 401 if user is not found', async () => {
      setupLoginMocks(db, validPasswordHash);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      const token = loginResponse.body.token;

      // Mock auth flow but with no user found
      setupAuthMocks(db, { user: null });

      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
    });
  });

  // ============================================================================
  // POST /api/auth/logout-all
  // ============================================================================
  describe('POST /api/auth/logout-all', () => {
    test('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/auth/logout-all');

      expect(response.status).toBe(401);
    });

    test('should invalidate all sessions with valid token', async () => {
      const token = generateTestToken();

      // Mock auth and logout-all queries
      db.query.mockImplementation((query) => {
        if (query.includes('token_blacklist') && query.includes('SELECT')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('active_sessions') && query.includes('SELECT')) {
          return Promise.resolve({ rows: [{ id: 1, token_jti: 'test-jti-12345', expires_at: new Date(Date.now() + 86400000) }] });
        }
        if (query.includes('update_session_activity')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('admin_users')) {
          return Promise.resolve({ rows: [mockUser] });
        }
        // Blacklist and delete operations
        if (query.includes('token_blacklist') && query.includes('INSERT')) {
          return Promise.resolve({ rows: [] });
        }
        if (query.includes('DELETE')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const response = await request(app)
        .post('/api/auth/logout-all')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toContain('all sessions');
    });
  });

  // ============================================================================
  // Error Response Format
  // ============================================================================
  describe('Error Response Format', () => {
    test('should always include timestamp in error responses', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'test' });

      expect(response.body).toHaveProperty('timestamp');
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });

    test('should return JSON content type for errors', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });
});
