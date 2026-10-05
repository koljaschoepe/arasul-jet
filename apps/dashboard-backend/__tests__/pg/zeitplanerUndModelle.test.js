/**
 * Zeitplaner und Modelle gegen ein ECHTES Postgres (M5, 05.10.2026, Auftrag
 * jet-pruefung-zwei).
 *
 * Die zweite lesende Pruefung fand drei Stellen, an denen die SQL selbst die
 * Regel traegt. Eine Attrappe haette jede davon gruen gemeldet, darum stehen
 * sie hier gegen dieselbe Datenbank wie `anmeldungProfilPersonen.test.js`:
 *
 *   Befund 1  Ein nachgetragenes Modell, das Bilder liest UND Text schreibt,
 *             steht fuer Textschritte zur Wahl (`traegNachModelle` bis
 *             `schrittModelle.installierte`); Migration 209 zieht die Zeilen
 *             nach, die vorher schon als `vision` angelegt waren.
 *   Befund 2  Ein Modell, das der Admin fuer einen ganzen Flow gesetzt hat
 *             (`flow_settings.modell`), ist gegen Entfernen gesperrt.
 *   Befund 3  Ein Zeitplan-Lauf gehoert nie einem stillgelegten Konto: der
 *             Besitzer des Livestand-Schluessels zaehlt nur, solange er aktiv
 *             ist; sonst der aelteste aktive Admin.
 *
 * Aufruf wie die Nachbardatei (`npm run test:pg` mit `ARASUL_PG_TEST_URL`).
 * Diese Datei legt nur eigene Zeilen an (Praefix `jpz-`) und raeumt sie weg;
 * sie leert keine Tabelle. Ohne `ARASUL_PG_TEST_URL` ueberspringt sie sich.
 */

const fs = require('fs');
const path = require('path');

const URL_TEST = process.env.ARASUL_PG_TEST_URL;
const beschreibe = URL_TEST ? describe : describe.skip;

jest.setTimeout(30000);

const MIGRATION_209 = path.resolve(
  __dirname,
  '../../../../services/postgres/init/209_nachtrag_bild_ist_text_m5.sql'
);
const NACHTRAG_TEXT =
  'Am Gerät bei Ollama gefunden, auf diesem Gerät ungemessen. Größe und Fähigkeiten stammen aus Ollama.';

beschreibe('Zeitplaner und Modelle gegen echtes Postgres', () => {
  let db;
  let zeitplaner;
  let modellVerwaltung;
  let schrittModelle;
  let createSyncHelpers;
  const konten = {};

  beforeAll(async () => {
    const ziel = new URL(URL_TEST);
    process.env.POSTGRES_HOST = ziel.hostname;
    process.env.POSTGRES_PORT = ziel.port || '5432';
    process.env.POSTGRES_USER = decodeURIComponent(ziel.username);
    process.env.POSTGRES_PASSWORD = decodeURIComponent(ziel.password);
    process.env.POSTGRES_DB = ziel.pathname.replace(/^\//, '');

    db = require('../../src/database');
    zeitplaner = require('../../src/services/flows/zeitplaner');
    modellVerwaltung = require('../../src/services/llm/modellVerwaltung');
    schrittModelle = require('../../src/services/flows/schrittModelle');
    ({ createSyncHelpers } = require('../../src/services/llm/modelSyncHelpers'));

    await aufraeumen();
    for (const [schluessel, rolle] of [
      ['admin', 'admin'],
      ['person', 'mitarbeiter'],
    ]) {
      const { rows } = await db.query(
        `INSERT INTO public.admin_users (username, password_hash, email, role, is_active)
         VALUES ($1, 'x', $2, $3, true) RETURNING id`,
        [`jpz-${schluessel}`, `jpz-${schluessel}@beispiel.de`, rolle]
      );
      konten[schluessel] = Number(rows[0].id);
    }
    await db.query(`INSERT INTO public.apps (id, name) VALUES ('jpz-app', 'JPZ Probe')`);
  });

  async function aufraeumen() {
    await db.query(`DELETE FROM public.api_keys WHERE app_id = 'jpz-app'`);
    await db.query(`DELETE FROM public.flow_settings WHERE app_id = 'jpz-app'`);
    await db.query(`DELETE FROM public.app_flows WHERE app_id = 'jpz-app'`);
    await db.query(`DELETE FROM public.apps WHERE id = 'jpz-app'`);
    await db.query(`DELETE FROM public.llm_installed_models WHERE id LIKE 'jpz-%'`);
    await db.query(`DELETE FROM public.llm_model_catalog WHERE id LIKE 'jpz-%'`);
    await db.query(`DELETE FROM public.admin_users WHERE username LIKE 'jpz-%'`);
  }

  afterAll(async () => {
    if (db) {
      await aufraeumen();
      await db.close?.();
    }
  });

  describe('Befund 3: Besitzer eines Zeitplan-Laufs', () => {
    /** Der aelteste aktive Admin am Geraet, wie `besitzer` ihn als Rueckfall nimmt. */
    async function aeltesterAdmin() {
      const { rows } = await db.query(
        `SELECT id FROM public.admin_users
          WHERE role = 'admin' AND is_active = TRUE ORDER BY id ASC LIMIT 1`
      );
      return Number(rows[0].id);
    }

    beforeAll(async () => {
      await db.query(
        `INSERT INTO public.api_keys (key_hash, key_prefix, name, created_by, app_id, stand)
         VALUES ('jpz-hash', 'jpz-pre', 'Livestand', $1, 'jpz-app', 'live')`,
        [konten.person]
      );
    });

    it('der Besitzer des Livestand-Schluessels, solange sein Konto aktiv ist', async () => {
      expect(await zeitplaner.besitzer('jpz-app')).toBe(konten.person);
    });

    it('ist sein Konto stillgelegt, gehoert der Lauf dem aeltesten aktiven Admin', async () => {
      await db.query('UPDATE public.admin_users SET is_active = false WHERE id = $1', [
        konten.person,
      ]);
      expect(await zeitplaner.besitzer('jpz-app')).toBe(await aeltesterAdmin());
      expect(await zeitplaner.besitzer('jpz-app')).not.toBe(konten.person);
    });
  });

  describe('Befund 2: Sperre beim Entfernen', () => {
    beforeAll(async () => {
      for (const [id, standard] of [
        ['jpz-standard', true],
        ['jpz-gewaehlt', false],
      ]) {
        await db.query(
          `INSERT INTO public.llm_model_catalog
             (id, name, size_bytes, ram_required_gb, category, task, model_type, frei_geladen)
           VALUES ($1, $1, 1, 1, 'small', 'text', 'llm', true)`,
          [id]
        );
        await db.query(
          `INSERT INTO public.llm_installed_models (id, status, is_default)
           VALUES ($1, 'available', $2)`,
          [id, standard]
        );
      }
      await db.query(
        `INSERT INTO public.app_flows (app_id, stand, name, version, definition)
         VALUES ('jpz-app', 'live', 'beleg', '1.0.0', '{}'::jsonb)`
      );
    });

    it('ohne Wahl des Admins darf das Modell gehen', async () => {
      await expect(modellVerwaltung.entfernenPruefen('jpz-gewaehlt')).resolves.toBeUndefined();
    });

    it('hat der Admin es fuer einen Flow gesetzt, ist es gesperrt und nennt den Flow', async () => {
      await db.query(
        `INSERT INTO public.flow_settings (app_id, flow_name, modell)
         VALUES ('jpz-app', 'beleg', 'jpz-gewaehlt')`
      );
      const fehler = await modellVerwaltung.entfernenPruefen('jpz-gewaehlt').catch(e => e);
      expect(fehler.statusCode).toBe(409);
      expect(fehler.message).toContain('„beleg" (JPZ Probe)');
    });
  });

  describe('Befund 1: nachgetragenes Modell mit Bild', () => {
    it('steht als Text- und Bildmodell fuer Schritte zur Wahl', async () => {
      const helfer = createSyncHelpers({
        database: db,
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        activeDownloadIds: new Set(),
        modelAvailabilityCache: new Map(),
        leseSteckbrief: async () => ({
          parameterLabel: '25.2B',
          quantization: 'Q4_K_M',
          license: null,
          contextLength: 262144,
          supportsTools: true,
          supportsVision: true,
          capabilities: ['completion', 'vision', 'tools', 'thinking'],
        }),
      });
      expect(await helfer.traegNachModelle([{ name: 'jpz-gemma:26b', size: 18e9 }])).toEqual([
        'jpz-gemma:26b',
      ]);
      await db.query(
        `INSERT INTO public.llm_installed_models (id, status) VALUES ('jpz-gemma:26b', 'available')`
      );

      const m = (await schrittModelle.installierte()).find(x => x.id === 'jpz-gemma:26b');
      expect(m.faehigkeiten).toMatchObject({ text: true, bild: true, werkzeuge: true });
    });

    it('Migration 209 zieht alte Nachtraege nach und laesst das Bildmodell der Kurzliste', async () => {
      await db.query(
        `INSERT INTO public.llm_model_catalog
           (id, name, description, size_bytes, ram_required_gb, category, task, model_type,
            supports_vision_input, frei_geladen)
         VALUES ('jpz-alt', 'jpz-alt', $1, 1, 1, 'small', 'vision', 'vision', true, true),
                ('jpz-kurz', 'jpz-kurz', 'Der Weg für Bilder.', 1, 1, 'small', 'vision', 'vision', true, false)`,
        [NACHTRAG_TEXT]
      );

      const sql = fs.readFileSync(MIGRATION_209, 'utf8');
      await db.query(sql);
      await db.query(sql); // wiederholbar

      const { rows } = await db.query(
        `SELECT id, task, model_type, supports_vision_input FROM public.llm_model_catalog
          WHERE id IN ('jpz-alt', 'jpz-kurz') ORDER BY id`
      );
      expect(rows).toEqual([
        { id: 'jpz-alt', task: 'text', model_type: 'llm', supports_vision_input: true },
        { id: 'jpz-kurz', task: 'vision', model_type: 'vision', supports_vision_input: true },
      ]);
    });
  });
});
