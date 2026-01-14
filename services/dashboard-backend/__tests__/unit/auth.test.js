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

// Set environment variables before importing server
process.env.JWT_SECRET = 'test-secret-for-unit-tests-32-chars-min';
process.env.NODE_ENV = 'test';

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

// Test data
const mockUser = {
  id: 1,
  username: 'admin',
  email: 'admin@arasul.local',
  is_active: true
};

// Valid bcrypt hash for 'TestPassword123!'
const validPasswordHash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.L3lfB8S.Xr9z.q';

// Helper to mock auth middleware for authenticated requests
// The auth flow makes 4 db.query calls:
// 1. verifyToken: blacklist check
// 2. verifyToken: session check
// 3. verifyToken: update session activity
// 4. requireAuth: user lookup
function mockAuthMiddleware() {
  db.query.mockResolvedValueOnce({ rows: [] }); // blacklist check (empty = not blacklisted)
  db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // session check (session exists)
  db.query.mockResolvedValueOnce({ rows: [] }); // update session activity (result ignored)
  db.query.mockResolvedValueOnce({ rows: [mockUser] }); // user lookup
}

describe('Authentication Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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
      // Mock locked user check
      db.query.mockResolvedValueOnce({ rows: [{ locked: true }] });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('locked');
    });

    test('should return 401 if user does not exist', async () => {
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
      // Mock not locked
      db.query.mockResolvedValueOnce({ rows: [{ locked: false }] });
      // Mock user found - use actual bcrypt hash for 'TestPassword123!'
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('TestPassword123!', 12);
      db.query.mockResolvedValueOnce({
        rows: [{ ...mockUser, password_hash: hash }]
      });
      // Mock record login attempt
      db.query.mockResolvedValueOnce({ rows: [] });
      // Mock insert session
      db.query.mockResolvedValueOnce({ rows: [] });

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
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('TestPassword123!', 12);

      db.query.mockResolvedValueOnce({ rows: [{ locked: false }] });
      db.query.mockResolvedValueOnce({
        rows: [{ ...mockUser, password_hash: hash }]
      });
      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [] });

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
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('TestPassword123!', 12);

      db.query.mockResolvedValueOnce({ rows: [{ locked: false }] });
      db.query.mockResolvedValueOnce({
        rows: [{ ...mockUser, password_hash: hash }]
      });
      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [] });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      const token = loginResponse.body.token;

      // Mock auth middleware checks for logout
      mockAuthMiddleware();
      db.query.mockResolvedValueOnce({ rows: [] }); // blacklist token
      db.query.mockResolvedValueOnce({ rows: [] }); // delete session

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
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('TestPassword123!', 12);

      db.query.mockResolvedValueOnce({ rows: [{ locked: false }] });
      db.query.mockResolvedValueOnce({
        rows: [{ ...mockUser, password_hash: hash }]
      });
      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [] });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      const token = loginResponse.body.token;

      // Mock auth middleware checks
      mockAuthMiddleware();

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
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('TestPassword123!', 12);

      db.query.mockResolvedValueOnce({ rows: [{ locked: false }] });
      db.query.mockResolvedValueOnce({
        rows: [{ ...mockUser, password_hash: hash }]
      });
      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [] });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      const token = loginResponse.body.token;

      // Mock auth middleware
      mockAuthMiddleware();

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ newPassword: 'NewPassword456!' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });

    test('should return 400 if newPassword is missing', async () => {
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('TestPassword123!', 12);

      db.query.mockResolvedValueOnce({ rows: [{ locked: false }] });
      db.query.mockResolvedValueOnce({
        rows: [{ ...mockUser, password_hash: hash }]
      });
      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [] });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      const token = loginResponse.body.token;

      mockAuthMiddleware();

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'TestPassword123!' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });

    test('should return 400 if newPassword does not meet complexity requirements', async () => {
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('TestPassword123!', 12);

      db.query.mockResolvedValueOnce({ rows: [{ locked: false }] });
      db.query.mockResolvedValueOnce({
        rows: [{ ...mockUser, password_hash: hash }]
      });
      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [] });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      const token = loginResponse.body.token;

      mockAuthMiddleware();

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'TestPassword123!', newPassword: 'abc' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('complexity');
    });

    test('should return 401 if currentPassword is incorrect', async () => {
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('TestPassword123!', 12);

      db.query.mockResolvedValueOnce({ rows: [{ locked: false }] });
      db.query.mockResolvedValueOnce({
        rows: [{ ...mockUser, password_hash: hash }]
      });
      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [] });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      const token = loginResponse.body.token;

      // Mock auth middleware
      mockAuthMiddleware();
      // Mock password lookup - return different hash
      db.query.mockResolvedValueOnce({ rows: [{ password_hash: hash }] });

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
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('TestPassword123!', 12);

      db.query.mockResolvedValueOnce({ rows: [{ locked: false }] });
      db.query.mockResolvedValueOnce({
        rows: [{ ...mockUser, password_hash: hash }]
      });
      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [] });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      const token = loginResponse.body.token;

      // Mock auth middleware
      mockAuthMiddleware();
      // Mock password lookup
      db.query.mockResolvedValueOnce({ rows: [{ password_hash: hash }] });

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
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('TestPassword123!', 12);

      db.query.mockResolvedValueOnce({ rows: [{ locked: false }] });
      db.query.mockResolvedValueOnce({
        rows: [{ ...mockUser, password_hash: hash }]
      });
      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [] });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      const token = loginResponse.body.token;

      // Mock auth middleware
      mockAuthMiddleware();
      // Mock sessions query
      db.query.mockResolvedValueOnce({
        rows: [{
          token_jti: 'test-jti',
          ip_address: '127.0.0.1',
          user_agent: 'test-agent',
          created_at: new Date(),
          expires_at: new Date(Date.now() + 86400000),
          last_activity: new Date()
        }]
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
  // GET /api/auth/password-requirements
  // ============================================================================
  describe('GET /api/auth/password-requirements', () => {
    test('should return password requirements without authentication', async () => {
      const response = await request(app)
        .get('/api/auth/password-requirements');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('requirements');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should return correct content type', async () => {
      const response = await request(app)
        .get('/api/auth/password-requirements');

      expect(response.headers['content-type']).toMatch(/application\/json/);
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
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('TestPassword123!', 12);

      db.query.mockResolvedValueOnce({ rows: [{ locked: false }] });
      db.query.mockResolvedValueOnce({
        rows: [{ ...mockUser, password_hash: hash }]
      });
      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [] });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      const token = loginResponse.body.token;

      // Mock auth middleware
      mockAuthMiddleware();

      const response = await request(app)
        .get('/api/auth/verify')
        .set('Cookie', `arasul_session=${token}`);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    test('should return 200 with valid Bearer token', async () => {
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('TestPassword123!', 12);

      db.query.mockResolvedValueOnce({ rows: [{ locked: false }] });
      db.query.mockResolvedValueOnce({
        rows: [{ ...mockUser, password_hash: hash }]
      });
      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [] });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      const token = loginResponse.body.token;

      // Mock auth middleware
      mockAuthMiddleware();

      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.headers['x-user-id']).toBeDefined();
      expect(response.headers['x-user-name']).toBeDefined();
    });

    test('should return 401 if user is inactive', async () => {
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('TestPassword123!', 12);

      db.query.mockResolvedValueOnce({ rows: [{ locked: false }] });
      db.query.mockResolvedValueOnce({
        rows: [{ ...mockUser, password_hash: hash }]
      });
      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [] });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      const token = loginResponse.body.token;

      // Mock auth flow but with no user found
      db.query.mockResolvedValueOnce({ rows: [] }); // blacklist check (empty = not blacklisted)
      db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // session check (session exists)
      db.query.mockResolvedValueOnce({ rows: [] }); // update session activity (result ignored)
      db.query.mockResolvedValueOnce({ rows: [] }); // user lookup - empty means not found

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
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('TestPassword123!', 12);

      db.query.mockResolvedValueOnce({ rows: [{ locked: false }] });
      db.query.mockResolvedValueOnce({
        rows: [{ ...mockUser, password_hash: hash }]
      });
      db.query.mockResolvedValueOnce({ rows: [] });
      db.query.mockResolvedValueOnce({ rows: [] });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'TestPassword123!' });

      const token = loginResponse.body.token;

      // Mock auth middleware
      mockAuthMiddleware();
      // Mock blacklist all tokens (get sessions, blacklist each, delete sessions)
      db.query.mockResolvedValueOnce({ rows: [{ token_jti: 'jti1', expires_at: new Date() }] }); // get sessions
      db.query.mockResolvedValueOnce({ rows: [] }); // blacklist token
      db.query.mockResolvedValueOnce({ rows: [] }); // delete sessions

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
