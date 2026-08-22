/**
 * Eigene Tabellen je Erweiterung (Plan 023 H1).
 *
 * Eine Erweiterung darf Zustand ablegen, aber nicht neben den Kundendaten.
 * Deshalb bekommt jede ein eigenes Postgres-Schema `ext_<slug>`, und darin darf
 * sie tun, was sie will.
 *
 * DIE WICHTIGSTE ENTSCHEIDUNG: die Erweiterung schickt niemals SQL. Sie sagt
 * „lege eine Tabelle belege mit den Spalten nummer (text) und betrag (zahl) an"
 * und „schreibe diese Werte hinein". Das SQL entsteht hier, aus geprüften
 * Bezeichnern und gebundenen Werten. Eine Brücke, die SQL durchreicht, ist
 * keine Brücke, sondern ein Datenbankzugang mit Extraschritten: die erste
 * Erweiterung mit einem Tippfehler im Escaping läse dann `admin_users`.
 *
 * Bezeichner (Schema-, Tabellen-, Spaltennamen) lassen sich nicht binden, sie
 * müssen in den Text. Deshalb kommen sie ausschließlich aus `sauber()` und aus
 * dem eigenen Register, nie ungeprüft aus der Anfrage.
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const { ValidationError, NotFoundError, ForbiddenError } = require('../../utils/errors');

/** Bezeichner: Kleinbuchstaben, Ziffern, Unterstrich, muss mit Buchstabe beginnen. */
const NAME_RE = /^[a-z][a-z0-9_]{0,48}$/;

/**
 * Erlaubte Spaltentypen, und was daraus in Postgres wird.
 *
 * Bewusst kurz. Jeder weitere Typ ist eine weitere Zeile, die jemand später
 * verstehen muss; und was hier fehlt, lässt sich als `text` ablegen.
 */
const TYPEN = Object.freeze({
  text: 'TEXT',
  zahl: 'DOUBLE PRECISION',
  ganzzahl: 'BIGINT',
  wahrheit: 'BOOLEAN',
  zeitpunkt: 'TIMESTAMPTZ',
  json: 'JSONB',
});

/** Höchstzahl Tabellen und Spalten je Erweiterung. */
const MAX_TABELLEN = 25;
const MAX_SPALTEN = 60;
/** Höchstzahl Zeilen, die ein Lesen zurückgibt. */
const MAX_ZEILEN = 500;

/**
 * Einen Bezeichner prüfen. Wirft, statt zu bereinigen.
 *
 * Stillschweigend zu bereinigen wäre schlimmer: die Erweiterung legte dann eine
 * Tabelle unter einem anderen Namen an, als sie glaubt, und fände sie nie
 * wieder.
 */
function sauber(name, was) {
  const roh = String(name || '').trim();
  if (!NAME_RE.test(roh)) {
    throw new ValidationError(
      `Ungültiger ${was}: "${roh}". Erlaubt sind Kleinbuchstaben, Ziffern und ` +
        'Unterstriche, beginnend mit einem Buchstaben, höchstens 49 Zeichen.'
    );
  }
  return roh;
}

/**
 * Das Schema einer Erweiterung.
 *
 * Der Präfix `ext_` steht davor, damit ein Erweiterungs-Schema nie zufällig
 * `public` oder `arasul` heißen kann, egal wie die Erweiterung heißt.
 */
function schemaName(extensionId) {
  const slug = String(extensionId || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  if (!slug) {
    throw new ValidationError(`Aus "${extensionId}" lässt sich kein Schemaname bilden`);
  }
  return `ext_${slug}`;
}

/** Das Schema anlegen, falls es noch nicht da ist. */
async function schemaSicherstellen(extensionId, deps = {}) {
  const d = deps.db || db;
  const schema = schemaName(extensionId);
  await d.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  return schema;
}

/**
 * Eine Tabelle anlegen.
 *
 * `id` und `angelegt_am` kommen immer dazu. Ohne einen Schlüssel gäbe es keinen
 * Weg, eine einzelne Zeile wieder zu löschen, und ohne Zeitstempel keinen, alte
 * Zeilen zu finden.
 */
async function anlegen(extensionId, { name, spalten }, deps = {}) {
  const d = deps.db || db;
  const tabelle = sauber(name, 'Tabellenname');
  const liste = Array.isArray(spalten) ? spalten : [];
  if (liste.length === 0) {
    throw new ValidationError('Eine Tabelle ohne Spalten ergibt keinen Sinn');
  }
  if (liste.length > MAX_SPALTEN) {
    throw new ValidationError(`Höchstens ${MAX_SPALTEN} Spalten je Tabelle`);
  }

  const { rows: vorhanden } = await d.query(
    'SELECT COUNT(*)::int AS anzahl FROM public.extension_tabellen WHERE extension_id = $1',
    [extensionId]
  );
  if ((vorhanden[0]?.anzahl ?? 0) >= MAX_TABELLEN) {
    throw new ForbiddenError(`Höchstens ${MAX_TABELLEN} Tabellen je Erweiterung`);
  }

  const gesehen = new Set(['id', 'angelegt_am']);
  const stuecke = [];
  const registerSpalten = [];
  for (const s of liste) {
    const spalte = sauber(s?.name, 'Spaltenname');
    if (gesehen.has(spalte)) {
      throw new ValidationError(`Spalte "${spalte}" ist doppelt (oder reserviert)`);
    }
    gesehen.add(spalte);
    const typ = String(s?.typ || 'text').toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(TYPEN, typ)) {
      throw new ValidationError(
        `Unbekannter Typ "${typ}". Erlaubt: ${Object.keys(TYPEN).join(', ')}`
      );
    }
    stuecke.push(`"${spalte}" ${TYPEN[typ]}`);
    registerSpalten.push({ name: spalte, typ });
  }

  const schema = await schemaSicherstellen(extensionId, deps);
  await d.query(
    `CREATE TABLE IF NOT EXISTS "${schema}"."${tabelle}" (
       id BIGSERIAL PRIMARY KEY,
       angelegt_am TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       ${stuecke.join(',\n       ')}
     )`
  );
  await d.query(
    `INSERT INTO public.extension_tabellen (extension_id, name, spalten)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (extension_id, name) DO UPDATE SET spalten = EXCLUDED.spalten`,
    [extensionId, tabelle, JSON.stringify(registerSpalten)]
  );
  logger.info(`Erweiterungs-Tabelle angelegt: ${schema}.${tabelle} (${extensionId})`);
  return { name: tabelle, spalten: registerSpalten };
}

/** Die im Register vermerkten Spalten einer Tabelle, oder ein NotFound. */
async function registerEintrag(extensionId, name, deps = {}) {
  const d = deps.db || db;
  const tabelle = sauber(name, 'Tabellenname');
  const { rows } = await d.query(
    'SELECT name, spalten FROM public.extension_tabellen WHERE extension_id = $1 AND name = $2',
    [extensionId, tabelle]
  );
  if (rows.length === 0) {
    throw new NotFoundError(
      `Tabelle "${tabelle}" gibt es für diese Erweiterung nicht. Erst anlegen.`
    );
  }
  return { tabelle, spalten: rows[0].spalten || [] };
}

/** Alle Tabellen dieser Erweiterung. */
async function liste(extensionId, deps = {}) {
  const d = deps.db || db;
  const { rows } = await d.query(
    `SELECT name, spalten, angelegt_am FROM public.extension_tabellen
     WHERE extension_id = $1 ORDER BY name`,
    [extensionId]
  );
  return { tabellen: rows };
}

/** Eine Zeile schreiben. Werte werden gebunden, Spaltennamen kommen aus dem Register. */
async function schreiben(extensionId, { name, werte }, deps = {}) {
  const d = deps.db || db;
  const { tabelle, spalten } = await registerEintrag(extensionId, name, deps);
  const erlaubt = new Map(spalten.map(s => [s.name, s.typ]));

  const namen = [];
  const platzhalter = [];
  const werteListe = [];
  for (const [k, v] of Object.entries(werte || {})) {
    if (!erlaubt.has(k)) {
      throw new ValidationError(
        `Spalte "${k}" gibt es in "${tabelle}" nicht. Vorhanden: ` +
          `${[...erlaubt.keys()].join(', ')}`
      );
    }
    namen.push(`"${k}"`);
    platzhalter.push(`$${werteListe.length + 1}`);
    werteListe.push(erlaubt.get(k) === 'json' ? JSON.stringify(v) : v);
  }
  if (namen.length === 0) {
    throw new ValidationError('Keine Werte zum Schreiben');
  }

  const schema = schemaName(extensionId);
  const { rows } = await d.query(
    `INSERT INTO "${schema}"."${tabelle}" (${namen.join(', ')})
     VALUES (${platzhalter.join(', ')}) RETURNING id, angelegt_am`,
    werteListe
  );
  return rows[0];
}

/**
 * Zeilen lesen.
 *
 * Kein freies WHERE: Gleichheit auf bekannten Spalten reicht für Zustand einer
 * Anwendung, und alles darüber wäre wieder ein Weg, SQL hereinzureichen.
 */
async function lesen(extensionId, { name, wo, anzahl }, deps = {}) {
  const d = deps.db || db;
  const { tabelle, spalten } = await registerEintrag(extensionId, name, deps);
  const erlaubt = new Set(spalten.map(s => s.name));

  const bedingungen = [];
  const werte = [];
  for (const [k, v] of Object.entries(wo || {})) {
    if (!erlaubt.has(k)) {
      throw new ValidationError(`Spalte "${k}" gibt es in "${tabelle}" nicht`);
    }
    werte.push(v);
    bedingungen.push(`"${k}" = $${werte.length}`);
  }
  const grenze = Math.min(Math.max(parseInt(anzahl, 10) || 100, 1), MAX_ZEILEN);
  const schema = schemaName(extensionId);
  const { rows } = await d.query(
    `SELECT * FROM "${schema}"."${tabelle}"
     ${bedingungen.length ? `WHERE ${bedingungen.join(' AND ')}` : ''}
     ORDER BY id DESC LIMIT ${grenze}`,
    werte
  );
  return { zeilen: rows, gekuerzt: rows.length === grenze };
}

/** Zeilen löschen. Ohne `wo` passiert nichts: „alles löschen" muss man sagen. */
async function loeschen(extensionId, { name, wo, alles }, deps = {}) {
  const d = deps.db || db;
  const { tabelle, spalten } = await registerEintrag(extensionId, name, deps);
  const erlaubt = new Set(spalten.map(s => s.name).concat('id'));

  const bedingungen = [];
  const werte = [];
  for (const [k, v] of Object.entries(wo || {})) {
    if (!erlaubt.has(k)) {
      throw new ValidationError(`Spalte "${k}" gibt es in "${tabelle}" nicht`);
    }
    werte.push(v);
    bedingungen.push(`"${k}" = $${werte.length}`);
  }
  if (bedingungen.length === 0 && alles !== true) {
    throw new ValidationError(
      'Ohne Bedingung wird nichts gelöscht. Für „alle Zeilen" ausdrücklich ' +
        '`alles: true` setzen.'
    );
  }
  const schema = schemaName(extensionId);
  const { rowCount } = await d.query(
    `DELETE FROM "${schema}"."${tabelle}"
     ${bedingungen.length ? `WHERE ${bedingungen.join(' AND ')}` : ''}`,
    werte
  );
  return { geloescht: rowCount };
}

/**
 * Alles einer Erweiterung entfernen (beim Deinstallieren).
 *
 * `CASCADE`, weil das Schema der Erweiterung gehört und nichts darin von außen
 * referenziert wird. Ohne das Register wüsste hier niemand, dass es dieses
 * Schema überhaupt gibt.
 */
async function entfernen(extensionId, deps = {}) {
  const d = deps.db || db;
  const schema = schemaName(extensionId);
  await d.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await d.query('DELETE FROM public.extension_tabellen WHERE extension_id = $1', [extensionId]);
  logger.info(`Erweiterungs-Schema entfernt: ${schema}`);
}

module.exports = {
  anlegen,
  liste,
  schreiben,
  lesen,
  loeschen,
  entfernen,
  schemaName,
  TYPEN,
  MAX_TABELLEN,
  MAX_SPALTEN,
  MAX_ZEILEN,
};
