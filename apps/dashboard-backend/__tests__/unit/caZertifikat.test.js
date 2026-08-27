/**
 * GET /api/system/ca-zertifikat (Phase C10, 27.08.2026)
 *
 * Der Weg, auf dem der Admin das CA-Zertifikat des Geraets bekommt, um es in
 * der Firma zu verteilen. Drei Dinge muessen stimmen, und zwei davon sind
 * Sicherheitsaussagen:
 *
 *   1. Es kommt als DATEI, mit Namen. Ein PEM im Browserfenster hilft
 *      niemandem; installiert wird eine Datei.
 *   2. Der private Schluessel der CA geht diesen Weg NICHT mit. Er liegt im
 *      selben Ordner, und wer ihn mit ausliefert, macht die CA in dem Moment
 *      wertlos, in dem der Admin die Datei weitergibt.
 *   3. Ein Geraet ohne CA sagt das mit einem 404 und einem Satz, der den
 *      naechsten Schritt nennt -- statt eine leere Datei zu schicken.
 */

const request = require('supertest');
const fs = require('fs').promises;

jest.mock('../../src/database', () => ({
  query: jest.fn(),
  initialize: jest.fn().mockResolvedValue(true),
  getPoolStats: jest.fn().mockReturnValue({ total: 10, idle: 5, waiting: 0 }),
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const db = require('../../src/database');
const { app } = require('../../src/server');
const { setupAuthMocks, generateTestToken } = require('../helpers/authMock');

const CA_PFAD = '/config/traefik/certs/arasul-ca.crt';
const PEM =
  '-----BEGIN CERTIFICATE-----\nMIIBkTCB+wIJAKZ0\n-----END CERTIFICATE-----\n';

describe('GET /api/system/ca-zertifikat', () => {
  let token;
  let lesen;

  beforeEach(() => {
    jest.clearAllMocks();
    setupAuthMocks(db);
    token = generateTestToken();
    lesen = jest.spyOn(fs, 'readFile');
  });

  afterEach(() => {
    lesen.mockRestore();
  });

  test('liefert das CA-Zertifikat als Datei', async () => {
    lesen.mockImplementation(async pfad => {
      if (pfad === CA_PFAD) return PEM;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const antwort = await request(app)
      .get('/api/system/ca-zertifikat')
      .set('Authorization', `Bearer ${token}`);

    expect(antwort.status).toBe(200);
    expect(antwort.headers['content-type']).toMatch(/x-x509-ca-cert/);
    expect(antwort.headers['content-disposition']).toMatch(/attachment; filename="[a-z0-9-]+-ca\.crt"/);
    expect(antwort.text).toContain('BEGIN CERTIFICATE');
  });

  test('liest genau die CA-Datei, nicht den privaten Schluessel daneben', async () => {
    lesen.mockResolvedValue(PEM);

    await request(app).get('/api/system/ca-zertifikat').set('Authorization', `Bearer ${token}`);

    const gelesen = lesen.mock.calls.map(aufruf => String(aufruf[0]));
    expect(gelesen).toContain(CA_PFAD);
    expect(gelesen.some(pfad => pfad.endsWith('.key'))).toBe(false);
  });

  test('ohne CA am Geraet: 404 mit dem naechsten Schritt', async () => {
    lesen.mockImplementation(async () => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const antwort = await request(app)
      .get('/api/system/ca-zertifikat')
      .set('Authorization', `Bearer ${token}`);

    expect(antwort.status).toBe(404);
    expect(JSON.stringify(antwort.body)).toContain('arasul zertifikat');
  });

  test('eine unlesbare Datei gilt nicht als Zertifikat', async () => {
    lesen.mockResolvedValue('kaputt, kein PEM');

    const antwort = await request(app)
      .get('/api/system/ca-zertifikat')
      .set('Authorization', `Bearer ${token}`);

    expect(antwort.status).toBe(404);
  });

  test('ohne Anmeldung gibt es nichts', async () => {
    lesen.mockResolvedValue(PEM);

    const antwort = await request(app).get('/api/system/ca-zertifikat');

    expect([401, 403]).toContain(antwort.status);
  });
});
