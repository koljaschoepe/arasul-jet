/**
 * Das Geraet spielt eine neue Fassung seiner selbst ein (J39).
 *
 * Gehalten wird, was die Zusage ausmacht: dass ohne den Bereich
 * `system:update` nichts geht, dass VOR dem Einspielen gesichert wird und eine
 * gescheiterte Sicherung alles anhaelt, dass eine Fassung, die nicht neuer ist,
 * nicht eingespielt wird, und dass in die Befehlszeile am Host nur Werte
 * kommen, die gegen ein enges Muster geprueft sind.
 */
const express = require('express');
const request = require('supertest');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-fassung-'));
process.env.UPDATES_DIR = ordner;
process.env.RATE_LIMIT_ENABLED = 'false';
process.env.SYSTEM_VERSION = '0.8.14';

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/utils/auditLog', () => ({ logSecurityEvent: jest.fn() }));
jest.mock('../../src/services/app/appPaket', () => ({
  MAX_ARCHIV_BYTES: 1024,
  eingangsOrdner: () => '/tmp/x',
  nimmAn: jest.fn(),
}));
jest.mock('../../src/services/app/appStore', () => ({}));

const mockContainer = {
  inspect: jest.fn(),
  remove: jest.fn().mockResolvedValue(),
  start: jest.fn().mockResolvedValue(),
};
const mockDocker = {
  getContainer: jest.fn(() => mockContainer),
  createContainer: jest.fn().mockResolvedValue(mockContainer),
};
jest.mock('../../src/services/core/docker', () => ({ docker: mockDocker }));

const mockSichern = jest.fn();
jest.mock('../../src/services/betrieb/sicherungsdienst', () => ({
  sichereVorUpdate: (...a) => mockSichern(...a),
}));

const mockAxios = { get: jest.fn() };
jest.mock('axios', () => ({ get: (...a) => mockAxios.get(...a) }));

jest.mock('../../src/middleware/apiKeyAuth', () => {
  const echt = jest.requireActual('../../src/middleware/apiKeyAuth');
  return {
    ...echt,
    requireApiKey: (req, res, next) => {
      const k = req.headers['x-api-key'];
      if (!k) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'API key required' } });
        return;
      }
      req.apiKey = {
        id: 1,
        prefix: 'aras_test123',
        userId: 42,
        allowedEndpoints: k === 'update' ? ['system:update'] : k === 'kit' ? ['app:deploy'] : [],
      };
      next();
    },
  };
});

const dienst = require('../../src/services/betrieb/fassungsdienst');
const { errorHandler } = require('../../src/middleware/errorHandler');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/v1/external', require('../../src/routes/external/deploy'));
  a.use(errorHandler);
  return a;
}

function eigenerContainer({ wurzel = '/home/arasul/arasul-0.8.14' } = {}) {
  mockContainer.inspect.mockResolvedValue({
    Image: 'sha256:abc',
    Config: { Labels: { 'com.docker.compose.project.working_dir': wurzel } },
    Mounts: [{ Destination: ordner, Source: '/home/arasul/arasul-0.8.14/data/updates' }],
    State: { Running: false },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  eigenerContainer();
  mockDocker.getContainer.mockImplementation(() => mockContainer);
  fs.rmSync(path.join(ordner, 'fassung'), { recursive: true, force: true });
  fs.rmSync(path.join(ordner, 'fassungen'), { recursive: true, force: true });
});

describe('Bereich system:update', () => {
  test('ohne Schluessel 401', async () => {
    await request(app()).post('/api/v1/external/update').send({}).expect(401);
  });

  test('der Deploy-Schluessel des Kits darf es nicht', async () => {
    const r = await request(app()).post('/api/v1/external/update').set('x-api-key', 'kit').send({});
    expect(r.status).toBe(403);
    expect(r.body.error.message).toContain('system:update');
  });

  test('der Bereich steht in der Liste, aber nicht in der Vorgabe', () => {
    const { ALLE_ENDPUNKTE, VORGABE_ENDPUNKTE } = require('../../src/config/apiBereiche');
    expect(ALLE_ENDPUNKTE).toContain('system:update');
    expect(VORGABE_ENDPUNKTE).not.toContain('system:update');
  });
});

describe('Vorpruefungen', () => {
  test('eine Fassung, die nicht neuer ist, wird abgelehnt', async () => {
    const r = await request(app())
      .post('/api/v1/external/update')
      .set('x-api-key', 'update')
      .send({ fassung: '0.8.14' });
    expect(r.status).toBe(409);
    expect(mockSichern).not.toHaveBeenCalled();
    expect(mockDocker.createContainer).not.toHaveBeenCalled();
  });

  test('eine Fassung in falscher Form wird abgelehnt', async () => {
    const r = await request(app())
      .post('/api/v1/external/update')
      .set('x-api-key', 'update')
      .send({ fassung: '0.8.15; rm -rf /' });
    expect(r.status).toBe(400);
  });

  test('ohne bekanntes Arbeitsverzeichnis geht es nicht', async () => {
    eigenerContainer({ wurzel: null });
    const r = await request(app())
      .post('/api/v1/external/update')
      .set('x-api-key', 'update')
      .send({ fassung: '0.8.15' });
    expect(r.status).toBe(503);
    expect(mockSichern).not.toHaveBeenCalled();
  });

  test('ein Pfad mit Leerzeichen oder Anfuehrungszeichen kommt nie in eine Befehlszeile', async () => {
    eigenerContainer({ wurzel: "/home/ara sul/x'y" });
    const w = await dienst.wegPruefen();
    expect(w.moeglich).toBe(false);
  });

  test('wenig Platz haelt alles an', async () => {
    const statfs = jest.spyOn(fs.promises, 'statfs').mockResolvedValue({ bavail: 10, bsize: 1024 });
    const r = await request(app())
      .post('/api/v1/external/update')
      .set('x-api-key', 'update')
      .send({ fassung: '0.8.15' });
    statfs.mockRestore();
    expect(r.status).toBe(503);
    expect(r.body.error.message).toContain('GB frei');
  });
});

describe('Einspielen', () => {
  function platzDa() {
    return jest
      .spyOn(fs.promises, 'statfs')
      .mockResolvedValue({ bavail: 100 * 1024 * 1024, bsize: 1024 });
  }

  async function warteAufStatus(erwartet) {
    for (let i = 0; i < 100; i++) {
      const s = await dienst.stand();
      if (s.lauf && erwartet(s.lauf)) {
        return s.lauf;
      }
      await new Promise(r => setTimeout(r, 20));
    }
    throw new Error('Status kam nicht: ' + JSON.stringify(await dienst.stand()));
  }

  test('scheitert die Sicherung, wird nichts uebergeben', async () => {
    const statfs = platzDa();
    const ablage = path.join(ordner, 'fassungen');
    mockAxios.get.mockImplementation(async url => {
      fs.mkdirSync(ablage, { recursive: true });
      const { Readable } = require('stream');
      if (url.endsWith('.sha256')) {
        const sum = require('crypto').createHash('sha256').update('paket').digest('hex');
        return { data: Readable.from([Buffer.from(`${sum}  arasul-0.8.15.tar.gz\n`)]) };
      }
      return { data: Readable.from([Buffer.from('paket')]) };
    });
    mockSichern.mockResolvedValue({ erfolg: false, ausgabe: 'kaputt' });

    const r = await request(app())
      .post('/api/v1/external/update')
      .set('x-api-key', 'update')
      .send({ fassung: '0.8.15' });
    expect(r.status).toBe(202);
    expect(r.body.data).toMatchObject({ von: '0.8.14', nach: '0.8.15' });

    const lauf = await warteAufStatus(l => l.status === 'fehlgeschlagen');
    statfs.mockRestore();
    expect(lauf.meldung).toContain('Sicherung');
    expect(mockSichern).toHaveBeenCalledTimes(1);
    expect(mockDocker.createContainer).not.toHaveBeenCalled();
  });

  test('eine falsche Pruefsumme verwirft das Paket, ohne zu sichern', async () => {
    const statfs = platzDa();
    mockAxios.get.mockImplementation(async url => {
      const { Readable } = require('stream');
      if (url.endsWith('.sha256')) {
        return { data: Readable.from([Buffer.from('0'.repeat(64))]) };
      }
      return { data: Readable.from([Buffer.from('paket')]) };
    });
    await request(app())
      .post('/api/v1/external/update')
      .set('x-api-key', 'update')
      .send({ fassung: '0.8.15' })
      .expect(202);
    const lauf = await warteAufStatus(l => l.status === 'fehlgeschlagen');
    statfs.mockRestore();
    expect(lauf.meldung).toContain('Prüfsumme');
    expect(mockSichern).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(ordner, 'fassungen', 'arasul-0.8.15.tar.gz'))).toBe(false);
  });

  test('erst Sicherung, dann der Hilfscontainer mit dem Skript der laufenden Fassung', async () => {
    const statfs = platzDa();
    const { Readable } = require('stream');
    const sum = require('crypto').createHash('sha256').update('paket').digest('hex');
    mockAxios.get.mockImplementation(async url =>
      url.endsWith('.sha256')
        ? { data: Readable.from([Buffer.from(`${sum}  x\n`)]) }
        : { data: Readable.from([Buffer.from('paket')]) }
    );
    const reihenfolge = [];
    mockSichern.mockImplementation(async () => {
      reihenfolge.push('sichern');
      return { erfolg: true, id: 'abcdef123456', zeitpunkt: '2026-10-04T02:00:00Z' };
    });
    mockDocker.createContainer.mockImplementation(async cfg => {
      reihenfolge.push('uebergabe');
      mockDocker.letzte = cfg;
      return mockContainer;
    });

    await request(app())
      .post('/api/v1/external/update')
      .set('x-api-key', 'update')
      .send({ fassung: '0.8.15' })
      .expect(202);
    await warteAufStatus(l => l.schritt === 'uebergabe' && l.sicherung);
    for (let i = 0; i < 50 && !mockDocker.letzte; i++) {
      await new Promise(r => setTimeout(r, 20));
    }
    statfs.mockRestore();

    expect(reihenfolge).toEqual(['sichern', 'uebergabe']);
    const cfg = mockDocker.letzte;
    expect(cfg.HostConfig).toMatchObject({ Privileged: true, PidMode: 'host' });
    expect(cfg.Cmd.slice(0, 9)).toEqual(['nsenter', '-t', '1', '-m', '-u', '-i', '-n', '-p', '--']);
    const befehl = cfg.Cmd[cfg.Cmd.length - 1];
    expect(befehl).toContain(
      '/home/arasul/arasul-0.8.14/scripts/deploy/fassung-einspielen.sh einspielen'
    );
    expect(befehl).toContain(
      '/home/arasul/arasul-0.8.14/data/updates/fassungen/arasul-0.8.15.tar.gz 0.8.15'
    );
    // Das Paket liegt im Ablageordner des Geraets, mit der Pruefsumme daneben.
    expect(fs.existsSync(path.join(ordner, 'fassungen', 'arasul-0.8.15.tar.gz'))).toBe(true);
  });
});

describe('Stand und Rueckweg', () => {
  test('ohne Lauf: Fassung, Moeglichkeit, kein Rueckweg', async () => {
    const r = await request(app()).get('/api/v1/external/update').set('x-api-key', 'update');
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({
      fassung: { version: '0.8.14', nummer: '0.8.14' },
      einspielenMoeglich: true,
      laeuft: false,
      lauf: null,
      zurueckMoeglich: false,
    });
  });

  test('ein Lauf, der laeuft, ohne dass etwas laeuft, heisst abgebrochen', async () => {
    fs.mkdirSync(path.join(ordner, 'fassung'), { recursive: true });
    fs.writeFileSync(
      path.join(ordner, 'fassung', 'status.json'),
      JSON.stringify({ status: 'laeuft', schritt: 'installieren' })
    );
    fs.writeFileSync(path.join(ordner, 'fassung', 'lauf.log'), 'a\nb\n');
    const s = await dienst.stand();
    expect(s.lauf.status).toBe('abgebrochen');
    expect(s.lauf.protokoll).toEqual(['a', 'b']);
  });

  test('ein Lauf, bei dem der Hilfscontainer noch arbeitet, laeuft', async () => {
    fs.mkdirSync(path.join(ordner, 'fassung'), { recursive: true });
    fs.writeFileSync(
      path.join(ordner, 'fassung', 'status.json'),
      JSON.stringify({ status: 'laeuft', schritt: 'installieren' })
    );
    mockContainer.inspect.mockImplementation(async () => ({
      Image: 'sha256:abc',
      Config: {
        Labels: { 'com.docker.compose.project.working_dir': '/home/arasul/arasul-0.8.14' },
      },
      Mounts: [{ Destination: ordner, Source: '/home/arasul/arasul-0.8.14/data/updates' }],
      State: { Running: true },
    }));
    const s = await dienst.stand();
    expect(s.laeuft).toBe(true);
    expect(s.lauf.status).toBe('laeuft');
  });

  test('zurueck ohne vorige Fassung: 404', async () => {
    const r = await request(app())
      .post('/api/v1/external/update/zurueck')
      .set('x-api-key', 'update')
      .send({});
    expect(r.status).toBe(404);
    expect(mockDocker.createContainer).not.toHaveBeenCalled();
  });

  test('zurueck startet das Skript mit "zurueck"', async () => {
    fs.mkdirSync(path.join(ordner, 'fassung'), { recursive: true });
    fs.writeFileSync(
      path.join(ordner, 'fassung', 'status.json'),
      JSON.stringify({ status: 'fertig', vorigeFassung: '0.8.14', vorigerOrdner: '/x' })
    );
    const r = await request(app())
      .post('/api/v1/external/update/zurueck')
      .set('x-api-key', 'update')
      .send({});
    expect(r.status).toBe(202);
    const cfg = mockDocker.createContainer.mock.calls[0][0];
    expect(cfg.Cmd[cfg.Cmd.length - 1]).toMatch(/fassung-einspielen\.sh zurueck [a-z0-9]+'$/);
  });
});

describe('vergleiche', () => {
  test('rechnet numerisch, nicht als Text', () => {
    expect(dienst.vergleiche('0.8.15', '0.8.14')).toBeGreaterThan(0);
    expect(dienst.vergleiche('0.8.9', '0.8.14')).toBeLessThan(0);
    expect(dienst.vergleiche('1.0.0', '1.0.0')).toBe(0);
  });

  test('ein Geraet im Zwischenstand nimmt die Nummer aus dem Ordner', () => {
    const alt = process.env.SYSTEM_VERSION;
    process.env.SYSTEM_VERSION = '20261001-759a2b8';
    expect(dienst.installierteNummer('/home/arasul/arasul-0.8.14')).toBe('0.8.14');
    expect(dienst.installierteNummer('/home/arasul/arasul')).toBeNull();
    process.env.SYSTEM_VERSION = alt;
  });
});
