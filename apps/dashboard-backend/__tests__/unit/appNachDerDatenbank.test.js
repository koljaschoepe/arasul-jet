/**
 * Apps starten nach der Datenbank (Auftrag apps-starten-nach-der-datenbank,
 * 26.09.2026, J35).
 *
 * Der Befund am Orin nach einem Neustart: Docker startet die App-Container
 * (`unless-stopped`) selbst, bevor `ordered-startup.sh` Postgres anlegt, und
 * eine App, die ihre Datenbank beim Start nicht fand, lief ohne sie weiter.
 * Gemessen wird hier die Regel: neu gestartet wird genau, wer VOR der
 * Datenbank hochkam und laeuft -- nicht, wer juenger ist (ein Deploy des
 * Backends darf keine App anfassen), und nicht, wer angehalten ist.
 */

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const container = {};
jest.mock('../../src/services/core/docker', () => ({
  docker: {
    listContainers: jest.fn(),
    getContainer: jest.fn(id => container[id]),
  },
}));

const db = require('../../src/database');
const logger = require('../../src/utils/logger');
const { docker } = require('../../src/services/core/docker');
const appDatenbank = require('../../src/services/app/appDatenbank');

const DB_SEIT = '2026-09-25T22:43:27.019Z';

function containerDa(id, { gestartet, laeuft = true, name = id }) {
  container[id] = {
    inspect: jest.fn().mockResolvedValue({
      Name: `/${name}`,
      State: { Running: laeuft, StartedAt: gestartet },
    }),
    restart: jest.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  for (const id of Object.keys(container)) {
    delete container[id];
  }
  db.query.mockReset();
  db.query.mockResolvedValue({ rows: [{ seit: DB_SEIT }] });
  docker.listContainers.mockReset();
  logger.warn.mockClear();
});

describe('Nach dem Neustart des Geraets', () => {
  test('eine App, die vor der Datenbank hochkam, startet neu', async () => {
    // Die Zahlen vom Orin, 26.09.2026: belege-live 40 s vor postgres-db.
    containerDa('belege', { gestartet: '2026-09-25T22:42:47.320682944Z' });
    docker.listContainers.mockResolvedValue([{ Id: 'belege' }]);

    const neu = await appDatenbank.appsNachDerDatenbank();

    expect(neu).toEqual(['belege']);
    expect(container.belege.restart).toHaveBeenCalledTimes(1);
    // Gefragt wird Postgres selbst, nicht ein Containername.
    expect(db.query.mock.calls[0][0]).toMatch(/pg_postmaster_start_time/);
    expect(docker.listContainers).toHaveBeenCalledWith({ filters: { label: ['arasul.app'] } });
  });

  test('eine App, die nach der Datenbank startete, bleibt stehen', async () => {
    // Der Fall jedes Deploys: das Backend startet neu, Postgres nicht.
    containerDa('faktum', { gestartet: '2026-09-25T22:45:38.089Z' });
    docker.listContainers.mockResolvedValue([{ Id: 'faktum' }]);

    expect(await appDatenbank.appsNachDerDatenbank()).toEqual([]);
    expect(container.faktum.restart).not.toHaveBeenCalled();
  });

  test('ein angehaltener Container bleibt angehalten', async () => {
    containerDa('still', { gestartet: '2026-09-25T20:00:00Z', laeuft: false });
    docker.listContainers.mockResolvedValue([{ Id: 'still' }]);

    expect(await appDatenbank.appsNachDerDatenbank()).toEqual([]);
    expect(container.still.restart).not.toHaveBeenCalled();
  });

  test('einer, der nicht will, haelt die anderen nicht auf', async () => {
    containerDa('zickig', { gestartet: '2026-09-25T22:42:00Z' });
    containerDa('brav', { gestartet: '2026-09-25T22:42:01Z' });
    container.zickig.restart.mockRejectedValue(new Error('kaputt'));
    docker.listContainers.mockResolvedValue([{ Id: 'zickig' }, { Id: 'brav' }]);

    expect(await appDatenbank.appsNachDerDatenbank()).toEqual(['brav']);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/zickig/));
  });

  test('antwortet Postgres nicht, wirft es nicht und fasst nichts an', async () => {
    db.query.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await appDatenbank.appsNachDerDatenbank()).toEqual([]);
    expect(docker.listContainers).not.toHaveBeenCalled();
  });
});

describe('Fehlt die Datenbank eines Standes?', () => {
  test('eingetragen und in pg_database nicht da: fehlt', async () => {
    db.query.mockResolvedValue({ rows: [{ da: false }] });
    expect(await appDatenbank.fehlt('belege', 'live')).toBe(true);
    expect(db.query.mock.calls[0][1]).toEqual(['belege', 'live']);
  });

  test('eingetragen und da: fehlt nicht', async () => {
    db.query.mockResolvedValue({ rows: [{ da: true }] });
    expect(await appDatenbank.fehlt('belege', 'live')).toBe(false);
  });

  test('nie eingetragen: kein Mangel', async () => {
    db.query.mockResolvedValue({ rows: [] });
    expect(await appDatenbank.fehlt('fremd', 'live')).toBe(false);
  });
});
