/**
 * Security Audit Log utility
 * Logs high-value actions to the audit_logs table for compliance.
 * This is separate from the api_audit_logs middleware which captures ALL requests.
 */

const db = require('../database');
const logger = require('./logger');

/**
 * Write a security audit entry. Fire-and-forget — never blocks the request.
 * @param {Object} params
 * @param {number|null} params.userId - User ID (null for unauthenticated)
 * @param {string} params.action - Semantic action name
 * @param {Object} [params.details] - Action-specific context
 * @param {string} [params.ipAddress] - Client IP
 * @param {string} [params.requestId] - Correlation ID
 */
async function logSecurityEvent({
  userId,
  action,
  details = {},
  ipAddress = null,
  requestId = null,
}) {
  try {
    await db.query(
      `INSERT INTO audit_logs (user_id, action, details, ip_address, request_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, action, JSON.stringify(details), ipAddress, requestId]
    );
  } catch (err) {
    logger.warn(`Security audit log failed: ${err.message}`, { action, userId });
  }
}

module.exports = { logSecurityEvent };
