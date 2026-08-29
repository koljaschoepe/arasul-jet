/**
 * Die Datenbank einer App (Phase H7 des Ueberordner-Plans vom 29.08.2026).
 *
 * WARUM ES SIE GIBT. Bis hierher bekam eine App vom Geraet ein Netz, eine
 * Speichergrenze und zwei Umgebungswerte -- und keinen Ort, an dem etwas
 * liegen bleibt. Kein Bind-Mount, kein Volume, nichts
 * (`services/app/appContainer.js`, `containerBeschreibung`). Wer mehr baute
 * als einen Zaehler, hielt seine Vorgaenge in einer Liste im Arbeitsspeicher,
 * und beim naechsten Neustart war der Zettel weg.
 *
 * Die Werkstatt hat es am 29.08.2026 am Orin gemessen und den Ausweg von Hand
 * genommen: eine Rolle `angebot` und eine Datenbank `angebot` im Postgres der
 * Plattform, angelegt ueber SSH. Der Weg gibt es also, er war nur keiner, den
 * das GERAET anbietet -- ein Partner ohne SSH-Zugang zum Kundengeraet kam
 * nicht daran. Und das Passwort lag danach in der `.env` eines Arbeitsbaums,
 * der mit dem naechsten Merge verschwand.
 *
 * DAS IST DER SPEICHER EINER APP, UND ES IST NUR EINER. Kein zweiter Ordner
 * daneben: zwei Orte hiessen zwei Antworten auf jede Frage des Betriebs --
 * was wird gesichert, was faehrt ein Weg zurueck wieder herein, was faellt
 * beim Entfernen weg. Eine hochgeladene Datei gehoert in eine Spalte; sie
 * wird damit mitgesichert, ohne dass jemand daran denken muss.
 *
 * JE APP UND STAND EINE, und nicht je App: der Teststand ist eine andere
 * Version, die jemand gerade ausprobiert, und ein Probelauf darf die Daten des
 * Livestandes nicht anfassen. Dieselbe Trennung wie beim Schluessel (C4).
 * Der Livestand behaelt seine Daten ueber jeden Versionswechsel hinweg --
 * angelegt wird nur, was noch nicht da ist.
 *
 * DAS PASSWORT WIRD NICHT BEI JEDEM EINSPIELEN NEU GEWUERFELT, anders als der
 * API-Schluessel. Der Grund ist der Unterschied zwischen den beiden: den
 * Schluessel kann das Geraet jederzeit neu vergeben, weil niemand sonst ihn
 * kennt. Ein neues Datenbankpasswort dagegen muesste jeder Container kennen,
 * der noch laeuft -- und ein Neustart durch Docker (`unless-stopped`,
 * Geraeteneustart) behaelt seine alte Umgebung. Es liegt deshalb
 * verschluesselt in `app_datenbanken` (dieselbe Ablage wie der Schluessel
 * eines externen Modells, D4) und kommt beim naechsten Start wieder heraus.
 *
 * GEFUNDEN WIRD UEBER DEN NAMEN, nicht ueber die Tabelle. `entferneAlle` und
 * die Sicherung fragen `pg_database` nach dem Praefix -- derselbe Grund, aus
 * dem `appContainer.entferneImages` die Etiketten der Images fragt: der
 * Werksreset leert `apps`, und eine Aufraeumung, die danach die Tabelle
 * fragte, faende nichts mehr und liesse die Datenbanken stehen.
 */

const crypto = require('crypto');
const db = require('../../database');
const logger = require('../../utils/logger');
const { encryptToken, decryptToken } = require('../../utils/tokenCrypto');

/**
 * Der Praefix, an dem eine App-Datenbank erkennbar ist.
 *
 * Ausgeschrieben und nicht `app_`: auf diesem Geraet legt niemand sonst eine
 * Datenbank an, aber `entferneAlle` loescht nach diesem Muster, und ein Muster,
 * das loescht, soll nicht aus Versehen passen.
 */
const PRAEFIX = 'arasul_app_';

/** Postgres nimmt 63 Byte je Bezeichner, mehr nicht. */
const MAX_BEZEICHNER = 63;

/**
 * Der Name der Datenbank UND der Rolle. Beide heissen gleich: sie gehoeren
 * einander, und zwei Namen fuer eine Sache waeren zwei Namen, die man
 * verwechseln kann.
 *
 * Der Bindestrich der Kennung wird zum Unterstrich -- er ist in einem
 * unquotierten Bezeichner nicht erlaubt. Das ist eindeutig, weil eine
 * App-Kennung selbst keinen Unterstrich tragen darf (`schemas/apps.js`).
 *
 * Wird der Name zu lang, traegt er nur noch den Anfang der Kennung und dahinter
 * acht Zeichen ihres Abdrucks. Eine abgeschnittene Kennung allein waere nicht
 * mehr eindeutig, und zwei Apps mit einer Datenbank waeren genau der Fehler,
 * gegen den diese Datei gebaut ist.
 */
function namenFuer(appId, stand) {
  const kern = String(appId).replace(/-/g, '_');
  const voll = `${PRAEFIX}${kern}_${stand}`;
  if (Buffer.byteLength(voll) <= MAX_BEZEICHNER) {
    return pruefeBezeichner(voll);
  }
  const abdruck = crypto.createHash('sha256').update(appId).digest('hex').slice(0, 8);
  const platz = MAX_BEZEICHNER - PRAEFIX.length - 1 - abdruck.length - 1 - stand.length;
  return pruefeBezeichner(`${PRAEFIX}${kern.slice(0, platz)}_${abdruck}_${stand}`);
}

/**
 * Ein Bezeichner geht in kein `$1`. Postgres nimmt in `CREATE DATABASE` und
 * `CREATE ROLE` keinen Parameter, der Name muss in den Text. Deshalb steht vor
 * jeder solchen Stelle diese Pruefung: was hier durchkommt, ist aus
 * Kleinbuchstaben, Ziffern und Unterstrich gebaut und kann keine zweite
 * Anweisung enthalten.
 */
function pruefeBezeichner(name) {
  if (!/^[a-z][a-z0-9_]*$/.test(name) || Buffer.byteLength(name) > MAX_BEZEICHNER) {
    throw new Error(`Unbrauchbarer Datenbankname: ${name}`);
  }
  return name;
}

/**
 * Ein Passwort aus dem Alphabet von base64url -- Buchstaben, Ziffern, `-` und
 * `_`. Kein Anfuehrungszeichen, kein `@`, kein `:`, kein `/`: es steht gleich
 * zweimal an einer Stelle, an der ein Sonderzeichen etwas anderes bedeutet --
 * im SQL-Literal von `ALTER ROLE` und in der Adresse `postgres://…`.
 */
function wuerfelePasswort() {
  return crypto.randomBytes(33).toString('base64url');
}

/** Wo der Postgres der Plattform aus einem App-Container heraus steht. */
function wirt() {
  return {
    host: process.env.POSTGRES_HOST || 'postgres-db',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  };
}

/** Die Adresse, die eine App bekommt. Eine Zeile, die jeder Treiber versteht. */
function adresse(name, passwort) {
  const { host, port } = wirt();
  return `postgresql://${name}:${passwort}@${host}:${port}/${name}`;
}

/**
 * Die Umgebung, die das Geraet dem Container mitgibt.
 *
 * EIN Wert und nicht sechs: Wirt, Port, Name, Rolle und Passwort einzeln
 * daneben waeren fuenf Zusagen, von denen jede einzeln veralten kann. Wer die
 * Teile braucht, zerlegt die Adresse -- jede Bibliothek, die Postgres spricht,
 * kann das.
 */
function umgebungFuer(zugang) {
  return zugang ? { ARASUL_DB_URL: zugang.url } : {};
}

/** Gibt es diese Rolle schon? */
async function rolleDa(name) {
  const { rows } = await db.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [name]);
  return rows.length > 0;
}

/** Gibt es diese Datenbank schon? */
async function datenbankDa(name) {
  const { rows } = await db.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  return rows.length > 0;
}

/**
 * Dafuer sorgen, dass es die Datenbank dieses Standes gibt, und ihre Adresse
 * zurueckgeben.
 *
 * Idempotent, und das ist der ganze Entwurf: derselbe Aufruf legt beim ersten
 * Einspielen an, findet beim zweiten alles vor und stellt nach einem Weg
 * zurueck die Rolle wieder her, die der Wiederherstellungsweg ohne Passwort
 * angelegt hat.
 *
 * `NOSUPERUSER NOCREATEDB NOCREATEROLE`: die Rolle darf sich anmelden und in
 * ihre eigene Datenbank schreiben, sonst nichts. Und `REVOKE CONNECT … FROM
 * PUBLIC`: ohne das darf JEDE Rolle sich mit JEDER Datenbank verbinden, und
 * zwei Apps auf einem Geraet waeren keine zwei Apps mehr.
 *
 * @param {{appId: string, stand: 'test'|'live'}} was
 * @returns {Promise<{datenbank: string, rolle: string, url: string}>}
 */
async function sorgeFuer({ appId, stand }) {
  const name = namenFuer(appId, stand);

  const vorhanden = await db.query(
    'SELECT passwort FROM public.app_datenbanken WHERE app_id = $1 AND stand = $2',
    [appId, stand]
  );
  let passwort;
  if (vorhanden.rows.length > 0) {
    try {
      passwort = decryptToken(vorhanden.rows[0].passwort);
    } catch (err) {
      // Der Schluessel kommt aus `JWT_SECRET`. Wurde er gewechselt, laesst sich
      // das Passwort nicht mehr lesen -- und ein neues zu wuerfeln waere hier
      // falsch: der laufende Container traegt noch das alte in seiner Umgebung,
      // und wir naehmen ihm den Zugang zu seinen eigenen Daten, ohne dass
      // jemand es merkt. Lieber laut und mit dem Grund.
      throw new Error(
        `Das Passwort der Datenbank von ${appId}/${stand} laesst sich nicht entschluesseln ` +
          `(${err.message}). Wurde JWT_SECRET gewechselt? Dann ist auch der Zugang jeder ` +
          'laufenden App dahin, und beide Staende muessen neu eingespielt werden.'
      );
    }
  } else {
    passwort = wuerfelePasswort();
  }

  if (!(await rolleDa(name))) {
    await db.query(
      `CREATE ROLE "${name}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT ` +
        `PASSWORD '${passwort}'`
    );
    logger.info(`App-Datenbank: Rolle ${name} angelegt`);
  } else {
    // Auch wenn es sie schon gab: das gespeicherte Passwort ist die Wahrheit.
    // Nach einem Weg zurueck steht die Rolle mit einem Zufallswert da, den
    // niemand kennt (`services/backup-service/wiederherstellen.sh`).
    await db.query(`ALTER ROLE "${name}" PASSWORD '${passwort}'`);
  }

  if (!(await datenbankDa(name))) {
    // `CREATE DATABASE` vertraegt keine Transaktion. `db.query` schickt eine
    // einzelne Anweisung, also ist das hier in Ordnung -- in einem `BEGIN`
    // waere es das nicht.
    await db.query(`CREATE DATABASE "${name}" OWNER "${name}"`);
    await db.query(`REVOKE ALL ON DATABASE "${name}" FROM PUBLIC`);
    await db.query(`GRANT CONNECT, TEMPORARY ON DATABASE "${name}" TO "${name}"`);
    logger.info(`App-Datenbank angelegt: ${name}`);
  }

  await db.query(
    `INSERT INTO public.app_datenbanken (app_id, stand, datenbank, rolle, passwort)
     VALUES ($1, $2, $3, $3, $4)
     ON CONFLICT (app_id, stand) DO UPDATE
        SET datenbank = EXCLUDED.datenbank,
            rolle = EXCLUDED.rolle,
            passwort = EXCLUDED.passwort`,
    [appId, stand, name, encryptToken(passwort)]
  );

  return { datenbank: name, rolle: name, url: adresse(name, passwort) };
}

/**
 * Alle Namen, die zu dieser App gehoeren koennen -- aus `pg_database` und
 * nicht aus der Tabelle. Siehe den Kopf dieser Datei.
 */
async function namenVon(appId) {
  const namen = new Set();
  for (const stand of ['test', 'live']) {
    namen.add(namenFuer(appId, stand));
  }
  const { rows } = await db.query(
    'SELECT datenbank FROM public.app_datenbanken WHERE app_id = $1',
    [appId]
  );
  for (const zeile of rows) {
    namen.add(zeile.datenbank);
  }
  return [...namen];
}

/**
 * Eine Datenbank samt Rolle wegwerfen. Idempotent: was es nicht gibt, ist
 * schon weg.
 *
 * `WITH (FORCE)` beendet offene Verbindungen. Ohne das weist Postgres mit
 * „database is being accessed by other users" ab -- und der Container der App
 * ist an dieser Stelle zwar entfernt, aber eine Verbindung kann noch eine
 * Sekunde lang haengen.
 */
async function wirfWeg(name) {
  pruefeBezeichner(name);
  if (await datenbankDa(name)) {
    await db.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    logger.info(`App-Datenbank entfernt: ${name}`);
  }
  if (await rolleDa(name)) {
    await db.query(`DROP ROLE IF EXISTS "${name}"`);
  }
}

/** Die Datenbanken einer App, beide Staende. */
async function entferne(appId) {
  const weg = [];
  for (const name of await namenVon(appId)) {
    await wirfWeg(name);
    weg.push(name);
  }
  await db.query('DELETE FROM public.app_datenbanken WHERE app_id = $1', [appId]);
  return weg;
}

/** Jede Datenbank mit dem Praefix -- der Werksreset kennt keine Kennungen. */
async function entferneAlle() {
  const { rows } = await db.query(
    'SELECT datname FROM pg_database WHERE datname LIKE $1 ORDER BY datname',
    [`${PRAEFIX}%`]
  );
  const weg = [];
  for (const zeile of rows) {
    await wirfWeg(zeile.datname);
    weg.push(zeile.datname);
  }
  // Und Rollen, deren Datenbank schon weg war.
  const rollen = await db.query(
    'SELECT rolname FROM pg_roles WHERE rolname LIKE $1 ORDER BY rolname',
    [`${PRAEFIX}%`]
  );
  for (const zeile of rollen.rows) {
    pruefeBezeichner(zeile.rolname);
    await db.query(`DROP ROLE IF EXISTS "${zeile.rolname}"`);
  }
  if (weg.length > 0) {
    logger.info(`Werksreset: ${weg.length} App-Datenbank(en) entfernt`);
  }
  return weg.length;
}

/**
 * Beim Start dafuer sorgen, dass jede eingetragene App-Datenbank auch wirklich
 * dasteht -- mit dem Passwort, das in der Tabelle liegt.
 *
 * Der Fall dahinter ist der Weg zurueck: `wiederherstellen.sh` legt Rolle und
 * Datenbank mit einem Zufallswert an, weil ein Shell-Skript das
 * verschluesselte Passwort nicht lesen kann. Die App im Container traegt aber
 * noch die Adresse von vorher. Dieser Aufruf setzt sie wieder zusammen.
 *
 * Er WIRFT NICHT: ein Postgres, der gerade keine Rolle anlegen will, darf das
 * Backend nicht am Hochkommen hindern. Er sagt, was war.
 */
async function heileAlle() {
  let geheilt = 0;
  try {
    const { rows } = await db.query(
      'SELECT app_id, stand FROM public.app_datenbanken ORDER BY app_id, stand'
    );
    for (const zeile of rows) {
      try {
        await sorgeFuer({ appId: zeile.app_id, stand: zeile.stand });
        geheilt += 1;
      } catch (err) {
        logger.warn(
          `App-Datenbank ${zeile.app_id}/${zeile.stand} liess sich nicht herstellen: ${err.message}`
        );
      }
    }
  } catch (err) {
    logger.warn(`App-Datenbanken nicht pruefbar: ${err.message}`);
  }
  if (geheilt > 0) {
    logger.info(`App-Datenbanken geprueft: ${geheilt}`);
  }
  return geheilt;
}

module.exports = {
  PRAEFIX,
  namenFuer,
  sorgeFuer,
  umgebungFuer,
  entferne,
  entferneAlle,
  heileAlle,
  adresse,
};
