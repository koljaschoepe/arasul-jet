/**
 * Das Paket, mit dem eine App auf das Geraet kommt (Phase C5).
 *
 * Gemessen wird vor allem das, was ein Paket NICHT darf. Ein Deploy-Endpunkt
 * ist die Stelle, an der ein Fremder Dateien auf ein Geraet legt, das fuenf
 * Jahre unbeaufsichtigt laufen soll; jede dieser Pruefungen steht fuer einen
 * Weg, auf dem er sonst mehr ablegen koennte, als er darf.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const tar = require('tar');

const APPS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-paket-'));
process.env.APPS_DIR = APPS_DIR;

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/services/app/appContainer', () => ({
  baueImage: jest.fn().mockResolvedValue('probeapp:1.0.0'),
}));
jest.mock('../../src/services/app/appStore', () => ({
  staendeVon: jest.fn().mockResolvedValue({ test: null, live: null }),
  spieleEin: jest.fn(async ({ appId, version, stand }) => ({
    app_id: appId,
    version,
    stand,
    vorige_version: null,
  })),
}));

const appPaket = require('../../src/services/app/appPaket');
const appStore = require('../../src/services/app/appStore');
const appContainer = require('../../src/services/app/appContainer');
const { AppManifest } = require('../../src/schemas/apps');

const WERKSTATT = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-paket-bau-'));

// Durch das Schema und nicht von Hand: `pruefePaketInhalt` bekommt im Betrieb
// immer ein GEPRUEFTES Manifest, in dem die Vorgaben schon eingesetzt sind
// (`bauen.dockerfile` = "Dockerfile"). Ein Objektliteral daneben waere ein
// zweites Manifest mit anderen Regeln.
const MANIFEST = AppManifest.parse({
  schema: 1,
  id: 'probeapp',
  name: 'Probeapp',
  version: '1.0.0',
  frontend: { verzeichnis: 'frontend' },
  backend: { image: 'probeapp:1.0.0', bauen: { verzeichnis: 'backend' } },
  ports: { backend: 8080 },
});

/** Einen Paketordner bauen und als `.tgz` packen. Gibt den Archivpfad zurueck. */
function packe(name, aufbau) {
  const ordner = path.join(WERKSTATT, name);
  fs.rmSync(ordner, { recursive: true, force: true });
  fs.mkdirSync(ordner, { recursive: true });
  aufbau(ordner);
  const archiv = path.join(WERKSTATT, `${name}.tgz`);
  tar.c({ sync: true, gzip: true, file: archiv, cwd: ordner }, ['.']);
  return archiv;
}

/** Der Normalfall: Manifest, Frontend mit index.html, Backend mit Dockerfile. */
function vollstaendig(ordner, manifest = MANIFEST) {
  fs.writeFileSync(path.join(ordner, 'app.json'), JSON.stringify(manifest, null, 2));
  fs.mkdirSync(path.join(ordner, 'frontend'), { recursive: true });
  fs.writeFileSync(path.join(ordner, 'frontend', 'index.html'), '<h1>hallo</h1>');
  fs.mkdirSync(path.join(ordner, 'backend'), { recursive: true });
  fs.writeFileSync(path.join(ordner, 'backend', 'Dockerfile'), 'FROM node:22-alpine\n');
}

afterAll(() => {
  fs.rmSync(APPS_DIR, { recursive: true, force: true });
  fs.rmSync(WERKSTATT, { recursive: true, force: true });
});

beforeEach(() => {
  jest.clearAllMocks();
  appStore.staendeVon.mockResolvedValue({ test: null, live: null });
  appStore.spieleEin.mockImplementation(async ({ appId, version, stand }) => ({
    app_id: appId,
    version,
    stand,
    vorige_version: null,
  }));
});

describe('entpacke: was ein Paket nicht enthalten darf', () => {
  const ziel = () => fs.mkdtempSync(path.join(WERKSTATT, 'aus-'));

  it('weist einen Symlink ab, statt ihn still zu ueberspringen', async () => {
    const archiv = packe('mit-symlink', ordner => {
      vollstaendig(ordner);
      fs.symlinkSync('/etc/hostname', path.join(ordner, 'frontend', 'geheim'));
    });
    await expect(appPaket.entpacke(archiv, ziel())).rejects.toThrow(/nicht enthalten darf/i);
  });

  it('weist einen Hardlink ab', async () => {
    const archiv = packe('mit-hardlink', ordner => {
      vollstaendig(ordner);
      fs.linkSync(path.join(ordner, 'app.json'), path.join(ordner, 'zweitname.json'));
    });
    await expect(appPaket.entpacke(archiv, ziel())).rejects.toThrow(/nicht enthalten darf/i);
  });

  it('nimmt Dateien und Ordner und zaehlt, was ankommt', async () => {
    const archiv = packe('sauber', vollstaendig);
    const aus = ziel();
    const mass = await appPaket.entpacke(archiv, aus);
    expect(mass.eintraege).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(aus, 'app.json'))).toBe(true);
    expect(fs.existsSync(path.join(aus, 'frontend', 'index.html'))).toBe(true);
  });

  it('legt nichts ausserhalb des Zielordners ab, auch nicht bei ../', async () => {
    // Das Archiv wird von Hand gebaut, weil `tar.c` einen solchen Pfad gar
    // nicht erst erzeugen wuerde.
    const archiv = path.join(WERKSTATT, 'ausbruch.tgz');
    const quelle = path.join(WERKSTATT, 'ausbruch-quelle');
    fs.rmSync(quelle, { recursive: true, force: true });
    fs.mkdirSync(quelle, { recursive: true });
    fs.writeFileSync(path.join(quelle, 'boese.txt'), 'nicht hierher');
    tar.c(
      {
        sync: true,
        gzip: true,
        file: archiv,
        cwd: quelle,
        prefix: '../../ausbruch',
      },
      ['boese.txt']
    );
    const aus = ziel();
    // Entweder abgewiesen oder entschaerft -- beides ist richtig, solange die
    // Datei nicht ueber dem Zielordner landet.
    await appPaket.entpacke(archiv, aus).catch(() => {});
    expect(fs.existsSync(path.join(aus, '..', '..', 'ausbruch'))).toBe(false);
  });
});

describe('leseManifestAusPaket', () => {
  it('sagt, was zu tun ist, wenn app.json nicht im Wurzelverzeichnis liegt', async () => {
    const ordner = path.join(WERKSTATT, 'verschachtelt');
    fs.rmSync(ordner, { recursive: true, force: true });
    fs.mkdirSync(path.join(ordner, 'meineapp'), { recursive: true });
    fs.writeFileSync(path.join(ordner, 'meineapp', 'app.json'), '{}');
    await expect(appPaket.leseManifestAusPaket(ordner)).rejects.toThrow(/-C <ordner> \./);
  });

  it('weist ein unbekanntes Feld ab', async () => {
    const ordner = path.join(WERKSTATT, 'tippfehler');
    fs.rmSync(ordner, { recursive: true, force: true });
    fs.mkdirSync(ordner, { recursive: true });
    fs.writeFileSync(
      path.join(ordner, 'app.json'),
      JSON.stringify({ ...MANIFEST, frontends: { verzeichnis: 'dist' } })
    );
    await expect(appPaket.leseManifestAusPaket(ordner)).rejects.toThrow();
  });
});

describe('pruefePaketInhalt', () => {
  it('verlangt einen Bauplan, wenn das Manifest ein Backend nennt', async () => {
    const ordner = path.join(WERKSTATT, 'ohne-bauen');
    fs.rmSync(ordner, { recursive: true, force: true });
    fs.mkdirSync(path.join(ordner, 'frontend'), { recursive: true });
    fs.writeFileSync(path.join(ordner, 'frontend', 'index.html'), 'x');
    const ohneBauen = { ...MANIFEST, backend: { image: 'probeapp:1.0.0' } };
    await expect(appPaket.pruefePaketInhalt(ohneBauen, ordner)).rejects.toThrow(
      /backend\.bauen.*fehlt/i
    );
  });

  it('verlangt das Dockerfile, das das Manifest nennt', async () => {
    const ordner = path.join(WERKSTATT, 'ohne-dockerfile');
    fs.rmSync(ordner, { recursive: true, force: true });
    fs.mkdirSync(path.join(ordner, 'frontend'), { recursive: true });
    fs.writeFileSync(path.join(ordner, 'frontend', 'index.html'), 'x');
    await expect(appPaket.pruefePaketInhalt(MANIFEST, ordner)).rejects.toThrow(/Bauplan/);
  });

  it('verlangt die index.html, wenn das Manifest ein Frontend verspricht', async () => {
    const ordner = path.join(WERKSTATT, 'ohne-index');
    fs.rmSync(ordner, { recursive: true, force: true });
    fs.mkdirSync(ordner, { recursive: true });
    await expect(appPaket.pruefePaketInhalt(MANIFEST, ordner)).rejects.toThrow(/index\.html/);
  });
});

describe('nimmAn', () => {
  it('legt die Version ab und rollt in den Teststand -- immer', async () => {
    const archiv = packe('annahme', vollstaendig);
    const kopie = path.join(WERKSTATT, 'annahme-kopie.tgz');
    fs.copyFileSync(archiv, kopie);

    const stand = await appPaket.nimmAn({ archivPfad: kopie, durch: 7 });

    expect(stand.stand).toBe('test');
    expect(appStore.spieleEin).toHaveBeenCalledWith(
      expect.objectContaining({ appId: 'probeapp', version: '1.0.0', stand: 'test', durch: 7 })
    );
    const ziel = path.join(APPS_DIR, 'probeapp', '1.0.0');
    expect(fs.existsSync(path.join(ziel, 'app.json'))).toBe(true);
    expect(fs.existsSync(path.join(ziel, 'backend', 'Dockerfile'))).toBe(true);
    // Das Archiv gehoert danach niemandem mehr.
    expect(fs.existsSync(kopie)).toBe(false);
    // Gebaut wird IMMER und aus dem EINGANG, nicht aus dem Zielordner: ein
    // Bau, der scheitert, soll nichts hinterlassen.
    expect(appContainer.baueImage).toHaveBeenCalledTimes(1);
    const kontext = appContainer.baueImage.mock.calls[0][1];
    expect(kontext.startsWith(appPaket.eingangsOrdner())).toBe(true);
    expect(kontext.endsWith(path.join('backend'))).toBe(true);
  });

  it('ueberschreibt keine Version, die gerade live ist', async () => {
    appStore.staendeVon.mockResolvedValue({ test: null, live: { version: '1.0.0' } });
    const archiv = packe('live-schutz', vollstaendig);
    const kopie = path.join(WERKSTATT, 'live-schutz-kopie.tgz');
    fs.copyFileSync(archiv, kopie);

    await expect(appPaket.nimmAn({ archivPfad: kopie, durch: null })).rejects.toThrow(
      /neue Versionsnummer/
    );
    expect(appStore.spieleEin).not.toHaveBeenCalled();
    expect(appContainer.baueImage).not.toHaveBeenCalled();
  });

  it('laesst nach einem Fehlschlag nichts im Eingang liegen', async () => {
    const archiv = packe('kaputt', ordner => {
      fs.writeFileSync(path.join(ordner, 'irgendwas.txt'), 'kein Manifest');
    });
    const kopie = path.join(WERKSTATT, 'kaputt-kopie.tgz');
    fs.copyFileSync(archiv, kopie);

    await expect(appPaket.nimmAn({ archivPfad: kopie, durch: null })).rejects.toThrow();
    const eingang = appPaket.eingangsOrdner();
    const reste = fs.existsSync(eingang) ? fs.readdirSync(eingang) : [];
    expect(reste).toEqual([]);
    expect(fs.existsSync(kopie)).toBe(false);
  });
});
