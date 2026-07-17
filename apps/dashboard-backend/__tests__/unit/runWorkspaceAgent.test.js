/**
 * Unit tests for the channel-neutral workspace-agent runner
 * (services/agents/runWorkspaceAgent.js, Plan 008 Schritt 11).
 *
 * DB, the agent-file loader and the tool-loop engine are all mocked so we can
 * assert workspace resolution (id vs slug), owner/admin authorization, and the
 * run-context passed to the engine.
 */

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/services/agents/agentFile', () => ({
  loadAgent: jest.fn(),
}));
jest.mock('../../src/services/agents/toolLoop', () => ({
  runAgent: jest.fn(),
}));

const db = require('../../src/database');
const { loadAgent } = require('../../src/services/agents/agentFile');
const { runAgent } = require('../../src/services/agents/toolLoop');
const { resolveAndRun, loadWorkspace } = require('../../src/services/agents/runWorkspaceAgent');
const { NotFoundError } = require('../../src/utils/errors');

const UUID = '11111111-2222-3333-4444-555555555555';
const PROJECT = {
  id: UUID,
  slug: 'mein-ws',
  host_path: '/data/sandbox/projects/mein-ws',
  container_name: 'arasul-sandbox-mein-ws',
  network_mode: 'internal',
  status: 'active',
  user_id: 7,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('loadWorkspace', () => {
  test('resolves by slug (non-UUID ref queries the slug column)', async () => {
    db.query.mockResolvedValue({ rows: [PROJECT] });
    const p = await loadWorkspace('mein-ws', { userId: 7, userRole: 'user' });
    expect(p).toBe(PROJECT);
    expect(db.query.mock.calls[0][0]).toMatch(/slug = \$1/);
    expect(db.query.mock.calls[0][1]).toEqual(['mein-ws']);
  });

  test('resolves by id (UUID ref queries the id column)', async () => {
    db.query.mockResolvedValue({ rows: [PROJECT] });
    await loadWorkspace(UUID, { userId: 7, userRole: 'user' });
    expect(db.query.mock.calls[0][0]).toMatch(/id = \$1/);
  });

  test('absent workspace → NotFoundError', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await expect(loadWorkspace('ghost', { userId: 7 })).rejects.toThrow(NotFoundError);
  });

  test('non-owner non-admin → NotFoundError', async () => {
    db.query.mockResolvedValue({ rows: [PROJECT] });
    await expect(loadWorkspace('mein-ws', { userId: 999, userRole: 'user' })).rejects.toThrow(
      NotFoundError
    );
  });

  test('admin may access another user’s workspace', async () => {
    db.query.mockResolvedValue({ rows: [PROJECT] });
    await expect(loadWorkspace('mein-ws', { userId: 999, userRole: 'admin' })).resolves.toBe(
      PROJECT
    );
  });
});

describe('resolveAndRun', () => {
  test('loads the agent and drives the engine with the run context', async () => {
    db.query.mockResolvedValue({ rows: [PROJECT] });
    const agent = { name: 'Texter', model: 'qwen2.5:7b', tools: ['dateien'] };
    loadAgent.mockResolvedValue(agent);
    runAgent.mockResolvedValue({ result: 'done', iterations: 1 });

    const onEvent = jest.fn();
    const out = await resolveAndRun({
      workspaceRef: 'mein-ws',
      agentName: 'texter',
      userInput: 'hallo',
      userId: 7,
      userRole: 'user',
      onEvent,
    });

    expect(loadAgent).toHaveBeenCalledWith(PROJECT.host_path, 'texter');
    expect(runAgent).toHaveBeenCalledWith({
      agent,
      userInput: 'hallo',
      onEvent,
      context: {
        workspaceId: UUID,
        hostPath: PROJECT.host_path,
        slug: 'mein-ws',
        containerName: PROJECT.container_name,
        userId: 7,
        networkMode: 'internal',
      },
    });
    expect(out).toEqual({ result: 'done', iterations: 1 });
  });

  test('unknown agent → NotFoundError (engine not called)', async () => {
    db.query.mockResolvedValue({ rows: [PROJECT] });
    loadAgent.mockRejectedValue(new NotFoundError('Agent "x" nicht gefunden'));
    await expect(
      resolveAndRun({ workspaceRef: 'mein-ws', agentName: 'x', userInput: '', userId: 7 })
    ).rejects.toThrow(NotFoundError);
    expect(runAgent).not.toHaveBeenCalled();
  });
});
