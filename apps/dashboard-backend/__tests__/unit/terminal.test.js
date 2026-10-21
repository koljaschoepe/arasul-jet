/**
 * Das Terminal (Karte terminal-im-frontend, M5, 21.10.2026).
 *
 * Die Tuer vor `/terminal/` (`GET /intern/terminal/tor`, ausserhalb von `/api`) laesst nur durch, wer
 * angemeldet, aktiv und Entwickler ist, auf einem Geraet mit eingeschaltetem
 * Terminal und eingerichtetem Geheimnis, aus der eigenen Oberflaeche. Sie
 * nennt dem Container den Linux-Nutzer mit Siegel. Ein Konto ohne die Rolle
 * bekommt 403, auch wenn alles andere stimmt.
 *
 * Die Trennung dahinter (fremder Ordner, docker, sudo) prueft nicht dieser
 * Test, sondern `scripts/test/terminal-trennung.sh` auf einem echten Linux.
 */
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');

const GEHEIM_DATEI = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-')),
  'tor_geheimnis'
);
process.env.TERMINAL_TOR_GEHEIMNIS_FILE = GEHEIM_DATEI;

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/services/auth/forwardAuth', () => ({ tokenOderNull: jest.fn() }));
jest.mock('../../src/middleware/auth', () => {
  const echt = jest.requireActual('../../src/middleware/auth');
  let mockUser = null;
  return {
    __setUser: u => {
      mockUser = u;
    },
    requireAuth: (req, res, next) => {
      req.user = mockUser;
      next();
    },
    requireRole: echt.requireRole,
    ROLLEN: echt.ROLLEN,
  };
});

const db = require('../../src/database');
const auth = require('../../src/middleware/auth');
const { tokenOderNull } = require('../../src/services/auth/forwardAuth');
const terminal = require('../../src/services/terminal/terminal');
const router = require('../../src/routes/terminal');
const torRouter = require('../../src/routes/terminalTor');
const { errorHandler } = require('../../src/middleware/errorHandler');

function app() {
  const a = express();
  a.use(cookieParser());
  a.use('/api/terminal', router);
  a.use('/intern/terminal', torRouter);
  a.use(errorHandler);
  return a;
}

const ENTWICKLER = { id: '7', username: 'eva', entwickler: true };
const OHNE_ROLLE = { id: '8', username: 'otto', entwickler: false };

describe('Terminal', () => {
  beforeEach(() => {
    db.query.mockReset();
    tokenOderNull.mockReset();
    process.env.COMPOSE_PROFILES = 'firmenordner,terminal';
    fs.writeFileSync(GEHEIM_DATEI, 'geheim-im-test\n');
  });

  afterAll(() => {
    delete process.env.COMPOSE_PROFILES;
  });

  describe('linuxNutzer und Siegel', () => {
    test('der Name kommt aus der Kennung, nie aus dem Benutzernamen', () => {
      expect(terminal.linuxNutzer('7')).toBe('ara-7');
      expect(terminal.linuxNutzer(99999999)).toBe('ara-99999999');
      for (const falsch of [0, -1, 'abc', '../1', 100000000, 1.5, null]) {
        expect(terminal.linuxNutzer(falsch)).toBeNull();
      }
    });

    test('Nutzer mit Siegel passt in die 29 Zeichen, die ttyd vorhaelt', () => {
      const n = terminal.linuxNutzer(99999999);
      expect(`${n}:${terminal.siegel(n, 'x')}`.length).toBeLessThanOrEqual(29);
    });

    test('das Siegel ist HMAC-SHA256, die ersten 16 Hex-Zeichen (wie openssl in verbinde.sh)', () => {
      const erwartet = crypto
        .createHmac('sha256', 'geheim-im-test')
        .update('ara-7')
        .digest('hex')
        .slice(0, 16);
      expect(terminal.siegel('ara-7', 'geheim-im-test')).toBe(erwartet);
      expect(terminal.siegel('ara-7', 'geheim-im-test')).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe('herkunftPasst', () => {
    test.each([
      [undefined, 'arasul', true],
      ['https://arasul', 'arasul', true],
      ['https://ARASUL:443', 'arasul:443', true],
      ['https://boese.example', 'arasul', false],
      ['kein-url', 'arasul', false],
      ['https://arasul', undefined, false],
    ])('Origin %s, Host %s: %s', (origin, host, ja) => {
      expect(terminal.herkunftPasst(origin, host)).toBe(ja);
    });
  });

  describe('GET /intern/terminal/tor', () => {
    function mitZeile(zeile) {
      tokenOderNull.mockResolvedValue({ userId: zeile ? zeile.id : '99' });
      db.query.mockResolvedValue({ rows: zeile ? [zeile] : [] });
    }

    test('ohne Cookie: 401, keine Kopfzeile', async () => {
      const res = await request(app()).get('/intern/terminal/tor');
      expect(res.status).toBe(401);
      expect(res.headers['x-arasul-terminal-nutzer']).toBeUndefined();
      expect(tokenOderNull).not.toHaveBeenCalled();
    });

    test('ein Ausweis im Authorization-Kopf oeffnet die Shell nicht', async () => {
      tokenOderNull.mockResolvedValue({ userId: '7' });
      const res = await request(app())
        .get('/intern/terminal/tor')
        .set('Authorization', 'Bearer ausweis-eines-rechners');
      expect(res.status).toBe(401);
    });

    test('ungueltiges Token: 401', async () => {
      tokenOderNull.mockResolvedValue(null);
      const res = await request(app())
        .get('/intern/terminal/tor')
        .set('Cookie', 'arasul_session=x');
      expect(res.status).toBe(401);
      expect(db.query).not.toHaveBeenCalled();
    });

    test('stillgelegtes oder geloeschtes Konto: 401', async () => {
      mitZeile(null);
      const res = await request(app())
        .get('/intern/terminal/tor')
        .set('Cookie', 'arasul_session=x');
      expect(res.status).toBe(401);
      expect(db.query.mock.calls[0][0]).toMatch(/is_active = true/);
    });

    test('ein Konto ohne die Rolle Entwickler: 403, keine Kopfzeile', async () => {
      mitZeile(OHNE_ROLLE);
      const res = await request(app())
        .get('/intern/terminal/tor')
        .set('Cookie', 'arasul_session=x');
      expect(res.status).toBe(403);
      expect(res.text).toMatch(/Rolle Entwickler/);
      expect(res.headers['x-arasul-terminal-nutzer']).toBeUndefined();
    });

    test('Terminal am Geraet nicht eingeschaltet: 403', async () => {
      process.env.COMPOSE_PROFILES = 'firmenordner';
      mitZeile(ENTWICKLER);
      const res = await request(app())
        .get('/intern/terminal/tor')
        .set('Cookie', 'arasul_session=x');
      expect(res.status).toBe(403);
    });

    test('fremde Herkunft (WebSocket von einer anderen Seite): 403', async () => {
      mitZeile(ENTWICKLER);
      const res = await request(app())
        .get('/intern/terminal/tor')
        .set('Cookie', 'arasul_session=x')
        .set('X-Forwarded-Host', 'arasul')
        .set('Origin', 'https://boese.example');
      expect(res.status).toBe(403);
      expect(res.headers['x-arasul-terminal-nutzer']).toBeUndefined();
    });

    test('ohne Geheimnis am Geraet: 503, keine Kopfzeile', async () => {
      fs.unlinkSync(GEHEIM_DATEI);
      mitZeile(ENTWICKLER);
      const res = await request(app())
        .get('/intern/terminal/tor')
        .set('Cookie', 'arasul_session=x');
      expect(res.status).toBe(503);
      expect(res.headers['x-arasul-terminal-nutzer']).toBeUndefined();
    });

    test('Entwickler aus der eigenen Oberflaeche: 200 mit Nutzer und Siegel', async () => {
      mitZeile(ENTWICKLER);
      const res = await request(app())
        .get('/intern/terminal/tor')
        .set('Cookie', 'arasul_session=x')
        .set('X-Forwarded-Host', 'arasul')
        .set('Origin', 'https://arasul');
      expect(res.status).toBe(200);
      expect(res.headers['x-arasul-terminal-nutzer']).toBe(
        `ara-7:${terminal.siegel('ara-7', 'geheim-im-test')}`
      );
    });
  });

  describe('GET /api/terminal', () => {
    test('die Tuer steht nicht unter /api: das Siegel gehoert nicht in einen Browser', async () => {
      tokenOderNull.mockResolvedValue({ userId: '7' });
      db.query.mockResolvedValue({ rows: [ENTWICKLER] });
      const res = await request(app()).get('/api/terminal/tor').set('Cookie', 'arasul_session=x');
      expect(res.headers['x-arasul-terminal-nutzer']).toBeUndefined();
      expect(res.status).not.toBe(200);
    });

    test('Entwickler: an, entwickler, sein Linux-Nutzer', async () => {
      auth.__setUser({ ...ENTWICKLER, role: 'mitarbeiter' });
      const res = await request(app()).get('/api/terminal');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ an: true, entwickler: true, linuxNutzer: 'ara-7' });
    });

    test('ohne Rolle: kein Linux-Nutzer, auch fuer den Administrator', async () => {
      auth.__setUser({ ...OHNE_ROLLE, role: 'admin' });
      const res = await request(app()).get('/api/terminal');
      expect(res.body.data).toEqual({ an: true, entwickler: false, linuxNutzer: null });
    });
  });
});
