/**
 * Integration tests for the workspace-agent chat surface (Plan 008, Schritt 11).
 *
 * Exercises the HTTP wiring for the agent-list and agent-run/stream routes
 * end-to-end through auth → route → helper. The agents service is mocked so we
 * assert the route contract (auth, 404 mapping, and the SSE frame sequence)
 * without a workspace, Docker, or a running LLM.
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
jest.mock('../../src/services/agents/runWorkspaceAgent');
jest.mock('../../src/services/agents/agentFile');

const db = require('../../src/database');
const logger = require('../../src/utils/logger');
const { resolveAndRun, loadWorkspace } = require('../../src/services/agents/runWorkspaceAgent');
const { listAgents, loadAgent } = require('../../src/services/agents/agentFile');
const { NotFoundError } = require('../../src/utils/errors');
const { app } = require('../../src/server');

logger.info = jest.fn();
logger.warn = jest.fn();
logger.error = jest.fn();
logger.debug = jest.fn();

/** Parse an SSE response body into the ordered list of `data:` JSON events. */
function parseSseFrames(text) {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('data:'))
    .map(l => JSON.parse(l.replace(/^data:\s*/, '')));
}

describe('Workspace Agent routes (Schritt 11)', () => {
  let authToken;

  beforeAll(() => {
    authToken = generateTestToken();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset();
    setupAuthMocks(db);
  });

  // --------------------------------------------------------------------------
  // GET /api/sandbox/projects/:workspace/agenten
  // --------------------------------------------------------------------------
  describe('GET /projects/:workspace/agenten', () => {
    test('lists the workspace agents with parsed metadata', async () => {
      loadWorkspace.mockResolvedValue({ id: 'w1', host_path: '/data/ws', user_id: 1 });
      listAgents.mockResolvedValue(['texter', 'broken']);
      loadAgent.mockImplementation(async (_hostPath, name) => {
        if (name === 'broken') throw new NotFoundError('kaputt');
        return { name: 'Texter', description: 'Schreibt.', model: 'qwen2.5:7b', tools: ['dateien'] };
      });

      const res = await request(app)
        .get('/api/sandbox/projects/mein-ws/agenten')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.agents).toEqual([
        {
          name: 'texter',
          displayName: 'Texter',
          description: 'Schreibt.',
          model: 'qwen2.5:7b',
          tools: ['dateien'],
        },
        { name: 'broken' },
      ]);
      expect(loadWorkspace).toHaveBeenCalledWith('mein-ws', { userId: 1, userRole: 'admin' });
    });

    test('unknown workspace → 404', async () => {
      loadWorkspace.mockRejectedValue(new NotFoundError('Workspace nicht gefunden'));
      const res = await request(app)
        .get('/api/sandbox/projects/nope/agenten')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    test('no auth → 401', async () => {
      const res = await request(app).get('/api/sandbox/projects/mein-ws/agenten');
      expect(res.status).toBe(401);
    });
  });

  // --------------------------------------------------------------------------
  // POST /api/sandbox/projects/:workspace/agenten/:agent/run/stream
  // --------------------------------------------------------------------------
  describe('POST /projects/:workspace/agenten/:agent/run/stream', () => {
    test('streams engine events as ordered SSE frames', async () => {
      const scripted = [
        { type: 'tool_start', tool: 'dateien', params: { aktion: 'read', pfad: 'brief.md' } },
        { type: 'tool_result', tool: 'dateien', result: 'Sehr geehrte…' },
        { type: 'text', content: 'Fertig.' },
        { type: 'done', result: 'Fertig.' },
      ];
      resolveAndRun.mockImplementation(async ({ onEvent }) => {
        for (const evt of scripted) onEvent(evt);
        return { result: 'Fertig.', iterations: 2 };
      });

      const res = await request(app)
        .post('/api/sandbox/projects/mein-ws/agenten/texter/run/stream')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ input: 'Schreib einen Brief' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/event-stream/);
      expect(parseSseFrames(res.text)).toEqual(scripted);

      expect(resolveAndRun).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceRef: 'mein-ws',
          agentName: 'texter',
          userInput: 'Schreib einen Brief',
          userId: 1,
          userRole: 'admin',
          onEvent: expect.any(Function),
        })
      );
    });

    test('empty input is accepted (bare @agent)', async () => {
      resolveAndRun.mockImplementation(async ({ onEvent }) => {
        onEvent({ type: 'done', result: 'ok' });
        return { result: 'ok', iterations: 1 };
      });
      const res = await request(app)
        .post('/api/sandbox/projects/mein-ws/agenten/texter/run/stream')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});
      expect(res.status).toBe(200);
      expect(resolveAndRun).toHaveBeenCalledWith(expect.objectContaining({ userInput: '' }));
    });

    test('unknown workspace/agent → 404 before any SSE frame', async () => {
      resolveAndRun.mockRejectedValue(new NotFoundError('Agent "texter" nicht gefunden'));
      const res = await request(app)
        .post('/api/sandbox/projects/mein-ws/agenten/texter/run/stream')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ input: 'hallo' });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.headers['content-type']).not.toMatch(/text\/event-stream/);
    });

    test('no auth → 401', async () => {
      const res = await request(app)
        .post('/api/sandbox/projects/mein-ws/agenten/texter/run/stream')
        .send({ input: 'hallo' });
      expect(res.status).toBe(401);
      expect(resolveAndRun).not.toHaveBeenCalled();
    });
  });
});
