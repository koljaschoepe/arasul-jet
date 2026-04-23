/**
 * Bootstrap - runs migrations and ensures admin user exists on startup.
 * Solves two problems:
 * 1. Docker init scripts only run on FIRST database creation — the migration
 *    runner catches new migrations on software updates.
 * 2. No admin user exists on fresh deploy (chicken-and-egg with Setup Wizard).
 */

const fs = require('fs');
const db = require('./database');
const { hashPassword } = require('./utils/password');
const { runMigrations } = require('./migrationRunner');
const logger = require('./utils/logger');

const DEFAULT_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const DEFAULT_EMAIL = process.env.ADMIN_EMAIL || 'admin@arasul.local';

/**
 * Strip ADMIN_PASSWORD= lines from the mounted .env file so the plaintext
 * bootstrap password does not persist on disk after the admin user has been
 * created. No-op if the file is read-only or absent.
 */
function stripAdminPasswordFromEnvFile() {
  const envPath = process.env.ENV_FILE_PATH;
  if (!envPath) {return;}
  try {
    const original = fs.readFileSync(envPath, 'utf8');
    const cleaned = original.replace(/^ADMIN_PASSWORD=.*$\n?/gm, '');
    if (cleaned !== original) {
      fs.writeFileSync(envPath, cleaned, { mode: 0o600 });
      logger.info(`Bootstrap: ADMIN_PASSWORD removed from ${envPath}`);
    }
  } catch (err) {
    logger.warn(`Bootstrap: Could not clean ADMIN_PASSWORD from env file: ${err.message}`);
  }
}

/**
 * Run pending database migrations, then ensure admin user exists.
 */
async function bootstrap() {
  // Step 1: Run any pending migrations
  try {
    const result = await runMigrations(db.pool);
    if (result.failed) {
      logger.error(`Bootstrap: Migration ${result.failed} failed — admin user creation may fail`);
    }
  } catch (error) {
    logger.error(`Bootstrap: Migration runner error: ${error.message}`);
  }

  // Step 2: Ensure admin user exists
  await ensureAdminUser();
}

async function ensureAdminUser() {
  try {
    // Check if any admin user exists
    const result = await db.query('SELECT COUNT(*) as count FROM admin_users');
    const count = parseInt(result.rows[0].count, 10);

    if (count > 0) {
      logger.debug(`Bootstrap: ${count} admin user(s) exist, skipping`);
      return;
    }

    // No admin users - create one
    const password = process.env.ADMIN_PASSWORD;
    if (!password || password === 'REDACTED_AFTER_BOOTSTRAP') {
      logger.error(
        'Bootstrap: No admin users exist and ADMIN_PASSWORD is not available. ' +
          'Re-run "./arasul setup" and "./arasul bootstrap" to create an admin user.'
      );
      return;
    }

    const passwordHash = await hashPassword(password);

    await db.query(
      `INSERT INTO admin_users (username, password_hash, email, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, true, NOW(), NOW())
       ON CONFLICT (username) DO NOTHING`,
      [DEFAULT_USERNAME, passwordHash, DEFAULT_EMAIL]
    );

    logger.info(`Bootstrap: Created initial admin user "${DEFAULT_USERNAME}"`);

    // Remove plaintext password from process environment
    delete process.env.ADMIN_PASSWORD;
    logger.info('Bootstrap: ADMIN_PASSWORD removed from process environment');

    // Remove plaintext password from .env file so it does not survive a restart
    stripAdminPasswordFromEnvFile();
  } catch (error) {
    // Table might not exist yet on very first run - don't crash
    if (error.message && error.message.includes('does not exist')) {
      logger.warn('Bootstrap: admin_users table not yet created, will retry on next start');
    } else {
      logger.error(`Bootstrap: Failed to ensure admin user: ${error.message}`);
    }
  }
}

module.exports = { bootstrap, ensureAdminUser };
