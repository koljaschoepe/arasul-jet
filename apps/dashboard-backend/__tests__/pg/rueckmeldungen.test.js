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
    expect(await dienst.hatWerkstattRecht(mia)).toBe(false);
    expect(await dienst.hatWerkstattRecht(chef)).toBe(true);
  });

  it('die eigene Sicht (J52): nur die Meldungen dieser Person, fremde Bilder nie', async () => {
    // Eine fremde Meldung mit Bild, direkt in die Tabelle (chef hat die App nicht).
    const { id: eigene } = await dienst.melde(meldung({ bild: PIXEL, text: 'Meine Meldung' }));
    const name = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.png';
    fs.mkdirSync(path.join(ordner, '.rueckmeldungen'), { recursive: true });
    fs.writeFileSync(path.join(ordner, '.rueckmeldungen', name), Buffer.from('x'));
    const { rows } = await db.query(
      `INSERT INTO public.rueckmeldungen (app_id, stand, seite, text, bild, person_id)
       VALUES ('jrm-belege', 'live', '/apps/jrm-belege/', 'Fremde Meldung', $1, $2) RETURNING id`,
      [name, chef]
    );
    const fremde = Number(rows[0].id);

    const meine = await dienst.liste({ personId: mia });
    expect(meine.length).toBeGreaterThan(0);
    expect(meine.every(m => m.person?.id === mia)).toBe(true);
    expect(meine.map(m => m.id)).toContain(eigene);
    expect(meine.map(m => m.id)).not.toContain(fremde);

    const alle = await dienst.liste({ appId: 'jrm-belege' });
    expect(alle.map(m => m.id)).toEqual(expect.arrayContaining([eigene, fremde]));

    expect((await dienst.bild(eigene, { personId: mia })).subarray(1, 4).toString()).toBe('PNG');
    await expect(dienst.bild(fremde, { personId: mia })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect((await dienst.bild(fremde)).toString()).toBe('x');
  });

  it('Migration 218: die alte Kennung zieht auf werkstatt um, die Seite mit', async () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../../../services/postgres/init/218_werkstatt_m7.sql'),
      'utf8'
    );
    const { rows } = await db.query(
      `INSERT INTO public.rueckmeldungen (app_id, stand, seite, text)
       VALUES ('entwickler-cockpit', 'live', '/apps/entwickler-cockpit/#apps', 'jrm-alt') RETURNING id`
    );
    try {
      await db.query(sql);
      await db.query(sql); // ein zweiter Lauf aendert nichts und scheitert nicht
      const { rows: nach } = await db.query(
        'SELECT app_id, seite FROM public.rueckmeldungen WHERE id = $1',
        [rows[0].id]
      );
      expect(nach[0]).toEqual({ app_id: 'werkstatt', seite: '/apps/werkstatt/#apps' });
    } finally {
      await db.query('DELETE FROM public.rueckmeldungen WHERE id = $1', [rows[0].id]);
    }
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

  it('die DSGVO-Auskunft liest die eigenen Meldungen samt Bild (21.11.2026)', async () => {
    const { id } = await dienst.melde(meldung({ bild: PIXEL, text: 'für die Auskunft' }));
    const { rows } = await db.query(dienst.AUSKUNFT_SQL, [mia]);
    expect(rows.some(z => Number(z.id) === id)).toBe(true);
    const { rows: aus, nichtLesbar } = await dienst.fuerAuskunft(rows);
    const eintrag = aus.find(m => m.id === id);
    expect(nichtLesbar).toBe(0);
    expect(eintrag).toMatchObject({ app_id: 'jrm-belege', text: 'für die Auskunft' });
    expect(eintrag.bild.daten).toBe(PIXEL);
    // Die Meldungen anderer stehen nicht in Mias Auskunft.
    const { rows: chefs } = await db.query(dienst.AUSKUNFT_SQL, [chef]);
    expect(chefs.some(z => Number(z.id) === id)).toBe(false);
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
  /*
   * Die Seite fuer das Kit (J43, Migration 215): Schalter je App, Stand mit
   * Grund. Gegen echtes Postgres, weil die Abfragen hier Spaltennamen,
   * `ANY($2::text[])` und eine Pruefung der Tabelle tragen.
   */
  describe('für den Agenten (J43)', () => {
    it('der Schalter steht nach Migration 215 auf aus', async () => {
      const { rows } = await db.query(
        `SELECT bilder_an_agenten FROM public.apps WHERE id = 'jrm-belege'`
      );
      expect(rows[0].bilder_an_agenten).toBe(false);
    });

    it('aus: kein Feld bild; an: Weg und Markierung', async () => {
      const markierung = { x: 0.5, y: 0.5, breite: 0.1, hoehe: 0.1 };
      const { id } = await dienst.melde(meldung({ bild: PIXEL, markierung, text: 'mit Bild' }));

      const aus = await dienst.fuerAgenten({ appId: 'jrm-belege' });
      expect(aus.bilder_an_agenten).toBe(false);
      const ohne = aus.meldungen.find(m => m.id === id);
      expect(ohne).not.toHaveProperty('bild');
      expect(JSON.stringify(aus)).not.toMatch(/\.png|markierung/);
      await expect(dienst.bildFuerAgenten('jrm-belege', id)).rejects.toMatchObject({
        statusCode: 403,
      });

      expect(await dienst.setzeBilderAnAgenten('jrm-belege', true)).toMatchObject({
        bilder_an_agenten: true,
        vorher: false,
      });
      const an = await dienst.fuerAgenten({ appId: 'jrm-belege' });
      expect(an.meldungen.find(m => m.id === id).bild).toEqual({
        weg: `/api/v1/external/apps/jrm-belege/rueckmeldungen/${id}/bild`,
        format: 'png',
        markierung,
      });
      expect((await dienst.bildFuerAgenten('jrm-belege', id)).subarray(1, 4).toString()).toBe(
        'PNG'
      );
      await dienst.setzeBilderAnAgenten('jrm-belege', false);
    });

    it('Stand setzen, filtern, und abgelehnt nur mit Grund', async () => {
      const { id } = await dienst.melde(meldung({ text: 'bitte ablehnen' }));
      const gesetzt = await dienst.setzeStand({
        appId: 'jrm-belege',
        nr: id,
        standMeldung: 'abgelehnt',
        grund: 'Gibt es schon',
        durch: 'schluessel:aras_probe1',
      });
      expect(gesetzt).toMatchObject({
        id,
        stand_meldung: 'abgelehnt',
        grund: 'Gibt es schon',
        vorher: 'neu',
        person: { id: mia, anzeigeName: 'Mia Muster' },
      });
      expect(gesetzt.stand_geaendert_am).toBeInstanceOf(Date);

      const abgelehnt = await dienst.fuerAgenten({
        appId: 'jrm-belege',
        standMeldung: ['abgelehnt'],
      });
      expect(abgelehnt.meldungen.map(m => m.id)).toEqual([id]);
      const offen = await dienst.fuerAgenten({ appId: 'jrm-belege', standMeldung: ['neu'] });
      expect(offen.meldungen.map(m => m.id)).not.toContain(id);

      // Ein neuer Stand ohne Grund nimmt den alten Grund mit.
      const wieder = await dienst.setzeStand({
        appId: 'jrm-belege',
        nr: id,
        standMeldung: 'angenommen',
        durch: 'schluessel:aras_probe1',
      });
      expect(wieder.grund).toBeNull();

      await expect(
        db.query(
          `UPDATE public.rueckmeldungen SET stand_meldung = 'abgelehnt', grund = NULL WHERE id = $1`,
          [id]
        )
      ).rejects.toThrow(/rueckmeldungen_grund_bei_ablehnung/);
      await expect(
        dienst.setzeStand({ appId: 'andere-app', nr: id, standMeldung: 'neu', durch: 'x' })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('Entwickler-Cockpit (J44)', () => {
    test('Stand am Gerät setzen: Person in stand_geaendert_durch, Grund geprüft', async () => {
      const { id } = await dienst.melde({
        personId: mia,
        appId: 'jrm-belege',
        stand: 'live',
        seite: '/apps/jrm-belege/',
        text: 'Cockpit-Probe',
      });
      const gesetzt = await dienst.setzeStandAmGeraet({
        id,
        standMeldung: 'abgelehnt',
        grund: 'Gibt es schon.',
        durch: `person:${chef}`,
      });
      expect(gesetzt).toMatchObject({
        id,
        app_name: 'Belege Probe',
        stand_meldung: 'abgelehnt',
        grund: 'Gibt es schon.',
        vorher: 'neu',
      });
      expect(gesetzt.stand_geaendert_am).toBeTruthy();
      const { rows } = await db.query(
        'SELECT stand_geaendert_durch FROM public.rueckmeldungen WHERE id = $1',
        [id]
      );
      expect(rows[0].stand_geaendert_durch).toBe(`person:${chef}`);
      const liste = await dienst.liste({ appId: 'jrm-belege' });
      expect(liste.find(m => m.id === id)).toMatchObject({ grund: 'Gibt es schon.' });
      await expect(
        dienst.setzeStandAmGeraet({ id: 999999999, standMeldung: 'neu', durch: 'x' })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    test('die Übersicht der Apps rechnet Test, Live und offene Meldungen', async () => {
      await db.query(
        `INSERT INTO public.app_staende (app_id, stand, version, manifest, aenderungstext)
         VALUES ('jrm-belege', 'test', '1.1.0', '{"symbol":"receipt"}'::jsonb, 'Filter nach Monat.')
         ON CONFLICT (app_id, stand) DO UPDATE SET version = EXCLUDED.version`
      );
      const werkstatt = require('../../src/services/app/werkstatt');
      const apps = await werkstatt.apps();
      const belege = apps.find(a => a.id === 'jrm-belege');
      expect(belege).toMatchObject({
        live: { version: '1.0.0' },
        test: { version: '1.1.0', aenderungstext: 'Filter nach Monat.' },
        test_neuer: true,
        symbol: 'receipt',
      });
      const { rows } = await db.query(
        `SELECT COUNT(*)::int AS n FROM public.rueckmeldungen
          WHERE app_id = 'jrm-belege' AND stand_meldung IN ('neu', 'angenommen')`
      );
      expect(belege.meldungen.offen).toBe(rows[0].n);
      expect(apps.at(-1)).toMatchObject({ id: 'werkstatt', mitgeliefert: true });
    });
  });
});
