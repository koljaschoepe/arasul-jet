/**
 * /api/profil (M5): jede angemeldete Person pflegt Name, Funktion, Kuerzel und
 * Bild; keine Kennung in der Adresse, wer es ist, sagt die Sitzung.
 */
const express = require('express');
const request = require('supertest');

jest.mock('../../src/database', () => ({ query: jest.fn(), transaction: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/utils/jwt', () => ({ blacklistAllUserTokens: jest.fn() }));
jest.mock('../../src/middleware/auth', () => {
  const echt = jest.requireActual('../../src/middleware/auth');
  return {
    requireAuth: (req, res, next) => {
      req.user = { id: '2', username: 'mia', role: 'mitarbeiter' };
      next();
    },
    requireRole: echt.requireRole,
    ROLLEN: echt.ROLLEN,
    invalidateUserCache: jest.fn(),
  };
});

const db = require('../../src/database');
const auth = require('../../src/middleware/auth');
const router = require('../../src/routes/profil');
const { errorHandler } = require('../../src/middleware/errorHandler');

const app = () => {
  const a = express();
  a.use(express.json({ limit: '10mb' }));
  a.use('/api/profil', router);
  a.use(errorHandler);
  return a;
};

// Ein PNG mit einem Pixel.
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('/api/profil', () => {
  beforeEach(() => db.query.mockReset());

  test('PUT setzt die Felder; leer wird NULL', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 2, username: 'mia', vorname: 'Mia', nachname: 'Muster', hat_bild: false }],
    });
    const res = await request(app())
      .put('/api/profil')
      .send({ vorname: ' Mia ', nachname: 'Muster', funktion: '', kuerzel: 'MM' });
    expect(res.status).toBe(200);
    expect(res.body.data.anzeigeName).toBe('Mia Muster');
    expect(db.query.mock.calls[0][1]).toEqual(['2', 'Mia', 'Muster', null, 'MM']);
    expect(auth.invalidateUserCache).toHaveBeenCalledWith('2');
  });

  test.each([
    [{ nachname: 'Muster' }],
    [{ vorname: 'Mia', nachname: 'Muster', kuerzel: 'ZUVIELEZEICHEN' }],
    [{ vorname: 'Mia', nachname: 'Muster', rolle: 'admin' }],
  ])('PUT lehnt %j mit 400 ab', async body => {
    const res = await request(app()).put('/api/profil').send(body);
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('PUT /bild speichert Typ und Bytes', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 2, username: 'mia', hat_bild: true }] });
    const res = await request(app()).put('/api/profil/bild').send({ bild: PIXEL });
    expect(res.status).toBe(200);
    expect(res.body.data.hatBild).toBe(true);
    expect(db.query.mock.calls[0][1][1]).toBe('image/png');
    expect(Buffer.isBuffer(db.query.mock.calls[0][1][2])).toBe(true);
  });

  test.each([
    ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
    ['data:text/html;base64,PGI+'],
    ['kein data-url'],
  ])('PUT /bild lehnt %s ab', async bild => {
    const res = await request(app()).put('/api/profil/bild').send({ bild });
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('PUT /bild lehnt mehr als 512 KB ab', async () => {
    const gross = `data:image/png;base64,${'A'.repeat(800 * 1024)}`;
    const res = await request(app()).put('/api/profil/bild').send({ bild: gross });
    expect(res.status).toBe(400);
  });

  test('GET /bild liefert die Bytes mit ihrem Typ', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ bild_typ: 'image/png', bild_daten: Buffer.from('png') }],
    });
    const res = await request(app()).get('/api/profil/bild');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
  });

  test('GET /bild ohne Bild ist 404', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ bild_typ: null, bild_daten: null }] });
    const res = await request(app()).get('/api/profil/bild');
    expect(res.status).toBe(404);
  });

  test('DELETE /bild entfernt es', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 2, username: 'mia', hat_bild: false }] });
    const res = await request(app()).delete('/api/profil/bild');
    expect(res.status).toBe(200);
    expect(db.query.mock.calls[0][1]).toEqual(['2', null, null]);
  });
});
