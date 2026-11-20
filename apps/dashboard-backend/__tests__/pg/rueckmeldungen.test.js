/**
 * Die Rueckmeldung im Rahmen gegen ein ECHTES Postgres (J42, M7, Migration 214).
 *
 * Die Einheitstests (`__tests__/unit/rueckmeldungen.test.js`) belegen Rechte
 * und Ablage gegen eine Attrappe. Hier steht, was nur die Datenbank sagen
 * kann: dass die Spalten heissen, wie der Dienst sie nennt; dass der Zugang
 * zur App wirklich aus `app_members` kommt; dass die Pruefungen der Tabelle
 * greifen; dass eine geloeschte Person ihre Meldung ohne Namen zuruecklaesst;
 * und dass Meldung und Bild zusammen gehen.
 *
 * Aufruf wie die Nachbardateien (`npm run test:pg` mit `ARASUL_PG_TEST_URL`).
 * Diese Datei legt nur eigene Zeilen an (Praefix `jrm-`) und raeumt sie weg.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const URL_TEST = process.env.ARASUL_PG_TEST_URL;
const beschreibe = URL_TEST ? describe : describe.skip;

jest.setTimeout(30000);

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

beschreibe('Rückmeldungen gegen echtes Postgres', () => {
  let db;
  let dienst;
  let ordner;
  let mia;
  let chef;

  async function aufraeumen() {
    await db.query(`DELETE FROM public.rueckmeldungen WHERE app_id LIKE 'jrm-%'`);
    await db.query(`DELETE FROM public.apps WHERE id LIKE 'jrm-%'`);
    await db.query(`DELETE FROM public.admin_users WHERE username LIKE 'jrm-%'`);
  }

  async function person(name, entwickler) {
    const { rows } = await db.query(
      `INSERT INTO public.admin_users (username, password_hash, email, role, is_active, entwickler, vorname, nachname)
       VALUES ($1::text, 'x', $1::text || '@beispiel.de', 'mitarbeiter', true, $2, 'Mia', 'Muster') RETURNING id`,
      [name, entwickler]
    );
    return Number(rows[0].id);
  }

  beforeAll(async () => {
    const ziel = new URL(URL_TEST);
    process.env.POSTGRES_HOST = ziel.hostname;
    process.env.POSTGRES_PORT = ziel.port || '5432';
    process.env.POSTGRES_USER = decodeURIComponent(ziel.username);
    process.env.POSTGRES_PASSWORD = decodeURIComponent(ziel.password);
    process.env.POSTGRES_DB = ziel.pathname.replace(/^\//, '');
    ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'jrm-'));
    process.env.APPS_DIR = ordner;

    db = require('../../src/database');
    dienst = require('../../src/services/rueckmeldung/rueckmeldungen');

    await aufraeumen();
    mia = await person('jrm-mia', false);
    chef = await person('jrm-chef', true);
    await db.query(`INSERT INTO public.apps (id, name) VALUES ('jrm-belege', 'Belege Probe')`);
    await db.query(
      `INSERT INTO public.app_staende (app_id, stand, version, manifest)
       VALUES ('jrm-belege', 'live', '1.0.0', '{}'::jsonb)`
    );
    await db.query(
      `INSERT INTO public.app_members (app_id, user_id, stand) VALUES ('jrm-belege', $1, 'live')`,
      [mia]
    );
  });

  afterAll(async () => {
    if (db) {
      await aufraeumen();
      await db.close?.();
    }
    fs.rmSync(ordner, { recursive: true, force: true });
  });

  const meldung = extra => ({
    personId: mia,
    appId: 'jrm-belege',
    stand: 'live',
    seite: '/apps/jrm-belege/?ansicht=offen',
    text: 'Filter nach Monat fehlt',
    ...extra,
  });

  it('speichert Text, Bild, App, Seite, Person, Zeit und Stand neu', async () => {
    const markierung = { x: 0.1, y: 0.2, breite: 0.3, hoehe: 0.1 };
    const { id } = await dienst.melde(meldung({ bild: PIXEL, markierung }));
    const { rows } = await db.query('SELECT * FROM public.rueckmeldungen WHERE id = $1', [id]);
    expect(rows[0]).toMatchObject({
      app_id: 'jrm-belege',
      stand: 'live',
      seite: '/apps/jrm-belege/?ansicht=offen',
      text: 'Filter nach Monat fehlt',
      markierung,
      stand_meldung: 'neu',
    });
    expect(Number(rows[0].person_id)).toBe(mia);
    expect(rows[0].erstellt_am).toBeInstanceOf(Date);
    expect(fs.existsSync(path.join(ordner, '.rueckmeldungen', rows[0].bild))).toBe(true);

    const liste = await dienst.liste({ appId: 'jrm-belege' });
    expect(liste[0]).toMatchObject({
      id,
      app_name: 'Belege Probe',
      hat_bild: true,
      person: { id: mia, anzeigeName: 'Mia Muster' },
    });
    expect((await dienst.bild(id)).subarray(1, 4).toString()).toBe('PNG');
  });

  it('ohne Freigabe der App wird nichts gespeichert', async () => {
    await expect(dienst.melde(meldung({ personId: chef }))).rejects.toMatchObject({
      statusCode: 403,
    });
    const { rows } = await db.query(
      'SELECT count(*)::int AS n FROM public.rueckmeldungen WHERE person_id = $1',
      [chef]
    );
    expect(rows[0].n).toBe(0);
  });

  it('das Kennzeichen kommt aus der Datenbank', async () => {
    await expect(dienst.pruefeEntwickler(mia)).rejects.toMatchObject({ statusCode: 403 });
    await expect(dienst.pruefeEntwickler(chef)).resolves.toBeUndefined();
  });

  it('die Tabelle weist leeren Text und einen fremden Bildnamen ab', async () => {
    await expect(
      db.query(
        `INSERT INTO public.rueckmeldungen (app_id, stand, seite, text) VALUES ('jrm-belege', 'live', '/apps/jrm-belege/', '')`
      )
    ).rejects.toThrow(/rueckmeldungen_text_laenge/);
    await expect(
      db.query(
        `INSERT INTO public.rueckmeldungen (app_id, stand, seite, text, bild) VALUES ('jrm-belege', 'live', '/apps/jrm-belege/', 'x', '../x.png')`
      )
    ).rejects.toThrow(/rueckmeldungen_bild_name/);
  });

  it('mit der Meldung geht das Bild', async () => {
    const { id } = await dienst.melde(meldung({ bild: PIXEL }));
    const { rows } = await db.query('SELECT bild FROM public.rueckmeldungen WHERE id = $1', [id]);
    const datei = path.join(ordner, '.rueckmeldungen', rows[0].bild);
    expect(fs.existsSync(datei)).toBe(true);
    await dienst.loesche(id);
    expect(fs.existsSync(datei)).toBe(false);
    await expect(dienst.bild(id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('wird die Person gelöscht, bleibt die Meldung ohne Namen', async () => {
    const weg = await person('jrm-weg', false);
    await db.query(
      `INSERT INTO public.app_members (app_id, user_id, stand) VALUES ('jrm-belege', $1, 'live')`,
      [weg]
    );
    const { id } = await dienst.melde(meldung({ personId: weg, text: 'von jemandem, der geht' }));
    await db.query('DELETE FROM public.admin_users WHERE id = $1', [weg]);
    const eintrag = (await dienst.liste({ appId: 'jrm-belege' })).find(m => m.id === id);
    expect(eintrag).toMatchObject({ text: 'von jemandem, der geht', person: null });
  });
});
