/**
 * Die Staende der Sicherung im Backend (M5, 03.10.2026).
 *
 * Das Backend hat weder restic noch den Schluessel. Es liest, was `backup.sh`
 * nach jedem Lauf ablegt (`staende.json`, auf dem Datentraeger
 * `arasul-sicherung/MANIFEST.json`), und reicht beim Zurueckholen die Kennung
 * eines Stands an `wiederherstellen.sh --stand` weiter. Die Ordner sind
 * Wegwerf-Ordner.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { PassThrough } = require('stream');

const WURZEL = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-staende-'));
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
const sicherungsdienst = require('../../src/services/betrieb/sicherungsdienst');
const { NotFoundError, ValidationError } = require('../../src/utils/errors');
const { WiederherstellungBody } = require('../../src/schemas/admin-backup');

const echteStat = fs.promises.stat;
const ID1 = '0c88ff92a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbcc';
const ID2 = '637755c9a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbcc';

function staendeSchreiben(extra = {}) {
  fs.writeFileSync(
    path.join(ORDNER, 'staende.json'),
    JSON.stringify({
      zeitpunkt: '2026-10-03T02:05:00+02:00',
      repo: 'staende-0123456789abcdef',
      bytes: 415000000,
      aufbewahrung: { tage: 7, wochen: 12, monate: 60 },
      hinweis: null,
      entfallen_wegen_platz: [],
      staende: [
        {
          id: ID1,
          kurz: ID1.slice(0, 8),
          zeit: '2026-10-02T02:00:10+02:00',
          geschrieben: 415000000,
          gelesen: 700000000,
        },
        {
          id: ID2,
          kurz: ID2.slice(0, 8),
          zeit: '2026-10-03T02:00:12+02:00',
          geschrieben: 2200000,
          gelesen: 700000000,
        },
      ],
      neuester: { id: ID2, app_datenbanken: ['arasul_app_belege_live'], apps: ['belege'] },
      ...extra,
    })
  );
}

function befehle() {
  return mockExec.mock.calls.map(([optionen]) => optionen.Cmd);
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

describe('sicherungen: die Staende', () => {
  it('nennt jeden Stand als eigene Zeile, mit dem, was er neu geschrieben hat', async () => {
    staendeSchreiben();
    const liste = await sicherungsdienst.sicherungen();
    const staende = liste.filter(z => z.art === 'stand');
    expect(staende.map(z => z.id)).toEqual([ID2, ID1]); // neueste zuerst
    expect(staende[0]).toMatchObject({ name: '637755c9', bytes: 2200000 });
    expect(staende[0].zweck).toMatch(/Stand des ganzen Geräts/);
  });

  it('ohne staende.json (Geraet von vor M5): keine Zeile, kein Fehler', async () => {
    const liste = await sicherungsdienst.sicherungen();
    expect(liste.filter(z => z.art === 'stand')).toEqual([]);
  });
});

describe('status: die Staende', () => {
  it('nennt Zahl, neuesten Stand, Aufbewahrung', async () => {
    staendeSchreiben();
    const s = await sicherungsdienst.status();
    expect(s.staende).toMatchObject({
      anzahl: 2,
      bytes: 415000000,
      neuester: { id: ID2, geschrieben: 2200000 },
      aufbewahrung: { tage: 7, wochen: 12, monate: 60 },
      hinweis: null,
      entfallenWegenPlatz: [],
    });
  });

  it('reicht den Hinweis durch, wenn das Ziel voll war', async () => {
    staendeSchreiben({
      hinweis:
        'Auf dem Datentraeger war kein Platz mehr: 1 aelteste(r) Stand/Staende sind entfallen.',
      entfallen_wegen_platz: ['2026-09-01T02:00:00+02:00'],
    });
    const s = await sicherungsdienst.status();
    expect(s.staende.hinweis).toMatch(/kein Platz mehr/);
    expect(s.staende.entfallenWegenPlatz).toEqual(['2026-09-01T02:00:00+02:00']);
  });

  it('nennt den Stand dieser Nacht aus dem Bericht', async () => {
    fs.writeFileSync(
      path.join(ORDNER, 'backup_report.json'),
      JSON.stringify({
        status: 'completed',
        timestamp: new Date().toISOString(),
        stand_status: 'ok',
        stand_id: ID2,
        stand_geschrieben_bytes: 2200000,
        stand_gelesen_bytes: 700000000,
        stand_klartext: 0,
      })
    );
    const s = await sicherungsdienst.status();
    expect(s.letzteSicherung.stand).toEqual({
      status: 'ok',
      id: ID2,
      geschrieben: 2200000,
      gelesen: 700000000,
      klartext: 0,
    });
  });

  it('ohne Staende: null', async () => {
    expect((await sicherungsdienst.status()).staende).toBeNull();
  });
});

describe('stelleWiederHer: ein bestimmter Stand', () => {
  it('reicht die Kennung als --stand weiter', async () => {
    containerLauf(0);
    db.query.mockResolvedValue({ rows: [] });
    await sicherungsdienst.stelleWiederHer({ stand: ID1.slice(0, 8), durch: 1 });
    expect(befehle()[0]).toEqual(['/usr/local/bin/wiederherstellen.sh', '--stand', '0c88ff92']);
  });

  it('ohne Angabe: der neueste Stand, ohne --stand', async () => {
    containerLauf(0);
    db.query.mockResolvedValue({ rows: [] });
    await sicherungsdienst.stelleWiederHer({ durch: 1 });
    expect(befehle()[0]).toEqual(['/usr/local/bin/wiederherstellen.sh']);
  });

  it('weist eine Kennung ab, die keine ist, und beides zusammen', async () => {
    await expect(sicherungsdienst.stelleWiederHer({ stand: '../etc' })).rejects.toThrow(
      ValidationError
    );
    await expect(
      sicherungsdienst.stelleWiederHer({ stand: ID1, datei: 'arasul_db_x.sql.gz' })
    ).rejects.toThrow(ValidationError);
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('Schema: stand ist hex, und nicht zusammen mit datei', () => {
    const basis = { bestaetigung: 'wiederherstellen' };
    expect(WiederherstellungBody.safeParse({ ...basis, stand: ID1 }).success).toBe(true);
    expect(WiederherstellungBody.safeParse({ ...basis, stand: 'latest' }).success).toBe(false);
    expect(WiederherstellungBody.safeParse({ ...basis, stand: 'abc' }).success).toBe(false);
    expect(
      WiederherstellungBody.safeParse({ ...basis, stand: ID1, datei: 'arasul_db_x.sql.gz' }).success
    ).toBe(false);
  });
});

describe('stelleAppWiederHer: der neueste Stand nennt die App-Datenbanken', () => {
  it('holt nur, was im Stand steht', async () => {
    staendeSchreiben();
    containerLauf(0);
    db.query.mockResolvedValue({ rows: [] });
    const r = await sicherungsdienst.stelleAppWiederHer({
      appId: 'belege',
      paket: false,
      durch: 1,
    });
    expect(r.staende.map(s => s.stand)).toEqual(['live']);
    expect(befehle()).toEqual([
      ['/usr/local/bin/wiederherstellen.sh', '--app-datenbank', 'arasul_app_belege_live'],
    ]);
  });

  it('sagt 404 fuer eine App, die nicht im Stand steht', async () => {
    staendeSchreiben();
    await expect(
      sicherungsdienst.stelleAppWiederHer({ appId: 'gibtsnicht', paket: false })
    ).rejects.toThrow(NotFoundError);
    expect(mockExec).not.toHaveBeenCalled();
  });
});

describe('externInhalt: das Manifest der Staende auf dem Datentraeger', () => {
  it('liest arasul-sicherung/MANIFEST.json und nennt die Tage der Staende', async () => {
    jest.spyOn(fs.promises, 'stat').mockImplementation(async p => {
      const st = await echteStat(p);
      return p === EXTERN ? Object.create(st, { dev: { value: st.dev + 1 } }) : st;
    });
    fs.writeFileSync(ZUSTAND, JSON.stringify({ name: 'ARASUL-SSD', dateisystem: 'ext4' }));
    const wurzel = path.join(EXTERN, 'arasul-sicherung');
    fs.mkdirSync(path.join(wurzel, '20260930'), { recursive: true }); // Tagesordner von vor M5
    fs.writeFileSync(
      path.join(wurzel, 'MANIFEST.json'),
      JSON.stringify({
        zeitpunkt: '2026-10-03T02:06:00+02:00',
        repo: 'staende-0123456789abcdef',
        bytes: 416000000,
        apps: [{ id: 'belege', staende: ['live'], datenbanken: ['arasul_app_belege_live'] }],
        dateien: [{ name: 'arasul_db.sql', bytes: 1, art: 'postgres' }],
        staende: [
          { id: ID1, kurz: '0c88ff92', zeit: '2026-10-02T02:00:10+02:00' },
          { id: ID2, kurz: '637755c9', zeit: '2026-10-03T02:00:12+02:00' },
        ],
      })
    );
    const r = await sicherungsdienst.externInhalt();
    expect(r.tage).toEqual(['20261003', '20261002']);
    expect(r.neuesteSicherung).toMatchObject({
      datum: '20261003',
      bytes: 416000000,
      apps: [{ id: 'belege', staende: ['live'] }],
      staende: 2,
    });
  });
});
