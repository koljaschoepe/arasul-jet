/**
 * Projekt-Verbindungen (Plan 017 Schritt 5).
 *
 * Fokus: der Geheimwert wird verschlüsselt abgelegt und NIE über die API-Form
 * zurückgegeben; die Injektion baut Env-Paare + .mcp.json/Codex-Konfig korrekt,
 * und MCP-Secrets erscheinen in der Konfig nur als ${ENV}-Platzhalter.
 */

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
// tokenCrypto real laufen lassen, aber mit gesetztem JWT_SECRET.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-connections-tests';

const db = require('../../src/database');
const { encryptToken } = require('../../src/utils/tokenCrypto');
const connectionsService = require('../../src/services/sandbox/connectionsService');

beforeEach(() => jest.clearAllMocks());

describe('createConnection', () => {
  it('verschlüsselt den Wert und gibt ihn NICHT zurück (nur hatWert)', async () => {
    db.query.mockResolvedValue({
      rows: [
        {
          id: 'c1',
          project_id: 'p1',
          name: 'SUPABASE_KEY',
          kind: 'env',
          config: {},
          secret_encrypted: Buffer.from('x'),
          created_at: 'now',
          updated_at: 'now',
        },
      ],
    });

    const conn = await connectionsService.createConnection(
      'p1',
      { kind: 'env', name: 'SUPABASE_KEY', value: 'geheim' },
      1
    );

    expect(conn.hatWert).toBe(true);
    expect(conn).not.toHaveProperty('value');
    expect(conn).not.toHaveProperty('secret_encrypted');
    // Der an die DB übergebene Wert ist ein verschlüsselter Buffer, kein Klartext.
    const params = db.query.mock.calls[0][1];
    const gespeichert = params[4];
    expect(Buffer.isBuffer(gespeichert)).toBe(true);
    expect(gespeichert.toString()).not.toContain('geheim');
  });

  it('doppelter Name → ConflictError (23505 → 409)', async () => {
    const { ConflictError } = require('../../src/utils/errors');
    db.query.mockRejectedValue({ code: '23505' });
    await expect(
      connectionsService.createConnection('p1', { kind: 'env', name: 'X', value: 'v' }, 1)
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('buildInjection', () => {
  it('env-Verbindung → Env-Paar; MCP → .mcp.json + Codex-Konfig mit ${ENV}', async () => {
    db.query.mockResolvedValue({
      rows: [
        {
          name: 'SUPABASE_URL',
          kind: 'env',
          config: {},
          secret_encrypted: encryptToken('https://x.supabase.co'),
        },
        {
          name: 'supabase',
          kind: 'mcp',
          config: { command: 'npx', args: ['-y', 'supabase-mcp'], valueEnv: 'SUPABASE_TOKEN' },
          secret_encrypted: encryptToken('sb-secret'),
        },
      ],
    });

    const inj = await connectionsService.buildInjection('p1');

    // Env: der Klartext-Wert der env-Verbindung + der MCP-Token unter valueEnv.
    const envMap = Object.fromEntries(inj.env.map(e => [e.name, e.value]));
    expect(envMap.SUPABASE_URL).toBe('https://x.supabase.co');
    expect(envMap.SUPABASE_TOKEN).toBe('sb-secret');

    // .mcp.json referenziert das Secret NUR als Platzhalter, nie im Klartext.
    expect(inj.mcpJson).toContain('"supabase"');
    expect(inj.mcpJson).toContain('${SUPABASE_TOKEN}');
    expect(inj.mcpJson).not.toContain('sb-secret');

    // Codex-Konfig ebenso.
    expect(inj.codexToml).toContain('[mcp_servers.supabase]');
    expect(inj.codexToml).toContain('${SUPABASE_TOKEN}');
    expect(inj.codexToml).not.toContain('sb-secret');
  });

  it('überspringt eine (Alt-)Zeile mit unsicherem MCP-Namen (Config-Injection-Schutz)', async () => {
    db.query.mockResolvedValue({
      rows: [
        {
          name: 'boese]\n[mcp_servers.evil',
          kind: 'mcp',
          config: { command: 'x', args: [] },
          secret_encrypted: null,
        },
      ],
    });
    const inj = await connectionsService.buildInjection('p1');
    expect(inj.mcpJson).toBeNull();
    expect(inj.codexToml).toBeNull();
  });

  it('ohne Verbindungen → leere Injektion', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const inj = await connectionsService.buildInjection('p1');
    expect(inj.env).toEqual([]);
    expect(inj.mcpJson).toBeNull();
    expect(inj.codexToml).toBeNull();
  });
});

describe('updateConnection / deleteConnection', () => {
  it('behält den alten Wert, wenn kein neuer mitkommt', async () => {
    const alt = encryptToken('alt');
    db.query
      .mockResolvedValueOnce({
        rows: [{ id: 'c1', project_id: 'p1', name: 'X', kind: 'env', config: {}, secret_encrypted: alt }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'c1',
            project_id: 'p1',
            name: 'X',
            kind: 'env',
            config: {},
            secret_encrypted: alt,
            created_at: 'now',
            updated_at: 'now',
          },
        ],
      });

    await connectionsService.updateConnection('p1', 'c1', {});
    const updateParams = db.query.mock.calls[1][1];
    expect(updateParams[3]).toBe(alt); // unveränderter Geheim-Buffer
  });

  it('mcp-Update ändert command/args/valueEnv in der Konfig', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'c1',
            project_id: 'p1',
            name: 'supabase',
            kind: 'mcp',
            config: { command: 'alt', args: [], valueEnv: 'OLD' },
            secret_encrypted: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'c1',
            project_id: 'p1',
            name: 'supabase',
            kind: 'mcp',
            config: { command: 'npx', args: ['-y', 'x'], valueEnv: 'NEW' },
            secret_encrypted: null,
            created_at: 'now',
            updated_at: 'now',
          },
        ],
      });

    const conn = await connectionsService.updateConnection('p1', 'c1', {
      command: 'npx',
      args: ['-y', 'x'],
      valueEnv: 'NEW',
    });
    expect(conn.config.command).toBe('npx');
    const updateParams = db.query.mock.calls[1][1];
    const savedConfig = JSON.parse(updateParams[2]);
    expect(savedConfig).toEqual({ command: 'npx', args: ['-y', 'x'], valueEnv: 'NEW' });
  });

  it('deleteConnection wirft NotFound, wenn nichts gelöscht wurde', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await expect(connectionsService.deleteConnection('p1', 'c-x')).rejects.toThrow(/nicht gefunden/i);
  });
});

describe('createConnection — Konflikt', () => {
  it('doppelter Name liefert ConflictError (409), nicht ValidationError', async () => {
    const { ConflictError } = require('../../src/utils/errors');
    db.query.mockRejectedValue({ code: '23505' });
    await expect(
      connectionsService.createConnection('p1', { kind: 'env', name: 'X', value: 'v' }, 1)
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
