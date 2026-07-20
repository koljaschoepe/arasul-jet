/**
 * Unit-Tests für den Flow-Agents-Service (Plan 010, Schritt 2).
 * DB gemockt; geprüft: Owner-Scoping (fremd → NotFound), Provider-Validierung,
 * allow_external nur für Admins, Update nur gesetzter Felder.
 */

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const db = require('../../src/database');
const svc = require('../../src/services/agents/flowAgentsService');
const { NotFoundError, ValidationError } = require('../../src/utils/errors');

const ROW = {
  id: 5,
  user_id: 7,
  name: 'Recherche',
  description: '',
  system_prompt: 'Du bist Rechercheur',
  provider: 'ollama',
  model: 'qwen2.5:3b',
  tools: [],
  allow_external: false,
  created_at: 'a',
  updated_at: 'b',
};

beforeEach(() => jest.clearAllMocks());

describe('getAgent', () => {
  test('owner findet den Agenten (camelCase-Mapping)', async () => {
    db.query.mockResolvedValue({ rows: [ROW] });
    const a = await svc.getAgent(5, 7);
    expect(a).toMatchObject({ id: 5, name: 'Recherche', systemPrompt: 'Du bist Rechercheur', tools: [] });
    expect(db.query.mock.calls[0][1]).toEqual([5, 7]);
    expect(db.query.mock.calls[0][0]).toMatch(/user_id = \$2/);
  });
  test('fremd/unbekannt → NotFoundError', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await expect(svc.getAgent(5, 999)).rejects.toThrow(NotFoundError);
  });
});

describe('listAgents', () => {
  test('scoped auf user_id', async () => {
    db.query.mockResolvedValue({ rows: [ROW] });
    const list = await svc.listAgents(7);
    expect(list).toHaveLength(1);
    expect(db.query.mock.calls[0][1]).toEqual([7]);
  });
});

describe('createAgent', () => {
  test('legt an und serialisiert tools als jsonb', async () => {
    db.query.mockResolvedValue({ rows: [{ ...ROW, tools: ['rag'] }] });
    const a = await svc.createAgent(7, 'user', {
      name: 'A',
      provider: 'ollama',
      model: 'm',
      tools: ['rag'],
    });
    expect(a.tools).toEqual(['rag']);
    const params = db.query.mock.calls[0][1];
    expect(params[0]).toBe(7); // user_id
    expect(params[6]).toBe(JSON.stringify(['rag'])); // tools jsonb
    expect(params[7]).toBe(false); // allow_external
  });

  test('unbekannter Provider → ValidationError (kein DB-Call)', async () => {
    await expect(svc.createAgent(7, 'user', { name: 'A', provider: 'gemini', model: 'm' })).rejects.toThrow(
      ValidationError
    );
    expect(db.query).not.toHaveBeenCalled();
  });

  test('Nicht-Admin darf allow_external nicht auf true setzen', async () => {
    await expect(
      svc.createAgent(7, 'user', { name: 'A', provider: 'ollama', model: 'm', allowExternal: true })
    ).rejects.toThrow(ValidationError);
  });

  test('Admin darf allow_external setzen', async () => {
    db.query.mockResolvedValue({ rows: [{ ...ROW, allow_external: true }] });
    const a = await svc.createAgent(7, 'admin', {
      name: 'A',
      provider: 'ollama',
      model: 'm',
      allowExternal: true,
    });
    expect(a.allowExternal).toBe(true);
    expect(db.query.mock.calls[0][1][7]).toBe(true);
  });
});

describe('updateAgent', () => {
  test('aktualisiert nur gesetzte Felder + updated_at', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [ROW] }) // getAgent (ownership)
      .mockResolvedValueOnce({ rows: [{ ...ROW, name: 'Neu' }] }); // update
    const a = await svc.updateAgent(5, 7, 'user', { name: 'Neu' });
    expect(a.name).toBe('Neu');
    const sql = db.query.mock.calls[1][0];
    expect(sql).toMatch(/name = \$1/);
    expect(sql).toMatch(/updated_at = NOW\(\)/);
    expect(sql).not.toMatch(/description =/);
  });

  test('fremder Agent → NotFoundError (kein Update)', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // getAgent leer
    await expect(svc.updateAgent(5, 999, 'user', { name: 'X' })).rejects.toThrow(NotFoundError);
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});

describe('deleteAgent', () => {
  test('owner löscht → true', async () => {
    db.query.mockResolvedValue({ rowCount: 1 });
    expect(await svc.deleteAgent(5, 7)).toBe(true);
  });
  test('fremd → NotFoundError', async () => {
    db.query.mockResolvedValue({ rowCount: 0 });
    await expect(svc.deleteAgent(5, 999)).rejects.toThrow(NotFoundError);
  });
});
