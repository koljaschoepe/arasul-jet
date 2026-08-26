/**
 * GET /api/flows/beispiele (Plan 023 B4).
 *
 * Zwei Dinge koennen hier schiefgehen und beide waeren unsichtbar: die Route
 * steht hinter `/:name` und wird nie erreicht, oder sie liefert die interne
 * Form mit `systemPrompt` statt `prompt`, und das Formular bleibt leer.
 */

const request = require('supertest');
const express = require('express');

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/middleware/auth', () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: 1, username: 'kolja', role: 'admin' };
    next();
  },
  requireAdmin: (req, res, next) => next(),
  optionalAuth: (req, res, next) => next(),
  invalidateUserCache: jest.fn(),
}));

jest.mock('../../src/database', () => ({ query: jest.fn(), transaction: jest.fn() }));

const flowRouter = require('../../src/routes/flows');
const { errorHandler } = require('../../src/middleware/errorHandler');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/flows', flowRouter);
  a.use(errorHandler);
  return a;
}

test('listet die mitgelieferten Beispiele ohne ihren Inhalt', async () => {
  const res = await request(app()).get('/api/flows/beispiele').expect(200);

  const namen = res.body.data.map(b => b.name);
  expect(namen).toContain('wissen');
  for (const beispiel of res.body.data) {
    expect(beispiel.beschreibung.length).toBeGreaterThan(5);
    // Die Liste ist eine Liste. Der Inhalt kommt erst auf Anfrage.
    expect(beispiel.definition).toBeUndefined();
  }
});

test('liefert ein Beispiel in derselben Form wie einen geladenen Flow', async () => {
  const res = await request(app()).get('/api/flows/beispiele/wissen').expect(200);

  // `prompt`, nicht `systemPrompt`: sonst fuellt fromDefinition() ein leeres
  // Formular und niemand sieht, warum.
  expect(res.body.data.prompt.length).toBeGreaterThan(20);
  expect(res.body.data.systemPrompt).toBeUndefined();
  expect(res.body.data.name).toBe('wissen');
});

test('ein unbekanntes Beispiel ist ein 404 und kein Flow-Name', async () => {
  // Die Route steht bewusst vor `/:name`. Stuende sie dahinter, liefe die
  // Anfrage in die Flow-Suche und die Meldung waere eine ganz andere.
  const res = await request(app()).get('/api/flows/beispiele/gibtsnicht').expect(404);
  expect(res.body.error.message).toMatch(/Kein Beispiel/);
});
