/**
 * Anmeldung, Profil und Personen gegen ein ECHTES Postgres (M5, 05.10.2026).
 *
 * WARUM ES DIESE REIHE GIBT
 *
 * Am 04.10.2026 antwortete die Anmeldung zehn Minuten lang mit 500: eine
 * SQL-Abfrage nannte eine Spalte, die es nicht gab. Die Jest-Reihe war gruen,
 * und sie konnte nicht anders -- jede Datei dort mockt `database.js`, also
 * sieht keine einzige Abfrage je eine Datenbank. Eine Attrappe antwortet auf
 * `SELECT gibt_es_nicht FROM admin_users` genauso freundlich wie auf die
 * richtige Abfrage.
 *
 * Diese Reihe faehrt deshalb die ECHTE App (`src/server.js`) mit dem ECHTEN
 * Pool aus `database.js` ueber supertest gegen eine Datenbank, deren Schema
 * die volle Migrationskette aus `services/postgres/init` ist. Nichts an der
 * Datenbank ist gemockt. Gefahren werden die Wege, die ein Mensch an jedem Tag
 * nimmt: Anmeldung samt Fehlversuchen und Sperre, Sitzungsprobe, `/auth/me`,
 * Abmelden; das eigene Profil, Bild, Darstellung, Passwortwechsel; und die
 * Verwaltung der Personen durch den Administrator (anlegen, auflisten,
 * Passwort setzen, Verwaltung schalten, stilllegen, loeschen).
 *
 * DAS NETZ UNTER DEN ANTWORTEN. Nicht jede Abfrage schlaegt bis zur Antwort
 * durch: `logSecurityEvent` faengt seinen Fehler und schreibt eine Warnung,
 * `update_session_activity` laeuft mit `.catch(() => {})` im Hintergrund, und
 * eine kaputte Abfrage in `verifyToken` wird zu einem 401 statt zu einem 500.
 * Ein falscher Spaltenname dort liesse jeden Status gruen. Deshalb sitzt eine
 * duenne Huelle um `pg.Client.prototype.query` -- sie ruft das Original und
 * merkt sich jeden Fehler der SQLSTATE-Klasse 42 (undefinierte Spalte,
 * Tabelle, Funktion, Syntax). Nach jedem Test muss die Liste leer sein. Die
 * Huelle ersetzt nichts: jede Abfrage geht unveraendert an Postgres.
 *
 * AUFRUF
 *
 *   ARASUL_PG_TEST_URL=postgres://arasul:pw@127.0.0.1:55432/arasul_db \
 *     npm run test:pg --workspace=arasul-dashboard-backend
 *
 * oder alles in einem (Behaelter, Kette, diese Reihe, Behaelter weg):
 *
 *   bash scripts/test/migrationskette.sh --reihe
 *
 * Ohne `ARASUL_PG_TEST_URL` ueberspringt sich die Reihe; im normalen
 * `npx jest` laeuft sie ohnehin nicht (`testPathIgnorePatterns`).
 *
 * ACHTUNG: die Reihe LEERT `admin_users` (TRUNCATE ... CASCADE), denn die
 * Einrichtung des ersten Administrators geht nur auf einem Geraet ohne Konto.
 * Nur gegen eine Wegwerf-Datenbank richten, nie gegen ein Geraet.
 */

const URL_TEST = process.env.ARASUL_PG_TEST_URL;
const beschreibe = URL_TEST ? describe : describe.skip;

// Echte Abfragen statt Attrappen: grosszuegiger als die 10 s aus jest.setup.js.
jest.setTimeout(30000);

// SQLSTATE-Klasse 42: syntax_error_or_access_rule_violation. Darin 42703
// (undefined_column), 42P01 (undefined_table), 42883 (undefined_function),
// 42601 (syntax_error). Genau die Fehler, die eine Attrappe nie zeigt.
const SCHEMA_FEHLER = /^42/;

const PASSWORT_ADMIN = 'Start-Passwort-2026!';
const PASSWORT_ADMIN_NEU = 'Zweites-Passwort-2026!';
const PASSWORT_PERSON = 'Eigenes-Passwort-2026!';
// Ein Bild aus einem einzigen Bildpunkt, als Data-URL (PNG).
const BILD =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

beschreibe('Anmeldung, Profil und Personen gegen echtes Postgres', () => {
  let request;
  let app;
  let db;
  let pgClient;
  let originalQuery;
  const schemaFehler = [];

  let adminToken;
  let adminId;
  // Leer und nicht `undefined`: scheitert das Anlegen, sollen die Tests danach
  // rot werden und nicht mit einem TypeError mitten im Aufbau einer Anfrage
  // abbrechen -- supertest liesse dann seinen Lauscher offen.
  let person = {}; // { id, email, startpasswort, token }

  const mitToken = (anfrage, token) => anfrage.set('Authorization', `Bearer ${token}`);

  // Hintergrund-Abfragen (Protokoll, Sitzungsaktivitaet) laufen nach der
  // Antwort. Vor jeder Pruefung des Netzes kurz warten, damit sie durch sind.
  const nachlaufen = () => new Promise(r => setTimeout(r, 150));

  beforeAll(async () => {
    // Die Verbindung kommt aus ARASUL_PG_TEST_URL und ueberschreibt, was
    // `jest.setup.js` fuer die gemockte Welt gesetzt hat. Das muss VOR dem
    // ersten `require` von `database.js` geschehen: der Pool liest die
    // Umgebung beim Laden.
    const ziel = new URL(URL_TEST);
    process.env.POSTGRES_HOST = ziel.hostname;
    process.env.POSTGRES_PORT = ziel.port || '5432';
    process.env.POSTGRES_USER = decodeURIComponent(ziel.username);
    process.env.POSTGRES_PASSWORD = decodeURIComponent(ziel.password);
    process.env.POSTGRES_DB = ziel.pathname.replace(/^\//, '');
    // Ohne Firmenordner: der Dateidienst ist ein eigener Behaelter, und ohne
    // ihn fragt `ordnerVerwaltung` nicht einmal die Datenbank (`istAn`).
    delete process.env.COMPOSE_PROFILES;

    // Die Huelle um den Treiber, siehe Kopf. Drei Aufrufformen hat
    // `Client#query`: mit Rueckruf als zweitem oder drittem Argument (so ruft
    // `pg-pool` es) und als Promise (so ruft `db.transaction` es).
    pgClient = require('pg').Client;
    originalQuery = pgClient.prototype.query;
    const merke = (fehler, config) => {
      if (fehler && SCHEMA_FEHLER.test(String(fehler.code || ''))) {
        const sql = typeof config === 'string' ? config : config && config.text;
        schemaFehler.push(`${fehler.code} ${fehler.message} -- ${String(sql).slice(0, 200)}`);
      }
    };
    pgClient.prototype.query = function (config, values, callback) {
      if (typeof values === 'function') {
        return originalQuery.call(this, config, (f, e) => {
          merke(f, config);
          values(f, e);
        });
      }
      if (typeof callback === 'function') {
        return originalQuery.call(this, config, values, (f, e) => {
          merke(f, config);
          callback(f, e);
        });
      }
      const ergebnis = originalQuery.call(this, config, values);
      if (ergebnis && typeof ergebnis.then === 'function') {
        ergebnis.then(null, f => merke(f, config));
      }
      return ergebnis;
    };

    request = require('supertest');
    db = require('../../src/database');
    ({ app } = require('../../src/server'));

    // Ein Geraet ohne Konto, wie nach der Auslieferung.
    await db.query(
      `TRUNCATE admin_users, login_attempts, token_blacklist, active_sessions
         RESTART IDENTITY CASCADE`
    );
  });

  afterEach(async () => {
    await nachlaufen();
    // Eine Zeile je Fehler, damit der rote Lauf die Abfrage gleich nennt.
    const gefunden = schemaFehler.splice(0);
    expect(gefunden).toEqual([]);
  });

  afterAll(async () => {
    if (pgClient && originalQuery) {
      pgClient.prototype.query = originalQuery;
    }
    if (db) {
      await db.close();
    }
  });

  // --- Einrichtung und Anmeldung ---------------------------------------------

  test('ein Geraet ohne Konto will eingerichtet werden', async () => {
    const res = await request(app).get('/api/auth/needs-setup');
    expect(res.status).toBe(200);
    expect(res.body.needsSetup).toBe(true);
  });

  test('der erste Administrator entsteht ueber /api/auth/setup', async () => {
    const res = await request(app)
      .post('/api/auth/setup')
      .send({ username: 'admin', password: PASSWORT_ADMIN, email: 'admin@firma.test' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('admin');
    adminId = String(res.body.user.id);

    const danach = await request(app).get('/api/auth/needs-setup');
    expect(danach.body.needsSetup).toBe(false);
  });

  test('ein unbekannter Name wird abgewiesen und als Fehlversuch gezaehlt', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'niemand', password: 'egal-was' });
    expect(res.status).toBe(401);

    const { rows } = await db.query(
      "SELECT success FROM login_attempts WHERE username = 'niemand'"
    );
    expect(rows).toEqual([{ success: false }]);
  });

  test('ein falsches Passwort wird abgewiesen und am Konto gezaehlt', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'falsch-falsch' });
    expect(res.status).toBe(401);

    const { rows } = await db.query(
      "SELECT login_attempts FROM admin_users WHERE username = 'admin'"
    );
    expect(rows[0].login_attempts).toBe(1);
  });

  test('die Anmeldung mit Benutzername traegt Token, Sitzung und Profil', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: PASSWORT_ADMIN });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({
      username: 'admin',
      role: 'admin',
      passwortWechselNoetig: false,
      theme: 'system',
      hatBild: false,
      anzeigeName: 'admin',
    });
    adminToken = res.body.token;

    // Die Nebenwirkungen, die das Geraet danach braucht: eine Sitzung (die
    // zweite -- die Einrichtung meldet den Administrator schon einmal an), der
    // Zaehler zurueck auf null, ein Eintrag im Protokoll.
    const sitzungen = await db.query('SELECT user_id FROM active_sessions WHERE user_id = $1', [
      adminId,
    ]);
    expect(sitzungen.rows).toHaveLength(2);
    const konto = await db.query(
      'SELECT login_attempts, last_login FROM admin_users WHERE id = $1',
      [adminId]
    );
    expect(konto.rows[0].login_attempts).toBe(0);
    expect(konto.rows[0].last_login).not.toBeNull();
    await nachlaufen();
    const protokoll = await db.query(
      "SELECT action FROM audit_logs WHERE user_id = $1 AND action = 'login'",
      [adminId]
    );
    expect(protokoll.rows.length).toBeGreaterThanOrEqual(1);
  });

  test('die Anmeldung geht auch mit der E-Mail-Adresse', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin@firma.test', password: PASSWORT_ADMIN });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('admin');
  });

  test('/api/auth/session erkennt die Sitzung und ohne Token niemanden', async () => {
    const mit = await mitToken(request(app).get('/api/auth/session'), adminToken);
    expect(mit.status).toBe(200);
    expect(mit.body.authenticated).toBe(true);
    expect(mit.body.user).toMatchObject({ username: 'admin', role: 'admin' });

    const ohne = await request(app).get('/api/auth/session');
    expect(ohne.status).toBe(200);
    expect(ohne.body.authenticated).toBe(false);
  });

  test('/api/auth/me und /api/auth/verify', async () => {
    const me = await mitToken(request(app).get('/api/auth/me'), adminToken);
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ username: 'admin', email: 'admin@firma.test' });

    // `/api/auth/sessions` ist am 06.10.2026 gefallen (kein Aufrufer).
    const sitzungen = await mitToken(request(app).get('/api/auth/sessions'), adminToken);
    expect(sitzungen.status).toBe(404);

    const verify = await mitToken(request(app).get('/api/auth/verify'), adminToken);
    expect(verify.status).toBe(200);
    expect(verify.headers['x-user-name']).toBe('admin');
  });

  // --- Das eigene Profil ------------------------------------------------------

  test('PUT /api/profil setzt Name, Funktion und Kuerzel', async () => {
    const res = await mitToken(request(app).put('/api/profil'), adminToken).send({
      vorname: 'Ada',
      nachname: 'Admin',
      funktion: 'Leitung',
      kuerzel: 'AA',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ anzeigeName: 'Ada Admin', kuerzel: 'AA' });

    const me = await mitToken(request(app).get('/api/auth/me'), adminToken);
    expect(me.body.user).toMatchObject({ vorname: 'Ada', funktion: 'Leitung' });
  });

  test('das eigene Bild: setzen, lesen, entfernen', async () => {
    const gesetzt = await mitToken(request(app).put('/api/profil/bild'), adminToken).send({
      bild: BILD,
    });
    expect(gesetzt.status).toBe(200);
    expect(gesetzt.body.data.hatBild).toBe(true);

    const gelesen = await mitToken(request(app).get('/api/profil/bild'), adminToken);
    expect(gelesen.status).toBe(200);
    expect(gelesen.headers['content-type']).toMatch(/^image\/png/);

    const entfernt = await mitToken(request(app).delete('/api/profil/bild'), adminToken);
    expect(entfernt.status).toBe(200);
    expect(entfernt.body.data.hatBild).toBe(false);

    const weg = await mitToken(request(app).get('/api/profil/bild'), adminToken);
    expect(weg.status).toBe(404);
  });

  test('PUT /api/darstellung setzt das Theme, die Sitzungsprobe traegt es', async () => {
    const res = await mitToken(request(app).put('/api/darstellung'), adminToken).send({
      theme: 'dark',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ theme: 'dark' });

    const sitzung = await mitToken(request(app).get('/api/auth/session'), adminToken);
    expect(sitzung.body.user.theme).toBe('dark');
  });

  // --- Personen in der Verwaltung --------------------------------------------

  test('POST /api/benutzer legt eine Person an und nennt das Startpasswort', async () => {
    const res = await mitToken(request(app).post('/api/benutzer'), adminToken).send({
      vorname: 'Bea',
      nachname: 'Beispiel',
      email: 'Bea.Beispiel@firma.test',
    });
    expect(res.status).toBe(201);
    expect(res.body.startpasswort).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(res.body.data).toMatchObject({
      username: 'bea.beispiel@firma.test',
      role: 'mitarbeiter',
      is_active: true,
      passwort_vom_admin: true,
      vorname: 'Bea',
    });
    person = {
      id: String(res.body.data.id),
      email: res.body.data.email,
      startpasswort: res.body.startpasswort,
    };

    // Dieselbe E-Mail ein zweites Mal: der eindeutige Index antwortet (409).
    const doppelt = await mitToken(request(app).post('/api/benutzer'), adminToken).send({
      vorname: 'Bea',
      nachname: 'Beispiel',
      email: 'bea.beispiel@firma.test',
    });
    expect(doppelt.status).toBe(409);
  });

  test('GET /api/benutzer listet beide Konten', async () => {
    const res = await mitToken(request(app).get('/api/benutzer'), adminToken);
    expect(res.status).toBe(200);
    expect(res.body.data.map(b => b.username)).toEqual(['admin', 'bea.beispiel@firma.test']);
  });

  test('die Person meldet sich mit dem Startpasswort an und muss wechseln', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: person.email, password: person.startpasswort });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: 'mitarbeiter', passwortWechselNoetig: true });
    person.token = res.body.token;

    const verboten = await mitToken(request(app).get('/api/benutzer'), person.token);
    expect(verboten.status).toBe(403);
  });

  test('POST /api/auth/change-password: eigenes Passwort, alle Sitzungen enden', async () => {
    const res = await mitToken(request(app).post('/api/auth/change-password'), person.token).send({
      currentPassword: person.startpasswort,
      newPassword: PASSWORT_PERSON,
    });
    expect(res.status).toBe(200);

    const historie = await db.query('SELECT changed_by FROM password_history WHERE user_id = $1', [
      person.id,
    ]);
    expect(historie.rows).toHaveLength(1);

    // Der alte Token ist gesperrt (token_blacklist), die Probe sieht niemanden.
    const alt = await mitToken(request(app).get('/api/auth/session'), person.token);
    expect(alt.body.authenticated).toBe(false);

    const neu = await request(app)
      .post('/api/auth/login')
      .send({ username: person.email, password: PASSWORT_PERSON });
    expect(neu.status).toBe(200);
    expect(neu.body.user.passwortWechselNoetig).toBe(false);
    person.token = neu.body.token;
  });

  test('PUT /api/benutzer/:id/passwort setzt ein neues Startpasswort', async () => {
    const res = await mitToken(
      request(app).put(`/api/benutzer/${person.id}/passwort`),
      adminToken
    ).send({});
    expect(res.status).toBe(200);
    expect(res.body.startpasswort).toEqual(expect.any(String));
    person.startpasswort = res.body.startpasswort;

    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: person.email, password: person.startpasswort });
    expect(login.status).toBe(200);
    expect(login.body.user.passwortWechselNoetig).toBe(true);
    person.token = login.body.token;
  });

  test('PUT /api/benutzer/:id/verwaltung schaltet die Rolle hin und zurueck', async () => {
    const an = await mitToken(
      request(app).put(`/api/benutzer/${person.id}/verwaltung`),
      adminToken
    ).send({ verwaltung: true });
    expect(an.status).toBe(200);
    expect(an.body.data.role).toBe('admin');

    const aus = await mitToken(
      request(app).put(`/api/benutzer/${person.id}/verwaltung`),
      adminToken
    ).send({ verwaltung: false });
    expect(aus.status).toBe(200);
    expect(aus.body.data.role).toBe('mitarbeiter');

    // Der letzte Administrator behaelt das Recht.
    const letzter = await mitToken(
      request(app).put(`/api/benutzer/${adminId}/verwaltung`),
      adminToken
    ).send({ verwaltung: false });
    expect(letzter.status).toBe(400);
  });

  test('PUT /api/benutzer/:id/aktiv legt still, die Anmeldung endet mit 403', async () => {
    const still = await mitToken(
      request(app).put(`/api/benutzer/${person.id}/aktiv`),
      adminToken
    ).send({ aktiv: false });
    expect(still.status).toBe(200);
    expect(still.body.data.is_active).toBe(false);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: person.email, password: person.startpasswort });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('ACCOUNT_DISABLED');

    const zurueck = await mitToken(
      request(app).put(`/api/benutzer/${person.id}/aktiv`),
      adminToken
    ).send({ aktiv: true });
    expect(zurueck.status).toBe(200);
    expect(zurueck.body.data.is_active).toBe(true);
  });

  test('nach fuenf Fehlversuchen ist das Konto gesperrt (ACCOUNT_LOCKED)', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: person.email, password: 'daneben-daneben' });
      expect(res.status).toBe(401);
    }
    const gesperrt = await request(app)
      .post('/api/auth/login')
      .send({ username: person.email, password: person.startpasswort });
    expect(gesperrt.status).toBe(403);
    expect(gesperrt.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  test('GET /api/benutzer/:id/bild ohne Bild ist 404', async () => {
    const res = await mitToken(request(app).get(`/api/benutzer/${person.id}/bild`), adminToken);
    expect(res.status).toBe(404);
  });

  test('DELETE /api/benutzer/:id loescht die Person samt Sitzungen', async () => {
    const res = await mitToken(request(app).delete(`/api/benutzer/${person.id}`), adminToken);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(res.body.summary.admin_users).toBe(1);

    const rest = await db.query('SELECT id FROM admin_users WHERE id = $1', [person.id]);
    expect(rest.rows).toHaveLength(0);
    const versuche = await db.query(
      'SELECT count(*)::int AS n FROM login_attempts WHERE username = $1',
      [person.email]
    );
    expect(versuche.rows[0].n).toBe(0);
  });

  // --- Der eigene Passwortwechsel und das Abmelden ---------------------------

  test('der Administrator wechselt sein Passwort und meldet sich neu an', async () => {
    const res = await mitToken(request(app).post('/api/auth/change-password'), adminToken).send({
      currentPassword: PASSWORT_ADMIN,
      newPassword: PASSWORT_ADMIN_NEU,
    });
    expect(res.status).toBe(200);

    const alt = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: PASSWORT_ADMIN });
    expect(alt.status).toBe(401);

    const neu = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: PASSWORT_ADMIN_NEU });
    expect(neu.status).toBe(200);
    adminToken = neu.body.token;
  });

  test('POST /api/auth/logout sperrt den Token', async () => {
    const res = await mitToken(request(app).post('/api/auth/logout'), adminToken);
    expect(res.status).toBe(200);

    const danach = await mitToken(request(app).get('/api/auth/session'), adminToken);
    expect(danach.body.authenticated).toBe(false);
    const me = await mitToken(request(app).get('/api/auth/me'), adminToken);
    expect(me.status).toBe(401);
  });

  test('POST /api/auth/logout-all beendet jede Sitzung', async () => {
    const eins = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: PASSWORT_ADMIN_NEU });
    const zwei = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: PASSWORT_ADMIN_NEU });
    expect(eins.status).toBe(200);
    expect(zwei.status).toBe(200);

    const res = await mitToken(request(app).post('/api/auth/logout-all'), eins.body.token);
    expect(res.status).toBe(200);

    const { rows } = await db.query(
      'SELECT count(*)::int AS n FROM active_sessions WHERE user_id = $1',
      [adminId]
    );
    expect(rows[0].n).toBe(0);
    const probe = await mitToken(request(app).get('/api/auth/session'), zwei.body.token);
    expect(probe.body.authenticated).toBe(false);
  });
});
