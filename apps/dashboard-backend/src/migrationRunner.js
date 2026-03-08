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
  if (!match) {return null;}
  return parseInt(match[1], 10);
}

/**
 * Compute SHA-256 checksum of file content
 */
function checksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Ensure schema_migrations table exists (bootstrap for existing databases)
 */
async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
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
async function getAppliedVersions(client) {
  const result = await client.query('SELECT version FROM schema_migrations WHERE success = true');
  return new Set(result.rows.map(r => r.version));
}

/**
 * Seed schema_migrations for an existing database that was set up by Docker init
 * (no tracking existed). Detects by checking if core tables exist but tracking is empty.
 */
async function seedExistingMigrations(client, files) {
  // Check if this is an existing DB without tracking
  const trackingCount = await client.query('SELECT COUNT(*) as count FROM schema_migrations');
  const tracked = parseInt(trackingCount.rows[0].count, 10);

  // If we already have substantial tracking, no seed needed
  if (tracked > 5) {return;}

  // Check if core tables from early migrations exist (Docker init ran them)
  const tableCheck = await client.query(`
    SELECT COUNT(*) as count FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('admin_users', 'chats', 'documents')
  `);
  const coreTablesExist = parseInt(tableCheck.rows[0].count, 10) >= 2;

  if (!coreTablesExist) {return;} // Fresh DB, no seeding needed

  // Seed: mark all migration files as "applied by Docker init"
  let seeded = 0;
  for (const migration of files) {
    const exists = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [
      migration.version,
    ]);
    if (exists.rows.length > 0) {continue;}

    const sql = fs.readFileSync(migration.filepath, 'utf8');
    const hash = checksum(sql);
    await client.query(
      `INSERT INTO schema_migrations (version, filename, checksum, execution_ms, success)
       VALUES ($1, $2, $3, 0, true)
       ON CONFLICT (version) DO NOTHING`,
      [migration.version, migration.filename, hash]
    );
    seeded++;
  }

  if (seeded > 0) {
    logger.info(`Migration Runner: Seeded ${seeded} existing migrations (Docker init)`);
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
      if (a.version !== b.version) {return a.version - b.version;}
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

    await ensureMigrationsTable(client);

    const files = getMigrationFiles();
    if (files.length === 0) {
      logger.info('Migration Runner: No migration files found');
      return { applied: 0, skipped: 0, failed: null };
    }

    // Seed tracking for existing databases that Docker init already set up
    await seedExistingMigrations(client, files);

    const applied = await getAppliedVersions(client);

    let appliedCount = 0;
    let skippedCount = 0;

    for (const migration of files) {
      if (applied.has(migration.version)) {
        skippedCount++;
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
          `INSERT INTO schema_migrations (version, filename, checksum, execution_ms, success)
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
            `INSERT INTO schema_migrations (version, filename, checksum, execution_ms, success)
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
        return { applied: appliedCount, skipped: skippedCount, failed: migration.filename };
      }
    }

    if (appliedCount > 0) {
      logger.info(`Migration Runner: ${appliedCount} applied, ${skippedCount} skipped`);
    } else {
      logger.debug(`Migration Runner: All ${skippedCount} migrations already applied`);
    }

    return { applied: appliedCount, skipped: skippedCount, failed: null };
  } finally {
    client.release();
  }
}

module.exports = { runMigrations, getMigrationFiles, extractVersion };
