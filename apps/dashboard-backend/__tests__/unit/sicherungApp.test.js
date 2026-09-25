/**
 * Die Daten EINER App zurueckholen (J35, 25.09.2026).
 *
 * Gemessen wird, was der ganze Weg zurueck nicht kann: nur die Datenbank
 * einer App anfassen, auch wenn es die App gerade nicht gibt -- und nichts
 * tun, wo keine Sicherung liegt. Ob Postgres die Daten danach der Rolle der
 * App gibt, misst die Abnahme am Orin; hier geht es um die Wahl der Datei und
 * das, was danach geschieht.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { PassThrough } = require('stream');

const ORDNER = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-sicherung-app-'));
process.env.BACKUP_REPORT_PATH = path.join(ORDNER, 'backup_report.json');

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
  fehlt: jest.fn(async () => false),
}));
jest.mock('../../src/services/app/appContainer', () => ({
  containerName: (appId, stand) => `app-${appId}-${stand}`,
}));

const mockExec = jest.fn();
const mockInspect = jest.fn();
const mockRestart = jest.fn();
jest.mock('../../src/services/core/docker', () => ({
  docker: {
    getContainer: jest.fn(() => ({ inspect: mockInspect, exec: mockExec, restart: mockRestart })),
  },
  getAllServicesStatus: jest.fn(),
}));

const db = require('../../src/database');
const appDatenbank = require('../../src/services/app/appDatenbank');
const sicherungsdienst = require('../../src/services/betrieb/sicherungsdienst');
const { NotFoundError } = require('../../src/utils/errors');

function containerLauf(code) {
  mockInspect.mockResolvedValue({ State: { Running: true } });
  mockExec.mockResolvedValue({
    start: async () => {
      const strom = new PassThrough();
      setImmediate(() => strom.end());
      return strom;
    },
    inspect: async () => ({ ExitCode: code }),
  });
}

/** Legt eine gesicherte Datenbank samt Zeiger `_latest` an, wie `backup.sh` es tut. */
function gesichert(name) {
  const ordner = path.join(ORDNER, 'postgres', 'apps');
  fs.mkdirSync(ordner, { recursive: true });
  const datei = `${name}_20260925_120000.sql.gz`;
  fs.writeFileSync(path.join(ordner, datei), 'x');
  fs.symlinkSync(datei, path.join(ordner, `${name}_latest.sql.gz`));
}

beforeEach(() => {
  jest.clearAllMocks();
  fs.rmSync(path.join(ORDNER, 'postgres'), { recursive: true, force: true });
});

afterAll(() => fs.rmSync(ORDNER, { recursive: true, force: true }));

describe('stelleAppWiederHer', () => {
  it('holt nur die Staende, von denen es eine Sicherung gibt', async () => {
    gesichert('arasul_app_probe_live');
    containerLauf(0);
    db.query.mockResolvedValue({ rows: [] });

    const ergebnis = await sicherungsdienst.stelleAppWiederHer({ appId: 'probe' });

    expect(ergebnis.erfolg).toBe(true);
    expect(ergebnis.staende.map(s => s.stand)).toEqual(['live']);
    expect(mockExec).toHaveBeenCalledTimes(1);
    expect(mockExec.mock.calls[0][0].Cmd).toEqual([
      '/usr/local/bin/wiederherstellen.sh',
      '--app-datenbank',
      'arasul_app_probe_live',
    ]);
  });

  it('startet nichts neu, wenn die App gerade entfernt ist -- das tut das naechste Einspielen', async () => {
    gesichert('arasul_app_probe_test');
    containerLauf(0);
    db.query.mockResolvedValue({ rows: [] });

    const ergebnis = await sicherungsdienst.stelleAppWiederHer({ appId: 'probe' });

    expect(ergebnis.staende[0].neu_gestartet).toBe(false);
    expect(appDatenbank.sorgeFuer).not.toHaveBeenCalled();
    expect(mockRestart).not.toHaveBeenCalled();
  });

  it('setzt bei einer eingespielten App das Passwort und startet ihren Container neu', async () => {
    gesichert('arasul_app_probe_live');
    containerLauf(0);
    db.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });

    const ergebnis = await sicherungsdienst.stelleAppWiederHer({ appId: 'probe', stand: 'live' });

    expect(appDatenbank.sorgeFuer).toHaveBeenCalledWith({ appId: 'probe', stand: 'live' });
    expect(mockRestart).toHaveBeenCalledTimes(1);
    expect(ergebnis.staende[0].neu_gestartet).toBe(true);
  });

  it('sagt 404, wo keine Sicherung liegt, und fasst nichts an', async () => {
    await expect(sicherungsdienst.stelleAppWiederHer({ appId: 'probe' })).rejects.toThrow(
      NotFoundError
    );
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('meldet einen gescheiterten Stand als Fehlschlag', async () => {
    gesichert('arasul_app_probe_live');
    containerLauf(1);

    const ergebnis = await sicherungsdienst.stelleAppWiederHer({ appId: 'probe' });

    expect(ergebnis.erfolg).toBe(false);
    expect(mockRestart).not.toHaveBeenCalled();
  });
});

describe('sicherungen', () => {
  it('nennt bei einer App-Datenbank, welche es ist', async () => {
    gesichert('arasul_app_probe_live');
    const liste = await sicherungsdienst.sicherungen();
    const eintrag = liste.find(s => s.art === 'app-datenbanken');
    expect(eintrag.datenbank).toBe('arasul_app_probe_live');
  });
});
