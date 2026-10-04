/**
 * Eigene Fehler mit Rohtext (M5, Auftrag jet-fehlerklassen).
 *
 * `InternalError` und `UpstreamError` tragen in `roh` den technischen Text
 * (Ausgabe des tailscale-Programms, Antwort des Firmenordners). Der gehoert
 * ins Log und nie in die Antwort; der Klient liest Satz, Status und Code.
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

const logger = require('../../src/utils/logger');
const { errorHandler } = require('../../src/middleware/errorHandler');
const { InternalError, UpstreamError } = require('../../src/utils/errors');

function appMit(fehler) {
  const app = express();
  app.get('/x', (_req, _res, next) => next(fehler));
  app.use(errorHandler);
  return app;
}

describe('Fehler mit Rohtext', () => {
  beforeEach(() => jest.clearAllMocks());

  it('InternalError: 500 mit Satz und eigenem Code statt „Internal server error"', async () => {
    const res = await request(
      appMit(
        new InternalError('Die Konfigurationsdatei des Geräts ließ sich nicht lesen.', {
          code: 'ENV_NICHT_LESBAR',
          roh: 'EACCES: permission denied, open /arasul/config/.env',
        })
      )
    ).get('/x');
    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({
      code: 'ENV_NICHT_LESBAR',
      message: 'Die Konfigurationsdatei des Geräts ließ sich nicht lesen.',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/EACCES/);
    expect(logger.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ roh: expect.stringMatching(/EACCES/) })
    );
  });

  it('UpstreamError mit 400: Satz an den Klienten, Rohtext ins Log', async () => {
    const res = await request(
      appMit(
        new UpstreamError('Tailscale hat den Auth-Key abgelehnt.', {
          statusCode: 400,
          code: 'TAILSCALE_KEY_UNGUELTIG',
          roh: 'backend error: invalid key',
        })
      )
    ).get('/x');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TAILSCALE_KEY_UNGUELTIG');
    expect(JSON.stringify(res.body)).not.toMatch(/backend error/);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ roh: 'backend error: invalid key' })
    );
  });

  it('UpstreamError ohne Status ist 502', async () => {
    const res = await request(appMit(new UpstreamError('Der Dienst lehnte ab.'))).get('/x');
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('UPSTREAM_ERROR');
  });
});
