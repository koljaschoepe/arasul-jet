/**
 * Unit tests for setup-on-first-login.
 *
 * Covers:
 * - services/auth/setupService.js (isSetupNeeded, createFirstAdmin)
 * - GET  /api/auth/needs-setup
 * - POST /api/auth/setup  (validation, self-closing 409, happy-path 201)
 */

const request = require('supertest');

jest.mock('../../src/database', () => ({
  query: jest.fn(),
  initialize: jest.fn().mockResolvedValue(true),
  getPoolStats: jest.fn().mockReturnValue({ total: 10, idle: 5, waiting: 0 }),
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const db = require('../../src/database');
const { isSetupNeeded, createFirstAdmin } = require('../../src/services/auth/setupService');
const { ConflictError } = require('../../src/utils/errors');
const { app } = require('../../src/server');

describe('Setup-on-first-login', () => {
  describe('setupService.isSetupNeeded', () => {
    test('true while no admin exists', async () => {
      db.query.mockReset();
      db.query.mockResolvedValueOnce({ rows: [{ count: 0 }] });
      await expect(isSetupNeeded()).resolves.toBe(true);
    });

    test('false once an admin exists', async () => {
      db.query.mockReset();
      db.query.mockResolvedValueOnce({ rows: [{ count: 3 }] });
      await expect(isSetupNeeded()).resolves.toBe(false);
    });
  });

  describe('setupService.createFirstAdmin', () => {
    test('creates the admin when the table is empty', async () => {
      db.query.mockReset();
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, username: 'boss', email: null }] });
      const user = await createFirstAdmin({ username: 'boss', password: 'secret12' });
      expect(user).toEqual({ id: 1, username: 'boss', email: null });
    });

    test('rejects with ConflictError when the race is lost (insert wrote nothing)', async () => {
      db.query.mockReset();
      db.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        createFirstAdmin({ username: 'boss', password: 'secret12' })
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('GET /api/auth/needs-setup', () => {
    test('needsSetup=true when no admin', async () => {
      db.query.mockReset();
      db.query.mockResolvedValueOnce({ rows: [{ count: 0 }] });
      const res = await request(app).get('/api/auth/needs-setup');
      expect(res.status).toBe(200);
      expect(res.body.needsSetup).toBe(true);
    });

    test('needsSetup=false when an admin exists', async () => {
      db.query.mockReset();
      db.query.mockResolvedValueOnce({ rows: [{ count: 1 }] });
      const res = await request(app).get('/api/auth/needs-setup');
      expect(res.status).toBe(200);
      expect(res.body.needsSetup).toBe(false);
    });
  });

  describe('POST /api/auth/setup', () => {
    test('400 when username missing', async () => {
      const res = await request(app).post('/api/auth/setup').send({ password: 'secret12' });
      expect(res.status).toBe(400);
    });

    test('400 when password too short', async () => {
      const res = await request(app).post('/api/auth/setup').send({ username: 'boss', password: 'x' });
      expect(res.status).toBe(400);
    });

    test('409 when an admin already exists (self-closing)', async () => {
      db.query.mockReset();
      db.query.mockResolvedValueOnce({ rows: [] }); // conditional insert wrote nothing
      const res = await request(app)
        .post('/api/auth/setup')
        .send({ username: 'boss', password: 'secret12' });
      expect(res.status).toBe(409);
    });

    test('201 with auto-login token on first admin creation', async () => {
      db.query.mockReset();
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, username: 'boss', email: null }] }) // createFirstAdmin
        .mockResolvedValue({ rows: [] }); // generateToken session insert + any audit writes
      const res = await request(app)
        .post('/api/auth/setup')
        .send({ username: 'boss', password: 'secret12' });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toMatchObject({ username: 'boss' });
    });
  });
});
