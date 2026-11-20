/**
 * Der App-Standard ist Pflicht (J45, M7): ein Test je Grund, aus dem das
 * Geraet ein Paket abweist.
 *
 * Die Codes und ihre Reihenfolge stehen im Formatblatt des Kits
 * (`.ara/knowledge/nachweis.de.md`, Abschnitt „Was die Prüfung im Gerät
 * ansieht"). Der Nachweis wird mit `helpers/nachweis.js` gebaut, das das
 * Blatt eigenstaendig rechnet, nicht mit den Bausteinen des Geraets.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const tar = require('tar');

const APPS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-standard-'));
process.env.APPS_DIR = APPS_DIR;

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/services/app/appContainer', () => ({
  baueImage: jest.fn().mockResolvedValue('probe:1.0.0'),
}));
jest.mock('../../src/services/app/appStore', () => ({
  staendeVon: jest.fn().mockResolvedValue({ test: null, live: null }),
  pruefeAppGrenze: jest.fn().mockResolvedValue(undefined),
  spieleEin: jest.fn(async ({ appId, version, stand }) => ({ app_id: appId, version, stand })),
}));

const appStandard = require('../../src/services/app/appStandard');
const appPaket = require('../../src/services/app/appPaket');
const appContainer = require('../../src/services/app/appContainer');
const appStore = require('../../src/services/app/appStore');
const { ValidationError } = require('../../src/utils/errors');
const { stemple } = require('../helpers/nachweis');

const WERKSTATT = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-standard-bau-'));

const MANIFEST = {
  schema: 1,
  id: 'probe',
  name: 'Probe',
  version: '1.0.0',
  marken: '5',
  frontend: { verzeichnis: 'frontend' },
};

let zaehler = 0;

/** Ein Paketordner mit Manifest und Frontend, auf Wunsch mit Nachweis. */
function paket({ manifest = MANIFEST, nachweis = {}, ohneNachweis = false, nachher = null } = {}) {
  zaehler += 1;
  const ordner = path.join(WERKSTATT, `p${zaehler}`);
  fs.mkdirSync(path.join(ordner, 'frontend', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(ordner, 'app.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(ordner, 'frontend', 'index.html'), '<h1>Probe</h1>');
  fs.writeFileSync(path.join(ordner, 'frontend', 'assets', 'a.js'), 'export {};');
  if (!ohneNachweis) stemple(ordner, nachweis);
  if (nachher) nachher(ordner);
  return ordner;
}

const codes = async (ordner, manifest = MANIFEST) =>
  (await appStandard.pruefe(ordner, manifest)).funde.map(f => f.code);

beforeEach(() => {
  appStandard._setzeGeraetFassung('5.6.1');
  jest.clearAllMocks();
});

afterAll(() => {
  fs.rmSync(APPS_DIR, { recursive: true, force: true });
  fs.rmSync(WERKSTATT, { recursive: true, force: true });
});

describe('ein Paket aus dem Kit-Ablauf', () => {
  it('erfüllt den Standard', async () => {
    const urteil = await appStandard.pruefe(paket(), MANIFEST);
    expect(urteil).toEqual({ erfuellt: true, ausgenommen: false, funde: [] });
  });

  it('besteht auch mit einer Kopie der Bibliothek derselben Hauptzahl', async () => {
    const manifest = { ...MANIFEST, marken: '5.2.0' };
    expect(await codes(paket({ manifest }), manifest)).toEqual([]);
  });

  it('zählt ._-Dateien und .DS_Store nicht mit (macOS legt sie beim Packen dazu)', async () => {
    const ordner = paket({
      nachher: o => {
        fs.writeFileSync(path.join(o, '.DS_Store'), 'x');
        fs.writeFileSync(path.join(o, 'frontend', '._index.html'), 'x');
      },
    });
    expect(await codes(ordner)).toEqual([]);
  });

  it('zählt node_modules nicht mit', async () => {
    const ordner = paket({
      nachher: o => {
        fs.mkdirSync(path.join(o, 'frontend', 'node_modules'), { recursive: true });
        fs.writeFileSync(path.join(o, 'frontend', 'node_modules', 'x.js'), 'x');
      },
    });
    expect(await codes(ordner)).toEqual([]);
  });
});

describe('(a) die Bibliothek', () => {
  it('bibliothek-fehlt: eine App mit Oberfläche nennt keine Fassung', async () => {
    const manifest = { ...MANIFEST, marken: undefined };
    expect(await codes(paket({ manifest }), manifest)).toContain('bibliothek-fehlt');
  });

  it('bibliothek-alt: eine Hauptzahl, die das Gerät nicht mehr trägt', async () => {
    const manifest = { ...MANIFEST, marken: '4' };
    const funde = (await appStandard.pruefe(paket({ manifest }), manifest)).funde;
    expect(funde.map(f => f.code)).toEqual(['bibliothek-alt']);
    expect(funde[0].text).toMatch(/Hauptzahl 5/);
  });

  it('bibliothek-alt auch für eine alte Kopie (4.9.0)', async () => {
    const manifest = { ...MANIFEST, marken: '4.9.0' };
    expect(await codes(paket({ manifest }), manifest)).toEqual(['bibliothek-alt']);
  });
});

describe('(b) und (c) der Nachweis, in der Reihenfolge des Blatts', () => {
  it('fehlt', async () => {
    expect(await codes(paket({ ohneNachweis: true }))).toEqual(['fehlt']);
  });

  it('unlesbar: kein JSON', async () => {
    const ordner = paket({
      nachher: o => fs.writeFileSync(path.join(o, 'nachweis.json'), '{ kaputt'),
    });
    expect(await codes(ordner)).toEqual(['unlesbar']);
  });

  it('unlesbar: JSON, aber kein Objekt', async () => {
    const ordner = paket({ nachher: o => fs.writeFileSync(path.join(o, 'nachweis.json'), '[]') });
    expect(await codes(ordner)).toEqual(['unlesbar']);
  });

  it('schema: eine fremde Nummer wird nicht geraten', async () => {
    const ordner = paket({ nachweis: { aendere: d => (d.schema = 2) } });
    expect(await codes(ordner)).toEqual(['schema']);
  });

  it('siegel: die Datei wurde von Hand geändert', async () => {
    const ordner = paket({
      nachweis: { aendere: d => (d.kit.version = '9.9.9'), siegeln: false },
    });
    expect(await codes(ordner)).toEqual(['siegel']);
  });

  it('kennung: der Nachweis gehört zu einer anderen App', async () => {
    const ordner = paket({ nachweis: { aendere: d => (d.app = 'andere') } });
    expect(await codes(ordner)).toEqual(['kennung']);
  });

  it('version: der Nachweis stammt aus einem früheren Bau', async () => {
    const ordner = paket({ nachweis: { aendere: d => (d.version = '0.9.0') } });
    expect(await codes(ordner)).toEqual(['version']);
  });

  it('paket-fehlt: keine Prüfsumme des Pakets', async () => {
    const ordner = paket({ nachweis: { aendere: d => delete d.inhalt.paket } });
    expect(await codes(ordner)).toEqual(['paket-fehlt']);
  });

  it('paket-geaendert: eine Datei nach dem Bau geändert', async () => {
    const ordner = paket({
      nachher: o => fs.writeFileSync(path.join(o, 'frontend', 'index.html'), '<h1>anders</h1>'),
    });
    expect(await codes(ordner)).toEqual(['paket-geaendert']);
  });

  it('paket-geaendert: eine Datei nach dem Bau dazugelegt', async () => {
    const ordner = paket({
      nachher: o => fs.writeFileSync(path.join(o, 'frontend', 'neu.js'), 'x'),
    });
    expect(await codes(ordner)).toEqual(['paket-geaendert']);
  });

  it('schritt-fehlt: eine Vorführung ohne Plan (kein interview)', async () => {
    const ordner = paket({
      nachweis: { aendere: d => (d.schritte = d.schritte.filter(s => s.name !== 'interview')) },
    });
    const funde = (await appStandard.pruefe(ordner, MANIFEST)).funde;
    expect(funde.map(f => f.code)).toEqual(['schritt-fehlt']);
    expect(funde[0].text).toMatch(/interview/);
  });

  it('reihenfolge: die Zeiten fallen', async () => {
    const ordner = paket({
      nachweis: { aendere: d => (d.schritte[1].zeit = '2026-11-19T00:00:00.000Z') },
    });
    expect(await codes(ordner)).toEqual(['reihenfolge']);
  });

  it('tests-fehlen: keine Testdatei', async () => {
    const ordner = paket({
      nachweis: { aendere: d => (d.tests = { vorhanden: false, dateien: 0, faelle: 0 }) },
    });
    expect(await codes(ordner)).toEqual(['tests-fehlen']);
  });

  it('tests-fehlen: eine Testdatei, aber kein Fall gezählt', async () => {
    const ordner = paket({ nachweis: { aendere: d => (d.tests.faelle = 0) } });
    expect(await codes(ordner)).toEqual(['tests-fehlen']);
  });

  it('tests-fehlen: kein Feld tests', async () => {
    const ordner = paket({ nachweis: { aendere: d => delete d.tests } });
    expect(await codes(ordner)).toEqual(['tests-fehlen']);
  });

  it('tests-rot', async () => {
    const ordner = paket({ nachweis: { aendere: d => (d.tests.lauf.gruen = false) } });
    expect(await codes(ordner)).toEqual(['tests-rot']);
  });

  it('tests-veraltet: die Tests liefen gegen einen anderen Stand', async () => {
    const ordner = paket({
      nachweis: { aendere: d => (d.tests.lauf.quelle = `sha256:${'b'.repeat(64)}`) },
    });
    expect(await codes(ordner)).toEqual(['tests-veraltet']);
  });

  it('bau-veraltet: nach einer Änderung nur --test gelaufen', async () => {
    const ordner = paket({
      nachweis: { aendere: d => (d.schritte[1].quelle = `sha256:${'c'.repeat(64)}`) },
    });
    expect(await codes(ordner)).toEqual(['bau-veraltet']);
  });

  it('bibliothek: der Nachweis nennt eine andere Fassung als das Manifest', async () => {
    const ordner = paket({ nachweis: { aendere: d => (d.bibliothek.marken = '4') } });
    expect(await codes(ordner)).toEqual(['bibliothek']);
  });

  it('bibliothek: der Nachweis nennt gar keine', async () => {
    const ordner = paket({ nachweis: { aendere: d => delete d.bibliothek } });
    expect(await codes(ordner)).toEqual(['bibliothek']);
  });

  it('ein Nachweis aus einer anderen App kopiert: kennung und paket-geaendert', async () => {
    const quelle = paket();
    const ziel = paket({
      manifest: { ...MANIFEST, id: 'andere' },
      ohneNachweis: true,
      nachher: o => fs.copyFileSync(path.join(quelle, 'nachweis.json'), path.join(o, 'nachweis.json')),
    });
    const gefunden = await codes(ziel, { ...MANIFEST, id: 'andere' });
    expect(gefunden).toEqual(expect.arrayContaining(['kennung', 'paket-geaendert']));
  });

  it('nennt mehrere Gründe zugleich, in der Reihenfolge des Blatts', async () => {
    const ordner = paket({
      nachweis: {
        aendere: d => {
          d.version = '0.1.0';
          d.tests.lauf.gruen = false;
        },
      },
    });
    expect(await codes(ordner)).toEqual(['version', 'tests-rot']);
  });
});

describe('Ausnahmen', () => {
  it('das Entwickler-Cockpit ist als mitgelieferte App ausgenommen', async () => {
    const manifest = { ...MANIFEST, id: 'entwickler-cockpit' };
    const urteil = await appStandard.pruefe(paket({ manifest, ohneNachweis: true }), manifest);
    expect(urteil).toEqual({ erfuellt: true, ausgenommen: true, funde: [] });
  });

  it('ein fremder Container (kein Frontend, fertiges Image) wird abgewiesen', async () => {
    const manifest = {
      schema: 1,
      id: 'fremd',
      name: 'Fremd',
      version: '1.0.0',
      backend: { image: 'nginx:alpine' },
      ports: { backend: 80 },
    };
    expect(await codes(paket({ manifest, ohneNachweis: true }), manifest)).toEqual([
      'fremder-container',
    ]);
  });

  it('es gibt keinen Schalter: verlange nimmt nur Ordner und Manifest', () => {
    expect(appStandard.verlange.length).toBe(2);
    expect(Object.keys(appStandard).some(k => /umgeh|ueberspring|skip|bypass/i.test(k))).toBe(
      false
    );
  });
});

describe('beim Ausrollen (nimmAn)', () => {
  /** Das Paket als Archiv, wie es an POST /api/v1/external/apps kommt. */
  function archiv(ordner) {
    const datei = path.join(WERKSTATT, `${path.basename(ordner)}.tgz`);
    tar.c({ sync: true, gzip: true, file: datei, cwd: ordner }, ['.']);
    return datei;
  }

  it('weist ab, mit einem deutschen Satz je Grund und den Codes daneben, BEVOR es baut', async () => {
    const manifest = { ...MANIFEST, marken: undefined };
    const ordner = paket({ manifest, nachweis: { aendere: d => (d.tests.lauf.gruen = false) } });
    const fehler = await appPaket
      .nimmAn({ archivPfad: archiv(ordner), durch: null })
      .catch(err => err);

    expect(fehler).toBeInstanceOf(ValidationError);
    expect(fehler.message).toMatch(/erfüllt den App-Standard nicht/);
    expect(fehler.message).toMatch(/- Die App nennt in app.json unter `marken` keine Fassung/);
    expect(fehler.message).toMatch(/- Der letzte Testlauf war nicht grün\./);
    expect(fehler.details.standard).toEqual(['bibliothek-fehlt', 'tests-rot']);
    expect(appStore.pruefeAppGrenze).not.toHaveBeenCalled();
    expect(appContainer.baueImage).not.toHaveBeenCalled();
    expect(appStore.spieleEin).not.toHaveBeenCalled();
    expect(fs.readdirSync(appPaket.eingangsOrdner())).toEqual([]);
  });

  it('nimmt ein Paket mit gültigem Nachweis an', async () => {
    const stand = await appPaket.nimmAn({ archivPfad: archiv(paket()), durch: 1 });
    expect(stand.stand).toBe('test');
    expect(fs.existsSync(path.join(APPS_DIR, 'probe', '1.0.0', 'nachweis.json'))).toBe(true);
  });
});

describe('befund: für Stände, die schon am Gerät liegen', () => {
  it('weist nichts ab, sagt aber, was fehlt', async () => {
    const urteil = await appStandard.befund(paket({ ohneNachweis: true }), MANIFEST);
    expect(urteil.erfuellt).toBe(false);
    expect(urteil.funde.map(f => f.code)).toEqual(['fehlt']);
  });

  it('merkt sich das Urteil je Ordner, bis vergiss es löscht', async () => {
    const ordner = paket();
    expect((await appStandard.befund(ordner, MANIFEST)).erfuellt).toBe(true);
    fs.writeFileSync(path.join(ordner, 'frontend', 'index.html'), 'anders');
    expect((await appStandard.befund(ordner, MANIFEST)).erfuellt).toBe(true);
    appStandard.vergiss(ordner);
    expect((await appStandard.befund(ordner, MANIFEST)).funde.map(f => f.code)).toEqual([
      'paket-geaendert',
    ]);
  });

  it('ein fehlender Ordner wird zum Fund, nicht zum Absturz', async () => {
    const urteil = await appStandard.befund(path.join(WERKSTATT, 'gibt-es-nicht'), MANIFEST);
    expect(urteil.erfuellt).toBe(false);
  });
});

describe('die Codes', () => {
  it('jeder Code, den die Prüfung vergeben kann, steht in CODES (und damit im Kontrakt)', () => {
    const quelle = fs.readFileSync(
      path.join(__dirname, '../../src/services/app/appStandard.js'),
      'utf8'
    );
    const vergeben = [
      ...quelle.matchAll(/fund\(\s*'([a-z-]+)'/g),
      ...quelle.matchAll(/code: '([a-z-]+)'/g),
    ].map(m => m[1]);
    const ohneGeraet = vergeben.filter(c => c !== 'nicht-pruefbar');
    expect(ohneGeraet.length).toBeGreaterThan(15);
    for (const code of ohneGeraet) expect(appStandard.CODES).toContain(code);
  });
});

describe('die Fassung des Geräts', () => {
  it('kommt aus packages/marken/src/fassung.ts', () => {
    appStandard._setzeGeraetFassung(undefined);
    expect(appStandard.geraetFassung()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
