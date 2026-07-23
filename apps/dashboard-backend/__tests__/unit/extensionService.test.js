/**
 * Erweiterungs-Register (Plan 012 Phase E · Schritt 16).
 *
 * Der Fokus liegt auf den Grenzen, nicht auf dem Glücksfall:
 *  - `buildFromSandbox` darf NIEMALS aus dem Sandbox-Ordner ausbrechen.
 *  - Ein unbekannter Slug/eine unbekannte Id endet als sauberer Fehler.
 *  - Die DB-Zeile wird verlustfrei auf die API-Form abgebildet.
 */

const path = require('path');

jest.mock('../../src/database', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));

const db = require('../../src/database');
const extensionService = require('../../src/services/extensions/extensionService');
const { SANDBOX_DATA_DIR } = require('../../src/services/sandbox/sandboxShared');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('buildFromSandbox — Ausbruchsschutz', () => {
  it.each([
    ['../..', 'Elternordner'],
    ['../andere-sandbox', 'Nachbar-Sandbox'],
    ['unter/../../raus', 'Umweg über einen Unterordner'],
  ])('weist "%s" ab (%s)', async subfolder => {
    await expect(
      extensionService.buildFromSandbox({ slug: 'werkstatt', subfolder, userId: 1 })
    ).rejects.toThrow(/innerhalb der Sandbox/i);
    // Kein DB-Schreibzugriff, wenn der Pfad nicht passt.
    expect(db.query).not.toHaveBeenCalled();
  });

  it('weist einen unsauberen Slug ab', async () => {
    await expect(
      extensionService.buildFromSandbox({ slug: '../etc', subfolder: '.', userId: 1 })
    ).rejects.toThrow(/Slug/i);
  });

  it('meldet einen nicht existierenden Unterordner als NotFound', async () => {
    await expect(
      extensionService.buildFromSandbox({
        slug: 'werkstatt',
        subfolder: 'gibt-es-nicht',
        userId: 1,
      })
    ).rejects.toThrow(/existiert/i);
  });

  it('der geprüfte Pfad liegt unter dem Sandbox-Ordner', () => {
    // Dokumentiert die Basis, gegen die geprüft wird — ändert sie sich,
    // muss der Ausbruchsschutz erneut betrachtet werden.
    const base = path.join(SANDBOX_DATA_DIR, 'werkstatt');
    expect(path.resolve(base, '.')).toBe(base);
    expect(path.resolve(base, '../raus').startsWith(base + path.sep)).toBe(false);
  });
});

describe('getExtension', () => {
  it('wirft NotFound, wenn die Erweiterung nicht registriert ist', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(extensionService.getExtension('fehlt')).rejects.toThrow(/nicht installiert/i);
  });

  it('weist eine unsaubere Id ab, bevor die DB gefragt wird', async () => {
    await expect(extensionService.getExtension('../etc')).rejects.toThrow();
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('listExtensions — Abbildung auf die API-Form', () => {
  it('übersetzt Spaltennamen und normalisiert enabled', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'mein-tool',
          name: 'Mein Tool',
          description: 'tut was',
          ext_type: 'tool',
          access_tier: 'internet',
          version: '0.2.0',
          source: 'built',
          enabled: true,
          manifest: { entry: 'tool.mjs' },
          installed_at: '2026-07-23T10:00:00.000Z',
          package_path: '/arasul/extensions/mein-tool',
        },
      ],
    });

    const [ext] = await extensionService.listExtensions();
    expect(ext).toEqual({
      id: 'mein-tool',
      name: 'Mein Tool',
      description: 'tut was',
      type: 'tool',
      accessTier: 'internet',
      version: '0.2.0',
      source: 'built',
      enabled: true,
      manifest: { entry: 'tool.mjs' },
      installedAt: '2026-07-23T10:00:00.000Z',
    });
    // Interne Pfade gehören nicht in die API-Antwort.
    expect(ext).not.toHaveProperty('package_path');
  });
});
