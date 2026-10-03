/**
 * Zurueckholen aus einem Stand (Auftrag sicherung-zurueckholen, M5, 04.10.2026).
 *
 * Ein Laie waehlt den richtigen Stand nach Datum, bestaetigt mit seinem
 * Passwort, und vorher sichert das Geraet den jetzigen Stand -- damit sich das
 * Zurueckholen selbst rueckgaengig machen laesst. Geprueft wird hier, was das
 * Backend dafuer tut: die Liste der Staende mit Inhalt und Namen, die
 * Reihenfolge (erst den Stand festhalten, dann sichern, dann zurueckholen),
 * dass ohne Stand davor nichts angefasst wird, ein Bereich des
 * Firmenordners, und dass die Routen ohne richtiges Passwort nichts tun.
 */

process.env.RATE_LIMIT_ENABLED = 'false';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { PassThrough } = require('stream');
const request = require('supertest');
const express = require('express');

const WURZEL = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-zurueck-'));
const ORDNER = path.join(WURZEL, 'backups');
const EXTERN = path.join(WURZEL, 'extern');
fs.mkdirSync(ORDNER, { recursive: true });
fs.mkdirSync(EXTERN, { recursive: true });
process.env.BACKUP_REPORT_PATH = path.join(ORDNER, 'backup_report.json');
process.env.EXTERN_ORDNER = EXTERN;
process.env.EXTERN_ZUSTAND = path.join(WURZEL, 'zustand.json');

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/utils/auditLog', () => ({ logSecurityEvent: jest.fn() }));
jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/app/appStore', () => ({ spieleEin: jest.fn() }));
jest.mock('../../src/services/app/appDatenbank', () => ({
  namenFuer: (appId, stand) => `arasul_app_${appId.replace(/-/g, '_')}_${stand}`,
  sorgeFuer: jest.fn(),
}));
jest.mock('../../src/services/app/appContainer', () => ({
  containerName: (appId, stand) => `app-${appId}-${stand}`,
}));
jest.mock('../../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { id: 7, username: 'probe-admin', role: 'admin' };
    next();
  },
  requireRole: () => (_req, _res, next) => next(),
  ROLLEN: ['admin', 'mitarbeiter'],
}));
const mockBestaetige = jest.fn();
jest.mock('../../src/services/auth/passwordService', () => ({
  bestaetigePasswort: (...a) => mockBestaetige(...a),
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
const { ConflictError, ForbiddenError, NotFoundError } = require('../../src/utils/errors');
const { errorHandler } = require('../../src/middleware/errorHandler');

const A = 'aaaa1111a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbcc';
const B = 'bbbb2222a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbcc';
const VORHER = 'cccc3333a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbcc';

const inhalt = (extra = {}) => ({
  apps: ['probe-rueck', 'nur-paket'],
  app_datenbanken: ['arasul_app_probe_rueck_test'],
  bereiche: ['firma', 'probe-rueck'],
  ...extra,
});

function staendeSchreiben(staende) {
  fs.writeFileSync(
    path.join(ORDNER, 'staende.json'),
    JSON.stringify({ zeitpunkt: '2026-10-04T02:05:00+02:00', staende, neuester: null })
  );
}
const zweiStaende = () =>
  staendeSchreiben([
    { id: A, kurz: A.slice(0, 8), zeit: '2026-10-03T00:00:10Z', inhalt: inhalt() },
    {
      id: B,
      kurz: B.slice(0, 8),
      zeit: '2026-10-04T00:00:12Z',
      inhalt: inhalt({ apps: [], app_datenbanken: [] }),
    },
  ]);

/**
 * Der Sicherungs-Container, nachgestellt: `backup.sh` legt (wie am Geraet)
 * einen neuen Stand an und schreibt seinen Bericht; alles andere gibt
 * `ausgaben[befehl]` aus und endet mit `codes[befehl]`.
 */
function container({ vorherGelingt = true, codes = {}, ausgaben = {} } = {}) {
  mockExec.mockImplementation(async ({ Cmd }) => {
    const name = Cmd[0].split('/').pop();
    if (name === 'backup.sh' && vorherGelingt) {
      const roh = JSON.parse(fs.readFileSync(path.join(ORDNER, 'staende.json'), 'utf8'));
      roh.staende.push({ id: VORHER, zeit: new Date().toISOString(), vorher: true });
      fs.writeFileSync(path.join(ORDNER, 'staende.json'), JSON.stringify(roh));
      fs.writeFileSync(
        process.env.BACKUP_REPORT_PATH,
        JSON.stringify({
          status: 'completed',
          timestamp: new Date().toISOString(),
          stand_status: 'ok',
          stand_id: VORHER,
        })
      );
    }
    return {
      start: async () => {
        const strom = new PassThrough();
        setImmediate(() => strom.end(ausgaben[name] ?? ''));
        return strom;
      },
      inspect: async () => ({
        ExitCode: name === 'backup.sh' ? (vorherGelingt ? 0 : 1) : (codes[name] ?? 0),
      }),
    };
  });
}
const befehle = () => mockExec.mock.calls.map(([o]) => o.Cmd);
const umgebungen = () => mockExec.mock.calls.map(([o]) => o.Env ?? []);

beforeEach(() => {
  jest.clearAllMocks();
  for (const f of fs.readdirSync(ORDNER)) {
    fs.rmSync(path.join(ORDNER, f), { recursive: true, force: true });
  }
  db.query.mockImplementation(async sql => {
    if (/FROM public\.apps/.test(sql)) {
      return { rows: [{ id: 'probe-rueck', name: 'Probe Rückholen' }] };
    }
    if (/FROM public\.firmenordner_ordner WHERE kennung/.test(sql)) {
      return { rows: [{ kennung: 'probe-rueck', name: 'Probe Rückholen' }] };
    }
    if (/FROM public\.firmenordner_ordner/.test(sql)) {
      return { rows: [{ kennung: 'probe-rueck', name: 'Probe Rückholen' }] };
    }
    return { rows: [] };
  });
});
afterAll(() => fs.rmSync(WURZEL, { recursive: true, force: true }));

describe('staendeZumZurueckholen', () => {
  it('nennt jeden Stand mit Zeitpunkt und Inhalt, neueste zuerst, Namen aus dem Geraet', async () => {
    staendeSchreiben([
      { id: A, zeit: '2026-10-03T00:00:10Z', inhalt: inhalt() },
      { id: VORHER, zeit: '2026-10-04T21:00:00Z', vorher: true, fuer: 'bereich:probe-rueck' },
      { id: 'kaputt', zeit: 'x' },
    ]);
    const liste = await sicherungsdienst.staendeZumZurueckholen('lokal');
    expect(liste.map(s => s.id)).toEqual([VORHER, A]);
    expect(liste[0]).toMatchObject({
      vorher: true,
      fuer: { art: 'bereich', id: 'probe-rueck' },
      inhaltBekannt: false,
      apps: [],
    });
    expect(liste[1].apps).toEqual([
      { id: 'probe-rueck', name: 'Probe Rückholen' },
      { id: 'nur-paket', name: null },
    ]);
    expect(liste[1].bereiche).toEqual([
      { kennung: 'firma', name: null, vorhanden: false },
      { kennung: 'probe-rueck', name: 'Probe Rückholen', vorhanden: true },
    ]);
    expect(liste[1].appDatenbanken).toEqual(['arasul_app_probe_rueck_test']);
  });

  it('ohne Datentraeger: extern ist ein 409, kein leerer Erfolg', async () => {
    await expect(sicherungsdienst.staendeZumZurueckholen('extern')).rejects.toThrow(ConflictError);
  });
});

describe('eine App zurueckholen, mit dem Stand davor', () => {
  it('haelt den gewaehlten Stand fest, sichert vorher (Tag vorher) und holt dann aus ihm', async () => {
    zweiStaende();
    container();
    const r = await sicherungsdienst.stelleAppWiederHer({
      appId: 'probe-rueck',
      standId: A.slice(0, 8),
      paket: true,
      durch: 7,
      vorherSichern: true,
    });
    expect(befehle()).toEqual([
      ['/usr/local/bin/backup.sh'],
      [
        '/usr/local/bin/wiederherstellen.sh',
        '--app-datenbank',
        'arasul_app_probe_rueck_test',
        '--stand',
        A,
      ],
      ['/usr/local/bin/wiederherstellen.sh', '--app-paket', 'probe-rueck', '--stand', A],
    ]);
    expect(umgebungen()[0]).toEqual([
      'ARASUL_STAND_ANLASS=vorher',
      'ARASUL_STAND_FUER=app:probe-rueck',
    ]);
    expect(r.vorher).toMatchObject({ erfolg: true, id: VORHER });
    expect(r.stand.id).toBe(A);
    expect(r.bericht[0]).toMatchObject({ schritt: 'vorher', erfolg: true });
    expect(r.bericht[0].text).toMatch(/rückgängig/);
  });

  it('ohne genannten Stand: der neueste VON VOR dem Stand davor -- nicht der eben gesicherte', async () => {
    zweiStaende();
    staendeSchreiben([
      { id: A, zeit: '2026-10-03T00:00:10Z', inhalt: inhalt() },
      { id: B, zeit: '2026-10-04T00:00:12Z', inhalt: inhalt() },
    ]);
    container();
    await sicherungsdienst.stelleAppWiederHer({
      appId: 'probe-rueck',
      paket: false,
      vorherSichern: true,
    });
    expect(befehle()[1]).toContain(B);
    expect(befehle().flat()).not.toContain(VORHER);
  });

  it('gelingt der Stand davor nicht, wird nichts zurueckgeholt', async () => {
    zweiStaende();
    container({ vorherGelingt: false });
    const r = await sicherungsdienst.stelleAppWiederHer({
      appId: 'probe-rueck',
      standId: A,
      paket: true,
      vorherSichern: true,
    });
    expect(r.erfolg).toBe(false);
    expect(befehle()).toEqual([['/usr/local/bin/backup.sh']]);
    expect(r.bericht).toEqual([
      expect.objectContaining({
        schritt: 'vorher',
        erfolg: false,
        text: expect.stringMatching(/nichts zurückgeholt/),
      }),
    ]);
  });

  it('holt aus einem Stand nur, was darin steht: hier nur das Paket', async () => {
    zweiStaende();
    container();
    await sicherungsdienst.stelleAppWiederHer({
      appId: 'nur-paket',
      standId: A,
      paket: true,
      vorherSichern: true,
    });
    expect(befehle().slice(1)).toEqual([
      ['/usr/local/bin/wiederherstellen.sh', '--app-paket', 'nur-paket', '--stand', A],
    ]);
  });

  it('eine App, die nicht im Stand steht: 404, und es wird nicht einmal gesichert', async () => {
    zweiStaende();
    container();
    await expect(
      sicherungsdienst.stelleAppWiederHer({
        appId: 'probe-rueck',
        standId: B,
        paket: true,
        vorherSichern: true,
      })
    ).rejects.toThrow(NotFoundError);
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('einen Stand, den es nicht (mehr) gibt: 404', async () => {
    zweiStaende();
    await expect(
      sicherungsdienst.stelleAppWiederHer({ appId: 'probe-rueck', standId: 'dddd4444' })
    ).rejects.toThrow(/gibt es nicht mehr/);
  });
});

describe('einen Bereich des Firmenordners zurueckholen', () => {
  it('sichert vorher und holt genau den Bereich aus dem Stand, mit Zahlen im Bericht', async () => {
    zweiStaende();
    container({
      ausgaben: {
        'wiederherstellen.sh':
          '[2026-10-04 23:50:01] probe-rueck: Bereich zurueck\nERGEBNIS bereich=probe-rueck geschrieben=2 entfernt=1 ordner_neu=0\n',
      },
    });
    const r = await sicherungsdienst.stelleBereichWiederHer({
      kennung: 'probe-rueck',
      standId: A.slice(0, 8),
      vorherSichern: true,
    });
    expect(befehle()).toEqual([
      ['/usr/local/bin/backup.sh'],
      ['/usr/local/bin/wiederherstellen.sh', '--firmenordner-bereich', 'probe-rueck', '--stand', A],
    ]);
    expect(umgebungen()[0]).toContain('ARASUL_STAND_FUER=bereich:probe-rueck');
    expect(r).toMatchObject({
      erfolg: true,
      bereich: { kennung: 'probe-rueck', name: 'Probe Rückholen' },
      zahlen: { geschrieben: 2, entfernt: 1, ordnerNeu: 0 },
    });
    expect(r.bericht.map(b => b.schritt)).toEqual(['vorher', 'bereich']);
    expect(r.bericht[1].text).toMatch(/2 Dateien zurückgeschrieben, 1 entfernt/);
  });

  it('einen Bereich, den es am Geraet nicht gibt: 404 mit dem Weg, nichts gesichert', async () => {
    zweiStaende();
    db.query.mockResolvedValue({ rows: [] });
    await expect(
      sicherungsdienst.stelleBereichWiederHer({ kennung: 'weg', standId: A, vorherSichern: true })
    ).rejects.toThrow(/Legen Sie ihn unter Firmenordner an/);
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('einen Bereich, der nicht in diesem Stand steht: 404', async () => {
    staendeSchreiben([
      { id: A, zeit: '2026-10-03T00:00:10Z', inhalt: inhalt({ bereiche: ['firma'] }) },
    ]);
    await expect(
      sicherungsdienst.stelleBereichWiederHer({ kennung: 'probe-rueck', standId: A })
    ).rejects.toThrow(/nicht in diesem Stand/);
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('eine Kennung, die ein Pfad ist, kommt nicht bis zum Container', async () => {
    await expect(
      sicherungsdienst.stelleBereichWiederHer({ kennung: '../apps', standId: A })
    ).rejects.toThrow(/Kennung/);
    expect(mockExec).not.toHaveBeenCalled();
  });
});

describe('das ganze Geraet: der Stand wird festgehalten, bevor der davor entsteht', () => {
  it('reicht den neuesten Stand von VOR der Sicherung als --stand weiter', async () => {
    zweiStaende();
    container();
    const r = await sicherungsdienst.stelleWiederHer({ durch: 7, vorherSichern: true });
    expect(befehle()[0]).toEqual(['/usr/local/bin/backup.sh']);
    expect(umgebungen()[0]).toContain('ARASUL_STAND_FUER=geraet');
    expect(befehle()[1]).toEqual(['/usr/local/bin/wiederherstellen.sh', '--stand', B]);
    expect(r.vorher.id).toBe(VORHER);
  });

  it('ohne Vorgabe (Rueckweg des Updates): wie bisher, kein Stand davor', async () => {
    zweiStaende();
    container();
    await sicherungsdienst.stelleWiederHer({ durch: null });
    expect(befehle()).toEqual([['/usr/local/bin/wiederherstellen.sh']]);
  });
});

describe('die Routen verlangen das Passwort', () => {
  function app() {
    const routen = require('../../src/routes/admin/backup');
    const a = express();
    a.use(express.json());
    a.use('/api/backup', routen);
    a.use(errorHandler);
    return a;
  }

  it('ohne Passwort: 400, und nichts passiert', async () => {
    const r = await request(app())
      .post('/api/backup/wiederherstellung/bereich/probe-rueck')
      .send({ stand_id: A });
    expect(r.status).toBe(400);
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('mit falschem Passwort: 403 PASSWORT_FALSCH, und nichts passiert', async () => {
    zweiStaende();
    container();
    mockBestaetige.mockRejectedValueOnce(
      new ForbiddenError('Das Passwort stimmt nicht.', 'PASSWORT_FALSCH')
    );
    const r = await request(app())
      .post('/api/backup/wiederherstellung/app/probe-rueck')
      .send({ passwort: 'falsch', stand_id: A });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('PASSWORT_FALSCH');
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('mit Passwort: der Bereich kommt zurueck, das Passwort geht an die Pruefung', async () => {
    zweiStaende();
    container();
    mockBestaetige.mockResolvedValueOnce(undefined);
    const r = await request(app())
      .post('/api/backup/wiederherstellung/bereich/probe-rueck')
      .send({ passwort: 'richtig', stand_id: A });
    expect(mockBestaetige).toHaveBeenCalledWith(7, 'richtig');
    expect(r.status).toBe(200);
    expect(r.body.data.vorher.id).toBe(VORHER);
  });

  it('GET /staende liefert die Liste', async () => {
    zweiStaende();
    const r = await request(app()).get('/api/backup/staende');
    expect(r.status).toBe(200);
    expect(r.body.data.map(s => s.id)).toEqual([B, A]);
  });
});
