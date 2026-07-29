/**
 * Werkstatt-Watcher — „Automatisch live" (2026-07-29).
 *
 * Getestet wird die Takt-Logik mit echten Ordnern (tmp) und injizierten
 * Abhängigkeiten (db + extensionService): neu → registrieren, unverändert →
 * Ruhe, geändert → aktualisieren, kaputt → genau EINE Warnung, und `enabled`
 * wird nie angefasst.
 */

const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const werkstattWatcher = require('../../src/services/extensions/werkstattWatcher');
const logger = require('../../src/utils/logger');
const { ValidationError } = require('../../src/utils/errors');

describe('werkstattWatcher', () => {
  let baseDir;
  let db;
  let extensionService;

  const manifest = (id, extra = {}) =>
    JSON.stringify({ id, name: `Ext ${id}`, type: 'app', entry: 'index.html', ...extra });

  async function legeWerkstattAn(slug, ordner = {}) {
    const dir = path.join(baseDir, slug);
    await fsp.mkdir(dir, { recursive: true });
    for (const [sub, dateien] of Object.entries(ordner)) {
      const subDir = sub === '.' ? dir : path.join(dir, sub);
      await fsp.mkdir(subDir, { recursive: true });
      for (const [name, inhalt] of Object.entries(dateien)) {
        await fsp.writeFile(path.join(subDir, name), inhalt);
      }
    }
    return dir;
  }

  beforeEach(async () => {
    baseDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'werkstatt-watcher-'));
    db = {
      query: jest.fn().mockResolvedValue({ rows: [{ slug: 'meine-werkstatt' }] }),
    };
    extensionService = {
      buildFromSandbox: jest
        .fn()
        .mockImplementation(async ({ slug, subfolder }) =>
          ({ id: `${slug}-${subfolder}`.replace(/[^a-z0-9-]/g, ''), version: '0.1.0' })
        ),
      setEnabled: jest.fn(),
    };
    werkstattWatcher.stoppe(); // Merkzettel leeren
  });

  afterEach(async () => {
    werkstattWatcher.stoppe();
    await fsp.rm(baseDir, { recursive: true, force: true });
  });

  const scanne = () => werkstattWatcher.scanne({ db, extensionService, baseDir });

  it('registriert einen neuen Unterordner mit manifest.json über buildFromSandbox (overwrite, ohne enabled)', async () => {
    await legeWerkstattAn('meine-werkstatt', {
      'meine-app': { 'manifest.json': manifest('meine-app'), 'index.html': '<h1>Hi</h1>' },
    });

    const stats = await scanne();

    expect(stats.registriert).toBe(1);
    expect(extensionService.buildFromSandbox).toHaveBeenCalledTimes(1);
    expect(extensionService.buildFromSandbox).toHaveBeenCalledWith({
      slug: 'meine-werkstatt',
      subfolder: 'meine-app',
      overwrite: true,
      userId: null,
    });
    // enabled wird NIE automatisch gesetzt.
    expect(extensionService.setEnabled).not.toHaveBeenCalled();
  });

  it('registriert die Werkstatt-Wurzel selbst, wenn dort eine manifest.json liegt', async () => {
    await legeWerkstattAn('meine-werkstatt', {
      '.': { 'manifest.json': manifest('wurzel-app'), 'index.html': '<h1>Wurzel</h1>' },
    });

    const stats = await scanne();

    expect(stats.registriert).toBe(1);
    expect(extensionService.buildFromSandbox).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'meine-werkstatt', subfolder: '.' })
    );
  });

  it('ruft bei unverändertem Ordner NICHT erneut auf', async () => {
    await legeWerkstattAn('meine-werkstatt', {
      'meine-app': { 'manifest.json': manifest('meine-app'), 'index.html': '<h1>Hi</h1>' },
    });

    await scanne();
    const stats2 = await scanne();

    expect(extensionService.buildFromSandbox).toHaveBeenCalledTimes(1);
    expect(stats2.registriert).toBe(0);
    expect(stats2.unveraendert).toBe(1);
  });

  it('aktualisiert bei geänderten Dateien (Asset-Änderung reicht)', async () => {
    const dir = await legeWerkstattAn('meine-werkstatt', {
      'meine-app': { 'manifest.json': manifest('meine-app'), 'index.html': '<h1>Alt</h1>' },
    });

    await scanne();
    await fsp.writeFile(
      path.join(dir, 'meine-app', 'index.html'),
      '<h1>Neu — deutlich länger als vorher</h1>'
    );
    const stats2 = await scanne();

    expect(extensionService.buildFromSandbox).toHaveBeenCalledTimes(2);
    expect(stats2.registriert).toBe(1);
  });

  it('warnt bei kaputtem Manifest genau EINMAL und probiert erst nach einer Änderung erneut', async () => {
    const dir = await legeWerkstattAn('meine-werkstatt', {
      kaputt: { 'manifest.json': '{ kein json' },
    });
    extensionService.buildFromSandbox.mockRejectedValue(
      new ValidationError('manifest.json ist kein gültiges JSON')
    );
    const warnSpy = jest.spyOn(logger, 'warn');

    const stats1 = await scanne();
    const stats2 = await scanne();

    expect(stats1.fehler).toBe(1);
    expect(stats2.fehler).toBe(0);
    expect(stats2.unveraendert).toBe(1);
    const warnungen = warnSpy.mock.calls.filter(c => String(c[0]).includes('kaputt'));
    expect(warnungen).toHaveLength(1);

    // Nach einer Änderung wird erneut versucht (und wieder genau einmal gewarnt).
    await fsp.writeFile(path.join(dir, 'kaputt', 'manifest.json'), '{ immer noch kein json');
    await scanne();
    expect(extensionService.buildFromSandbox).toHaveBeenCalledTimes(2);
  });

  it('ignoriert Unterordner ohne manifest.json und versteckte Ordner', async () => {
    await legeWerkstattAn('meine-werkstatt', {
      notizen: { 'README.md': 'kein Paket' },
      '.git': { 'manifest.json': manifest('geist') },
    });

    const stats = await scanne();

    expect(stats.registriert).toBe(0);
    expect(extensionService.buildFromSandbox).not.toHaveBeenCalled();
  });

  it('übersteht eine fehlende Werkstatt auf der Platte ohne Fehler', async () => {
    db.query.mockResolvedValue({ rows: [{ slug: 'noch-nicht-da' }] });

    const stats = await scanne();

    expect(stats).toEqual({ registriert: 0, unveraendert: 0, fehler: 0 });
  });

  it('fragt nur aktive Erweiterungs-Werkstätten aus der Datenbank ab', async () => {
    await scanne();
    const sql = db.query.mock.calls[0][0];
    expect(sql).toMatch(/workspace_type = 'erweiterungs-werkstatt'/);
    expect(sql).toMatch(/status = 'active'/);
  });
});
