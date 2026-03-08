/**
 * Password Service
 * Consolidated dashboard password change logic used by auth and settings routes
 */

const db = require('../../database');
const {
  verifyPassword,
  hashPassword,
  validatePasswordComplexity,
} = require('../../utils/password');
const { ValidationError, UnauthorizedError, NotFoundError } = require('../../utils/errors');
const logger = require('../../utils/logger');

/**
 * Change dashboard admin password
 *
 * Validates inputs, verifies current password, hashes new password,
 * updates the database and records in password history (atomically).
 *
 * @param {number} userId - admin_users.id
 * @param {string} currentPassword - plaintext current password
 * @param {string} newPassword - plaintext new password
 * @param {object} options
 * @param {string} options.username - for audit logging and history
 * @param {string} [options.ipAddress] - for password history
 * @returns {Promise<string>} the new password hash (for callers that need it)
 */
async function changeDashboardPassword(
  userId,
  currentPassword,
  newPassword,
  { username, ipAddress } = {}
) {
  // Validate input
  if (!currentPassword || !newPassword) {
    throw new ValidationError('Current password and new password are required');
  }

  // Validate new password complexity
  const validation = validatePasswordComplexity(newPassword);
  if (!validation.valid) {
    throw new ValidationError('Password does not meet complexity requirements', validation.errors);
  }

  // Get user's current password hash
  const result = await db.query('SELECT password_hash FROM admin_users WHERE id = $1', [userId]);

  if (result.rows.length === 0) {
    throw new NotFoundError('User not found');
  }

  const { password_hash } = result.rows[0];

  // Verify current password
  const passwordValid = await verifyPassword(currentPassword, password_hash);
  if (!passwordValid) {
    logger.warn(`Failed password change attempt for user: ${username || userId}`);
    throw new UnauthorizedError('Current password is incorrect');
  }

  // Check if new password is same as current
  const sameAsOld = await verifyPassword(newPassword, password_hash);
  if (sameAsOld) {
    throw new ValidationError('New password must be different from current password');
  }

  // Hash new password
  const newPasswordHash = await hashPassword(newPassword);

  // Use transaction for atomicity: password update + history record
  await db.transaction(async client => {
    await client.query(
      'UPDATE admin_users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newPasswordHash, userId]
    );

    await client.query(
      `INSERT INTO password_history (user_id, password_hash, changed_by, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [userId, newPasswordHash, username || null, ipAddress || null]
    );
  });

  logger.info(`Password changed for user: ${username || userId}`);

  return newPasswordHash;
}

module.exports = { changeDashboardPassword };
