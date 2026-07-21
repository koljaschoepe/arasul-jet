/**
 * Unit-Tests des Flows-Service (Plan 010, Schritt 4).
 * DB gemockt; Fokus: Owner-Scoping (fremd → 404) und die Prüfung, dass ein
 * Fluss keine fremden Agenten referenzieren kann (assertAgentsOwned).
 */

jest.mock('../../src/database', () => ({ query: jest.fn() }));

const db = require('../../src/database');
const svc = require('../../src/services/agents/flowsService');
const { NotFoundError, ValidationError } = require('../../src/utils/errors');

const ROW = {
  id: 3,
  user_id: 7,
  name: 'Mein Fluss',
  description: '',
  graph: { nodes: [{ id: 'a', type: 'agent', data: { agentId: 1 } }], edges: [] },
  schedule_cron: null,
  run_token_hash: null,
  created_at: 'a',
  updated_at: 'b',
};

beforeEach(() => jest.clearAllMocks());

describe('getFlow', () => {
  test('owner findet den Fluss (camelCase + graph)', async () => {
    db.query.mockResolvedValue({ rows: [ROW] });
    const f = await svc.getFlow(3, 7);
    expect(f).toMatchObject({ id: 3, name: 'Mein Fluss', hasRunToken: false });
    expect(f.graph.nodes).toHaveLength(1);
    expect(db.query.mock.calls[0][1]).toEqual([3, 7]);
  });
  test('fremd/unbekannt → NotFoundError', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await expect(svc.getFlow(3, 999)).rejects.toThrow(NotFoundError);
  });
});

describe('createFlow', () => {
  test('serialisiert den Graphen als jsonb', async () => {
    db.query.mockResolvedValue({ rows: [ROW] });
    await svc.createFlow(7, { name: 'X', graph: { nodes: [], edges: [] } });
    const params = db.query.mock.calls[0][1];
    expect(params[0]).toBe(7);
    expect(params[3]).toBe(JSON.stringify({ nodes: [], edges: [] }));
  });

  test('reicht scheduleCron beim Anlegen durch (kein stiller Verlust)', async () => {
    db.query.mockResolvedValue({ rows: [ROW] });
    await svc.createFlow(7, { name: 'X', scheduleCron: '*/5 * * * *' });
    expect(db.query.mock.calls[0][1][4]).toBe('*/5 * * * *');
    // leer → null
    db.query.mockClear();
    db.query.mockResolvedValue({ rows: [ROW] });
    await svc.createFlow(7, { name: 'Y', scheduleCron: '' });
    expect(db.query.mock.calls[0][1][4]).toBeNull();
  });
});

describe('assertAgentsOwned', () => {
  test('alle Agenten gehören dem Nutzer → ok', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 1 }, { id: 2 }] });
    await expect(svc.assertAgentsOwned([1, 2, 1], 7)).resolves.toBeUndefined();
    // Deduplizierte Abfrage
    expect(db.query.mock.calls[0][1]).toEqual([7, [1, 2]]);
  });

  test('fremder/fehlender Agent → ValidationError', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 1 }] }); // 2 fehlt
    await expect(svc.assertAgentsOwned([1, 2], 7)).rejects.toThrow(ValidationError);
  });

  test('keine Agenten → kein DB-Call', async () => {
    await svc.assertAgentsOwned([], 7);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('deleteFlow', () => {
  test('owner löscht → true', async () => {
    db.query.mockResolvedValue({ rowCount: 1 });
    expect(await svc.deleteFlow(3, 7)).toBe(true);
  });
  test('fremd → NotFoundError', async () => {
    db.query.mockResolvedValue({ rowCount: 0 });
    await expect(svc.deleteFlow(3, 999)).rejects.toThrow(NotFoundError);
  });
});
