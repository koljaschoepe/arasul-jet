/**
 * KI-Brücke (Plan 017 Schritt 2) — Token-Lebenszyklus und Fähigkeits-Gates.
 *
 * Der Fokus liegt auf den Grenzen: fehlende/abgelaufene/fremde Tokens (401),
 * nicht freigegebene Fähigkeiten (403), deaktivierte Erweiterung, Notaus-Flag
 * (503). Die eigentlichen Fähigkeits-Implementierungen (LLM-Stream, RAG,
 * Dateien, Flows) hängen an externen Diensten und werden hier nicht gefahren.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

// Datentopf in einen echten Temp-Ordner umlenken, damit die dateien-Fähigkeit
// gegen das reale Dateisystem (inkl. O_NOFOLLOW/assertFdWithinRoots) läuft.
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'bruecke-daten-'));
process.env.EXTENSIONS_DATA_DIR = TMP_ROOT;

jest.mock('../../src/database', () => ({ query: jest.fn(), transaction: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const db = require('../../src/database');
const brueckeService = require('../../src/services/extensions/brueckeService');
const {
  UnauthorizedError,
  ForbiddenError,
  ServiceUnavailableError,
  ValidationError,
} = require('../../src/utils/errors');

/** Eine Register-Zeile, wie getExtension sie aus der DB liest. */
function extRow(overrides = {}) {
  return {
    id: 'meine-app',
    name: 'Meine App',
    description: '',
    ext_type: 'app',
    access_tier: 'internet',
    version: '1.0.0',
    source: 'built',
    enabled: true,
    manifest: {},
    declared_capabilities: ['llm', 'rag'],
    approved_capabilities: ['llm', 'rag'],
    installed_at: new Date().toISOString(),
    ...overrides,
  };
}

function mockExtension(overrides = {}) {
  db.query.mockResolvedValue({ rows: [extRow(overrides)] });
}

beforeEach(() => {
  jest.clearAllMocks();
  brueckeService._reset();
  delete process.env.EXTENSIONS_BRUECKE_ENABLED;
});

describe('brueckeService — Token ausstellen', () => {
  test('liefert Token, TTL und die wirksamen Fähigkeiten', async () => {
    mockExtension();
    const { token, expiresInMs, faehigkeiten } = await brueckeService.issueToken('meine-app', 1);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);
    expect(expiresInMs).toBe(brueckeService.TOKEN_TTL_MS);
    expect(faehigkeiten.sort()).toEqual(['llm', 'rag']);
  });

  test('wirksam ist NUR der Schnitt deklariert ∩ freigegeben', async () => {
    mockExtension({
      declared_capabilities: ['llm', 'rag', 'flows'],
      approved_capabilities: ['llm', 'dateien'],
    });
    const { faehigkeiten } = await brueckeService.issueToken('meine-app', 1);
    expect(faehigkeiten).toEqual(['llm']);
  });

  test('deaktivierte Erweiterung bekommt token:null statt eines Fehlers (F-02)', async () => {
    mockExtension({ enabled: false });
    // Kein Wurf mehr: eine deaktivierte App ist ein normaler Zustand (z. B.
    // wiederhergestellter Tab) — der frühere 400 erschien als Konsolen-Fehler.
    const res = await brueckeService.issueToken('meine-app', 1);
    expect(res).toEqual({ token: null, enabled: false, expiresInMs: 0, faehigkeiten: [] });
  });

  test('Notaus-Flag EXTENSIONS_BRUECKE_ENABLED=false → 503', async () => {
    process.env.EXTENSIONS_BRUECKE_ENABLED = 'false';
    await expect(brueckeService.issueToken('meine-app', 1)).rejects.toThrow(
      ServiceUnavailableError
    );
  });
});

describe('brueckeService — autorisieren', () => {
  async function frischerToken() {
    mockExtension();
    const { token } = await brueckeService.issueToken('meine-app', 7);
    return token;
  }

  test('gültiger Token + freigegebene Fähigkeit → Erweiterung + userId', async () => {
    const token = await frischerToken();
    const { extension, userId } = await brueckeService.autorisieren('meine-app', token, 'llm');
    expect(extension.id).toBe('meine-app');
    expect(userId).toBe(7);
  });

  test('fehlender Token → 401', async () => {
    mockExtension();
    await expect(brueckeService.autorisieren('meine-app', null, 'llm')).rejects.toThrow(
      UnauthorizedError
    );
  });

  test('unbekannter Token → 401', async () => {
    mockExtension();
    await expect(brueckeService.autorisieren('meine-app', 'quatsch', 'llm')).rejects.toThrow(
      UnauthorizedError
    );
  });

  test('abgelaufener Token → 401 und wird entfernt', async () => {
    const token = await frischerToken();
    brueckeService._internals.tokens.get(token).exp = Date.now() - 1;
    await expect(brueckeService.autorisieren('meine-app', token, 'llm')).rejects.toThrow(
      UnauthorizedError
    );
    expect(brueckeService._internals.tokens.has(token)).toBe(false);
  });

  test('Token einer ANDEREN Erweiterung → 401', async () => {
    const token = await frischerToken();
    await expect(brueckeService.autorisieren('andere-app', token, 'llm')).rejects.toThrow(
      UnauthorizedError
    );
  });

  test('nicht freigegebene Fähigkeit → 403', async () => {
    const token = await frischerToken();
    await expect(brueckeService.autorisieren('meine-app', token, 'flows')).rejects.toThrow(
      ForbiddenError
    );
  });

  test('deklariert, aber nach Update noch nicht freigegeben → 403', async () => {
    const token = await frischerToken();
    // Update deklariert 'flows' neu — Freigabe fehlt noch.
    mockExtension({
      declared_capabilities: ['llm', 'rag', 'flows'],
      approved_capabilities: ['llm', 'rag'],
    });
    await expect(brueckeService.autorisieren('meine-app', token, 'flows')).rejects.toThrow(
      ForbiddenError
    );
  });

  test('inzwischen deaktivierte Erweiterung → 403', async () => {
    const token = await frischerToken();
    mockExtension({ enabled: false });
    await expect(brueckeService.autorisieren('meine-app', token, 'llm')).rejects.toThrow(
      ForbiddenError
    );
  });

  test('Notaus-Flag schaltet auch bestehende Tokens ab (503)', async () => {
    const token = await frischerToken();
    process.env.EXTENSIONS_BRUECKE_ENABLED = 'false';
    await expect(brueckeService.autorisieren('meine-app', token, 'llm')).rejects.toThrow(
      ServiceUnavailableError
    );
  });
});

describe('brueckeService.dateien — eigener Datentopf, symlink-sicher', () => {
  const EXT = 'app-a';
  const FREMD = 'app-b';

  afterAll(async () => {
    await fsp.rm(TMP_ROOT, { recursive: true, force: true });
  });

  test('write dann read im eigenen Topf', async () => {
    const w = await brueckeService.dateien(EXT, {
      aktion: 'write',
      pfad: 'notiz.txt',
      inhalt: 'hallo',
    });
    expect(w).toEqual({ geschrieben: true, pfad: 'notiz.txt' });
    const r = await brueckeService.dateien(EXT, { aktion: 'read', pfad: 'notiz.txt' });
    expect(r.inhalt).toBe('hallo');
  });

  test('list zeigt nur den eigenen Topf', async () => {
    await brueckeService.dateien(FREMD, { aktion: 'write', pfad: 'geheim.txt', inhalt: 'x' });
    const list = await brueckeService.dateien(EXT, { aktion: 'list', pfad: '.' });
    const namen = list.eintraege.map(e => e.name);
    expect(namen).toContain('notiz.txt');
    expect(namen).not.toContain('geheim.txt');
  });

  test('Pfad-Ausbruch mit .. wird abgewiesen (kein Griff in fremden Topf)', async () => {
    await expect(
      brueckeService.dateien(EXT, { aktion: 'read', pfad: `../${FREMD}/geheim.txt` })
    ).rejects.toThrow();
  });

  test('absoluter Pfad wird abgewiesen', async () => {
    await expect(
      brueckeService.dateien(EXT, { aktion: 'read', pfad: '/etc/passwd' })
    ).rejects.toThrow();
  });

  test('Symlink aus dem Topf heraus wird beim Lesen abgewiesen', async () => {
    const wurzel = path.join(TMP_ROOT, EXT);
    await fsp.mkdir(wurzel, { recursive: true });
    const linkPfad = path.join(wurzel, 'raus.txt');
    await fsp.rm(linkPfad, { force: true });
    await fsp.symlink('/etc/hostname', linkPfad);
    await expect(
      brueckeService.dateien(EXT, { aktion: 'read', pfad: 'raus.txt' })
    ).rejects.toThrow();
  });

  test('unbekannte aktion → Validierungsfehler', async () => {
    await expect(brueckeService.dateien(EXT, { aktion: 'delete' })).rejects.toThrow(
      ValidationError
    );
  });
});
