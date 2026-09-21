/**
 * Der Ausweis eines Mitarbeiters (Bruecke, 21.09.2026, J34).
 *
 * DIE EINE FRAGE, die dieser Test beantwortet, steht in der Abnahme: „das
 * Token oeffnet nichts ausser App-Schnittstellen und der Liste der eigenen
 * Apps, keine Admin-Route." Das ist eine Aussage ueber ALLE Wege des Geraets
 * und nicht ueber die drei, die ihn annehmen -- deshalb wird hier nicht nur
 * gemessen, dass die drei gehen, sondern dass ein vierter Weg ihn abweist,
 * und zwar ein Weg, der demselben Menschen mit einer Sitzung offenstuende.
 *
 * Er kommt nicht durch `requireAuth`, weil er kein JWT ist -- das ist keine
 * Regel, die jemand pflegt, sondern die Bauweise. Der Test haelt sie fest,
 * damit sie es bleibt.
 */
const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

jest.mock('../../src/database', () => {
  const query = jest.fn();
  return { query, transaction: jest.fn(cb => cb({ query })) };
});
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/utils/auditLog', () => ({ logSecurityEvent: jest.fn() }));

/**
 * `requireAuth` mit einer Sitzung, die dieser Test setzt -- und ohne sie der
 * ECHTE.
 *
 * Der Unterschied traegt den halben Test: wo eine Sitzung steht, wird
 * gemessen, was DANACH passiert (wer welchen Ausweis sieht und wegnehmen
 * darf); wo keine steht, laeuft die echte Pruefung, und die ist es, die einen
 * Ausweis auf einer fremden Route abweist. Ein durchweg gefaelschtes
 * `requireAuth` haette genau die Aussage weggemockt, um die es geht.
 */
// Der Vorsatz `mock` ist Jests Regel und nicht Geschmack: nur so darf eine
// Fabrik in `jest.mock` eine Variable von aussen lesen.
let mockSitzung = null;
jest.mock('../../src/middleware/auth', () => {
  const echt = jest.requireActual('../../src/middleware/auth');
  return {
    ...echt,
    requireAuth: (req, res, next) => {
      if (mockSitzung) {
        req.user = mockSitzung;
        return next();
      }
      return echt.requireAuth(req, res, next);
    },
  };
});

const db = require('../../src/database');
const { errorHandler } = require('../../src/middleware/errorHandler');
const mitarbeiterAusweis = require('../../src/services/auth/mitarbeiterAusweis');
const { logSecurityEvent } = require('../../src/utils/auditLog');

const ANNA = {
  id: '7',
  username: 'anna',
  email: 'anna@firma.de',
  role: 'mitarbeiter',
  is_active: true,
  passwort_vom_admin: false,
  theme: 'light',
};
const CHEF = { ...ANNA, id: '1', username: 'chef', role: 'admin' };

const AUSWEIS = `ausweis_${'a'.repeat(64)}`;
const PRUEFSUMME = crypto.createHash('sha256').update(AUSWEIS, 'utf8').digest('hex');

/** Die Antwort, die `mitarbeiterAusweis.pruefe` aus der Datenbank bekommt. */
function ausweisGehoert(benutzer) {
  return { rows: [{ ...benutzer, ausweis_id: 42 }] };
}

beforeEach(() => {
  db.query.mockReset();
  logSecurityEvent.mockClear();
  mockSitzung = null;
});

describe('Ausstellen: einmal sichtbar, danach nur eine Pruefsumme', () => {
  test('der Klartext kommt genau einmal heraus, und die Datenbank sieht ihn nicht', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          name: 'Laptop',
          praefix: 'ausweis_abc123',
          angelegt_am: '2026-09-21T20:00:00Z',
          zuletzt_benutzt_am: null,
        },
      ],
    });
    const ergebnis = await mitarbeiterAusweis.stelleAus({ benutzerId: '7', name: 'Laptop' });

    expect(ergebnis.ausweis).toMatch(/^ausweis_[0-9a-f]{64}$/);

    // Was WIRKLICH abgelegt wurde: die Pruefsumme, nicht der Wert. Der Test
    // greift dafuer in die Argumente des INSERT -- die einzige Stelle, an der
    // sich „wird nur die Pruefsumme gespeichert" ueberhaupt messen laesst.
    const [, werte] = db.query.mock.calls[0];
    expect(werte).not.toContain(ergebnis.ausweis);
    expect(werte[3]).toBe(
      crypto.createHash('sha256').update(ergebnis.ausweis, 'utf8').digest('hex')
    );
    expect(werte[3]).toHaveLength(64);
    // Der Vorsatz zur Wiedererkennung ist kein Geheimnis, aber auch kein
    // brauchbares Stueck des Wertes.
    expect(ergebnis.ausweis.startsWith(werte[2])).toBe(true);
    expect(werte[2].length).toBeLessThan(20);
  });

  test('zwei Ausweise hintereinander sind nicht derselbe', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 1, name: 'x', praefix: 'y' }] });
    const a = await mitarbeiterAusweis.stelleAus({ benutzerId: '7', name: 'a' });
    const b = await mitarbeiterAusweis.stelleAus({ benutzerId: '7', name: 'b' });
    expect(a.ausweis).not.toBe(b.ausweis);
  });
});

describe('Pruefen', () => {
  test('ein gueltiger Ausweis nennt seinen Menschen', async () => {
    db.query.mockResolvedValueOnce(ausweisGehoert(ANNA));
    const treffer = await mitarbeiterAusweis.pruefe(AUSWEIS);
    expect(treffer.benutzer.username).toBe('anna');
    expect(treffer.ausweisId).toBe(42);
    // Gesucht wird ueber die Pruefsumme, nicht ueber den Wert.
    expect(db.query.mock.calls[0][1]).toEqual([PRUEFSUMME]);
  });

  test('ein widerrufener Ausweis ist keiner -- die Zeile ist weg', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    expect(await mitarbeiterAusweis.pruefe(AUSWEIS)).toBeNull();
  });

  test('ein abgeschaltetes Konto zaehlt nicht', async () => {
    db.query.mockResolvedValueOnce(ausweisGehoert({ ...ANNA, is_active: false }));
    expect(await mitarbeiterAusweis.pruefe(AUSWEIS)).toBeNull();
  });

  test('was nicht wie ein Ausweis aussieht, fragt die Datenbank gar nicht', async () => {
    // Der Normalfall ist ein JWT. Ohne diese Abkuerzung loeste jede Anfrage
    // des Browsers eine Suche nach einer Pruefsumme aus, die es nie gibt.
    expect(await mitarbeiterAusweis.pruefe('eyJhbGciOiJIUzI1NiJ9.x.y')).toBeNull();
    expect(await mitarbeiterAusweis.pruefe('aras_0123456789abcdef')).toBeNull();
    expect(await mitarbeiterAusweis.pruefe(null)).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('Widerrufen', () => {
  test('ein Mitarbeiter kommt nur an seine eigenen', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await mitarbeiterAusweis.widerrufe({ ausweisId: 5, nurBenutzer: '7' });
    const [sql, werte] = db.query.mock.calls[0];
    expect(sql).toMatch(/AND user_id = \$2/);
    expect(werte).toEqual([5, '7']);
  });

  test('der Administrator kommt an jeden', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 5, name: 'Laptop', user_id: '7' }] });
    await mitarbeiterAusweis.widerrufe({ ausweisId: 5, nurBenutzer: null });
    const [sql, werte] = db.query.mock.calls[0];
    expect(sql).not.toMatch(/AND user_id/);
    expect(werte).toEqual([5]);
  });
});

// --- Die drei Tueren, und die vierte, die zu bleibt -------------------------

/**
 * Die Wege dieses Geraets, so wie sie im Backend zusammengesteckt sind. Kein
 * Mock von `requireAuth`: der ECHTE Weg soll gemessen werden, und der
 * entscheidet, ob ein Ausweis durchkommt.
 */
function geraet() {
  const a = express();
  a.use(express.json());
  a.use('/api/apps', require('../../src/routes/store/apps'));
  a.use('/apps', require('../../src/routes/appAusliefern'));
  a.use('/api/ausweise', require('../../src/routes/ausweise'));
  a.use('/api/benutzer', require('../../src/routes/admin/benutzer'));
  a.use('/api/notizen', require('../../src/routes/notizen'));
  a.use(errorHandler);
  return a;
}

const mitAusweis = pfad => request(geraet()).get(pfad).set('Authorization', `Bearer ${AUSWEIS}`);

describe('Was ein Ausweis oeffnet -- und was nicht', () => {
  test('die Liste der eigenen Apps, mit Adresse', async () => {
    db.query
      .mockResolvedValueOnce(ausweisGehoert(ANNA)) // pruefe
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'belege',
            name: 'Belege',
            beschreibung: null,
            freigegeben_bis: 'live',
            live_version: '0.3.0',
            test_version: null,
            live_manifest: { id: 'belege', version: '0.3.0', backend: { image: 'x' } },
            test_manifest: null,
          },
        ],
      });
    const res = await mitAusweis('/api/apps/meine');
    expect(res.status).toBe(200);
    expect(res.body.data[0].live).toEqual({
      version: '0.3.0',
      pfad: '/apps/belege/',
      api: '/apps/belege/api/',
    });
  });

  test('die Forward-Auth vor einer freigegebenen App, samt der zwei Kopfzeilen', async () => {
    db.query
      .mockResolvedValueOnce(ausweisGehoert(ANNA)) // pruefe
      .mockResolvedValueOnce({ rows: [{ stand: 'live' }] }) // app_members
      .mockResolvedValueOnce({ rows: [{ x: 1 }] }); // app_staende
    const res = await mitAusweis('/api/apps/belege/zugang?stand=live');
    expect(res.status).toBe(200);
    // Die App dahinter sieht denselben Menschen wie bei einem Browser und
    // merkt den Unterschied nicht -- das ist der Sinn der Sache.
    expect(res.headers['x-arasul-user']).toBe('anna');
    expect(res.headers['x-arasul-role']).toBe('mitarbeiter');
  });

  test('eine App, die nicht freigegeben ist: 403', async () => {
    db.query
      .mockResolvedValueOnce(ausweisGehoert(ANNA))
      .mockResolvedValueOnce({ rows: [] }); // keine Freigabe
    const res = await mitAusweis('/api/apps/fremd/zugang?stand=live');
    expect(res.status).toBe(403);
  });

  test('nach dem Widerruf: 401, und die Meldung sagt warum', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // pruefe findet nichts mehr
    const res = await mitAusweis('/api/apps/belege/zugang?stand=live');
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/widerrufen/i);
  });

  test('`/apps/<id>/api/me` -- der eine Weg unter api/, der der Plattform gehoert', async () => {
    // FUND DER MESSUNG AM ORIN (21.09.2026). Traefik gibt genau diesen Weg an
    // Arasul (`apps-me`, Zahl 50) und nicht an den Container der App, und dort
    // stand nur `optionalAuth` -- ein Ausweis kam nicht vorbei. „Wer bin ich"
    // ist die erste Frage, die ein Agent an eine App stellt.
    db.query
      .mockResolvedValueOnce(ausweisGehoert(ANNA)) // pruefe
      .mockResolvedValueOnce({ rows: [{ stand: 'live' }] }) // app_members
      .mockResolvedValueOnce({ rows: [{ x: 1 }] }); // app_staende
    const res = await mitAusweis('/apps/belege/api/me');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ app_id: 'belege', benutzer: 'anna', rolle: 'mitarbeiter' });
  });

  test('dort ohne Freigabe: 403', async () => {
    db.query.mockResolvedValueOnce(ausweisGehoert(ANNA)).mockResolvedValueOnce({ rows: [] });
    expect((await mitAusweis('/apps/fremd/api/me')).status).toBe(403);
  });

  test('die SEITE der App bleibt zu -- ein Ausweis ist kein Browser', async () => {
    // Ein Ausweis oeffnet App-SCHNITTSTELLEN; eine statische Seite ist keine.
    // Ohne Sitzung zieht dieser Weg auf die Anmeldung um (302) -- und dass er
    // das auch mit einem Ausweis tut, ist die Grenze der Zusage.
    const res = await mitAusweis('/apps/belege/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
    expect(db.query).not.toHaveBeenCalled();
  });

  test('keine Admin-Route -- 401, nicht 403', async () => {
    // Und der Unterschied ist die Aussage: 403 hiesse „erkannt, aber nicht
    // erlaubt". Der Ausweis wird dort gar nicht erst als Ausweis gelesen --
    // `requireAuth` sieht einen Wert, der kein JWT ist.
    const res = await mitAusweis('/api/benutzer');
    expect(res.status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('auch keine gewoehnliche Mitarbeiter-Route: die Notizen bleiben zu', async () => {
    // Ein Zettel ist nicht weniger privat als eine Benutzerliste, und der
    // Ausweis ist nicht die kleine Sitzung, sondern etwas anderes.
    const res = await mitAusweis('/api/notizen');
    expect(res.status).toBe(401);
  });

  test('und nicht einmal die Liste der Ausweise selbst', async () => {
    // Sonst koennte ein abhanden gekommener Ausweis sich selbst am Leben
    // erhalten: erst die Liste lesen, dann die anderen widerrufen.
    const res = await mitAusweis('/api/ausweise');
    expect(res.status).toBe(401);
    expect((await request(geraet()).delete('/api/ausweise/1')).status).toBe(401);
  });
});

describe('Die Routen der Verwaltung eines Ausweises', () => {
  /** Ein Mensch mit einer Sitzung vor den Wegen dieses Geraets. */
  function mitSitzung(benutzer) {
    mockSitzung = benutzer;
    return geraet();
  }

  test('ein Name, der schon da ist, ergibt 409 mit einem Satz, was zu tun ist', async () => {
    const konflikt = new Error('duplicate key');
    konflikt.code = '23505';
    db.query.mockRejectedValueOnce(konflikt);
    const res = await request(mitSitzung(ANNA))
      .post('/api/ausweise')
      .send({ name: 'Laptop' });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/Widerrufen Sie ihn oder nehmen Sie einen anderen/);
  });

  test('ein Ausweis ohne Namen wird abgewiesen', async () => {
    const res = await request(mitSitzung(ANNA)).post('/api/ausweise').send({ name: '   ' });
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('der Klartext steht in der Antwort und NICHT im Audit-Log', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 3, name: 'Laptop', praefix: 'ausweis_abc123', angelegt_am: 'jetzt' }],
    });
    const res = await request(mitSitzung(ANNA)).post('/api/ausweise').send({ name: 'Laptop' });
    expect(res.status).toBe(201);
    expect(res.body.data.ausweis).toMatch(/^ausweis_/);
    const protokoll = JSON.stringify(logSecurityEvent.mock.calls[0][0]);
    expect(protokoll).not.toContain(res.body.data.ausweis);
    expect(protokoll).toContain('ausweis_ausgestellt');
  });

  test('ein Mitarbeiter, der einen fremden Ausweis widerruft, bekommt 404', async () => {
    // 404 und nicht 403: sonst waere die Nummernfolge eine Auskunft darueber,
    // welche Ausweise es am Geraet gibt.
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(mitSitzung(ANNA)).delete('/api/ausweise/99');
    expect(res.status).toBe(404);
    expect(db.query.mock.calls[0][1]).toEqual([99, '7']);
  });

  test('der Administrator widerruft ohne Einschraenkung', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 99, name: 'Laptop', user_id: '7' }] });
    const res = await request(mitSitzung(CHEF)).delete('/api/ausweise/99');
    expect(res.status).toBe(200);
    expect(db.query.mock.calls[0][1]).toEqual([99]);
  });

  test('nur der Administrator sieht alle Ausweise', async () => {
    const res = await request(mitSitzung(ANNA)).get('/api/ausweise/alle');
    expect(res.status).toBe(403);
  });
});
