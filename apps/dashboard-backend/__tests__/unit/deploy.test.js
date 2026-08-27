/**
 * Der Deploy-Endpunkt des Ara-Kits (Phase C5).
 *
 * Drei Dinge werden hier gehalten, und alle drei sind Zusagen der Phase:
 * dass ohne den Bereich `app:deploy` nichts geht, dass vor dem Entfernen eine
 * Rueckfrage steht, und dass der Schalter denselben Dienst ruft wie das
 * Einspielen -- es gibt keine zweite Einspiel-Logik neben der aus C3.
 */
const express = require('express');
const request = require('supertest');

process.env.APPS_DIR = '/tmp/arasul-deploy-test';
process.env.RATE_LIMIT_ENABLED = 'false';

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/utils/auditLog', () => ({ logSecurityEvent: jest.fn() }));

jest.mock('../../src/services/app/appPaket', () => ({
  MAX_ARCHIV_BYTES: 1024 * 1024,
  eingangsOrdner: () => '/tmp/arasul-deploy-test/.eingang',
  nimmAn: jest.fn(),
}));
jest.mock('../../src/services/app/appStore', () => ({
  holeApp: jest.fn(),
  schalte: jest.fn(),
  entferneApp: jest.fn(),
}));

// Die echte Pruefung bleibt drin, nur die Schluesselsuche in der Datenbank
// nicht: `requireEndpoint` IST die Zusage, die hier gemessen wird, und eine
// nachgebaute Fassung davon wuerde etwas ueber den Nachbau aussagen.
jest.mock('../../src/middleware/apiKeyAuth', () => {
  const echt = jest.requireActual('../../src/middleware/apiKeyAuth');
  const { VORGABE_ENDPUNKTE } = jest.requireActual('../../src/config/apiBereiche');
  return {
    ...echt,
    requireApiKey: (req, res, next) => {
      const schluessel = req.headers['x-api-key'];
      if (!schluessel) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'API key required' } });
        return;
      }
      req.apiKey = {
        id: 1,
        prefix: 'aras_test123',
        name: 'Test',
        userId: 42,
        allowedEndpoints: schluessel === 'kit' ? ['app:deploy'] : [...VORGABE_ENDPUNKTE],
      };
      next();
    },
  };
});

const appStore = require('../../src/services/app/appStore');
const appPaket = require('../../src/services/app/appPaket');
const { errorHandler } = require('../../src/middleware/errorHandler');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/v1/external', require('../../src/routes/external/deploy'));
  a.use(errorHandler);
  return a;
}

beforeEach(() => jest.clearAllMocks());

describe('GET /contract', () => {
  it('braucht einen Schluessel, aber keinen mit app:deploy', async () => {
    await request(app()).get('/api/v1/external/contract').expect(401);

    const antwort = await request(app())
      .get('/api/v1/external/contract')
      .set('x-api-key', 'app-eigener-schluessel')
      .expect(200);
    expect(antwort.body.data.kontrakt).toBeGreaterThanOrEqual(1);
    expect(antwort.body.data.koepfe.benutzer).toBe('X-Arasul-User');
  });
});

describe('Wer nicht deployen darf', () => {
  const wege = [
    ['post', '/api/v1/external/apps'],
    ['get', '/api/v1/external/apps/urlaub'],
    ['post', '/api/v1/external/apps/urlaub/schalten'],
    ['delete', '/api/v1/external/apps/urlaub?bestaetigung=urlaub'],
  ];

  it.each(wege)('%s %s ist ohne Schluessel 401', async (verb, pfad) => {
    await request(app())[verb](pfad).expect(401);
  });

  it.each(wege)('%s %s ist mit einem App-Schluessel 403', async (verb, pfad) => {
    // Genau der Schluessel, den das Geraet einer App beim Einspielen mitgibt
    // (C4): er traegt die Vorgabe-Bereiche und damit KEIN `app:deploy`.
    const antwort = await request(app())[verb](pfad).set('x-api-key', 'app-eigener');
    expect(antwort.status).toBe(403);
  });
});

describe('POST /apps', () => {
  it('weist eine Anfrage ohne Paket ab', async () => {
    const antwort = await request(app())
      .post('/api/v1/external/apps')
      .set('x-api-key', 'kit')
      .expect(400);
    expect(antwort.body.error.message).toMatch(/paket/i);
  });

  it('weist eine Datei ab, die kein .tar.gz ist', async () => {
    const antwort = await request(app())
      .post('/api/v1/external/apps')
      .set('x-api-key', 'kit')
      .attach('paket', Buffer.from('nicht wirklich ein Archiv'), 'app.zip');
    expect(antwort.status).toBe(400);
    expect(antwort.body.error.message).toMatch(/tar\.gz/);
    expect(appPaket.nimmAn).not.toHaveBeenCalled();
  });

  it('reicht ein Paket an den Dienst weiter und antwortet mit dem Stand', async () => {
    appPaket.nimmAn.mockResolvedValue({
      app_id: 'urlaub',
      stand: 'test',
      version: '1.2.0',
      vorige_version: null,
    });
    const antwort = await request(app())
      .post('/api/v1/external/apps')
      .set('x-api-key', 'kit')
      .attach('paket', Buffer.from('tut so, als waere es ein Archiv'), 'paket.tgz')
      .expect(201);
    expect(antwort.body.data.stand).toBe('test');
    expect(appPaket.nimmAn).toHaveBeenCalledWith(
      expect.objectContaining({ durch: 42, archivPfad: expect.any(String) })
    );
  });
});

describe('POST /apps/:id/schalten', () => {
  it('kennt genau zwei Ziele', async () => {
    const antwort = await request(app())
      .post('/api/v1/external/apps/urlaub/schalten')
      .set('x-api-key', 'kit')
      .send({ ziel: 'irgendwohin' })
      .expect(400);
    expect(antwort.body.error.message).toMatch(/live/);
    expect(appStore.schalte).not.toHaveBeenCalled();
  });

  it('gibt `live` an den Dienst weiter', async () => {
    appStore.schalte.mockResolvedValue({ app_id: 'urlaub', stand: 'live', version: '1.2.0' });
    await request(app())
      .post('/api/v1/external/apps/urlaub/schalten')
      .set('x-api-key', 'kit')
      .send({ ziel: 'live' })
      .expect(200);
    expect(appStore.schalte).toHaveBeenCalledWith({ appId: 'urlaub', ziel: 'live', durch: 42 });
  });

  it('gibt `zurueck` ebenso weiter', async () => {
    appStore.schalte.mockResolvedValue({ app_id: 'urlaub', stand: 'live', version: '1.1.0' });
    await request(app())
      .post('/api/v1/external/apps/urlaub/schalten')
      .set('x-api-key', 'kit')
      .send({ ziel: 'zurueck' })
      .expect(200);
    expect(appStore.schalte).toHaveBeenCalledWith({ appId: 'urlaub', ziel: 'zurueck', durch: 42 });
  });
});

describe('DELETE /apps/:id', () => {
  it('verlangt die Rueckfrage', async () => {
    const antwort = await request(app())
      .delete('/api/v1/external/apps/urlaub')
      .set('x-api-key', 'kit')
      .expect(400);
    expect(antwort.body.error.message).toMatch(/bestaetigung/i);
    expect(appStore.entferneApp).not.toHaveBeenCalled();
  });

  it('nimmt keine falsche Rueckfrage an', async () => {
    await request(app())
      .delete('/api/v1/external/apps/urlaub?bestaetigung=krankmeldung')
      .set('x-api-key', 'kit')
      .expect(400);
    expect(appStore.entferneApp).not.toHaveBeenCalled();
  });

  it('laesst die Dateien liegen, wenn niemand etwas anderes sagt', async () => {
    appStore.entferneApp.mockResolvedValue({ id: 'urlaub', dateien_entfernt: null });
    await request(app())
      .delete('/api/v1/external/apps/urlaub?bestaetigung=urlaub')
      .set('x-api-key', 'kit')
      .expect(200);
    expect(appStore.entferneApp).toHaveBeenCalledWith('urlaub', { dateien: false });
  });

  it('nimmt sie mit, wenn `dateien=true` dabeisteht', async () => {
    appStore.entferneApp.mockResolvedValue({ id: 'urlaub', dateien_entfernt: ['1.0.0'] });
    await request(app())
      .delete('/api/v1/external/apps/urlaub?bestaetigung=urlaub&dateien=true')
      .set('x-api-key', 'kit')
      .expect(200);
    expect(appStore.entferneApp).toHaveBeenCalledWith('urlaub', { dateien: true });
  });
});
