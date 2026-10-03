/**
 * Der Datentraeger in `status()`, `externInhalt()` und die neue
 * Wiederherstellung (J37). Die Ordner sind Wegwerf-Ordner; ob zwei Ordner auf
 * verschiedenen Dateisystemen liegen, wird ueber `fs.stat` vorgetaeuscht.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { PassThrough } = require('stream');

const WURZEL = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-datentraeger-'));
const ORDNER = path.join(WURZEL, 'backups');
const EXTERN = path.join(WURZEL, 'extern');
const ZUSTAND = path.join(WURZEL, 'zustand', 'zustand.json');
fs.mkdirSync(ORDNER, { recursive: true });
fs.mkdirSync(EXTERN, { recursive: true });
fs.mkdirSync(path.dirname(ZUSTAND), { recursive: true });
process.env.BACKUP_REPORT_PATH = path.join(ORDNER, 'backup_report.json');
process.env.EXTERN_ORDNER = EXTERN;
process.env.EXTERN_ZUSTAND = ZUSTAND;

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/app/appStore', () => ({ spieleEin: jest.fn() }));
jest.mock('../../src/services/app/appDatenbank', () => ({
  namenFuer: (appId, stand) => `arasul_app_${appId.replace(/-/g, '_')}_${stand}`,
  sorgeFuer: jest.fn(),
}));
jest.mock('../../src/services/app/appContainer', () => ({
  containerName: (appId, stand) => `app-${appId}-${stand}`,
}));
const mockExec = jest.fn();
jest.mock('../../src/services/core/docker', () => ({
  docker: {
    getContainer: jest.fn(() => ({
      inspect: async () => ({ State: { Running: true } }),
      exec: mockExec,
      restart: jest.fn(),
    })),
  },
  getAllServicesStatus: jest.fn(),
}));

const db = require('../../src/database');
const appStore = require('../../src/services/app/appStore');
const sicherungsdienst = require('../../src/services/betrieb/sicherungsdienst');
const { ConflictError, NotFoundError } = require('../../src/utils/errors');
const {
  WiederherstellungBody,
  AppWiederherstellungBody,
} = require('../../src/schemas/admin-backup');

const echteStat = fs.promises.stat;

/** Taeuscht vor, dass EXTERN auf einem anderen Dateisystem liegt. */
function stickSteckt(steckt) {
  jest.spyOn(fs.promises, 'stat').mockImplementation(async p => {
    const st = await echteStat(p);
    if (p === EXTERN && steckt) {
      return Object.create(st, { dev: { value: st.dev + 1 } });
    }
    return st;
  });
}

function zustandSchreiben() {
  fs.writeFileSync(
    ZUSTAND,
    JSON.stringify({ name: 'GOLDENBACKUP', dateisystem: 'ext4', geraet: '/dev/sda1' })
  );
}

function manifest(datum, apps = [{ id: 'belege', staende: ['test', 'live'] }]) {
  const ordner = path.join(EXTERN, 'arasul-sicherung', datum);
  fs.mkdirSync(ordner, { recursive: true });
  fs.writeFileSync(
    path.join(ordner, 'MANIFEST.json'),
    JSON.stringify({
      zeitpunkt: '2026-10-02T02:00:00Z',
      bytes: 1234,
      apps,
      dateien: [{ name: 'a.enc' }, { name: 'b.enc' }],
    })
  );
}

function containerLauf(code = 0) {
  mockExec.mockResolvedValue({
    start: async () => {
      const strom = new PassThrough();
      setImmediate(() => strom.end());
      return strom;
    },
    inspect: async () => ({ ExitCode: code }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  fs.rmSync(path.join(EXTERN, 'arasul-sicherung'), { recursive: true, force: true });
  fs.rmSync(ZUSTAND, { force: true });
  for (const f of fs.readdirSync(ORDNER)) {
    fs.rmSync(path.join(ORDNER, f), { recursive: true, force: true });
  }
});

afterAll(() => fs.rmSync(WURZEL, { recursive: true, force: true }));

describe('status: Datentraeger', () => {
  it('zeigt Name, Dateisystem und Platz, wenn ein Stick steckt', async () => {
    stickSteckt(true);
    zustandSchreiben();
    fs.writeFileSync(
      process.env.BACKUP_REPORT_PATH,
      JSON.stringify({
        status: 'completed',
        timestamp: new Date().toISOString(),
        extern_klartext: 0,
      })
    );
    fs.writeFileSync(
      path.join(ORDNER, 'extern_bericht.json'),
      JSON.stringify({ zeitpunkt: '2026-10-02T02:00:00Z', apps: ['belege'] })
    );
    const s = await sicherungsdienst.status();
    expect(s.ausserhalb.datentraeger).toMatchObject({
      angesteckt: true,
      name: 'GOLDENBACKUP',
      dateisystem: 'ext4',
    });
    expect(s.ausserhalb.datentraeger.frei).toBeGreaterThan(0);
    expect(s.ausserhalb.datentraeger.gesamt).toBeGreaterThanOrEqual(s.ausserhalb.datentraeger.frei);
    expect(s.ausserhalb.klartextDateien).toBe(0);
    expect(s.ausserhalb.inhalt).toEqual({ apps: ['belege'] });
  });

  it('kennt keinen Datentraeger, wenn nichts eingehaengt ist oder die Zustandsdatei fehlt', async () => {
    zustandSchreiben();
    stickSteckt(false);
    expect((await sicherungsdienst.status()).ausserhalb.datentraeger.angesteckt).toBe(false);

    jest.restoreAllMocks();
    fs.rmSync(ZUSTAND);
    stickSteckt(true);
    const s = await sicherungsdienst.status();
    expect(s.ausserhalb.datentraeger).toEqual({
      angesteckt: false,
      name: null,
      dateisystem: null,
      frei: null,
      gesamt: null,
    });
    expect(s.ausserhalb.klartextDateien).toBeNull();
    expect(s.ausserhalb.inhalt).toBeNull();
  });
});

describe('status: Schluessel', () => {
  it('ohne Datei: passt ist null', async () => {
    const s = await sicherungsdienst.status();
    expect(s.schluessel).toMatchObject({ passt: null, geprueft: null, aelterUnlesbar: 0 });
  });

  it('reicht die Pruefung durch', async () => {
    fs.writeFileSync(
      path.join(ORDNER, 'schluessel_pruefung.json'),
      JSON.stringify({
        zeitpunkt: '2026-10-02T03:00:00Z',
        abdruck: 'abcdef0123456789',
        passt: false,
        grund: 'Der Schlüssel ist ein anderer.',
        lokal: { neueste: 'x.enc', passt: false, lesbar: 0, unlesbar: 3 },
        extern: { neueste: null, passt: null, lesbar: 0, unlesbar: 0 },
        aeltere_unlesbar: 2,
      })
    );
    const { schluessel } = await sicherungsdienst.status();
    expect(schluessel.passt).toBe(false);
    expect(schluessel.grund).toBe('Der Schlüssel ist ein anderer.');
    expect(schluessel.aelterUnlesbar).toBe(2);
    expect(schluessel.lokal).toEqual({ neueste: 'x.enc', passt: false, lesbar: 0, unlesbar: 3 });
    expect(schluessel.extern.passt).toBeNull();
  });
});

describe('externInhalt', () => {
  it('ohne Stick: nichts, kein Fehler', async () => {
    stickSteckt(false);
    expect(await sicherungsdienst.externInhalt()).toEqual({
      angesteckt: false,
      name: null,
      neuesteSicherung: null,
      tage: [],
    });
  });

  it('liest das Verzeichnis des neuesten Tages und ignoriert fremde Ordnernamen', async () => {
    stickSteckt(true);
    zustandSchreiben();
    manifest('20261001', [{ id: 'alt', staende: ['live'] }]);
    manifest('20261002');
    fs.mkdirSync(path.join(EXTERN, 'arasul-sicherung', '..evil'), { recursive: true });
    fs.mkdirSync(path.join(EXTERN, 'arasul-sicherung', 'notizen'), { recursive: true });
    const r = await sicherungsdienst.externInhalt();
    expect(r.angesteckt).toBe(true);
    expect(r.name).toBe('GOLDENBACKUP');
    expect(r.tage).toEqual(['20261002', '20261001']);
    expect(r.neuesteSicherung).toEqual({
      datum: '20261002',
      zeitpunkt: '2026-10-02T02:00:00Z',
      bytes: 1234,
      apps: [{ id: 'belege', staende: ['test', 'live'] }],
      dateien: 2,
    });
  });
});

describe('Wiederherstellung von der Quelle extern', () => {
  it('verweigert ohne Stick mit klarem Satz', async () => {
    stickSteckt(false);
    await expect(
      sicherungsdienst.stelleAppWiederHer({ appId: 'belege', quelle: 'extern' })
    ).rejects.toThrow(ConflictError);
    await expect(sicherungsdienst.stelleWiederHer({ quelle: 'extern' })).rejects.toThrow(
      'Es ist kein Datenträger angesteckt.'
    );
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('sagt 404, wenn die App nicht im Verzeichnis steht', async () => {
    stickSteckt(true);
    zustandSchreiben();
    manifest('20261002');
    await expect(
      sicherungsdienst.stelleAppWiederHer({ appId: 'andere', quelle: 'extern' })
    ).rejects.toThrow(NotFoundError);
  });

  it('holt Daten und Paket vom Stick, mit Code nur in der Umgebung, und baut neu', async () => {
    stickSteckt(true);
    zustandSchreiben();
    manifest('20261002');
    containerLauf(0);
    db.query.mockResolvedValue({ rows: [{ version: '1.2.0' }] });

    const r = await sicherungsdienst.stelleAppWiederHer({
      appId: 'belege',
      quelle: 'extern',
      paket: true,
      wiederherstellungscode: 'ABCD-1234',
      durch: 7,
    });

    const aufrufe = mockExec.mock.calls.map(c => c[0]);
    expect(aufrufe.map(a => a.Cmd)).toEqual([
      [
        '/usr/local/bin/wiederherstellen.sh',
        '--app-datenbank',
        'arasul_app_belege_test',
        '--quelle',
        'extern',
      ],
      [
        '/usr/local/bin/wiederherstellen.sh',
        '--app-datenbank',
        'arasul_app_belege_live',
        '--quelle',
        'extern',
      ],
      ['/usr/local/bin/wiederherstellen.sh', '--app-paket', 'belege', '--quelle', 'extern'],
    ]);
    for (const a of aufrufe) {
      expect(a.Env).toEqual(['ARASUL_WIEDERHERSTELLUNGSCODE=ABCD-1234']);
      expect(JSON.stringify(a.Cmd)).not.toContain('ABCD-1234');
    }
    expect(appStore.spieleEin).toHaveBeenCalledTimes(2);
    expect(appStore.spieleEin).toHaveBeenCalledWith({
      appId: 'belege',
      version: '1.2.0',
      stand: 'live',
      durch: 7,
    });
    expect(r.erfolg).toBe(true);
    expect(r.quelle).toBe('extern');
    expect(r.paket.erfolg).toBe(true);
    expect(r.bericht.map(b => b.schritt)).toEqual([
      'datenbank',
      'datenbank',
      'paket',
      'neu_gestartet',
      'neu_gestartet',
    ]);
    expect(r.bericht.every(b => b.erfolg && typeof b.text === 'string')).toBe(true);
  });

  it('meldet ein gescheitertes Paket und baut dann nichts neu', async () => {
    stickSteckt(true);
    zustandSchreiben();
    manifest('20261002', [{ id: 'belege', staende: ['live'] }]);
    mockExec
      .mockResolvedValueOnce({
        start: async () => {
          const s = new PassThrough();
          setImmediate(() => s.end());
          return s;
        },
        inspect: async () => ({ ExitCode: 0 }),
      })
      .mockResolvedValueOnce({
        start: async () => {
          const s = new PassThrough();
          setImmediate(() => s.end());
          return s;
        },
        inspect: async () => ({ ExitCode: 1 }),
      });
    db.query.mockResolvedValue({ rows: [] });
    const r = await sicherungsdienst.stelleAppWiederHer({
      appId: 'belege',
      quelle: 'extern',
      paket: true,
    });
    expect(r.erfolg).toBe(false);
    expect(r.paket.erfolg).toBe(false);
    expect(appStore.spieleEin).not.toHaveBeenCalled();
    expect(r.bericht.find(b => b.schritt === 'paket').erfolg).toBe(false);
  });
});

describe('Schemas', () => {
  it('ganze Wiederherstellung: Quelle und Code', () => {
    const ok = WiederherstellungBody.parse({
      bestaetigung: 'wiederherstellen',
      passwort: 'x',
      quelle: 'extern',
      wiederherstellungscode: 'AB12-CD34 EF',
    });
    expect(ok.quelle).toBe('extern');
    expect(WiederherstellungBody.parse({ bestaetigung: 'wiederherstellen', passwort: 'x' }).quelle).toBe('lokal');
    expect(
      WiederherstellungBody.safeParse({ bestaetigung: 'wiederherstellen',
      passwort: 'x', quelle: '/etc' }).success
    ).toBe(false);
    expect(
      WiederherstellungBody.safeParse({
        bestaetigung: 'wiederherstellen',
      passwort: 'x',
        wiederherstellungscode: 'a; rm -rf /',
      }).success
    ).toBe(false);
  });

  it('App: Vorgaben, Laenge und Zeichen des Codes', () => {
    const b = AppWiederherstellungBody.parse({ passwort: 'x' });
    expect(b).toMatchObject({ quelle: 'lokal', paket: true });
    expect(
      AppWiederherstellungBody.safeParse({
        passwort: 'x',
        wiederherstellungscode: 'a'.repeat(101),
      }).success
    ).toBe(false);
    expect(
      AppWiederherstellungBody.safeParse({ passwort: 'x', wiederherstellungscode: '$(id)' })
        .success
    ).toBe(false);
    // Ohne Passwort geht nichts mehr (M5, Auftrag sicherung-zurueckholen).
    expect(AppWiederherstellungBody.safeParse({ bestaetigung: 'belege' }).success).toBe(false);
    expect(WiederherstellungBody.safeParse({ bestaetigung: 'wiederherstellen' }).success).toBe(
      false
    );
  });
});
