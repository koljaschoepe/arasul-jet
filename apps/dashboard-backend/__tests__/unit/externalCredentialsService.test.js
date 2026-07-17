/**
 * External Credentials Service — unit tests (Plan 008, Schritt 14).
 *
 * Kern-Garantie: ein einmal gespeicherter Login überlebt, weil er verschlüsselt
 * in der DB liegt und exakt zum Original zurück-entschlüsselt. Dafür wird die
 * ECHTE tokenCrypto (mit dem Test-JWT_SECRET aus jest.setup.js) benutzt — nur
 * die DB und Docker sind gemockt.
 */

// In-memory-„DB": speichert den verschlüsselten Buffer genau so, wie es Postgres
// mit einer BYTEA-Spalte täte, und gibt ihn beim SELECT wieder heraus.
const store = new Map(); // key `${userId}:${provider}` → Buffer

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/database', () => ({
  query: jest.fn(),
}));

// Docker wird pro Test gesteuert; Default: getContainer liefert einen Stub.
const mockExec = { start: jest.fn(), inspect: jest.fn() };
const mockContainer = { exec: jest.fn(() => Promise.resolve(mockExec)) };
jest.mock('../../src/services/core/docker', () => ({
  docker: {
    getContainer: jest.fn(() => mockContainer),
    modem: { demuxStream: jest.fn() },
  },
}));

const { EventEmitter } = require('events');
const db = require('../../src/database');
const { docker } = require('../../src/services/core/docker');
const svc = require('../../src/services/sandbox/externalCredentialsService');

// db.query-Mock, der INSERT/SELECT/DELETE gegen den In-memory-`store` bedient.
function wireDb() {
  db.query.mockImplementation(async (sql, params) => {
    if (/INSERT INTO user_external_credentials/.test(sql)) {
      const [userId, provider, encrypted] = params;
      store.set(`${userId}:${provider}`, encrypted);
      return { rows: [{ provider, updated_at: '2026-07-17T00:00:00Z' }], rowCount: 1 };
    }
    if (/SELECT encrypted_credentials/.test(sql)) {
      const [userId, provider] = params;
      const buf = store.get(`${userId}:${provider}`);
      return buf ? { rows: [{ encrypted_credentials: buf }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (/SELECT 1 FROM user_external_credentials/.test(sql)) {
      const [userId, provider] = params;
      return store.has(`${userId}:${provider}`)
        ? { rows: [{ '?column?': 1 }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    if (/DELETE FROM user_external_credentials/.test(sql)) {
      const [userId, provider] = params;
      const existed = store.delete(`${userId}:${provider}`);
      return { rows: [], rowCount: existed ? 1 : 0 };
    }
    throw new Error(`Unmocked SQL: ${sql}`);
  });
}

function makeStream() {
  const s = new EventEmitter();
  s.destroy = jest.fn();
  return s;
}

beforeEach(() => {
  jest.clearAllMocks();
  store.clear();
  wireDb();
  docker.getContainer.mockReturnValue(mockContainer);
  mockContainer.exec.mockResolvedValue(mockExec);
});

describe('externalCredentialsService — CRUD round-trip (echte tokenCrypto)', () => {
  it('save→load entschlüsselt zum ursprünglichen Objekt', async () => {
    const creds = { files: { '.claude/.credentials.json': '{"token":"abc123"}' }, nested: { a: 1 } };
    await svc.saveCredentials(7, 'claude', creds);

    // Was in der „DB" liegt, ist ein Buffer und NICHT der Klartext.
    const stored = store.get('7:claude');
    expect(Buffer.isBuffer(stored)).toBe(true);
    expect(stored.toString('utf8')).not.toContain('abc123');

    const loaded = await svc.loadCredentials(7, 'claude');
    expect(loaded).toEqual(creds);
  });

  it('loadCredentials liefert null, wenn nichts gespeichert ist', async () => {
    const loaded = await svc.loadCredentials(99, 'claude');
    expect(loaded).toBeNull();
  });

  it('hasCredentials true/false', async () => {
    expect(await svc.hasCredentials(7, 'claude')).toBe(false);
    await svc.saveCredentials(7, 'claude', { x: 1 });
    expect(await svc.hasCredentials(7, 'claude')).toBe(true);
  });

  it('deleteCredentials entfernt und meldet true, danach false', async () => {
    await svc.saveCredentials(7, 'claude', { x: 1 });
    expect(await svc.deleteCredentials(7, 'claude')).toBe(true);
    expect(await svc.hasCredentials(7, 'claude')).toBe(false);
    expect(await svc.deleteCredentials(7, 'claude')).toBe(false);
  });

  it('Upsert überschreibt vorhandene Credentials', async () => {
    await svc.saveCredentials(7, 'claude', { v: 1 });
    await svc.saveCredentials(7, 'claude', { v: 2 });
    expect(await svc.loadCredentials(7, 'claude')).toEqual({ v: 2 });
  });
});

describe('captureClaudeLogin', () => {
  // Hilft, docker exec so zu steuern, dass `cat` je nach Datei Inhalt liefert.
  function stubCat(fileContents) {
    // fileContents: map rel → string (fehlend ⇒ leere Ausgabe)
    mockContainer.exec.mockImplementation(async ({ Cmd }) => {
      const shell = Cmd[2] || '';
      const stream = makeStream();
      mockExec.start.mockResolvedValue(stream);
      mockExec.inspect.mockResolvedValue({ ExitCode: 0 });
      // Welche Datei wird gelesen?
      let out = '';
      for (const rel of Object.keys(fileContents)) {
        if (shell.includes(`$HOME/${rel}`)) {
          out = fileContents[rel];
        }
      }
      // demuxStream schreibt die passende Ausgabe und beendet den Stream.
      docker.modem.demuxStream.mockImplementation((s, stdout) => {
        if (out) {
          stdout.write(Buffer.from(out));
        }
        setImmediate(() => s.emit('end'));
      });
      return mockExec;
    });
  }

  it('liest die Creds-Datei und speichert sie verschlüsselt', async () => {
    stubCat({ '.claude/.credentials.json': '{"token":"xyz"}' });
    const result = await svc.captureClaudeLogin(7, { container_id: 'c1' });
    expect(result.captured).toBe(true);
    expect(result.files).toContain('.claude/.credentials.json');

    // Round-trip: der gespeicherte Login lädt zum Datei-Inhalt zurück.
    const loaded = await svc.loadCredentials(7, 'claude');
    expect(loaded.files['.claude/.credentials.json']).toBe('{"token":"xyz"}');
  });

  it('no-op (captured:false), wenn die Pflicht-Datei fehlt — kein Wurf', async () => {
    stubCat({}); // nichts vorhanden
    const result = await svc.captureClaudeLogin(7, { container_id: 'c1' });
    expect(result.captured).toBe(false);
    expect(await svc.hasCredentials(7, 'claude')).toBe(false);
  });

  it('captured:false ohne Container-Referenz', async () => {
    const result = await svc.captureClaudeLogin(7, {});
    expect(result.captured).toBe(false);
    expect(result.reason).toBe('no_container');
  });
});

describe('restoreClaudeLogin', () => {
  it('schreibt die gespeicherte Datei in den Container zurück', async () => {
    // Erst speichern.
    await svc.saveCredentials(7, 'claude', {
      files: { '.claude/.credentials.json': '{"token":"restore-me"}' },
    });

    const writtenScripts = [];
    mockContainer.exec.mockImplementation(async ({ Cmd }) => {
      writtenScripts.push(Cmd[2]);
      const stream = makeStream();
      mockExec.start.mockResolvedValue(stream);
      mockExec.inspect.mockResolvedValue({ ExitCode: 0 });
      docker.modem.demuxStream.mockImplementation((s) => setImmediate(() => s.emit('end')));
      return mockExec;
    });

    const result = await svc.restoreClaudeLogin(7, { container_id: 'c1' });
    expect(result.restored).toBe(true);
    expect(result.files).toContain('.claude/.credentials.json');
    // Der Restore-Befehl base64-dekodiert in die Zieldatei und setzt chmod 600.
    const script = writtenScripts.join('\n');
    expect(script).toContain('base64 -d');
    expect(script).toContain('chmod 600');
    expect(script).toContain('$HOME/.claude/.credentials.json');
  });

  it('no-op (restored:false), wenn keine Creds gespeichert sind — kein Wurf', async () => {
    const result = await svc.restoreClaudeLogin(7, { container_id: 'c1' });
    expect(result.restored).toBe(false);
    expect(result.reason).toBe('no_credentials');
    // exec wird gar nicht erst aufgerufen.
    expect(mockContainer.exec).not.toHaveBeenCalled();
  });

  it('restored:false ohne Container-Referenz', async () => {
    await svc.saveCredentials(7, 'claude', { files: { '.claude.json': '{}' } });
    const result = await svc.restoreClaudeLogin(7, {});
    expect(result.restored).toBe(false);
    expect(result.reason).toBe('no_container');
  });

  it('restoreClaudeLoginBestEffort wirft nie, auch wenn exec explodiert', async () => {
    await svc.saveCredentials(7, 'claude', {
      files: { '.claude/.credentials.json': '{"t":1}' },
    });
    mockContainer.exec.mockRejectedValue(new Error('boom'));
    const result = await svc.restoreClaudeLoginBestEffort(7, { container_id: 'c1' });
    expect(result.restored).toBe(false);
  });
});
