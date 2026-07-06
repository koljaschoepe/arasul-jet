/**
 * Setup-on-first-login service.
 *
 * The appliance ships without an admin: `./arasul bootstrap` runs fully
 * unattended and creates NO admin user. The first person to open the dashboard
 * on the LAN creates the admin account (username + password) directly in the
 * web UI — the only thing ever asked. Once an admin exists this path is closed,
 * so a provisioned box cannot be claimed by a later visitor.
 */

const db = require('../../database');
const { hashPassword } = require('../../utils/password');
const { ConflictError } = require('../../utils/errors');
const logger = require('../../utils/logger');

/**
 * @returns {Promise<boolean>} true while the box has no admin user yet.
 */
async function isSetupNeeded() {
  const result = await db.query('SELECT COUNT(*)::int AS count FROM admin_users');
  return result.rows[0].count === 0;
}

/**
 * Create the first admin account. Race-safe: the INSERT only fires while
 * admin_users is empty, so two concurrent claimers cannot both succeed.
 *
 * @param {{username: string, password: string, email?: string}} input
 * @returns {Promise<{id: number, username: string, email: string|null}>}
 * @throws {ConflictError} if an admin already exists (setup already done).
 */
async function createFirstAdmin({ username, password, email }) {
  const passwordHash = await hashPassword(password);

  // Conditional insert: only writes when no admin exists yet. If another
  // request won the race, rowCount is 0 and we reject.
  const result = await db.query(
    `INSERT INTO admin_users (username, password_hash, email, role, is_active, created_at, updated_at)
     SELECT $1, $2, $3, 'admin', true, NOW(), NOW()
     WHERE NOT EXISTS (SELECT 1 FROM admin_users)
     RETURNING id, username, email`,
    [username, passwordHash, email || null]
  );

  if (result.rows.length === 0) {
    throw new ConflictError('Setup already completed — an admin account already exists');
  }

  logger.info(`Setup: created first admin user "${username}" via web onboarding`);
  return result.rows[0];
}

module.exports = { isSetupNeeded, createFirstAdmin };
