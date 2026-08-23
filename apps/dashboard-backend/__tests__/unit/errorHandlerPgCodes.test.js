/**
 * Eine kaputte Id in der Adresse ist eine Eingabe, kein Geraetefehler.
 *
 * Gefunden am 23.08.2026 an `DELETE /api/sandbox/projects/:id`: acht Routen
 * dort nehmen `:id` ohne Pruefung, die Spalte ist `uuid`, und Postgres wirft
 * `22P02`. Der Fehlerpfad kannte den Code nicht, also kam HTTP 500 zurueck —
 * mit der rohen Postgres-Meldung, in der die eingegebene Zeichenkette stand.
 *
 * Fuer den Betreiber ist das der Unterschied zwischen "ich habe mich vertippt"
 * und "das Geraet ist kaputt".
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-minimum-32-chars';

const request = require('supertest');
const express = require('express');

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { errorHandler } = require('../../src/middleware/errorHandler');

function appMit(fehler) {
  const app = express();
  app.get('/x', (_req, _res, next) => next(fehler));
  app.use(errorHandler);
  return app;
}

const pgFehler = (code, message) => Object.assign(new Error(message), { code });

describe('Postgres-Codes im Fehlerpfad', () => {
  it('22P02 ist 400, nicht 500', async () => {
    const res = await request(
      appMit(pgFehler('22P02', 'invalid input syntax for type uuid: "abc-kaputt"'))
    ).get('/x');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('die rohe Postgres-Meldung steht nicht in der Antwort', async () => {
    // Sie trug die eingegebene Zeichenkette zurueck an den Aufrufer.
    const res = await request(
      appMit(pgFehler('22P02', 'invalid input syntax for type uuid: "abc-kaputt"'))
    ).get('/x');
    expect(JSON.stringify(res.body)).not.toMatch(/abc-kaputt/);
    expect(JSON.stringify(res.body)).not.toMatch(/invalid input syntax/i);
  });

  it('die vorhandenen Codes bleiben, wie sie waren', async () => {
    const doppelt = await request(appMit(pgFehler('23505', 'duplicate key'))).get('/x');
    expect(doppelt.status).toBe(409);
    const fk = await request(appMit(pgFehler('23503', 'fk violation'))).get('/x');
    expect(fk.status).toBe(400);
  });

  it('ein unbekannter Fehler bleibt 500', async () => {
    const res = await request(appMit(new Error('irgendwas'))).get('/x');
    expect(res.status).toBe(500);
  });
});
