/**
 * Integration tests for Sandbox + LLM Jobs routes
 *
 * Verifies the HTTP surface for two high-traffic route groups end-to-end
 * through auth middleware, route handler, and the service layer. Services
 * are mocked so we can assert the route wiring (param shapes, status codes,
 * error mapping) without depending on Docker or a running LLM.
 */

const request = require('supertest');
const { generateTestToken, setupAuthMocks } = require('../helpers/authMock');

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('mock-hash'),
  compare: jest.fn().mockResolvedValue(true),
  genSalt: jest.fn().mockResolvedValue('mock-salt'),
}));
jest.mock('../../src/database');
jest.mock('../../src/utils/logger');
jest.mock('../../src/services/sandbox/sandboxService');
jest.mock('../../src/services/sandbox/terminalService');
jest.mock('../../src/services/llm/llmJobService');
jest.mock('../../src/services/llm/llmQueueService');
jest.mock('../../src/services/llm/modelLifecycleService');

const db = require('../../src/database');
const logger = require('../../src/utils/logger');
const sandboxService = require('../../src/services/sandbox/sandboxService');
const llmJobService = require('../../src/services/llm/llmJobService');
const llmQueueService = require('../../src/services/llm/llmQueueService');
const { app } = require('../../src/server');

logger.info = jest.fn();
logger.warn = jest.fn();
logger.error = jest.fn();
logger.debug = jest.fn();

describe('Sandbox + LLM Jobs Integration', () => {
  let authToken;

  beforeAll(() => {
    authToken = generateTestToken();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset();
    setupAuthMocks(db);
  });

  // ==========================================================================
  // Sandbox Projects
  // ==========================================================================

  describe('GET /api/sandbox/projects', () => {
    test('returns project list for authenticated user', async () => {
      sandboxService.listProjects.mockResolvedValue({
        projects: [
          { id: 'p1', name: 'test', status: 'stopped' },
          { id: 'p2', name: 'demo', status: 'running' },
        ],
        total: 2,
      });

      const res = await request(app)
        .get('/api/sandbox/projects')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.projects).toHaveLength(2);
      expect(res.body.total).toBe(2);
      expect(res.body.timestamp).toBeDefined();
      expect(sandboxService.listProjects).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1 })
      );
    });

    test('forwards query filters to service', async () => {
      sandboxService.listProjects.mockResolvedValue({ projects: [], total: 0 });

      await request(app)
        .get('/api/sandbox/projects?status=running&search=demo&limit=10&offset=0')
        .set('Authorization', `Bearer ${authToken}`);

      expect(sandboxService.listProjects).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'running',
          search: 'demo',
          limit: 10,
          offset: 0,
          userId: 1,
        })
      );
    });

    test('rejects unauthenticated request', async () => {
      const res = await request(app).get('/api/sandbox/projects');
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('POST /api/sandbox/projects', () => {
    test('creates project and returns 201', async () => {
      const newProject = { id: 'new-1', name: 'my-sandbox', status: 'stopped' };
      sandboxService.createProject.mockResolvedValue(newProject);

      const res = await request(app)
        .post('/api/sandbox/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'my-sandbox',
          description: 'integration test',
          baseImage: 'arasul-sandbox:latest',
        });

      expect(res.status).toBe(201);
      expect(res.body.project).toEqual(newProject);
      expect(sandboxService.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'my-sandbox',
          description: 'integration test',
          userId: 1,
        })
      );
    });

    test('maps ValidationError from service to 400', async () => {
      const { ValidationError } = require('../../src/utils/errors');
      sandboxService.createProject.mockRejectedValue(
        new ValidationError('Name is required')
      );

      const res = await request(app)
        .post('/api/sandbox/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/name/i);
    });
  });

  describe('GET /api/sandbox/projects/:id', () => {
    test('returns project details', async () => {
      sandboxService.getProject.mockResolvedValue({ id: 'p1', name: 'test' });

      const res = await request(app)
        .get('/api/sandbox/projects/p1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.project.id).toBe('p1');
      expect(sandboxService.getProject).toHaveBeenCalledWith('p1', 1);
    });

    test('maps NotFoundError to 404', async () => {
      const { NotFoundError } = require('../../src/utils/errors');
      sandboxService.getProject.mockRejectedValue(new NotFoundError('Project not found'));

      const res = await request(app)
        .get('/api/sandbox/projects/missing')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/sandbox/projects/:id', () => {
    test('archives project and returns success', async () => {
      sandboxService.deleteProject.mockResolvedValue({ success: true, archived: true });

      const res = await request(app)
        .delete('/api/sandbox/projects/p1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(sandboxService.deleteProject).toHaveBeenCalledWith('p1', 1);
    });
  });

  // ==========================================================================
  // LLM Jobs
  // ==========================================================================

  describe('GET /api/llm/jobs/:jobId', () => {
    test('returns job status for active job', async () => {
      llmJobService.getJob.mockResolvedValue({
        id: 'job-123',
        status: 'running',
        content: 'partial response',
        conversation_id: 'conv-1',
      });

      const res = await request(app)
        .get('/api/llm/jobs/job-123')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('job-123');
      expect(res.body.status).toBe('running');
      expect(res.body.timestamp).toBeDefined();
    });

    test('returns 404 when job does not exist', async () => {
      llmJobService.getJob.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/llm/jobs/missing')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/llm/queue', () => {
    test('returns queue status', async () => {
      llmQueueService.getQueueStatus.mockResolvedValue({
        pending: 2,
        running: 1,
        completed: 10,
      });

      const res = await request(app)
        .get('/api/llm/queue')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pending).toBe(2);
      expect(res.body.running).toBe(1);
    });
  });

  describe('GET /api/llm/queue/metrics', () => {
    test('returns detailed queue metrics', async () => {
      llmQueueService.getQueueMetrics.mockResolvedValue({
        avgWaitMs: 1200,
        avgRunMs: 8500,
        throughputPerMinute: 4.2,
      });

      const res = await request(app)
        .get('/api/llm/queue/metrics')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.avgWaitMs).toBe(1200);
      expect(res.body.throughputPerMinute).toBeCloseTo(4.2);
    });
  });

  describe('POST /api/llm/queue/prioritize', () => {
    test('prioritizes a job by ID', async () => {
      llmQueueService.prioritizeJob.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/llm/queue/prioritize')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ job_id: 'job-abc' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(llmQueueService.prioritizeJob).toHaveBeenCalledWith('job-abc');
    });

    test('rejects missing job_id with 400', async () => {
      const res = await request(app)
        .post('/api/llm/queue/prioritize')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/job_id/i);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details?.issues?.[0]?.path).toBe('job_id');
      expect(llmQueueService.prioritizeJob).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Discovery endpoint
  // ==========================================================================

  describe('GET /api/_meta', () => {
    test('returns API surface without auth', async () => {
      const res = await request(app).get('/api/_meta');

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('arasul-dashboard-backend');
      expect(Array.isArray(res.body.routes)).toBe(true);
      expect(res.body.routes.length).toBeGreaterThan(10);
      expect(res.body.routes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ prefix: '/sandbox', group: 'sandbox' }),
          expect.objectContaining({ prefix: '/llm', group: 'core' }),
        ])
      );
      expect(res.body.errorCodes).toEqual(expect.arrayContaining(['VALIDATION_ERROR', 'NOT_FOUND']));
      expect(typeof res.body.uptimeSeconds).toBe('number');
    });
  });

  // ==========================================================================
  // Validation middleware — schema-driven input rejection
  // ==========================================================================

  describe('validateBody on POST /api/sandbox/projects', () => {
    test('rejects empty body with structured details', async () => {
      const res = await request(app)
        .post('/api/sandbox/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.source).toBe('body');
      expect(res.body.error.details.issues).toBeDefined();
      expect(sandboxService.createProject).not.toHaveBeenCalled();
    });

    test('rejects unknown keys (strict schema)', async () => {
      const res = await request(app)
        .post('/api/sandbox/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'ok', bogus_field: 'nope' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(sandboxService.createProject).not.toHaveBeenCalled();
    });

    test('rejects invalid color hex', async () => {
      const res = await request(app)
        .post('/api/sandbox/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'ok', color: 'red' });

      expect(res.status).toBe(400);
      expect(res.body.error.details.issues[0].path).toBe('color');
    });
  });

  describe('validateQuery coerces numeric filters', () => {
    test('coerces limit/offset strings to numbers before service call', async () => {
      sandboxService.listProjects.mockResolvedValue({ projects: [], total: 0 });

      await request(app)
        .get('/api/sandbox/projects?limit=25&offset=5')
        .set('Authorization', `Bearer ${authToken}`);

      expect(sandboxService.listProjects).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 25, offset: 5 })
      );
    });

    test('rejects non-numeric limit', async () => {
      const res = await request(app)
        .get('/api/sandbox/projects?limit=abc')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
