/**
 * Die zurueckgestellten Befunde der zweiten Pruefung gegen ein ECHTES Postgres
 * (M5, 07.10.2026, Auftrag jet-restbefunde-drei).
 *
 *   Befund 13  Die Modellverwaltung prueft jedes noch nicht geladene Modell der
 *              Liste einzeln: je Modell zwei Abfragen und ein `df`. Jetzt liest
 *              sie Platte und Groessen einmal.
 *   Befund 14  Die Modell-Hinweise der Startseite fragen je App und je Flow
 *              einzeln. Jetzt drei Abfragen fuer alle.
 *   Befund 15  Laesst sich der Plan eines Laufs nicht lesen, lief er bisher
 *              still ohne die Wahl des Admins. Jetzt steht es im Lauf.
 *   Befund 16  Stirbt das Backend zwischen Termin und Start, stand der Termin
 *              fuer immer als `gestartet` ohne Lauf da. Jetzt raeumt der
 *              naechste Takt ihn auf: Lauf gefunden, nachgeholt oder
 *              uebersprungen mit Grund.
 *   Befund 18  Das Loeschen einer Person loeschte die Schluessel der Apps, die
 *              sie eingespielt hat. Jetzt bleiben sie und gehen auf den Admin
 *              ueber; ihre eigenen Schluessel gehen mit.
 *   Kleinfund  Nach dem Entfernen eines frei geladenen Modells ist seine
 *              Katalogzeile weg (das war schon so; der Test haelt es fest).
 *
 * 13 und 14 messen ausserdem die Zeit, mit einem Bestand, wie ihn ein Haus mit
 * zwoelf Personen hat, und schreiben sie als `MESSUNG` in die Ausgabe.
 *
 * Aufruf wie die Nachbardateien (`npm run test:pg` mit `ARASUL_PG_TEST_URL`).
 * Diese Datei legt nur eigene Zeilen an (Praefix `jpr-`) und raeumt sie weg.
 */

const URL_TEST = process.env.ARASUL_PG_TEST_URL;
const beschreibe = URL_TEST ? describe : describe.skip;

jest.setTimeout(60000);

const MIN = 60 * 1000;

/** Den Median aus `runden` Durchlaeufen, in Millisekunden. */
async function miss(name, runden, fn) {
  await fn(); // warm
  const zeiten = [];
  for (let i = 0; i < runden; i++) {
    const t0 = process.hrtime.bigint();
    await fn();
    zeiten.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  zeiten.sort((a, b) => a - b);
  const median = zeiten[Math.floor(zeiten.length / 2)];
  process.stdout.write(`MESSUNG ${name}: Median ${median.toFixed(1)} ms aus ${runden}\n`);
  return median;
}

/** Wie viele Abfragen `fn` an die Datenbank stellt. */
async function zaehleAbfragen(db, fn) {
  const spion = jest.spyOn(db, 'query');
  try {
    await fn();
    return spion.mock.calls.length;
  } finally {
    spion.mockRestore();
  }
}

beschreibe('Restbefunde der zweiten Pruefung gegen echtes Postgres', () => {
  let db;
  let zeitplaner;
  let schrittModelle;
  let modellVerwaltung;
  let modelService;
  let benutzerService;
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
    schrittModelle = require('../../src/services/flows/schrittModelle');
    modellVerwaltung = require('../../src/services/llm/modellVerwaltung');
    modelService = require('../../src/services/llm/modelService');
    benutzerService = require('../../src/services/auth/benutzerService');

    await aufraeumen();
    for (const [schluessel, rolle] of [
      ['chef', 'admin'],
      ['weg', 'admin'],
      ['geht', 'mitarbeiter'],
    ]) {
      const { rows } = await db.query(
        `INSERT INTO public.admin_users (username, password_hash, email, role, is_active)
         VALUES ($1, 'x', $2, $3, true) RETURNING id`,
        [`jpr-${schluessel}`, `jpr-${schluessel}@beispiel.de`, rolle]
      );
      konten[schluessel] = Number(rows[0].id);
    }
  });

  async function aufraeumen() {
    await db.query(`DELETE FROM public.api_keys WHERE name LIKE 'jpr-%'`);
    await db.query(`DELETE FROM public.flow_zeitplan_termine WHERE app_id LIKE 'jpr-%'`);
    await db.query(`DELETE FROM flow_runs WHERE app_id LIKE 'jpr-%'`);
    await db.query(`DELETE FROM public.flow_schritt_modelle WHERE app_id LIKE 'jpr-%'`);
    await db.query(`DELETE FROM public.app_flows WHERE app_id LIKE 'jpr-%'`);
    await db.query(`DELETE FROM public.apps WHERE id LIKE 'jpr-%'`);
    await db.query(`DELETE FROM public.llm_installed_models WHERE id LIKE 'jpr-%'`);
    await db.query(`DELETE FROM public.llm_model_catalog WHERE id LIKE 'jpr-%'`);
    await db.query(`DELETE FROM public.admin_users WHERE username LIKE 'jpr-%'`);
  }

  afterAll(async () => {
    jest.restoreAllMocks();
    if (db) {
      await aufraeumen();
      await db.close?.();
    }
  });

  // -------------------------------------------------------------------------
  describe('Befund 13: Modellverwaltung prueft die Liste in einem Zug', () => {
    const abfragenBei = {};
    beforeAll(() => {
      // Ollama gibt es hier nicht; `getLoadedModels` faengt das selbst, aber
      // jeder Versuch kostete fuenf Sekunden Frist.
      jest.spyOn(modelService, 'getLoadedModels').mockResolvedValue([]);
    });

    async function messeBei(anzahl) {
      const { rows } = await db.query(
        `SELECT count(*)::int AS n FROM public.llm_model_catalog c
           LEFT JOIN public.llm_installed_models i ON i.id = c.id
          WHERE COALESCE(c.frei_geladen, false) = false AND c.model_type <> 'ocr'
            AND COALESCE(i.status, '') <> 'available'`
      );
      for (let i = rows[0].n; i < anzahl; i++) {
        const id = `jpr-liste-${String(i).padStart(2, '0')}:8b`;
        await db.query(
          `INSERT INTO public.llm_model_catalog
             (id, name, size_bytes, ram_required_gb, category, task, model_type, performance_tier)
           VALUES ($1, $1, $2, 8, 'medium', 'text', 'llm', 2)`,
          [id, 5e9 + i]
        );
      }
      const platte = jest.spyOn(modelService, 'getDiskSpace');
      const ergebnis = await modellVerwaltung.uebersicht();
      const dfAufrufe = platte.mock.calls.length;
      platte.mockRestore();
      const abfragen = await zaehleAbfragen(db, () => modellVerwaltung.uebersicht());
      const n = ergebnis.liste.length;
      await miss(`Befund 13, ${n} offene Modelle`, 15, () => modellVerwaltung.uebersicht());
      process.stdout.write(
        `MESSUNG Befund 13, ${n} offene Modelle: ${abfragen} Abfragen, ${dfAufrufe} Mal Platte\n`
      );
      return { ergebnis, dfAufrufe, abfragen };
    }

    it('frisches Geraet (die Kurzliste): Platte einmal gelesen, jedes Modell geprueft', async () => {
      const { ergebnis, dfAufrufe, abfragen } = await messeBei(0);
      expect(ergebnis.liste.length).toBeGreaterThan(0);
      for (const z of ergebnis.liste) {
        expect(typeof z.passt).toBe('boolean');
      }
      expect(dfAufrufe).toBe(1);
      abfragenBei.kurz = abfragen;
    });

    it('gewachsene Liste mit 20 Modellen: Abfragen und Platte haengen nicht an der Zahl', async () => {
      const { ergebnis, dfAufrufe, abfragen } = await messeBei(20);
      expect(ergebnis.liste.length).toBeGreaterThanOrEqual(20);
      expect(dfAufrufe).toBe(1);
      expect(abfragen).toBe(abfragenBei.kurz);
    });

    it('das Urteil ist dasselbe wie das der Einzelpruefung', async () => {
      const freiesModell = require('../../src/services/llm/freiesModell');
      const { liste } = await modellVerwaltung.uebersicht();
      for (const z of liste.slice(0, 5)) {
        const einzeln = await freiesModell.pruefe(z.id);
        expect([z.id, z.passt, z.grund]).toEqual([z.id, einzeln.passt, einzeln.grund]);
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('Befund 14: Modell-Hinweise ueber alle Apps in wenigen Abfragen', () => {
    const APPS = 10;
    const FLOWS = 4;

    beforeAll(async () => {
      await db.query(
        `INSERT INTO public.llm_model_catalog
           (id, name, size_bytes, ram_required_gb, category, task, model_type, supports_tools)
         VALUES ('jpr-da', 'jpr-da', 1, 1, 'small', 'text', 'llm', true)`
      );
      await db.query(
        `INSERT INTO public.llm_installed_models (id, status) VALUES ('jpr-da', 'available')`
      );
      // Je App vier Flows in zwei Staenden mit drei Schritten; der zweite
      // nennt ein Modell, das am Geraet fehlt (also ein Hinweis je Flow).
      for (let a = 0; a < APPS; a++) {
        const appId = `jpr-hw-${a}`;
        await db.query('INSERT INTO public.apps (id, name) VALUES ($1, $2)', [
          appId,
          `Hinweis-App ${a}`,
        ]);
        for (let f = 0; f < FLOWS; f++) {
          const definition = {
            schritte: [
              { typ: 'subagent', name: 'lesen', modell: 'jpr-da', auftrag: 'a' },
              { typ: 'subagent', name: 'pruefen', modell: 'jpr-fehlt:70b', auftrag: 'b' },
              { typ: 'subagent', name: 'schreiben', auftrag: 'c' },
            ],
          };
          for (const stand of ['test', 'live']) {
            await db.query(
              `INSERT INTO public.app_flows (app_id, stand, name, version, definition)
               VALUES ($1, $2, $3, '1.0.0', $4)`,
              [appId, stand, `flow-${f}`, definition]
            );
          }
          if (f === 0) {
            await db.query(
              `INSERT INTO public.flow_schritt_modelle (app_id, flow_name, schritt, modell)
               VALUES ($1, 'flow-0', 'schreiben', 'jpr-da')`,
              [appId]
            );
          }
        }
      }
    });

    it('nennt jeden Schritt mit fehlendem Modell, in wenigen Abfragen', async () => {
      const abfragen = await zaehleAbfragen(db, () => schrittModelle.hinweise());
      await miss(`Befund 14, ${APPS} Apps zu ${FLOWS} Flows`, 15, () => schrittModelle.hinweise());
      process.stdout.write(
        `MESSUNG Befund 14, ${APPS} Apps zu ${FLOWS} Flows: ${abfragen} Abfragen\n`
      );
      const hinweise = (await schrittModelle.hinweise()).filter(h => h.app_id.startsWith('jpr-hw'));
      expect(hinweise).toHaveLength(APPS * FLOWS);
      expect(hinweise[0]).toMatchObject({ schritt: 'pruefen', original: 'jpr-fehlt:70b' });
      // Vorher eine je App und eine je Flow (55 bei diesem Bestand).
      expect(abfragen).toBeLessThanOrEqual(8);
    });

    it('die App-Seite liest die Wahlen der App in einer Abfrage', async () => {
      const seite = await schrittModelle.uebersicht('jpr-hw-0');
      expect(seite.flows).toHaveLength(FLOWS);
      const schreiben = seite.flows[0].schritte.find(s => s.name === 'schreiben');
      expect(schreiben.gewaehlt).toBe('jpr-da');
      const abfragen = await zaehleAbfragen(db, () => schrittModelle.uebersicht('jpr-hw-0'));
      // Vorher fuenf und eine je Flow.
      expect(abfragen).toBeLessThanOrEqual(6);
    });
  });

  // -------------------------------------------------------------------------
  describe('Befund 15: ein unlesbarer Plan steht im Lauf', () => {
    it('jeder Schritt laeuft mit seinem Paket-Modell, und der Lauf sagt es', async () => {
      const original = db.query.bind(db);
      const spion = jest
        .spyOn(db, 'query')
        .mockImplementation((sql, ...rest) =>
          /flow_schritt_modelle/.test(sql)
            ? Promise.reject(new Error('Verbindung zur Datenbank abgerissen'))
            : original(sql, ...rest)
        );
      try {
        const plan = await schrittModelle.planFuerLauf({
          appId: 'jpr-hw-0',
          flowName: 'flow-0',
          definition: {
            schritte: [
              { typ: 'subagent', name: 'lesen', modell: 'jpr-da', auftrag: 'a' },
              { typ: 'subagent', name: 'schreiben', auftrag: 'c' },
            ],
          },
        });
        expect([...plan.keys()]).toEqual(['lesen', 'schreiben']);
        expect(plan.get('lesen')).toMatchObject({ modell: null, herkunft: 'plan_unlesbar' });
        expect(plan.get('lesen').vermerk).toMatch(/Modellwahl.*nicht lesen/);
        // Ein Vermerk fuer den Lauf, nicht einer je Schritt.
        expect(plan.get('schreiben').vermerk).toBeNull();
      } finally {
        spion.mockRestore();
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('Befund 16: ein Termin ohne Lauf nach einem Absturz', () => {
    const APP = 'jpr-zp';
    const jetzt = Date.now();
    const vor = ms => new Date(jetzt - ms);

    beforeAll(async () => {
      await db.query(`INSERT INTO public.apps (id, name) VALUES ($1, 'Zeitplan-Probe')`, [APP]);
      await db.query(
        `INSERT INTO public.flow_zeitplaner (id, geprueft_bis) VALUES (1, $1)
         ON CONFLICT (id) DO UPDATE SET geprueft_bis = EXCLUDED.geprueft_bis`,
        [new Date(Math.floor(jetzt / MIN) * MIN - MIN)]
      );
      const termin = (flow, alter, erfasst = alter) =>
        db.query(
          `INSERT INTO public.flow_zeitplan_termine (app_id, flow_name, termin, ergebnis, erfasst_am)
           VALUES ($1, $2, $3, 'gestartet', $4)`,
          [APP, flow, vor(alter), vor(erfasst)]
        );
      // a: der Lauf begann noch, nur die Kennung fehlt.
      await termin('a', 10 * MIN);
      await db.query(
        `INSERT INTO flow_runs (user_id, flow_name, app_id, stand, ausloeser, created_at)
         VALUES ($1, 'a', $2, 'live', 'zeitplan', $3)`,
        [konten.chef, APP, vor(10 * MIN - 1000)]
      );
      // b: kein Lauf, der Termin ist zehn Minuten alt -> nachholen.
      await termin('b', 10 * MIN);
      // c: kein Lauf, der Termin ist zwei Stunden alt -> uebersprungen.
      await termin('c', 120 * MIN);
      // d: eben erst eingetragen, der Start kann noch laufen -> nicht anfassen.
      await termin('d', 30 * 1000);
    });

    it('der naechste Takt raeumt auf, und nur, was liegen geblieben ist', async () => {
      const start = jest.fn(async () => 987654);
      await zeitplaner.takt(jetzt, { start });

      const { rows } = await db.query(
        `SELECT flow_name, ergebnis, grund, run_id FROM public.flow_zeitplan_termine
          WHERE app_id = $1 ORDER BY flow_name`,
        [APP]
      );
      const lauf = await db.query(`SELECT id FROM flow_runs WHERE app_id = $1`, [APP]);
      const z = Object.fromEntries(rows.map(r => [r.flow_name, r]));

      expect(z.a).toMatchObject({ ergebnis: 'gestartet', run_id: lauf.rows[0].id });
      expect(z.b).toMatchObject({ ergebnis: 'nachgeholt', run_id: '987654' });
      expect(z.c.ergebnis).toBe('uebersprungen');
      expect(z.c.grund).toMatch(/unterbrochen/);
      expect(z.c.run_id).toBeNull();
      expect(z.d).toMatchObject({ ergebnis: 'gestartet', run_id: null });
      expect(start).toHaveBeenCalledTimes(1);
      expect(start).toHaveBeenCalledWith(expect.objectContaining({ appId: APP, flowName: 'b' }));

      // Der Takt der naechsten Minute findet nichts mehr.
      await zeitplaner.takt(jetzt + MIN, { start });
      expect(start).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('Befund 18: Loeschen einer Person, die Apps eingespielt hat', () => {
    const APP = 'jpr-zp';

    async function schluessel(name, createdBy, appId, stand) {
      const { rows } = await db.query(
        `INSERT INTO public.api_keys (key_hash, key_prefix, name, created_by, app_id, stand)
         VALUES ('jpr-hash', 'jpr-pre', $1, $2, $3, $4) RETURNING id`,
        [name, createdBy, appId, stand]
      );
      return Number(rows[0].id);
    }
    const besitzerVon = async id =>
      (await db.query('SELECT created_by FROM public.api_keys WHERE id = $1', [id])).rows[0];

    it('der Schluessel der App bleibt und gehoert dem Admin, der loescht', async () => {
      const appTest = await schluessel('jpr-app-test', konten.weg, APP, 'test');
      const appLive = await schluessel('jpr-app-live', konten.weg, APP, 'live');
      const eigen = await schluessel('jpr-kit', konten.weg, null, null);

      const { summary } = await benutzerService.loescheBenutzer({
        userId: konten.weg,
        username: 'jpr-weg',
        role: 'admin',
        uebernehmer: konten.chef,
      });

      expect(await besitzerVon(appTest)).toEqual({ created_by: konten.chef });
      expect(await besitzerVon(appLive)).toEqual({ created_by: konten.chef });
      expect(await besitzerVon(eigen)).toBeUndefined();
      expect(summary).toMatchObject({ api_keys: 1, api_keys_uebernommen: 2 });
      // Der Zeitplan der App laeuft weiter, jetzt im Namen des Admins.
      expect(await zeitplaner.besitzer(APP)).toBe(konten.chef);
    });

    it('wer sich selbst loescht, gibt die Schluessel der Apps dem aeltesten Admin', async () => {
      const appLive = await schluessel('jpr-app-live-2', konten.geht, 'jpr-hw-1', 'live');
      await benutzerService.loescheBenutzer({
        userId: konten.geht,
        username: 'jpr-geht',
        role: 'mitarbeiter',
      });
      const { rows } = await db.query(
        `SELECT id FROM public.admin_users
          WHERE role = 'admin' AND is_active = TRUE ORDER BY id ASC LIMIT 1`
      );
      expect(await besitzerVon(appLive)).toEqual({ created_by: Number(rows[0].id) });
    });
  });

  // -------------------------------------------------------------------------
  describe('Kleinfund: Katalogzeile nach dem Entfernen eines frei geladenen Modells', () => {
    it('die Zeile geht mit dem Modell, die der Kurzliste bleibt', async () => {
      const axios = require('axios');
      jest.spyOn(axios, 'delete').mockResolvedValue({ data: {} });
      jest.spyOn(modelService, 'getLoadedModel').mockResolvedValue(null);
      for (const [id, frei] of [
        ['jpr-frei:1b', true],
        ['jpr-kurz:1b', false],
      ]) {
        await db.query(
          `INSERT INTO public.llm_model_catalog
             (id, name, size_bytes, ram_required_gb, category, task, model_type, frei_geladen)
           VALUES ($1, $1, 1, 1, 'small', 'text', 'llm', $2)`,
          [id, frei]
        );
        await db.query(
          `INSERT INTO public.llm_installed_models (id, status) VALUES ($1, 'available')`,
          [id]
        );
        await modelService.deleteModel(id);
      }
      const { rows } = await db.query(
        `SELECT id FROM public.llm_model_catalog WHERE id IN ('jpr-frei:1b', 'jpr-kurz:1b')`
      );
      expect(rows.map(r => r.id)).toEqual(['jpr-kurz:1b']);
    });
  });
});
