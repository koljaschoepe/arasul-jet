/**
 * Das Manifest `app.json`, Fassung 1 (Phase C3).
 *
 * Geprueft wird hier das Schema und das Lesen von der Platte. Was ein Manifest
 * ABLEHNT, ist dabei die eigentliche Zusage: ein Partner, dessen Tippfehler
 * still geschluckt wird, baut auf eine Wirkung, die es nicht gibt.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const APPS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-apps-'));
process.env.APPS_DIR = APPS_DIR;

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { AppManifest } = require('../../src/schemas/apps');
const appManifest = require('../../src/services/app/appManifest');

const GUELTIG = {
  schema: 1,
  id: 'urlaub',
  name: 'Urlaubsantrag',
  version: '1.0.0',
  frontend: { verzeichnis: 'frontend' },
  backend: { image: 'urlaub:1.0.0' },
  ports: { backend: 8080 },
};

function lege_ab(id, version, manifest, mitFrontend = true) {
  const ordner = path.join(APPS_DIR, id, version);
  fs.mkdirSync(ordner, { recursive: true });
  fs.writeFileSync(path.join(ordner, 'app.json'), JSON.stringify(manifest));
  if (mitFrontend) {
    fs.mkdirSync(path.join(ordner, 'frontend'), { recursive: true });
    fs.writeFileSync(path.join(ordner, 'frontend', 'index.html'), '<!doctype html>');
  }
  return ordner;
}

afterAll(() => fs.rmSync(APPS_DIR, { recursive: true, force: true }));

describe('Schema app.json v1', () => {
  test('nimmt ein vollstaendiges Manifest und setzt die Vorgaben', () => {
    const m = AppManifest.parse(GUELTIG);
    expect(m.ressourcen).toEqual({ speicher: '512m', cpus: 1 });
    expect(m.modelle).toEqual([]);
    // `flows` hat KEINE Vorgabe: seit C6 ist es ein Verzeichnis und damit eine
    // Lieferung. Ein leeres Objekt daraus zu machen hiesse, jedem Manifest
    // einen Ordner `flows/` zu versprechen, den kein Paket mitbringt.
    expect(m.flows).toBeUndefined();
  });

  test.each([
    ['ohne Frontend und ohne Backend', { schema: 1, id: 'a', name: 'A', version: '1.0.0' }],
    ['mit Backend, aber ohne Port', { ...GUELTIG, ports: undefined }],
    ['mit Port, aber ohne Backend', { ...GUELTIG, backend: undefined }],
    ['mit einer Kennung in Grossbuchstaben', { ...GUELTIG, id: 'Urlaub' }],
    // Kontrakt 1 schrieb `flows` als Liste von Namen. Ein Kit, das darauf
    // stehengeblieben ist, soll ein klares Nein bekommen und keinen still
    // ignorierten Wert (Phase C6).
    ['mit `flows` als Liste, wie in Kontrakt 1', { ...GUELTIG, flows: ['bericht'] }],
    ['mit einem Punkt in der Kennung', { ...GUELTIG, id: 'mein.urlaub' }],
    ['mit der Kennung test', { ...GUELTIG, id: 'test' }],
    ['mit einer Version ohne Punkte', { ...GUELTIG, version: 'neu' }],
    ['mit einem unbekannten Feld', { ...GUELTIG, kategorie: 'buero' }],
    ['mit einer anderen Schema-Fassung', { ...GUELTIG, schema: 2 }],
    ['mit einem Pfad, der aus dem Paket fuehrt', { ...GUELTIG, frontend: { verzeichnis: '../..' } }],
    ['mit einer Speichergrenze ohne Einheit', { ...GUELTIG, ressourcen: { speicher: '512' } }],
  ])('weist ein Manifest %s ab', (_was, roh) => {
    expect(AppManifest.safeParse(roh).success).toBe(false);
  });

  /**
   * Die Fassung des Designsystems (Phase H6). Sie ist FREIWILLIG, und das ist
   * die eigentliche Zusage: jede App, die vor H6 gebaut wurde, hat sie nicht,
   * und ein Manifest deswegen abzuweisen hiesse, eine laufende App an einer
   * Auskunft scheitern zu lassen, die es zu ihrer Bauzeit nicht gab.
   */
  test('nimmt die Fassung des Designsystems', () => {
    expect(AppManifest.parse({ ...GUELTIG, marken: '3.1.0' }).marken).toBe('3.1.0');
    expect(AppManifest.parse({ ...GUELTIG, marken: '3.1.0-rc1' }).marken).toBe('3.1.0-rc1');
  });

  test('eine App ohne Angabe zum Designsystem ist gueltig', () => {
    expect(AppManifest.parse(GUELTIG).marken).toBeUndefined();
  });

  test.each([['3'], ['3.1'], ['neu'], ['v3.1.0']])(
    'weist `marken: %s` ab -- eine Fassung sind drei Zahlen',
    fassung => {
      expect(AppManifest.safeParse({ ...GUELTIG, marken: fassung }).success).toBe(false);
    }
  );

  test('eine App darf auch nur ein Frontend haben', () => {
    const m = AppManifest.parse({ schema: 1, id: 'a', name: 'A', version: '1.0.0', frontend: {} });
    expect(m.frontend.verzeichnis).toBe('frontend');
    expect(m.backend).toBeUndefined();
  });
});

describe('appManifest von der Platte', () => {
  test('liest und prueft ein abgelegtes Manifest', async () => {
    lege_ab('urlaub', '1.0.0', GUELTIG);
    const m = await appManifest.leseManifest('urlaub', '1.0.0');
    expect(m.name).toBe('Urlaubsantrag');
  });

  test('weist ein Manifest ab, das nicht zu seinem Ordner passt', async () => {
    // Sonst haette eine App zwei Namen, je nachdem wen man fragt, und ihr
    // Verzeichnis waere beim naechsten Deploy nicht wiederzufinden.
    lege_ab('umzug', '1.0.0', { ...GUELTIG, id: 'urlaub' });
    await expect(appManifest.leseManifest('umzug', '1.0.0')).rejects.toThrow(/liegt aber unter/);
  });

  test('eine Version, die es nicht gibt, ist 404 und kein Absturz', async () => {
    await expect(appManifest.leseManifest('urlaub', '9.9.9')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  test('kaputtes JSON wird als solches benannt', async () => {
    const ordner = path.join(APPS_DIR, 'kaputt', '1.0.0');
    fs.mkdirSync(ordner, { recursive: true });
    fs.writeFileSync(path.join(ordner, 'app.json'), '{ das ist kein json');
    await expect(appManifest.leseManifest('kaputt', '1.0.0')).rejects.toThrow(/kein gueltiges JSON/);
  });

  test('listet nur Ordner, die wie eine Version aussehen', async () => {
    lege_ab('viele', '1.0.0', { ...GUELTIG, id: 'viele', version: '1.0.0' });
    lege_ab('viele', '1.2.0', { ...GUELTIG, id: 'viele', version: '1.2.0' });
    fs.mkdirSync(path.join(APPS_DIR, 'viele', 'zwischenablage'), { recursive: true });
    expect(await appManifest.listeVersionen('viele')).toEqual(['1.0.0', '1.2.0']);
  });

  test('eine App ohne Ordner hat keine Versionen und wirft nicht', async () => {
    expect(await appManifest.listeVersionen('gibt-es-nicht')).toEqual([]);
  });

  test.each([
    ['../../etc', '1.0.0'],
    ['urlaub', '../../etc'],
    ['urlaub/..', '1.0.0'],
  ])('laesst sich mit %s / %s nicht aus dem Ordner fuehren', (id, version) => {
    expect(() => appManifest.verzeichnisFuer(id, version)).toThrow();
  });

  test('ein versprochenes Frontend ohne index.html faellt beim Einspielen auf', async () => {
    // Nicht erst beim ersten Besucher: ein Stand, der in der Datenbank steht,
    // soll einer sein, der wirklich etwas ausliefert.
    lege_ab('leer', '1.0.0', { ...GUELTIG, id: 'leer' }, false);
    const m = await appManifest.leseManifest('leer', '1.0.0');
    await expect(appManifest.frontendVerzeichnis(m)).rejects.toThrow(/Frontend von leer/);
  });

  test('eine App ohne Frontend hat kein Verzeichnis und ist trotzdem in Ordnung', async () => {
    const m = AppManifest.parse({ ...GUELTIG, frontend: undefined });
    expect(await appManifest.frontendVerzeichnis(m)).toBeNull();
  });
});
