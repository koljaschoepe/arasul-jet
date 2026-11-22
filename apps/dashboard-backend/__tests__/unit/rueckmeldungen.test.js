/**
 * /api/rueckmeldungen (J42, M7): melden darf jeder mit Zugang zur App, lesen
 * nur, wer das Kennzeichen Entwickler traegt. Die Abweisung wird fuer beide
 * Faelle belegt, die die Karte nennt: Mitarbeiter und Administrator ohne
 * Kennzeichen. Das Bild liegt als Datei am Geraet und geht mit der Meldung.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');

jest.mock('../../src/database', () => ({ query: jest.fn(), transaction: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

/** Wer gerade angemeldet ist; jeder Test setzt es selbst. */
let mockAngemeldet = { id: '2', username: 'mia', role: 'mitarbeiter' };
jest.mock('../../src/middleware/auth', () => {
  const echt = jest.requireActual('../../src/middleware/auth');
  return {
    requireAuth: (req, res, next) => {
      req.user = { ...mockAngemeldet };
      next();
    },
    requireRole: echt.requireRole,
    ROLLEN: echt.ROLLEN,
  };
});

const db = require('../../src/database');
const router = require('../../src/routes/rueckmeldungen');
const { errorHandler } = require('../../src/middleware/errorHandler');

const app = () => {
  const a = express();
  a.use(express.json({ limit: '10mb' }));
  a.use('/api/rueckmeldungen', router);
  a.use(errorHandler);
  return a;
};

// Ein PNG mit einem Pixel.
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const MELDUNG = {
  app_id: 'belege',
  stand: 'live',
  seite: '/apps/belege/?ansicht=offen',
  text: 'Hier fehlt ein Filter nach Monat.',
};

/** Die Antworten der Datenbank fuer `appZugang.pruefe`: freigegeben, vorhanden. */
function zugangDa(stand = 'live') {
  db.query
    .mockResolvedValueOnce({ rows: [{ stand }] })
    .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
}

let ordner;
beforeEach(() => {
  db.query.mockReset();
  ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'rueckmeldungen-'));
  process.env.APPS_DIR = ordner;
  mockAngemeldet = { id: '2', username: 'mia', role: 'mitarbeiter' };
});
afterEach(() => {
  fs.rmSync(ordner, { recursive: true, force: true });
  delete process.env.APPS_DIR;
});

const bilder = () => {
  const o = path.join(ordner, '.rueckmeldungen');
  return fs.existsSync(o) ? fs.readdirSync(o) : [];
};

describe('POST /api/rueckmeldungen (melden)', () => {
  test('ein Mitarbeiter mit Zugang meldet Text ohne Bild: 201, nur Nummer und Zeit', async () => {
    zugangDa();
    db.query.mockResolvedValueOnce({ rows: [{ id: '7', erstellt_am: '2026-11-20T10:00:00Z' }] });
    const res = await request(app()).post('/api/rueckmeldungen').send(MELDUNG);
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ id: 7, erstellt_am: '2026-11-20T10:00:00Z' });
    const [sql, werte] = db.query.mock.calls[2];
    expect(sql).toMatch(/INSERT INTO public\.rueckmeldungen/);
    expect(werte).toEqual([
      'belege',
      'live',
      '/apps/belege/?ansicht=offen',
      'Hier fehlt ein Filter nach Monat.',
      null,
      null,
      '2',
    ]);
    expect(bilder()).toEqual([]);
  });

  test('mit Bild: die Datei liegt am Gerät, die Zeile nennt nur ihren Namen', async () => {
    zugangDa();
    db.query.mockResolvedValueOnce({ rows: [{ id: '8', erstellt_am: 'jetzt' }] });
    const markierung = { x: 0.1, y: 0.2, breite: 0.3, hoehe: 0.1 };
    const res = await request(app())
      .post('/api/rueckmeldungen')
      .send({ ...MELDUNG, bild: PIXEL, markierung });
    expect(res.status).toBe(201);
    const dateien = bilder();
    expect(dateien).toHaveLength(1);
    expect(dateien[0]).toMatch(/^[a-f0-9-]{36}\.png$/);
    const werte = db.query.mock.calls[2][1];
    expect(werte[4]).toBe(dateien[0]);
    expect(JSON.parse(werte[5])).toEqual(markierung);
    const bytes = fs.readFileSync(path.join(ordner, '.rueckmeldungen', dateien[0]));
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  });

  test('scheitert die Zeile, bleibt keine Datei liegen', async () => {
    zugangDa();
    db.query.mockRejectedValueOnce(Object.assign(new Error('weg'), { code: '57P01' }));
    const res = await request(app())
      .post('/api/rueckmeldungen')
      .send({ ...MELDUNG, bild: PIXEL });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(bilder()).toEqual([]);
  });

  test('ohne Freigabe der App: 403, nichts gespeichert', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app()).post('/api/rueckmeldungen').send(MELDUNG);
    expect(res.status).toBe(403);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('eine Seite außerhalb der App wird abgewiesen', async () => {
    zugangDa();
    const res = await request(app())
      .post('/api/rueckmeldungen')
      .send({ ...MELDUNG, seite: '/apps/abschluss/' });
    expect(res.status).toBe(400);
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  test.each([
    ['ohne Text', { ...MELDUNG, text: '   ' }],
    ['ein SVG statt PNG', { ...MELDUNG, bild: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }],
    [
      'eine Markierung außerhalb des Bildes',
      { ...MELDUNG, markierung: { x: 2, y: 0, breite: 0.1, hoehe: 0.1 } },
    ],
    ['ein fremdes Feld', { ...MELDUNG, person_id: 1 }],
  ])('%s: 400', async (_, body) => {
    const res = await request(app()).post('/api/rueckmeldungen').send(body);
    expect(res.status).toBe(400);
    expect(bilder()).toEqual([]);
  });

  test('ein data-URL, das kein PNG ist, wird abgewiesen', async () => {
    zugangDa();
    const res = await request(app())
      .post('/api/rueckmeldungen')
      .send({
        ...MELDUNG,
        bild: `data:image/png;base64,${Buffer.from('kein png').toString('base64')}`,
      });
    expect(res.status).toBe(400);
    expect(bilder()).toEqual([]);
  });
});

describe('Lesen: die eigenen für jeden, alle nur mit dem Recht in der Werkstatt (J52)', () => {
  const nurMitRecht = [
    ['PATCH /:id', a => request(a).patch('/api/rueckmeldungen/7').send({ stand_meldung: 'neu' })],
    ['DELETE /:id', a => request(a).delete('/api/rueckmeldungen/7')],
  ];

  test.each(nurMitRecht)('%s: ein Mitarbeiter ohne das Recht bekommt 403', async (_, rufe) => {
    db.query.mockResolvedValueOnce({ rows: [{ entwickler: false }] });
    const res = await rufe(app());
    expect(res.status).toBe(403);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toMatch(/SELECT entwickler FROM public\.admin_users/);
  });

  test.each(nurMitRecht)('%s: ein Administrator ohne das Recht bekommt 403', async (_, rufe) => {
    mockAngemeldet = { id: '1', username: 'chef', role: 'admin', entwickler: true };
    // Der Zwischenspeicher sagt `entwickler: true`, die Datenbank nicht mehr:
    // es gilt die Datenbank.
    db.query.mockResolvedValueOnce({ rows: [{ entwickler: false }] });
    const res = await rufe(app());
    expect(res.status).toBe(403);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('ohne das Recht: die Liste fragt NUR nach den eigenen, Sicht „eigene"', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ entwickler: false }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '9',
            app_id: 'belege',
            app_name: 'Belege',
            stand: 'live',
            seite: '/apps/belege/',
            text: 'Mein Filter fehlt',
            bild: null,
            markierung: null,
            person_id: '2',
            username: 'mia',
            vorname: 'Mia',
            nachname: 'Muster',
            stand_meldung: 'abgelehnt',
            grund: 'Gibt es schon: oben rechts.',
            erstellt_am: '2026-11-22T10:00:00Z',
          },
        ],
      });
    const res = await request(app()).get('/api/rueckmeldungen');
    expect(res.status).toBe(200);
    expect(res.body.sicht).toBe('eigene');
    expect(res.body.data[0]).toMatchObject({
      id: 9,
      stand_meldung: 'abgelehnt',
      grund: 'Gibt es schon: oben rechts.',
    });
    // Die Abfrage selbst grenzt auf die Person ein, nicht der Browser.
    expect(db.query.mock.calls[1][0]).toMatch(/r\.person_id = \$3/);
    expect(db.query.mock.calls[1][1]).toEqual([null, 500, '2']);
  });

  test('ein Administrator ohne das Recht sieht ebenfalls nur die eigenen', async () => {
    mockAngemeldet = { id: '1', username: 'chef', role: 'admin' };
    db.query.mockResolvedValueOnce({ rows: [{ entwickler: false }] }).mockResolvedValueOnce({
      rows: [],
    });
    const res = await request(app()).get('/api/rueckmeldungen');
    expect(res.status).toBe(200);
    expect(res.body.sicht).toBe('eigene');
    expect(db.query.mock.calls[1][1]).toEqual([null, 500, '1']);
  });

  test('ein gesperrtes Konto sieht nichts Fremdes', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const res = await request(app()).get('/api/rueckmeldungen');
    expect(res.body.sicht).toBe('eigene');
    expect(db.query.mock.calls[1][1]).toEqual([null, 500, '2']);
  });

  test('ohne das Recht: ein fremdes Bild ist 404, gefragt wird mit der Person', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ entwickler: false }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app()).get('/api/rueckmeldungen/7/bild');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).not.toMatch(/image/);
    expect(db.query.mock.calls[1][0]).toMatch(/person_id = \$2/);
    expect(db.query.mock.calls[1][1]).toEqual([7, '2']);
  });

  test('ohne das Recht: das eigene Bild kommt', async () => {
    const name = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd.png';
    fs.mkdirSync(path.join(ordner, '.rueckmeldungen'));
    fs.writeFileSync(
      path.join(ordner, '.rueckmeldungen', name),
      Buffer.from(PIXEL.split(',')[1], 'base64')
    );
    db.query
      .mockResolvedValueOnce({ rows: [{ entwickler: false }] })
      .mockResolvedValueOnce({ rows: [{ bild: name }] });
    const res = await request(app()).get('/api/rueckmeldungen/7/bild');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
  });

  test('mit dem Recht (auch als Mitarbeiter) liest sie alle mit Person und App', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ entwickler: true }] }).mockResolvedValueOnce({
      rows: [
        {
          id: '7',
          app_id: 'belege',
          app_name: 'Belege',
          stand: 'live',
          seite: '/apps/belege/',
          text: 'Filter fehlt',
          bild: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png',
          markierung: { x: 0.1, y: 0.1, breite: 0.2, hoehe: 0.2 },
          person_id: '2',
          username: 'mia',
          vorname: 'Mia',
          nachname: 'Muster',
          stand_meldung: 'neu',
          erstellt_am: '2026-11-20T10:00:00Z',
        },
        {
          id: '6',
          app_id: 'weg',
          app_name: null,
          stand: 'test',
          seite: '/apps/weg/test/',
          text: 'alt',
          bild: null,
          markierung: null,
          person_id: null,
          stand_meldung: 'neu',
          erstellt_am: '2026-11-19T10:00:00Z',
        },
      ],
    });
    const res = await request(app()).get('/api/rueckmeldungen?app_id=belege');
    expect(res.status).toBe(200);
    expect(res.body.sicht).toBe('alle');
    expect(res.body.data[0]).toMatchObject({
      id: 7,
      app_name: 'Belege',
      hat_bild: true,
      person: { id: 2, anzeigeName: 'Mia Muster' },
      stand_meldung: 'neu',
    });
    expect(res.body.data[0]).not.toHaveProperty('bild');
    expect(res.body.data[1]).toMatchObject({ hat_bild: false, person: null });
    expect(db.query.mock.calls[1][1]).toEqual(['belege', 500, null]);
  });

  test('das Bild kommt als PNG; fehlt die Datei, ist es 404', async () => {
    const name = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png';
    fs.mkdirSync(path.join(ordner, '.rueckmeldungen'));
    fs.writeFileSync(
      path.join(ordner, '.rueckmeldungen', name),
      Buffer.from(PIXEL.split(',')[1], 'base64')
    );
    db.query
      .mockResolvedValueOnce({ rows: [{ entwickler: true }] })
      .mockResolvedValueOnce({ rows: [{ bild: name }] });
    const res = await request(app()).get('/api/rueckmeldungen/7/bild');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);

    fs.rmSync(path.join(ordner, '.rueckmeldungen', name));
    db.query
      .mockResolvedValueOnce({ rows: [{ entwickler: true }] })
      .mockResolvedValueOnce({ rows: [{ bild: name }] });
    expect((await request(app()).get('/api/rueckmeldungen/7/bild')).status).toBe(404);
  });

  test('ein Name aus der Datenbank, der aus dem Ordner führt, wird nie gelesen', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ entwickler: true }] })
      .mockResolvedValueOnce({ rows: [{ bild: '../../etc/passwd' }] });
    const res = await request(app()).get('/api/rueckmeldungen/7/bild');
    expect(res.status).toBe(400);
  });

  test('DELETE entfernt die Meldung und ihr Bild', async () => {
    const name = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc.png';
    fs.mkdirSync(path.join(ordner, '.rueckmeldungen'));
    fs.writeFileSync(path.join(ordner, '.rueckmeldungen', name), 'x');
    db.query
      .mockResolvedValueOnce({ rows: [{ entwickler: true }] })
      .mockResolvedValueOnce({ rows: [{ bild: name }] });
    const res = await request(app()).delete('/api/rueckmeldungen/7');
    expect(res.status).toBe(200);
    expect(db.query.mock.calls[1][0]).toMatch(/DELETE FROM public\.rueckmeldungen/);
    expect(bilder()).toEqual([]);
  });

  test('DELETE einer unbekannten Meldung: 404', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ entwickler: true }] })
      .mockResolvedValueOnce({ rows: [] });
    expect((await request(app()).delete('/api/rueckmeldungen/99')).status).toBe(404);
  });
});
