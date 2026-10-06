/**
 * Der kurze Titel eines Laufs gegen ein ECHTES Postgres (M5, 06.10.2026,
 * Auftrag erkennung-liest-das-original, Migration 211).
 *
 * Die Regel steht in der SQL selbst: `titelSetzen` ueberschreibt nie, was die
 * App beim Start nannte (`COALESCE`), und `anfordern` setzt den Titel des Laufs
 * in derselben Anweisung vor den Titel der Freigabe. Eine Attrappe meldete
 * beides gruen, auch wenn die Spalte fehlte.
 *
 * Aufruf wie die Nachbardateien (`npm run test:pg` mit `ARASUL_PG_TEST_URL`).
 * Diese Datei legt nur eigene Zeilen an (Praefix `jlt-`) und raeumt sie weg.
 */

const URL_TEST = process.env.ARASUL_PG_TEST_URL;
const beschreibe = URL_TEST ? describe : describe.skip;

jest.setTimeout(30000);

beschreibe('Titel des Laufs gegen echtes Postgres', () => {
  let db;
  let runStore;
  let freigabeAnfragen;
  let benutzer;

  async function aufraeumen() {
    await db.query(`DELETE FROM public.approvals WHERE app_id = 'jlt-app'`);
    await db.query(`DELETE FROM flow_runs WHERE app_id = 'jlt-app'`);
    await db.query(`DELETE FROM public.apps WHERE id = 'jlt-app'`);
    await db.query(`DELETE FROM public.admin_users WHERE username LIKE 'jlt-%'`);
  }

  beforeAll(async () => {
    const ziel = new URL(URL_TEST);
    process.env.POSTGRES_HOST = ziel.hostname;
    process.env.POSTGRES_PORT = ziel.port || '5432';
    process.env.POSTGRES_USER = decodeURIComponent(ziel.username);
    process.env.POSTGRES_PASSWORD = decodeURIComponent(ziel.password);
    process.env.POSTGRES_DB = ziel.pathname.replace(/^\//, '');

    db = require('../../src/database');
    runStore = require('../../src/services/flows/runStore');
    freigabeAnfragen = require('../../src/services/flows/freigabeAnfragen');

    await aufraeumen();
    const { rows } = await db.query(
      `INSERT INTO public.admin_users (username, password_hash, email, role, is_active)
       VALUES ('jlt-admin', 'x', 'jlt-admin@beispiel.de', 'admin', true) RETURNING id`
    );
    benutzer = Number(rows[0].id);
    await db.query(`INSERT INTO public.apps (id, name) VALUES ('jlt-app', 'JLT Probe')`);
  });

  afterAll(async () => {
    if (db) {
      await aufraeumen();
      await db.close?.();
    }
  });

  async function freigabeTitel(runId, titel) {
    const signal = AbortSignal.abort();
    await expect(
      freigabeAnfragen.anfordern(
        { runId, appId: 'jlt-app', stand: 'test', flowName: 'beleg', titel },
        { signal }
      )
    ).rejects.toMatchObject({ laufBeendet: true });
    const { rows } = await db.query(
      `SELECT titel FROM public.approvals WHERE run_id = $1 ORDER BY id DESC LIMIT 1`,
      [runId]
    );
    return rows[0].titel;
  }

  it('was die App beim Start nennt, bleibt, und steht vorn an der Freigabe', async () => {
    const lauf = await runStore.createRun({
      userId: benutzer,
      flowName: 'beleg',
      appId: 'jlt-app',
      stand: 'test',
      titel: 'Beleg 7, Deutsche Post',
    });
    expect(lauf.titel).toBe('Beleg 7, Deutsche Post');
    expect(await runStore.titelSetzen({ runId: lauf.id, titel: '4,95, 01.10.2026' })).toBe(
      'Beleg 7, Deutsche Post'
    );
    expect(await freigabeTitel(lauf.id, 'Erkennung unsicher: Feld konto')).toBe(
      'Beleg 7, Deutsche Post – Erkennung unsicher: Feld konto'
    );
  });

  it('ohne Titel vom Start setzt die Erkennung einen; ohne beides bleibt der Grund allein', async () => {
    const ohne = await runStore.createRun({
      userId: benutzer,
      flowName: 'beleg',
      appId: 'jlt-app',
      stand: 'test',
    });
    expect(ohne.titel).toBeNull();
    expect(await freigabeTitel(ohne.id, 'Ergebnis bestätigen: beleg')).toBe(
      'Ergebnis bestätigen: beleg'
    );

    const erkannt = await runStore.createRun({
      userId: benutzer,
      flowName: 'beleg',
      appId: 'jlt-app',
      stand: 'test',
    });
    expect(await runStore.titelSetzen({ runId: erkannt.id, titel: 'Kern, 23,80' })).toBe(
      'Kern, 23,80'
    );
    expect(await freigabeTitel(erkannt.id, 'Ergebnis bestätigen: beleg')).toBe(
      'Kern, 23,80 – Ergebnis bestätigen: beleg'
    );
  });

  it('mehr als 120 Zeichen weist die Datenbank ab', async () => {
    await expect(
      db.query(
        `INSERT INTO flow_runs (user_id, flow_name, app_id, stand, arguments, titel)
         VALUES ($1, 'beleg', 'jlt-app', 'test', '{}'::jsonb, $2)`,
        [benutzer, 'x'.repeat(121)]
      )
    ).rejects.toThrow(/flow_runs_titel_laenge/);
  });
});
