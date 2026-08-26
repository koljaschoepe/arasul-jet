/**
 * Migration Runner Unit Tests
 */

const fs = require('fs');

jest.mock('fs');
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { runMigrations, extractVersion, getMigrationFiles } = require('../../src/migrationRunner');

describe('extractVersion', () => {
  test('extracts version from standard filename', () => {
    expect(extractVersion('005_chat_schema.sql')).toBe(5);
    expect(extractVersion('047_telegram_rag.sql')).toBe(47);
    expect(extractVersion('000_schema_migrations.sql')).toBe(0);
  });

  test('extracts version from sub-version filename', () => {
    expect(extractVersion('032a_create_data_database.sh')).toBe(32);
  });

  test('returns null for invalid filenames', () => {
    expect(extractVersion('readme.md')).toBeNull();
    expect(extractVersion('no_number.sql')).toBeNull();
  });
});

describe('getMigrationFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns empty array when dir does not exist', () => {
    fs.existsSync.mockReturnValue(false);
    expect(getMigrationFiles()).toEqual([]);
  });

  test('filters and sorts SQL files by version', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue([
      '005_chat.sql',
      '001_init.sql',
      'readme.md',
      '032a_data.sh',
      '010_alerts.sql',
    ]);

    const files = getMigrationFiles();
    expect(files).toHaveLength(3);
    expect(files[0].filename).toBe('001_init.sql');
    expect(files[1].filename).toBe('005_chat.sql');
    expect(files[2].filename).toBe('010_alerts.sql');
  });
});

describe('runMigrations', () => {
  let mockClient;
  let mockPool;
  let queryResults;
  let callIndex;

  beforeEach(() => {
    jest.clearAllMocks();
    callIndex = 0;
    queryResults = [];

    mockClient = {
      query: jest.fn().mockImplementation((...args) => {
        const result = queryResults[callIndex] || { rows: [] };
        callIndex++;
        if (result instanceof Error) return Promise.reject(result);
        return Promise.resolve(result);
      }),
      release: jest.fn(),
    };
    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    fs.existsSync.mockReturnValue(false);
  });

  test('returns zeros when no migration files found', async () => {
    queryResults = [
      {}, // SET statement_timeout
      { rows: [{ table_schema: 'public' }] }, // ermittleBuchOrt
      {}, // CREATE TABLE schema_migrations
      { rows: [] }, // schattentabellen (vorher)
    ];

    const result = await runMigrations(mockPool);
    expect(result).toEqual({ applied: 0, skipped: 0, failed: null, schatten: [] });
    expect(mockClient.release).toHaveBeenCalled();
  });

  test('seeds existing database and skips all', async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['001_init.sql', '005_chat.sql']);
    fs.readFileSync.mockReturnValue('SELECT 1;');

    queryResults = [
      {}, // SET statement_timeout
      { rows: [{ table_schema: 'public' }] }, // ermittleBuchOrt
      {}, // CREATE TABLE schema_migrations
      { rows: [] }, // schattentabellen (vorher)
      { rows: [{ count: '1' }] }, // seedExisting: COUNT schema_migrations (only version 0)
      { rows: [{ count: '2' }] }, // seedExisting: core tables check (admin_users, chats exist)
      { rows: [] }, // seedExisting: SELECT for version 1 (not tracked)
      {}, // seedExisting: INSERT version 1
      { rows: [] }, // seedExisting: SELECT for version 5 (not tracked)
      {}, // seedExisting: INSERT version 5
      { rows: [{ version: 0 }, { version: 1 }, { version: 5 }] }, // getAppliedVersions
    ];

    const result = await runMigrations(mockPool);
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(2);
  });

  test('skips already-applied migrations', async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['001_init.sql', '005_chat.sql']);

    queryResults = [
      {}, // SET statement_timeout
      { rows: [{ table_schema: 'public' }] }, // ermittleBuchOrt
      {}, // CREATE TABLE schema_migrations
      { rows: [] }, // schattentabellen (vorher)
      { rows: [{ count: '48' }] }, // seedExisting: COUNT (>5, skip seed)
      { rows: [] }, // buchWiderspricht: Schema arasul gibt es nicht
      { rows: [{ version: 1 }, { version: 5 }] }, // getAppliedVersions
    ];

    const result = await runMigrations(mockPool);
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.failed).toBeNull();
  });

  test('applies unapplied migration in transaction', async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['001_init.sql']);
    fs.readFileSync.mockReturnValue('CREATE TABLE test (id INT);');

    queryResults = [
      {}, // SET statement_timeout
      { rows: [{ table_schema: 'public' }] }, // ermittleBuchOrt
      {}, // CREATE TABLE schema_migrations
      { rows: [] }, // schattentabellen (vorher)
      { rows: [{ count: '48' }] }, // seedExisting: COUNT (>5, skip seed)
      { rows: [] }, // buchWiderspricht: Schema arasul gibt es nicht
      { rows: [] }, // getAppliedVersions (empty)
      {}, // BEGIN
      {}, // SQL content
      {}, // INSERT INTO schema_migrations
      {}, // COMMIT
    ];

    const result = await runMigrations(mockPool);
    expect(result.applied).toBe(1);
    expect(result.failed).toBeNull();

    const calls = mockClient.query.mock.calls.map(c => typeof c[0] === 'string' ? c[0] : '');
    expect(calls).toContain('BEGIN');
    expect(calls).toContain('COMMIT');
  });

  test('rolls back and stops on failure', async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['001_init.sql', '005_chat.sql']);
    fs.readFileSync.mockReturnValue('INVALID SQL;');

    queryResults = [
      {}, // SET statement_timeout
      { rows: [{ table_schema: 'public' }] }, // ermittleBuchOrt
      {}, // CREATE TABLE schema_migrations
      { rows: [] }, // schattentabellen (vorher)
      { rows: [{ count: '48' }] }, // seedExisting: COUNT (>5, skip seed)
      { rows: [] }, // buchWiderspricht: Schema arasul gibt es nicht
      { rows: [] }, // getAppliedVersions (empty)
      {}, // BEGIN
      new Error('syntax error'), // SQL fails
      {}, // ROLLBACK
      {}, // INSERT failure record
    ];

    const result = await runMigrations(mockPool);
    expect(result.applied).toBe(0);
    expect(result.failed).toBe('001_init.sql');
  });

  /**
   * Wo das Migrationsbuch steht (Nacharbeit zur Live-Abnahme vom 19.08.2026).
   *
   * Der unqualifizierte Name `schema_migrations` loeste gegen `search_path`
   * (`"$user", public`) auf. Der Datenbanknutzer heisst arasul, und seit
   * Migration 090 gibt es auch ein Schema arasul. Damit hing der Ablageort davon
   * ab, ob dieses Schema im Moment des CREATE schon existierte. Auf dem Geraet:
   * arasul.schema_migrations mit 145 Zeilen UND public.schema_migrations mit 93.
   * Auf einem frischen Geraet legte der zweite Start das Buch neu an und
   * markierte blind 146 Migrationen als erledigt.
   */
  describe('Ort des Migrationsbuchs', () => {
    function laufMit(ortZeilen) {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue([]);
      queryResults = [
        {}, // SET statement_timeout
        { rows: ortZeilen }, // ermittleBuchOrt
        {}, // CREATE TABLE
        { rows: [] }, // schattentabellen (vorher)
      ];
      return runMigrations(mockPool);
    }

    const sql = () => mockClient.query.mock.calls.map(c => (typeof c[0] === 'string' ? c[0] : ''));

    test('bleibt bei arasul, wenn das Buch dort schon steht', async () => {
      await laufMit([{ table_schema: 'arasul' }]);
      expect(sql().some(s => s.includes('CREATE TABLE IF NOT EXISTS arasul.schema_migrations'))).toBe(
        true
      );
    });

    test('nimmt public, wenn es dort steht', async () => {
      await laufMit([{ table_schema: 'public' }]);
      expect(sql().some(s => s.includes('CREATE TABLE IF NOT EXISTS public.schema_migrations'))).toBe(
        true
      );
    });

    test('legt es auf einer frischen Datenbank in public an', async () => {
      await laufMit([]);
      expect(sql().some(s => s.includes('CREATE TABLE IF NOT EXISTS public.schema_migrations'))).toBe(
        true
      );
    });

    test('schreibt den Ort nirgends unqualifiziert', async () => {
      await laufMit([{ table_schema: 'arasul' }]);
      // Genau das war der Fehler: ohne Schema entscheidet der search_path.
      expect(sql().some(s => /\b(FROM|INTO|EXISTS)\s+schema_migrations\b/.test(s))).toBe(false);
    });
  });

  /**
   * Das Buch widerspricht der Datenbank (Befund vom 20.08.2026).
   *
   * Der Docker-Init wendet alle 147 Migrationen an und trug bis zum 20.08.2026
   * sieben Zeilen ins Buch ein. Sieben ist groesser als fuenf, also griff die
   * bisherige Abkuerzung `tracked > 5`, der Runner hielt 140 Migrationen fuer
   * offen und wendete sie erneut an. Das Merkmal darf deshalb nicht die Zahl
   * der Zeilen sein, sondern der Widerspruch: Schema `arasul` da, Migration 90
   * nicht gebucht.
   */
  describe('Buch widerspricht der Datenbank', () => {
    function laufMit({ schemaDa, neunzigGebucht }) {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['001_init.sql']);
      fs.readFileSync.mockReturnValue('SELECT 1;');
      queryResults = [
        {}, // SET statement_timeout
        { rows: [{ table_schema: 'public' }] }, // ermittleBuchOrt
        {}, // CREATE TABLE
        { rows: [] }, // schattentabellen (vorher)
        { rows: [{ count: '7' }] }, // seedExisting: COUNT, genau der Fall vom 20.08.
        { rows: schemaDa ? [{ '?column?': 1 }] : [] }, // buchWiderspricht: Schema arasul
      ];
      if (schemaDa) {
        queryResults.push({ rows: neunzigGebucht ? [{ '?column?': 1 }] : [] }); // Version 90 im Buch?
      }
      if (schemaDa && !neunzigGebucht) {
        queryResults.push(
          { rows: [{ count: '3' }] }, // seedExisting: Kerntabellen da
          { rows: [] }, // seedExisting: Version 1 noch nicht gebucht
          {}, // seedExisting: INSERT
          { rows: [{ version: 1 }] } // getAppliedVersions
        );
      } else {
        queryResults.push({ rows: [{ version: 1 }] }); // getAppliedVersions
      }
      return runMigrations(mockPool);
    }

    const sql = () => mockClient.query.mock.calls.map(c => (typeof c[0] === 'string' ? c[0] : ''));

    test('traegt nach, statt 140 Migrationen erneut anzuwenden', async () => {
      const result = await laufMit({ schemaDa: true, neunzigGebucht: false });

      expect(result.applied).toBe(0);
      expect(result.skipped).toBe(1);
      expect(sql()).not.toContain('BEGIN');
      const logger = require('../../src/utils/logger');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('steht aber nicht im Buch')
      );
    });

    test('laesst ein vollstaendiges Buch in Ruhe', async () => {
      await laufMit({ schemaDa: true, neunzigGebucht: true });

      // Kein Nachtragen: keine INSERT-Anweisung ausserhalb eines Laufs.
      expect(sql().some(s => s.includes('INSERT INTO public.schema_migrations'))).toBe(false);
    });

    test('greift nicht auf einer Datenbank ohne Schema arasul', async () => {
      await laufMit({ schemaDa: false, neunzigGebucht: false });

      const logger = require('../../src/utils/logger');
      expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('steht aber nicht im Buch'));
    });
  });

  /**
   * Schattentabellen (Befund vom 20.08.2026, am Pruefstand gemessen).
   *
   * Ein fabrikneues Geraet lief, der Kunde legte sein Konto an, ein einziger
   * Neustart des Backends erzeugte 47 gleichnamige, leere Tabellen im Schema
   * `arasul`. Danach: Anmeldung des Kunden 401, `needsSetup` false, und in
   * `arasul.admin_users` ein neues Konto `admin` mit dem Passwort ab Werk.
   * Die Daten des Kunden lagen unerreichbar in `public`.
   */
  describe('Schattentabellen', () => {
    function laufMit(schattenZeilen, dateien = ['001_init.sql']) {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(dateien);
      fs.readFileSync.mockReturnValue('SELECT 1;');
      queryResults = [
        {}, // SET statement_timeout
        { rows: [{ table_schema: 'public' }] }, // ermittleBuchOrt
        {}, // CREATE TABLE
        { rows: schattenZeilen }, // schattentabellen (vorher)
        { rows: [{ count: '48' }] }, // seedExisting: COUNT (>5, kein Seed)
      { rows: [] }, // buchWiderspricht: Schema arasul gibt es nicht
        { rows: [{ version: 1 }] }, // getAppliedVersions
      ];
      return runMigrations(mockPool);
    }

    test('meldet doppelt liegende Tabellen und wendet nichts an', async () => {
      const result = await laufMit([{ table_name: 'admin_users' }, { table_name: 'llm_jobs' }]);

      expect(result.schatten).toEqual(['admin_users', 'llm_jobs']);
      expect(result.applied).toBe(0);
      // Kein BEGIN: auf einer verdeckten Datenbank wird nicht weitergebaut.
      const sql = mockClient.query.mock.calls.map(c => (typeof c[0] === 'string' ? c[0] : ''));
      expect(sql).not.toContain('BEGIN');
    });

    test('laesst schema_migrations durch, die steht auf dem Geraet wirklich doppelt', async () => {
      const result = await laufMit([{ table_name: 'schema_migrations' }]);

      expect(result.schatten).toEqual([]);
      expect(result.failed).toBeNull();
    });

    test('meldet auch eine Doppelung, die erst der Lauf selbst erzeugt hat', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['001_init.sql']);
      fs.readFileSync.mockReturnValue('SELECT 1;');
      queryResults = [
        {}, // SET statement_timeout
        { rows: [{ table_schema: 'public' }] }, // ermittleBuchOrt
        {}, // CREATE TABLE
        { rows: [] }, // schattentabellen (vorher): sauber
        { rows: [{ count: '48' }] }, // seedExisting: COUNT
      { rows: [] }, // buchWiderspricht: Schema arasul gibt es nicht
        { rows: [] }, // getAppliedVersions: nichts angewendet
        {}, // BEGIN
        {}, // SQL
        {}, // INSERT ins Buch
        {}, // COMMIT
        { rows: [{ table_name: 'llm_jobs' }] }, // schattentabellen (nachher)
      ];

      const result = await runMigrations(mockPool);

      expect(result.applied).toBe(1);
      expect(result.failed).toBeNull();
      expect(result.schatten).toEqual(['llm_jobs']);
    });
  });
});
