/**
 * Flow-Verwaltung über HTTP (Plan 011, Schritt 5).
 *
 * Die Registry ist hier NICHT gemockt: sie arbeitet gegen ein echtes temporäres
 * Verzeichnis. Genau darum geht es bei diesen Routen — dass am Ende eine
 * gültige Datei auf der Platte liegt. Ein Mock würde die eigentliche Zusage
 * ("ein fehlerhafter Flow kann nicht gespeichert werden") wegtesten.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const request = require('supertest');

// Muss VOR dem Laden der Registry gesetzt sein — sie liest FLOWS_DIR beim Import.
const TMP_FLOWS = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-flows-'));
process.env.FLOWS_DIR = TMP_FLOWS;

const { generateTestToken, setupAuthMocks } = require('../helpers/authMock');

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('mock-hash'),
  compare: jest.fn().mockResolvedValue(true),
  genSalt: jest.fn().mockResolvedValue('mock-salt'),
}));
jest.mock('../../src/database');
jest.mock('../../src/utils/logger');

const db = require('../../src/database');
const logger = require('../../src/utils/logger');
const registry = require('../../src/services/flows/flowRegistry');
const flowRunner = require('../../src/services/flows/flowRunner');
const { app } = require('../../src/server');

logger.info = jest.fn();
logger.warn = jest.fn();
logger.error = jest.fn();
logger.debug = jest.fn();

/** Kleinster gültiger Anlege-Body. */
const NEU = {
  name: 'notiz',
  beschreibung: 'Fasst etwas zusammen.',
  prompt: 'Fasse den Text zusammen.',
};

describe('Flows-Routen', () => {
  let token;

  beforeAll(() => {
    token = generateTestToken();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset();
    setupAuthMocks(db);
    registry.clearCache();
    // Verzeichnis zwischen den Tests leeren.
    for (const f of fs.readdirSync(TMP_FLOWS)) {
      fs.unlinkSync(path.join(TMP_FLOWS, f));
    }
  });

  afterAll(() => {
    fs.rmSync(TMP_FLOWS, { recursive: true, force: true });
  });

  const auth = req => req.set('Authorization', `Bearer ${token}`);

  describe('Authentifizierung', () => {
    test('ohne Token gibt es keine Flows', async () => {
      const res = await request(app).get('/api/flows');
      expect(res.status).toBe(401);
    });
  });

  describe('Anlegen', () => {
    test('legt einen Flow an und schreibt eine echte Datei', async () => {
      const res = await auth(request(app).post('/api/flows')).send(NEU);
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ name: 'notiz', prompt: 'Fasse den Text zusammen.' });
      // Die Voreinstellungen aus dem Schema müssen durchschlagen.
      expect(res.body.data.grenzen).toEqual({
        max_aufrufe: 20,
        zeitlimit_s: 900,
        werkzeug_runden: 10,
        max_tiefe: 2,
      });

      const datei = path.join(TMP_FLOWS, 'notiz.md');
      expect(fs.existsSync(datei)).toBe(true);
      expect(fs.readFileSync(datei, 'utf8')).toContain('name: notiz');
    });

    test('weist einen zweiten Flow mit gleichem Namen mit 409 ab', async () => {
      await auth(request(app).post('/api/flows')).send(NEU);
      const res = await auth(request(app).post('/api/flows')).send(NEU);
      expect(res.status).toBe(409);
    });

    test('weist einen ungültigen Namen ab, ohne etwas zu schreiben', async () => {
      const res = await auth(request(app).post('/api/flows')).send({
        ...NEU,
        name: '../ausbruch',
      });
      expect(res.status).toBe(400);
      expect(fs.readdirSync(TMP_FLOWS)).toHaveLength(0);
    });

    test('weist einen Flow mit unbekanntem Werkzeug ab', async () => {
      const res = await auth(request(app).post('/api/flows')).send({
        ...NEU,
        werkzeuge: ['zauberstab'],
      });
      expect(res.status).toBe(400);
      expect(fs.readdirSync(TMP_FLOWS)).toHaveLength(0);
    });

    test('weist einen Prompt mit unbekanntem Platzhalter ab', async () => {
      const res = await auth(request(app).post('/api/flows')).send({
        ...NEU,
        prompt: 'Schreibe über {{thema}}.',
      });
      expect(res.status).toBe(400);
      expect(fs.readdirSync(TMP_FLOWS)).toHaveLength(0);
    });

    test('weist eine Rolle ab, die mehr darf als der Flow selbst', async () => {
      const res = await auth(request(app).post('/api/flows')).send({
        ...NEU,
        werkzeuge: ['subagent'],
        rollen: [
          {
            name: 'r',
            werkzeuge: ['terminal'],
            ergebnis: { felder: ['f'] },
            prompt: 'P',
          },
        ],
      });
      expect(res.status).toBe(400);
      expect(fs.readdirSync(TMP_FLOWS)).toHaveLength(0);
    });
  });

  describe('Lesen', () => {
    test('listet angelegte Flows', async () => {
      await auth(request(app).post('/api/flows')).send(NEU);
      await auth(request(app).post('/api/flows')).send({ ...NEU, name: 'zweit' });

      const res = await auth(request(app).get('/api/flows'));
      expect(res.status).toBe(200);
      expect(res.body.data.map(s => s.name).sort()).toEqual(['notiz', 'zweit']);
      expect(res.body.fehlerhaft).toEqual([]);
    });

    test('eine kaputte Datei legt die Liste nicht lahm, sondern wird gemeldet', async () => {
      await auth(request(app).post('/api/flows')).send(NEU);
      fs.writeFileSync(path.join(TMP_FLOWS, 'kaputt.md'), '---\nwerkzeuge: [unsinn]\n---\nX');

      const res = await auth(request(app).get('/api/flows'));
      expect(res.status).toBe(200);
      expect(res.body.data.map(s => s.name)).toEqual(['notiz']);
      expect(res.body.fehlerhaft).toHaveLength(1);
      expect(res.body.fehlerhaft[0].name).toBe('kaputt');
    });

    test('liefert 404 für einen unbekannten Flow', async () => {
      const res = await auth(request(app).get('/api/flows/gibtsnicht'));
      expect(res.status).toBe(404);
    });

    test('gibt die rohe Markdown-Datei zurück', async () => {
      await auth(request(app).post('/api/flows')).send(NEU);
      const res = await auth(request(app).get('/api/flows/notiz/datei'));
      expect(res.status).toBe(200);
      expect(res.text).toMatch(/^---\n/);
      expect(res.text).toContain('Fasse den Text zusammen.');
    });

    test('nennt die Werkzeuge und ob sie schon nutzbar sind', async () => {
      const res = await auth(request(app).get('/api/flows/werkzeuge'));
      expect(res.status).toBe(200);
      const nach = Object.fromEntries(res.body.data.map(w => [w.name, w.verfuegbar]));
      // Alle Werkzeuge des Plans sind gebaut (Schritte 6–11).
      expect(nach.dateien_lesen).toBe(true);
      expect(nach.rag_suche).toBe(true);
      expect(nach.terminal).toBe(true);
      expect(nach.web_suche).toBe(true);
      expect(nach.web_lesen).toBe(true);
      expect(nach.subagent).toBe(true);
    });

    test('listet die Wissensbasen ohne die unsichtbaren Workspace-Räume', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Allgemein', slug: 'allgemein' }] });
      const res = await auth(request(app).get('/api/flows/sammlungen'));
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      // Nicht der LETZTE Aufruf — danach schreibt die Audit-Middleware noch.
      const abfragen = db.query.mock.calls.map(c => String(c[0]));
      expect(abfragen.some(q => /is_workspace = FALSE/.test(q))).toBe(true);
    });
  });

  describe('Ändern und Löschen', () => {
    test('ändert einen bestehenden Flow', async () => {
      await auth(request(app).post('/api/flows')).send(NEU);
      const res = await auth(request(app).put('/api/flows/notiz')).send({
        prompt: 'Neuer Prompt.',
        beschreibung: 'Geändert.',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.prompt).toBe('Neuer Prompt.');
      expect(fs.readFileSync(path.join(TMP_FLOWS, 'notiz.md'), 'utf8')).toContain('Neuer Prompt.');
    });

    /**
     * Regression: Ein PUT mit nur `{ prompt }` darf die übrigen Felder NICHT
     * verlieren. Vorher ersetzte PUT die Definition vollständig — wer einen
     * Tippfehler im Prompt korrigierte, bekam eine 200 und einen Flow ohne
     * Werkzeuge, Rollen, Argumente, Ordner und Grenzen zurück.
     */
    test('ein PUT mit nur einem Feld behält alle übrigen Felder', async () => {
      const voll = {
        name: 'voll',
        prompt: 'Recherchiere {{thema}}.',
        argumente: [{ name: 'thema', typ: 'freitext', pflicht: true }],
        ordner: ['/arasul/sandbox/projects/demo'],
        werkzeuge: ['web_suche', 'subagent', 'dateien_schreiben'],
        rollen: [
          {
            name: 'leser',
            werkzeuge: ['web_suche'],
            ergebnis: { felder: ['fakten'], max_zeichen: 1200 },
            prompt: 'Lies und verdichte.',
          },
        ],
        grenzen: { max_aufrufe: 5, zeitlimit_s: 60, werkzeug_runden: 3 },
      };
      await auth(request(app).post('/api/flows')).send(voll);

      // Nur den Prompt ändern — wie beim Beheben eines Tippfehlers.
      const res = await auth(request(app).put('/api/flows/voll')).send({
        prompt: 'Recherchiere gründlich {{thema}}.',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.prompt).toBe('Recherchiere gründlich {{thema}}.');

      // Alles andere muss unverändert dastehen.
      expect(res.body.data.werkzeuge).toEqual(['web_suche', 'subagent', 'dateien_schreiben']);
      expect(res.body.data.rollen).toHaveLength(1);
      expect(res.body.data.rollen[0].name).toBe('leser');
      expect(res.body.data.argumente).toHaveLength(1);
      expect(res.body.data.ordner).toEqual(['/arasul/sandbox/projects/demo']);
      expect(res.body.data.grenzen).toEqual({
        max_aufrufe: 5,
        zeitlimit_s: 60,
        werkzeug_runden: 3,
        max_tiefe: 2,
      });

      // Und auch auf der Platte, nicht nur in der Antwort.
      const datei = fs.readFileSync(path.join(TMP_FLOWS, 'voll.md'), 'utf8');
      expect(datei).toContain('leser');
      expect(datei).toContain('web_suche');
    });

    test('ein Feld lässt sich weiterhin gezielt leeren', async () => {
      await auth(request(app).post('/api/flows')).send({
        name: 'leerbar',
        prompt: 'Text.',
        ordner: ['/a'],
        werkzeuge: ['dateien_lesen'],
      });
      const res = await auth(request(app).put('/api/flows/leerbar')).send({
        prompt: 'Text.',
        werkzeuge: [],
        ordner: [],
      });
      expect(res.status).toBe(200);
      expect(res.body.data.werkzeuge).toEqual([]);
      expect(res.body.data.ordner).toEqual([]);
    });

    test('Ändern eines unbekannten Flows gibt 404 (kein stilles Anlegen)', async () => {
      const res = await auth(request(app).put('/api/flows/gibtsnicht')).send({ prompt: 'X' });
      expect(res.status).toBe(404);
      expect(fs.readdirSync(TMP_FLOWS)).toHaveLength(0);
    });

    test('eine ungültige Änderung lässt die alte Datei unangetastet', async () => {
      await auth(request(app).post('/api/flows')).send(NEU);
      const vorher = fs.readFileSync(path.join(TMP_FLOWS, 'notiz.md'), 'utf8');

      const res = await auth(request(app).put('/api/flows/notiz')).send({
        prompt: 'Kaputt {{unbekannt}}',
      });
      expect(res.status).toBe(400);
      expect(fs.readFileSync(path.join(TMP_FLOWS, 'notiz.md'), 'utf8')).toBe(vorher);
    });

    test('löscht einen Flow', async () => {
      await auth(request(app).post('/api/flows')).send(NEU);
      const res = await auth(request(app).delete('/api/flows/notiz'));
      expect(res.status).toBe(200);
      expect(fs.existsSync(path.join(TMP_FLOWS, 'notiz.md'))).toBe(false);
    });

    test('Löschen eines unbekannten Flows gibt 404', async () => {
      const res = await auth(request(app).delete('/api/flows/gibtsnicht'));
      expect(res.status).toBe(404);
    });
  });

  describe('Vorschau', () => {
    test('zeigt die Datei, ohne sie zu schreiben', async () => {
      const res = await auth(request(app).post('/api/flows/vorschau')).send(NEU);
      expect(res.status).toBe(200);
      expect(res.body.data.datei).toContain('name: notiz');
      expect(fs.readdirSync(TMP_FLOWS)).toHaveLength(0);
    });

    test('meldet ungültige Eingaben, statt eine kaputte Vorschau zu zeigen', async () => {
      const res = await auth(request(app).post('/api/flows/vorschau')).send({
        ...NEU,
        prompt: '{{fehlt}}',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('Vorschau-Laufzeit', () => {
    test('löst den Prompt mit den mitgegebenen Argumenten auf', async () => {
      const res = await auth(request(app).post('/api/flows/vorschau-laufzeit')).send({
        ...NEU,
        prompt: 'Fasse {{thema}} zusammen.',
        argumente: [{ name: 'thema', typ: 'freitext', pflicht: true }],
        args: { thema: 'Quartalszahlen' },
      });
      expect(res.status).toBe(200);
      expect(res.body.data.systemPrompt).toBe('Fasse Quartalszahlen zusammen.');
      expect(res.body.data.werkzeuge).toEqual([]);
      expect(fs.readdirSync(TMP_FLOWS)).toHaveLength(0);
    });

    test('setzt ohne Angaben einen sichtbaren Platzhalter ein (wirft nicht)', async () => {
      const res = await auth(request(app).post('/api/flows/vorschau-laufzeit')).send({
        ...NEU,
        prompt: 'Fasse {{thema}} zusammen.',
        argumente: [{ name: 'thema', typ: 'freitext', pflicht: true }],
      });
      expect(res.status).toBe(200);
      expect(res.body.data.systemPrompt).toBe('Fasse ‹thema› zusammen.');
    });

    test('gibt strukturellen Kontext (Werkzeuge/Ordner) getrennt zurück', async () => {
      const res = await auth(request(app).post('/api/flows/vorschau-laufzeit')).send({
        ...NEU,
        werkzeuge: ['dateien_lesen'],
        ordner: ['berichte'],
      });
      expect(res.status).toBe(200);
      expect(res.body.data.werkzeuge).toEqual(['dateien_lesen']);
      expect(res.body.data.ordner).toEqual(['berichte']);
    });
  });

  // --- Läufe (Plan 011, Schritt 9) -----------------------------------------
  // Der Auth-Mock beantwortet die Auth-Abfragen per Teilstring; hier wird er um
  // die Lauf-Tabellen erweitert, damit die Routen echte Zeilen zurückbekommen.
  describe('Läufe', () => {
    /** Verdrahtet db.query: erst Auth wie gehabt, dann die Lauf-Tabellen. */
    function mitLaeufen({ runRows = [], stepRows = [], cancelRows = [] }) {
      setupAuthMocks(db);
      const auth = db.query.getMockImplementation();
      db.query.mockImplementation((sql, params) => {
        const s = String(sql);
        if (/UPDATE flow_runs\s+SET status = 'abgebrochen'/.test(s)) {
          return Promise.resolve({ rows: cancelRows });
        }
        if (/UPDATE flow_run_steps/.test(s)) {
          return Promise.resolve({ rows: [] });
        }
        if (/FROM flow_runs/.test(s) && /ORDER BY id DESC/.test(s)) {
          return Promise.resolve({ rows: runRows });
        }
        if (/FROM flow_runs WHERE id/.test(s)) {
          return Promise.resolve({ rows: runRows });
        }
        if (/FROM flow_run_steps/.test(s)) {
          return Promise.resolve({ rows: stepRows });
        }
        return auth(sql, params);
      });
    }

    test('listet die Läufe des Nutzers', async () => {
      mitLaeufen({ runRows: [{ id: 3, flow_name: 'recherche', status: 'fertig' }] });
      const res = await auth(request(app).get('/api/flows/laeufe'));
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].flow_name).toBe('recherche');
    });

    test('„laeufe" wird NICHT als Flow-Name missverstanden', async () => {
      // Der Kern der Routen-Reihenfolge: /laeufe muss VOR /:name greifen.
      mitLaeufen({ runRows: [] });
      const res = await auth(request(app).get('/api/flows/laeufe'));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('lädt einen Lauf samt Schritten', async () => {
      mitLaeufen({
        runRows: [{ id: 3, flow_name: 'recherche', status: 'laeuft' }],
        stepRows: [{ id: 9, position: 0, kind: 'werkzeug', name: 'web_suche' }],
      });
      const res = await auth(request(app).get('/api/flows/laeufe/3'));
      expect(res.status).toBe(200);
      expect(res.body.data.steps).toHaveLength(1);
      expect(res.body.data.steps[0].name).toBe('web_suche');
    });

    test('ein fremder/unbekannter Lauf gibt 404', async () => {
      mitLaeufen({ runRows: [] });
      const res = await auth(request(app).get('/api/flows/laeufe/999'));
      expect(res.status).toBe(404);
    });

    test('eine nicht-numerische Lauf-ID wird abgewiesen', async () => {
      mitLaeufen({ runRows: [] });
      const res = await auth(request(app).get('/api/flows/laeufe/abc'));
      expect(res.status).toBe(400);
    });

    test('bricht einen laufenden Lauf ab', async () => {
      mitLaeufen({ cancelRows: [{ id: 3, status: 'abgebrochen' }] });
      const res = await auth(request(app).post('/api/flows/laeufe/3/abbrechen'));
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('abgebrochen');
    });

    test('Abbrechen eines bereits beendeten/fremden Laufs gibt 404', async () => {
      mitLaeufen({ cancelRows: [] });
      const res = await auth(request(app).post('/api/flows/laeufe/3/abbrechen'));
      expect(res.status).toBe(404);
    });
  });

  // --- Starten & Streamen (Plan 011, Schritt 12) ---------------------------
  describe('Läufe starten & streamen', () => {
    afterEach(() => jest.restoreAllMocks());

    test('startet einen Lauf LOSGELÖST und gibt sofort die ID (202) zurück', async () => {
      setupAuthMocks(db);
      // Der Flow muss existieren (loadFlow prüft die Datei früh).
      await auth(request(app).post('/api/flows')).send(NEU);
      // Den echten, losgelösten Start abfangen — kein Hintergrund-Lauf im Test.
      const spy = jest.spyOn(flowRunner, 'starten').mockResolvedValue({ runId: 77 });

      const res = await auth(request(app).post('/api/flows/laeufe')).send({
        flow: 'notiz',
        args: { text: 'hallo' },
      });
      expect(res.status).toBe(202);
      expect(res.body.data.runId).toBe(77);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ flowName: 'notiz', args: { text: 'hallo' } })
      );
    });

    test('Starten eines unbekannten Flows gibt 404 (kein Lauf entsteht)', async () => {
      setupAuthMocks(db);
      const spy = jest.spyOn(flowRunner, 'starten');
      const res = await auth(request(app).post('/api/flows/laeufe')).send({ flow: 'gibtsnicht' });
      expect(res.status).toBe(404);
      expect(spy).not.toHaveBeenCalled();
    });

    test('fehlt ein Pflicht-Argument, gibt es SOFORT 400 (kein losgelöster Lauf)', async () => {
      setupAuthMocks(db);
      // Flow mit Pflicht-Argument anlegen.
      await auth(request(app).post('/api/flows')).send({
        name: 'mitpflicht',
        prompt: 'Fasse {{text}} zusammen.',
        argumente: [{ name: 'text', typ: 'freitext', pflicht: true }],
      });
      const spy = jest.spyOn(flowRunner, 'starten');
      const res = await auth(request(app).post('/api/flows/laeufe')).send({
        flow: 'mitpflicht',
        args: {}, // das Pflicht-Argument fehlt
      });
      expect(res.status).toBe(400);
      expect(spy).not.toHaveBeenCalled(); // gar kein Lauf gestartet
    });

    test('Stream eines FERTIGEN Laufs: Verlauf + ende, dann geschlossen', async () => {
      // Fertiger Lauf → die Route sendet Verlauf und ende und schließt sofort.
      db.query.mockReset();
      setupAuthMocks(db);
      const auth2 = db.query.getMockImplementation();
      db.query.mockImplementation((sql, params) => {
        const s = String(sql);
        if (/FROM flow_runs WHERE id/.test(s)) {
          return Promise.resolve({ rows: [{ id: 5, flow_name: 'notiz', status: 'fertig', result: 'R' }] });
        }
        if (/FROM flow_run_steps/.test(s)) {
          return Promise.resolve({ rows: [] });
        }
        return auth2(sql, params);
      });

      const res = await auth(request(app).get('/api/flows/laeufe/5/stream'));
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/event-stream/);
      expect(res.text).toMatch(/"type":"verlauf"/);
      expect(res.text).toMatch(/"type":"ende"/);
      expect(res.text).toMatch(/"status":"fertig"/);
    });

    test('Stream eines laufenden Laufs: hängt sich an und schließt beim ende-Ereignis', async () => {
      db.query.mockReset();
      setupAuthMocks(db);
      const auth2 = db.query.getMockImplementation();
      db.query.mockImplementation((sql, params) => {
        const s = String(sql);
        if (/FROM flow_runs WHERE id/.test(s)) {
          return Promise.resolve({ rows: [{ id: 6, flow_name: 'notiz', status: 'laeuft' }] });
        }
        if (/FROM flow_run_steps/.test(s)) {
          return Promise.resolve({ rows: [] });
        }
        return auth2(sql, params);
      });
      // Abonnement mocken: sofort ein Live-Ereignis und dann 'ende' schicken,
      // damit der Strom sich schließt (sonst hinge der Test).
      jest.spyOn(flowRunner, 'abonnieren').mockImplementation((id, handler) => {
        setImmediate(() => {
          handler({ type: 'text', content: 'live!' });
          handler({ type: 'ende', status: 'fertig' });
        });
        return () => {};
      });

      const res = await auth(request(app).get('/api/flows/laeufe/6/stream'));
      expect(res.status).toBe(200);
      expect(res.text).toMatch(/"content":"live!"/);
      expect(res.text).toMatch(/"type":"ende"/);
    });

    test('Wettlauf: endet der Lauf zwischen Verlauf und Abonnieren, schließt der Strom trotzdem', async () => {
      // Der kritische Fall: Beim ersten Lesen ist der Lauf 'laeuft', das
      // 'ende'-Ereignis feuert aber, bevor wir abonnieren — der Bus wiederholt
      // es nicht. Die Nachprüfung (zweites getRun) muss den Strom schließen,
      // sonst hinge er für immer.
      db.query.mockReset();
      setupAuthMocks(db);
      const auth2 = db.query.getMockImplementation();
      let runReads = 0;
      db.query.mockImplementation((sql, params) => {
        const s = String(sql);
        if (/FROM flow_runs WHERE id/.test(s)) {
          runReads += 1;
          // Erstes Lesen: läuft. Zweites Lesen (Nachprüfung): schon fertig.
          const status = runReads === 1 ? 'laeuft' : 'fertig';
          return Promise.resolve({ rows: [{ id: 8, flow_name: 'notiz', status }] });
        }
        if (/FROM flow_run_steps/.test(s)) {
          return Promise.resolve({ rows: [] });
        }
        return auth2(sql, params);
      });
      // Abonnieren liefert eine Abmelde-Funktion, feuert aber NIE 'ende' (es kam
      // ja schon vor dem Abonnieren) — ohne die Nachprüfung bliebe der Strom offen.
      jest.spyOn(flowRunner, 'abonnieren').mockReturnValue(() => {});

      const res = await auth(request(app).get('/api/flows/laeufe/8/stream'));
      expect(res.status).toBe(200);
      expect(res.text).toMatch(/"type":"ende"/); // der Strom hat sich geschlossen
      expect(runReads).toBeGreaterThanOrEqual(2); // die Nachprüfung lief
    });

    test('Stream eines fremden/unbekannten Laufs gibt 404', async () => {
      db.query.mockReset();
      setupAuthMocks(db);
      const auth2 = db.query.getMockImplementation();
      db.query.mockImplementation((sql, params) => {
        if (/FROM flow_runs WHERE id/.test(String(sql))) {
          return Promise.resolve({ rows: [] }); // gehört nicht dem Nutzer
        }
        return auth2(sql, params);
      });
      const res = await auth(request(app).get('/api/flows/laeufe/999/stream'));
      expect(res.status).toBe(404);
    });
  });
});
