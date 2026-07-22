/**
 * Skill-Verwaltung über HTTP (Plan 011, Schritt 5).
 *
 * Die Registry ist hier NICHT gemockt: sie arbeitet gegen ein echtes temporäres
 * Verzeichnis. Genau darum geht es bei diesen Routen — dass am Ende eine
 * gültige Datei auf der Platte liegt. Ein Mock würde die eigentliche Zusage
 * ("ein fehlerhafter Skill kann nicht gespeichert werden") wegtesten.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const request = require('supertest');

// Muss VOR dem Laden der Registry gesetzt sein — sie liest SKILLS_DIR beim Import.
const TMP_SKILLS = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-skills-'));
process.env.SKILLS_DIR = TMP_SKILLS;

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
const registry = require('../../src/services/skills/skillRegistry');
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

describe('Skills-Routen', () => {
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
    for (const f of fs.readdirSync(TMP_SKILLS)) {
      fs.unlinkSync(path.join(TMP_SKILLS, f));
    }
  });

  afterAll(() => {
    fs.rmSync(TMP_SKILLS, { recursive: true, force: true });
  });

  const auth = req => req.set('Authorization', `Bearer ${token}`);

  describe('Authentifizierung', () => {
    test('ohne Token gibt es keine Skills', async () => {
      const res = await request(app).get('/api/skills');
      expect(res.status).toBe(401);
    });
  });

  describe('Anlegen', () => {
    test('legt einen Skill an und schreibt eine echte Datei', async () => {
      const res = await auth(request(app).post('/api/skills')).send(NEU);
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ name: 'notiz', prompt: 'Fasse den Text zusammen.' });
      // Die Voreinstellungen aus dem Schema müssen durchschlagen.
      expect(res.body.data.grenzen).toEqual({
        max_aufrufe: 20,
        zeitlimit_s: 900,
        werkzeug_runden: 10,
      });

      const datei = path.join(TMP_SKILLS, 'notiz.md');
      expect(fs.existsSync(datei)).toBe(true);
      expect(fs.readFileSync(datei, 'utf8')).toContain('name: notiz');
    });

    test('weist einen zweiten Skill mit gleichem Namen mit 409 ab', async () => {
      await auth(request(app).post('/api/skills')).send(NEU);
      const res = await auth(request(app).post('/api/skills')).send(NEU);
      expect(res.status).toBe(409);
    });

    test('weist einen ungültigen Namen ab, ohne etwas zu schreiben', async () => {
      const res = await auth(request(app).post('/api/skills')).send({
        ...NEU,
        name: '../ausbruch',
      });
      expect(res.status).toBe(400);
      expect(fs.readdirSync(TMP_SKILLS)).toHaveLength(0);
    });

    test('weist einen Skill mit unbekanntem Werkzeug ab', async () => {
      const res = await auth(request(app).post('/api/skills')).send({
        ...NEU,
        werkzeuge: ['zauberstab'],
      });
      expect(res.status).toBe(400);
      expect(fs.readdirSync(TMP_SKILLS)).toHaveLength(0);
    });

    test('weist einen Prompt mit unbekanntem Platzhalter ab', async () => {
      const res = await auth(request(app).post('/api/skills')).send({
        ...NEU,
        prompt: 'Schreibe über {{thema}}.',
      });
      expect(res.status).toBe(400);
      expect(fs.readdirSync(TMP_SKILLS)).toHaveLength(0);
    });

    test('weist eine Rolle ab, die mehr darf als der Skill selbst', async () => {
      const res = await auth(request(app).post('/api/skills')).send({
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
      expect(fs.readdirSync(TMP_SKILLS)).toHaveLength(0);
    });
  });

  describe('Lesen', () => {
    test('listet angelegte Skills', async () => {
      await auth(request(app).post('/api/skills')).send(NEU);
      await auth(request(app).post('/api/skills')).send({ ...NEU, name: 'zweit' });

      const res = await auth(request(app).get('/api/skills'));
      expect(res.status).toBe(200);
      expect(res.body.data.map(s => s.name).sort()).toEqual(['notiz', 'zweit']);
      expect(res.body.fehlerhaft).toEqual([]);
    });

    test('eine kaputte Datei legt die Liste nicht lahm, sondern wird gemeldet', async () => {
      await auth(request(app).post('/api/skills')).send(NEU);
      fs.writeFileSync(path.join(TMP_SKILLS, 'kaputt.md'), '---\nwerkzeuge: [unsinn]\n---\nX');

      const res = await auth(request(app).get('/api/skills'));
      expect(res.status).toBe(200);
      expect(res.body.data.map(s => s.name)).toEqual(['notiz']);
      expect(res.body.fehlerhaft).toHaveLength(1);
      expect(res.body.fehlerhaft[0].name).toBe('kaputt');
    });

    test('liefert 404 für einen unbekannten Skill', async () => {
      const res = await auth(request(app).get('/api/skills/gibtsnicht'));
      expect(res.status).toBe(404);
    });

    test('gibt die rohe Markdown-Datei zurück', async () => {
      await auth(request(app).post('/api/skills')).send(NEU);
      const res = await auth(request(app).get('/api/skills/notiz/datei'));
      expect(res.status).toBe(200);
      expect(res.text).toMatch(/^---\n/);
      expect(res.text).toContain('Fasse den Text zusammen.');
    });

    test('nennt die Werkzeuge und ob sie schon nutzbar sind', async () => {
      const res = await auth(request(app).get('/api/skills/werkzeuge'));
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
      const res = await auth(request(app).get('/api/skills/sammlungen'));
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      // Nicht der LETZTE Aufruf — danach schreibt die Audit-Middleware noch.
      const abfragen = db.query.mock.calls.map(c => String(c[0]));
      expect(abfragen.some(q => /is_workspace = FALSE/.test(q))).toBe(true);
    });
  });

  describe('Ändern und Löschen', () => {
    test('ändert einen bestehenden Skill', async () => {
      await auth(request(app).post('/api/skills')).send(NEU);
      const res = await auth(request(app).put('/api/skills/notiz')).send({
        prompt: 'Neuer Prompt.',
        beschreibung: 'Geändert.',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.prompt).toBe('Neuer Prompt.');
      expect(fs.readFileSync(path.join(TMP_SKILLS, 'notiz.md'), 'utf8')).toContain('Neuer Prompt.');
    });

    /**
     * Regression: Ein PUT mit nur `{ prompt }` darf die übrigen Felder NICHT
     * verlieren. Vorher ersetzte PUT die Definition vollständig — wer einen
     * Tippfehler im Prompt korrigierte, bekam eine 200 und einen Skill ohne
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
      await auth(request(app).post('/api/skills')).send(voll);

      // Nur den Prompt ändern — wie beim Beheben eines Tippfehlers.
      const res = await auth(request(app).put('/api/skills/voll')).send({
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
      });

      // Und auch auf der Platte, nicht nur in der Antwort.
      const datei = fs.readFileSync(path.join(TMP_SKILLS, 'voll.md'), 'utf8');
      expect(datei).toContain('leser');
      expect(datei).toContain('web_suche');
    });

    test('ein Feld lässt sich weiterhin gezielt leeren', async () => {
      await auth(request(app).post('/api/skills')).send({
        name: 'leerbar',
        prompt: 'Text.',
        ordner: ['/a'],
        werkzeuge: ['dateien_lesen'],
      });
      const res = await auth(request(app).put('/api/skills/leerbar')).send({
        prompt: 'Text.',
        werkzeuge: [],
        ordner: [],
      });
      expect(res.status).toBe(200);
      expect(res.body.data.werkzeuge).toEqual([]);
      expect(res.body.data.ordner).toEqual([]);
    });

    test('Ändern eines unbekannten Skills gibt 404 (kein stilles Anlegen)', async () => {
      const res = await auth(request(app).put('/api/skills/gibtsnicht')).send({ prompt: 'X' });
      expect(res.status).toBe(404);
      expect(fs.readdirSync(TMP_SKILLS)).toHaveLength(0);
    });

    test('eine ungültige Änderung lässt die alte Datei unangetastet', async () => {
      await auth(request(app).post('/api/skills')).send(NEU);
      const vorher = fs.readFileSync(path.join(TMP_SKILLS, 'notiz.md'), 'utf8');

      const res = await auth(request(app).put('/api/skills/notiz')).send({
        prompt: 'Kaputt {{unbekannt}}',
      });
      expect(res.status).toBe(400);
      expect(fs.readFileSync(path.join(TMP_SKILLS, 'notiz.md'), 'utf8')).toBe(vorher);
    });

    test('löscht einen Skill', async () => {
      await auth(request(app).post('/api/skills')).send(NEU);
      const res = await auth(request(app).delete('/api/skills/notiz'));
      expect(res.status).toBe(200);
      expect(fs.existsSync(path.join(TMP_SKILLS, 'notiz.md'))).toBe(false);
    });

    test('Löschen eines unbekannten Skills gibt 404', async () => {
      const res = await auth(request(app).delete('/api/skills/gibtsnicht'));
      expect(res.status).toBe(404);
    });
  });

  describe('Vorschau', () => {
    test('zeigt die Datei, ohne sie zu schreiben', async () => {
      const res = await auth(request(app).post('/api/skills/vorschau')).send(NEU);
      expect(res.status).toBe(200);
      expect(res.body.data.datei).toContain('name: notiz');
      expect(fs.readdirSync(TMP_SKILLS)).toHaveLength(0);
    });

    test('meldet ungültige Eingaben, statt eine kaputte Vorschau zu zeigen', async () => {
      const res = await auth(request(app).post('/api/skills/vorschau')).send({
        ...NEU,
        prompt: '{{fehlt}}',
      });
      expect(res.status).toBe(400);
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
        if (/UPDATE skill_runs\s+SET status = 'abgebrochen'/.test(s)) {
          return Promise.resolve({ rows: cancelRows });
        }
        if (/UPDATE skill_run_steps/.test(s)) {
          return Promise.resolve({ rows: [] });
        }
        if (/FROM skill_runs/.test(s) && /ORDER BY id DESC/.test(s)) {
          return Promise.resolve({ rows: runRows });
        }
        if (/FROM skill_runs WHERE id/.test(s)) {
          return Promise.resolve({ rows: runRows });
        }
        if (/FROM skill_run_steps/.test(s)) {
          return Promise.resolve({ rows: stepRows });
        }
        return auth(sql, params);
      });
    }

    test('listet die Läufe des Nutzers', async () => {
      mitLaeufen({ runRows: [{ id: 3, skill_name: 'recherche', status: 'fertig' }] });
      const res = await auth(request(app).get('/api/skills/laeufe'));
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].skill_name).toBe('recherche');
    });

    test('„laeufe" wird NICHT als Skill-Name missverstanden', async () => {
      // Der Kern der Routen-Reihenfolge: /laeufe muss VOR /:name greifen.
      mitLaeufen({ runRows: [] });
      const res = await auth(request(app).get('/api/skills/laeufe'));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('lädt einen Lauf samt Schritten', async () => {
      mitLaeufen({
        runRows: [{ id: 3, skill_name: 'recherche', status: 'laeuft' }],
        stepRows: [{ id: 9, position: 0, kind: 'werkzeug', name: 'web_suche' }],
      });
      const res = await auth(request(app).get('/api/skills/laeufe/3'));
      expect(res.status).toBe(200);
      expect(res.body.data.steps).toHaveLength(1);
      expect(res.body.data.steps[0].name).toBe('web_suche');
    });

    test('ein fremder/unbekannter Lauf gibt 404', async () => {
      mitLaeufen({ runRows: [] });
      const res = await auth(request(app).get('/api/skills/laeufe/999'));
      expect(res.status).toBe(404);
    });

    test('eine nicht-numerische Lauf-ID wird abgewiesen', async () => {
      mitLaeufen({ runRows: [] });
      const res = await auth(request(app).get('/api/skills/laeufe/abc'));
      expect(res.status).toBe(400);
    });

    test('bricht einen laufenden Lauf ab', async () => {
      mitLaeufen({ cancelRows: [{ id: 3, status: 'abgebrochen' }] });
      const res = await auth(request(app).post('/api/skills/laeufe/3/abbrechen'));
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('abgebrochen');
    });

    test('Abbrechen eines bereits beendeten/fremden Laufs gibt 404', async () => {
      mitLaeufen({ cancelRows: [] });
      const res = await auth(request(app).post('/api/skills/laeufe/3/abbrechen'));
      expect(res.status).toBe(404);
    });
  });
});
