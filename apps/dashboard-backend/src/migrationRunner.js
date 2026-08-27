/**
 * Migration Runner — applies unapplied SQL migrations on backend startup.
 *
 * Design:
 * - Reads SQL files from MIGRATIONS_DIR (mounted from services/postgres/init/)
 * - Checks schema_migrations table to find unapplied migrations
 * - On first run (existing DB without tracking): seeds schema_migrations
 *   with all migrations whose tables already exist (Docker init ran them)
 * - Applies genuinely new migrations in transactions
 * - Skips .sh files (Docker-init-only scripts)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./utils/logger');

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || '/arasul/migrations';

/**
 * Extract version number from filename like "005_chat_schema.sql" → 5
 */
function extractVersion(filename) {
  const match = filename.match(/^(\d+)[a-z]?_/);
  if (!match) {
    return null;
  }
  return parseInt(match[1], 10);
}

/**
 * Compute SHA-256 checksum of file content
 */
function checksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Wo das Migrationsbuch steht.
 *
 * Bis zum 19.08.2026 stand hier ueberall der unqualifizierte Name
 * `schema_migrations`. Der loest gegen `search_path` auf, und der ist
 * `"$user", public`. Der Datenbanknutzer heisst arasul, und seit Migration 090
 * gibt es auch ein Schema arasul. Damit haengt der Ablageort davon ab, ob
 * dieses Schema im Moment des CREATE schon existiert: mal `public`, mal
 * `arasul`.
 *
 * Auf dem Geraet gefunden: arasul.schema_migrations mit 145 Zeilen und
 * public.schema_migrations mit 93 aus der Zeit davor. Auf einem frischen Geraet
 * landet das Buch beim ersten Start in `public`; beim zweiten Start findet der
 * Laeufer dort nichts mehr, legt es in `arasul` neu an und meldet
 * "Seeded 146 existing migrations". Er markiert also alles blind als erledigt,
 * ohne es geprueft zu haben. Heute folgenlos, weil die Docker-Initialisierung
 * sie wirklich angewendet hat. Verlaesslich ist das Buch damit nicht.
 *
 * Deshalb wird der Ort einmal ermittelt und danach ueberall ausgeschrieben:
 * gibt es `arasul.schema_migrations` schon, bleibt es dort. Sonst `public`.
 * Kein bestehendes Buch zieht um, und ein neues Geraet bekommt einen festen Ort.
 */
async function ermittleBuchOrt(client) {
  const { rows } = await client.query(
    `SELECT table_schema
       FROM information_schema.tables
      WHERE table_name = 'schema_migrations'
        AND table_schema IN ('arasul', 'public')
      ORDER BY CASE table_schema WHEN 'arasul' THEN 0 ELSE 1 END
      LIMIT 1`
  );
  return rows[0] ? `${rows[0].table_schema}.schema_migrations` : 'public.schema_migrations';
}

/**
 * Tabellen, die es in `public` UND in `arasul` gibt.
 *
 * Genau eine darf das: `schema_migrations`. Sie steht auf dem Geraet in beiden
 * Schemata, weil das Buch frueher ohne Ortsangabe angelegt wurde (siehe
 * ermittleBuchOrt). Jede andere Doppelung ist ein Schaden, kein Zustand:
 * `search_path` ist `"$user", public`, der Datenbanknutzer heisst arasul, also
 * gewinnt ab Migration 090 immer die Tabelle in `arasul`. Eine gleichnamige
 * Tabelle dort verdeckt die gefuellte in `public` vollstaendig. Die Anwendung
 * liest dann eine leere Tabelle und haelt das fuer die Wahrheit.
 *
 * Am 20.08.2026 auf dem Pruefstand gemessen: ein Neustart eines fabrikneuen
 * Geraets erzeugte 47 solche Paare. Danach meldete `/auth/login` fuer das
 * Konto des Kunden "Invalid username or password", `needsSetup` stand auf
 * false, und in `arasul.admin_users` sass ein neu angelegtes `admin` mit dem
 * Passwort ab Werk. Kein einziger Testlauf hat das je gesehen, weil auf einer
 * gewachsenen Datenbank die Doppelung nicht entsteht.
 */
const SCHATTEN_ERLAUBT = new Set(['schema_migrations']);

async function schattentabellen(client) {
  const { rows } = await client.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'arasul'
     INTERSECT
     SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY 1`
  );
  return rows.map(r => r.table_name).filter(name => !SCHATTEN_ERLAUBT.has(name));
}

/**
 * Ensure schema_migrations table exists (bootstrap for existing databases)
 */
async function ensureMigrationsTable(client, buch) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${buch} (
        version INTEGER PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW(),
        checksum VARCHAR(64),
        execution_ms INTEGER,
        success BOOLEAN DEFAULT true
    )
  `);
}

/**
 * Get set of already-applied migration versions
 */
async function getAppliedVersions(client, buch) {
  const result = await client.query(`SELECT version FROM ${buch} WHERE success = true`);
  return new Set(result.rows.map(r => r.version));
}

/**
 * Widerspricht das Buch der Datenbank?
 *
 * Migration 090 legt `CREATE SCHEMA IF NOT EXISTS arasul` an. Existiert dieses
 * Schema, hat jemand mindestens bis 090 angewendet. Steht 90 trotzdem nicht im
 * Buch, ist das Buch keine Auskunft ueber den Stand, sondern eine Luecke, und
 * der Runner wuerde 140 laengst angewendete Migrationen erneut anwenden.
 *
 * Genau das ist am 20.08.2026 passiert, zweimal: einmal, weil der Docker-Init
 * nur sieben Zeilen schrieb, und einmal, weil das Skript, das die Zeilen
 * nachtragen sollte, selbst abbrach. Die Zahl im Buch (`tracked > 5`) taugt als
 * Merkmal nicht, sieben ist groesser als fuenf.
 *
 * Die 90 steht hier fest und darf das: eine bereits angewendete Migration wird
 * nicht mehr geaendert (siehe services/postgres/CLAUDE.md, "Forbidden").
 */
const SCHEMA_MIGRATION = 90;

/**
 * Migrationen, die in ihrer ausgelieferten Fassung nicht anwendbar sind und
 * deren Ergebnis eine SPAETERE Migration herstellt: Nummer -> Nummer.
 *
 * Warum es das gibt. Der Runner haelt beim ersten Fehlschlag an, und das ist
 * richtig: was nach einer misslungenen Migration kommt, rechnet mit einem
 * Schema, das es nicht gibt. Die Kehrseite hat sich am 27.08.2026 am Orin
 * gezeigt. Migration 169 laesst einen Typ fallen, an dem eine Funktion aus 014
 * haengt, die sie nicht mit auf ihre Loeschliste genommen hat:
 *
 *   ERROR: cannot drop type app_status because other objects depend on it
 *
 * Damit stand 169 mit `success = false` im Buch, und bei jedem Start versuchte
 * der Runner sie erneut, scheiterte erneut und kam nie zu einer Migration, die
 * den Fehler haette beheben koennen. Eine gescheiterte Migration war eine
 * Sackgasse, aus der nur eine Hand am Geraet herausfuehrt.
 *
 * Reparieren laesst sich das nur an einer von zwei Stellen: in der
 * gescheiterten Datei selbst oder hier. Die Datei steht im Buch und wird nicht
 * mehr geaendert (services/postgres/CLAUDE.md, "Forbidden"), auch keine
 * gescheiterte: sie ist der Beleg dafuer, was das Geraet versucht hat.
 *
 * Was hier steht, wird deshalb NICHT ANGEWENDET, sondern als erledigt
 * eingetragen -- und zwar nur, wenn die abloesende Datei wirklich auf der
 * Platte liegt. Das Buch beantwortet damit weiter die Frage, die der Runner
 * ihm stellt ("muss diese Datei noch laufen?"), und die Zeile im Log sagt,
 * warum die Antwort nein ist. Jede Nummer hier ist eine Entscheidung mit
 * Datum, keine Regel: eine Migration, die nicht drinsteht, haelt den Lauf
 * weiterhin an.
 */
const ABGELOEST = new Map([
  // 27.08.2026, Phase C3: 170_app_modell_reparatur_c3.sql tut, was 169 tun
  // wollte, und raeumt zusaetzlich check_app_dependencies() aus 014 weg.
  [169, 170],
]);

async function buchWiderspricht(client, buch) {
  const { rows: schema } = await client.query(
    `SELECT 1 FROM information_schema.schemata WHERE schema_name = 'arasul'`
  );
  if (schema.length === 0) {
    return false;
  }
  const { rows: gebucht } = await client.query(`SELECT 1 FROM ${buch} WHERE version = $1`, [
    SCHEMA_MIGRATION,
  ]);
  if (gebucht.length > 0) {
    return false;
  }
  logger.warn(
    `Migration Runner: das Schema arasul existiert, Migration ${SCHEMA_MIGRATION} steht aber nicht im Buch. ` +
      'Das Buch wird als unvollstaendig behandelt und nachgetragen, statt alles erneut anzuwenden.'
  );
  return true;
}

/**
 * Seed schema_migrations for an existing database that was set up by Docker init
 * (no tracking existed). Detects by checking if core tables exist but tracking is empty.
 */
async function seedExistingMigrations(client, files, buch) {
  // Check if this is an existing DB without tracking
  const trackingCount = await client.query(`SELECT COUNT(*) as count FROM ${buch}`);
  const tracked = parseInt(trackingCount.rows[0].count, 10);

  // If we already have substantial tracking, no seed needed — es sei denn, das
  // Buch widerspricht der Datenbank. Siehe buchWiderspricht.
  if (tracked > 5 && !(await buchWiderspricht(client, buch))) {
    return;
  }

  // Check if core tables from early migrations exist (Docker init ran them)
  const tableCheck = await client.query(`
    SELECT COUNT(*) as count FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('admin_users', 'chats', 'documents')
  `);
  const coreTablesExist = parseInt(tableCheck.rows[0].count, 10) >= 2;

  if (!coreTablesExist) {
    return;
  } // Fresh DB, no seeding needed

  // Seed: mark all migration files as "applied by Docker init"
  let seeded = 0;
  for (const migration of files) {
    const exists = await client.query(`SELECT 1 FROM ${buch} WHERE version = $1`, [
      migration.version,
    ]);
    if (exists.rows.length > 0) {
      continue;
    }

    const sql = fs.readFileSync(migration.filepath, 'utf8');
    const hash = checksum(sql);
    await client.query(
      `INSERT INTO ${buch} (version, filename, checksum, execution_ms, success)
       VALUES ($1, $2, $3, 0, true)
       ON CONFLICT (version) DO NOTHING`,
      [migration.version, migration.filename, hash]
    );
    seeded++;
  }

  if (seeded > 0) {
    logger.info(`Migration Runner: Seeded ${seeded} existing migrations (Docker init) in ${buch}`);
  }
}

/**
 * Get all SQL migration files sorted by version
 */
function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    logger.warn(`Migrations directory not found: ${MIGRATIONS_DIR}`);
    return [];
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(filename => ({
      filename,
      version: extractVersion(filename),
      filepath: path.join(MIGRATIONS_DIR, filename),
    }))
    .filter(m => m.version !== null)
    .sort((a, b) => {
      if (a.version !== b.version) {
        return a.version - b.version;
      }
      return a.filename.localeCompare(b.filename);
    });
}

/**
 * Run all pending migrations.
 * @param {import('pg').Pool} pool - Database pool
 * @returns {Object} { applied: number, skipped: number, failed: string|null }
 */
async function runMigrations(pool) {
  const client = await pool.connect();

  try {
    // Remove the 30s statement timeout for migrations (some are long)
    await client.query('SET statement_timeout = 0');

    // Einmal ermitteln, danach ueberall ausgeschrieben. Siehe ermittleBuchOrt.
    const buch = await ermittleBuchOrt(client);
    await ensureMigrationsTable(client, buch);

    // Vor jeder Anweisung: steht die Datenbank schon schief, wird nichts mehr
    // angewendet. Weitere DDL auf einem verdeckten Schema vertieft den Schaden
    // nur, und das Ergebnis waere nicht mehr zu unterscheiden von einem, das
    // nie kaputt war.
    const schattenVorher = await schattentabellen(client);
    if (schattenVorher.length > 0) {
      logger.error(
        `Migration Runner: ABBRUCH, ${schattenVorher.length} Tabelle(n) liegen doppelt in arasul und public: ` +
          `${schattenVorher.join(', ')}. Es wurde nichts angewendet.`
      );
      return { applied: 0, skipped: 0, failed: null, schatten: schattenVorher };
    }

    const files = getMigrationFiles();
    if (files.length === 0) {
      logger.info('Migration Runner: No migration files found');
      return { applied: 0, skipped: 0, failed: null, schatten: [] };
    }

    // Seed tracking for existing databases that Docker init already set up
    await seedExistingMigrations(client, files, buch);

    const applied = await getAppliedVersions(client, buch);
    const aufDerPlatte = new Set(files.map(m => m.version));

    let appliedCount = 0;
    let skippedCount = 0;

    for (const migration of files) {
      if (applied.has(migration.version)) {
        skippedCount++;
        continue;
      }

      // Abgeloest: nicht anwenden, als erledigt eintragen, weiter. Siehe
      // ABGELOEST. Der Eintrag faellt nur, wenn die abloesende Datei wirklich
      // da ist -- sonst bliebe ihre Arbeit ungetan und niemand saehe es.
      const abloeser = ABGELOEST.get(migration.version);
      if (abloeser !== undefined && aufDerPlatte.has(abloeser)) {
        const hash = checksum(fs.readFileSync(migration.filepath, 'utf8'));
        await client.query(
          `INSERT INTO ${buch} (version, filename, checksum, execution_ms, success)
           VALUES ($1, $2, $3, 0, true)
           ON CONFLICT (version) DO UPDATE SET
             filename = EXCLUDED.filename,
             checksum = EXCLUDED.checksum,
             execution_ms = 0,
             applied_at = NOW(),
             success = true`,
          [migration.version, migration.filename, hash]
        );
        skippedCount++;
        logger.warn(
          `Migration ${migration.filename} wird nicht angewendet: Migration ${abloeser} stellt ihr Ergebnis her.`
        );
        continue;
      }

      // Read and apply migration
      const sql = fs.readFileSync(migration.filepath, 'utf8');
      const hash = checksum(sql);
      const start = Date.now();

      try {
        await client.query('BEGIN');
        await client.query(sql);
        const durationMs = Date.now() - start;

        // Record success
        await client.query(
          `INSERT INTO ${buch} (version, filename, checksum, execution_ms, success)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT (version) DO UPDATE SET
             filename = EXCLUDED.filename,
             checksum = EXCLUDED.checksum,
             execution_ms = EXCLUDED.execution_ms,
             applied_at = NOW(),
             success = true`,
          [migration.version, migration.filename, hash, durationMs]
        );

        await client.query('COMMIT');
        appliedCount++;
        logger.info(`Migration ${migration.filename} applied (${durationMs}ms)`);
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr) {
          logger.error(`Migration rollback failed: ${rollbackErr.message}`);
        }

        // Record failure
        try {
          await client.query(
            `INSERT INTO ${buch} (version, filename, checksum, execution_ms, success)
             VALUES ($1, $2, $3, $4, false)
             ON CONFLICT (version) DO UPDATE SET
               filename = EXCLUDED.filename,
               checksum = EXCLUDED.checksum,
               execution_ms = EXCLUDED.execution_ms,
               applied_at = NOW(),
               success = false`,
            [migration.version, migration.filename, hash, Date.now() - start]
          );
        } catch (recordErr) {
          logger.error(`Failed to record migration failure: ${recordErr.message}`);
        }

        logger.error(`Migration ${migration.filename} FAILED: ${error.message}`);
        return {
          applied: appliedCount,
          skipped: skippedCount,
          failed: migration.filename,
          schatten: await schattentabellen(client),
        };
      }
    }

    if (appliedCount > 0) {
      logger.info(
        `Migration Runner: ${appliedCount} applied, ${skippedCount} skipped (Buch: ${buch})`
      );
    } else {
      logger.debug(`Migration Runner: All ${skippedCount} migrations already applied`);
    }

    // Danach noch einmal: eine Migration kann selbst eine Doppelung erzeugen,
    // ohne dabei zu scheitern. Genau so ist der Schaden am 19.08.2026
    // entstanden, und niemand hat es bemerkt.
    const schattenNachher = await schattentabellen(client);
    if (schattenNachher.length > 0) {
      logger.error(
        `Migration Runner: ${schattenNachher.length} Tabelle(n) liegen jetzt doppelt in arasul und public: ` +
          `${schattenNachher.join(', ')}. Die Anwendung liest ab hier die leere.`
      );
    }

    return {
      applied: appliedCount,
      skipped: skippedCount,
      failed: null,
      schatten: schattenNachher,
    };
  } finally {
    client.release();
  }
}

module.exports = { runMigrations, getMigrationFiles, extractVersion, schattentabellen };
