/**
 * Plan 023 H1: eigene Tabellen je Erweiterung.
 *
 * Die eine Entscheidung, an der hier alles hängt: die Erweiterung schickt
 * NIEMALS SQL. Sie sagt, was sie will; das SQL entsteht im Backend aus
 * geprüften Bezeichnern und gebundenen Werten.
 *
 * Bezeichner lassen sich nicht binden, sie müssen in den Text. Deshalb prüfen
 * die meisten Tests hier genau das: dass ein Name, der etwas anderes bewirken
 * würde, abgewiesen wird, statt bereinigt zu werden. Stillschweigend zu
 * bereinigen wäre schlimmer — die Erweiterung legte dann eine Tabelle unter
 * einem anderen Namen an, als sie glaubt, und fände sie nie wieder.
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-minimum-32-chars';

const dienst = require('../../src/services/extensions/tabellenService');
const { ValidationError, NotFoundError, ForbiddenError } = require('../../src/utils/errors');

/** Ein db-Doppel, das jede Abfrage mitschreibt und Antworten der Reihe nach gibt. */
function fakeDb(antworten = []) {
  const abfragen = [];
  const rest = [...antworten];
  const d = {
    query: jest.fn(async (sql, werte) => {
      abfragen.push({ sql, werte });
      return rest.shift() ?? { rows: [], rowCount: 0 };
    }),
  };
  d.abfragen = abfragen;
  d.sqlMit = teil => abfragen.filter(a => a.sql.includes(teil));
  return d;
}

const KEINE_TABELLEN = { rows: [{ anzahl: 0 }] };

describe('schemaName', () => {
  test('setzt ext_ davor', () => {
    expect(dienst.schemaName('mein-paket')).toBe('ext_mein_paket');
  });

  test('eine Erweiterung kann sich nicht public oder arasul nennen', () => {
    // Der Praefix ist genau dafuer da.
    expect(dienst.schemaName('public')).toBe('ext_public');
    expect(dienst.schemaName('arasul')).toBe('ext_arasul');
  });

  test('Anfuehrungszeichen und Semikolon ueberleben die Umformung nicht', () => {
    expect(dienst.schemaName('a";DROP SCHEMA public;--')).toBe('ext_a_drop_schema_public');
  });

  test('was gar keinen Namen ergibt, wirft', () => {
    expect(() => dienst.schemaName('---')).toThrow(ValidationError);
    expect(() => dienst.schemaName('')).toThrow(ValidationError);
  });
});

describe('anlegen', () => {
  test('legt Schema und Tabelle an und traegt sie ins Register', async () => {
    const db = fakeDb([KEINE_TABELLEN]);
    const res = await dienst.anlegen(
      'meine-ext',
      { name: 'belege', spalten: [{ name: 'nummer', typ: 'text' }, { name: 'betrag', typ: 'zahl' }] },
      { db }
    );

    expect(res).toEqual({
      name: 'belege',
      spalten: [{ name: 'nummer', typ: 'text' }, { name: 'betrag', typ: 'zahl' }],
    });
    expect(db.sqlMit('CREATE SCHEMA IF NOT EXISTS "ext_meine_ext"')).toHaveLength(1);
    const erzeugt = db.sqlMit('CREATE TABLE IF NOT EXISTS')[0].sql;
    expect(erzeugt).toContain('"ext_meine_ext"."belege"');
    expect(erzeugt).toContain('"nummer" TEXT');
    expect(erzeugt).toContain('"betrag" DOUBLE PRECISION');
    // id und Zeitstempel kommen immer dazu.
    expect(erzeugt).toContain('id BIGSERIAL PRIMARY KEY');
    expect(erzeugt).toContain('angelegt_am TIMESTAMPTZ');
    expect(db.sqlMit('INSERT INTO public.extension_tabellen')).toHaveLength(1);
  });

  test('ein Tabellenname mit Anfuehrungszeichen wird abgewiesen, nicht bereinigt', async () => {
    const db = fakeDb([KEINE_TABELLEN]);
    await expect(
      dienst.anlegen('meine-ext', { name: 'a"; DROP TABLE admin_users; --', spalten: [{ name: 'x' }] }, { db })
    ).rejects.toThrow(ValidationError);
    expect(db.abfragen).toHaveLength(0);
  });

  test('ein Spaltenname mit Anfuehrungszeichen ebenso', async () => {
    const db = fakeDb([KEINE_TABELLEN]);
    await expect(
      dienst.anlegen('meine-ext', { name: 'gut', spalten: [{ name: 'x" INTEGER, y TEXT' }] }, { db })
    ).rejects.toThrow(ValidationError);
    expect(db.sqlMit('CREATE TABLE')).toHaveLength(0);
  });

  test('ein unbekannter Typ wird abgewiesen', async () => {
    const db = fakeDb([KEINE_TABELLEN]);
    await expect(
      dienst.anlegen('meine-ext', { name: 'gut', spalten: [{ name: 'x', typ: 'TEXT); DROP' }] }, { db })
    ).rejects.toThrow(/Unbekannter Typ/);
  });

  test('id und angelegt_am sind reserviert', async () => {
    const db = fakeDb([KEINE_TABELLEN]);
    await expect(
      dienst.anlegen('meine-ext', { name: 'gut', spalten: [{ name: 'id' }] }, { db })
    ).rejects.toThrow(/doppelt|reserviert/);
  });

  test('eine Tabelle ohne Spalten ergibt keinen Sinn', async () => {
    await expect(
      dienst.anlegen('meine-ext', { name: 'leer', spalten: [] }, { db: fakeDb() })
    ).rejects.toThrow(ValidationError);
  });

  test('der Deckel je Erweiterung greift', async () => {
    const db = fakeDb([{ rows: [{ anzahl: dienst.MAX_TABELLEN }] }]);
    await expect(
      dienst.anlegen('meine-ext', { name: 'noch_eine', spalten: [{ name: 'x' }] }, { db })
    ).rejects.toThrow(ForbiddenError);
  });
});

describe('schreiben', () => {
  const REGISTER = {
    rows: [{ name: 'belege', spalten: [{ name: 'nummer', typ: 'text' }, { name: 'daten', typ: 'json' }] }],
  };

  test('bindet die Werte, statt sie in den Text zu setzen', async () => {
    const db = fakeDb([REGISTER, { rows: [{ id: 1, angelegt_am: 'jetzt' }] }]);
    await dienst.schreiben('meine-ext', { name: 'belege', werte: { nummer: "'; DROP TABLE x; --" } }, { db });

    const insert = db.sqlMit('INSERT INTO "ext_meine_ext"."belege"')[0];
    expect(insert.sql).toContain('VALUES ($1)');
    // Der gefaehrliche Text steht als WERT da, nicht im SQL.
    expect(insert.werte).toEqual(["'; DROP TABLE x; --"]);
    expect(insert.sql).not.toContain('DROP');
  });

  test('json-Spalten werden serialisiert', async () => {
    const db = fakeDb([REGISTER, { rows: [{ id: 1 }] }]);
    await dienst.schreiben('meine-ext', { name: 'belege', werte: { daten: { a: 1 } } }, { db });
    expect(db.sqlMit('INSERT INTO')[0].werte).toEqual(['{"a":1}']);
  });

  test('eine unbekannte Spalte wird abgewiesen, mit Auskunft', async () => {
    const db = fakeDb([REGISTER]);
    await expect(
      dienst.schreiben('meine-ext', { name: 'belege', werte: { gibtsnicht: 1 } }, { db })
    ).rejects.toThrow(/Vorhanden: nummer, daten/);
  });

  test('eine unbekannte Tabelle ist ein NotFound', async () => {
    const db = fakeDb([{ rows: [] }]);
    await expect(
      dienst.schreiben('meine-ext', { name: 'fremd', werte: { x: 1 } }, { db })
    ).rejects.toThrow(NotFoundError);
  });
});

describe('lesen', () => {
  const REGISTER = { rows: [{ name: 'belege', spalten: [{ name: 'nummer', typ: 'text' }] }] };

  test('filtert ueber gebundene Werte', async () => {
    const db = fakeDb([REGISTER, { rows: [{ id: 1, nummer: 'R-1' }] }]);
    const res = await dienst.lesen('meine-ext', { name: 'belege', wo: { nummer: 'R-1' } }, { db });
    const sel = db.sqlMit('SELECT * FROM')[0];
    expect(sel.sql).toContain('WHERE "nummer" = $1');
    expect(sel.werte).toEqual(['R-1']);
    expect(res.zeilen).toHaveLength(1);
  });

  test('deckelt die Zeilenzahl und sagt es', async () => {
    const zeilen = Array.from({ length: 3 }, (_, i) => ({ id: i }));
    const db = fakeDb([REGISTER, { rows: zeilen }]);
    const res = await dienst.lesen('meine-ext', { name: 'belege', anzahl: 3 }, { db });
    expect(db.sqlMit('LIMIT 3')).toHaveLength(1);
    expect(res.gekuerzt).toBe(true);
  });

  test('eine zu grosse Anzahl wird auf den Deckel gezogen', async () => {
    const db = fakeDb([REGISTER, { rows: [] }]);
    await dienst.lesen('meine-ext', { name: 'belege', anzahl: 99999 }, { db });
    expect(db.sqlMit(`LIMIT ${dienst.MAX_ZEILEN}`)).toHaveLength(1);
  });

  test('eine unbekannte Spalte im Filter wird abgewiesen', async () => {
    const db = fakeDb([REGISTER]);
    await expect(
      dienst.lesen('meine-ext', { name: 'belege', wo: { fremd: 1 } }, { db })
    ).rejects.toThrow(ValidationError);
  });
});

describe('loeschen', () => {
  const REGISTER = { rows: [{ name: 'belege', spalten: [{ name: 'nummer', typ: 'text' }] }] };

  test('ohne Bedingung passiert nichts', async () => {
    // "Alles loeschen" muss man sagen, sonst ist ein vergessener Filter das
    // Ende der Daten.
    const db = fakeDb([REGISTER]);
    await expect(dienst.loeschen('meine-ext', { name: 'belege' }, { db })).rejects.toThrow(
      /alles: true/
    );
    expect(db.sqlMit('DELETE FROM "ext_')).toHaveLength(0);
  });

  test('mit alles: true wird geraeumt', async () => {
    const db = fakeDb([REGISTER, { rowCount: 7 }]);
    const res = await dienst.loeschen('meine-ext', { name: 'belege', alles: true }, { db });
    expect(res).toEqual({ geloescht: 7 });
    expect(db.sqlMit('DELETE FROM "ext_meine_ext"."belege"')[0].sql).not.toContain('WHERE');
  });

  test('nach id darf geloescht werden, auch ohne eigene Spalte', async () => {
    const db = fakeDb([REGISTER, { rowCount: 1 }]);
    await dienst.loeschen('meine-ext', { name: 'belege', wo: { id: 5 } }, { db });
    expect(db.sqlMit('WHERE "id" = $1')).toHaveLength(1);
  });
});

describe('entfernen', () => {
  test('raeumt Schema und Register ab', async () => {
    // Ohne das bliebe ein Schema mit Kundendaten stehen, das niemand mehr
    // zuordnen kann: die Register-Zeile ist dann weg.
    const db = fakeDb();
    await dienst.entfernen('meine-ext', { db });
    expect(db.sqlMit('DROP SCHEMA IF EXISTS "ext_meine_ext" CASCADE')).toHaveLength(1);
    expect(db.sqlMit('DELETE FROM public.extension_tabellen')).toHaveLength(1);
  });
});
