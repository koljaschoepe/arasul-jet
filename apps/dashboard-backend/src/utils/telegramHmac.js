'use strict';

/**
 * HMAC-pseudonymise Telegram user IDs (Phase 6 DSGVO).
 *
 * Raw telegram_user_id values are personenbezogen (an identifier for an
 * individual). To keep the principle of data minimisation we hash them under
 * a server-side pepper before persisting. The pepper is mounted as a Docker
 * secret and resolved into process.env.TELEGRAM_USER_ID_PEPPER at boot.
 *
 * Output: lowercase hex SHA-256 (64 chars). The CHAR(64) column type and the
 * UNIQUE index on telegram_user_consent.telegram_user_id_hash both depend on
 * this format.
 */

const crypto = require('crypto');
const logger = require('./logger');

let cachedPepper = null;
let warned = false;

function getPepper() {
  if (cachedPepper) {
    return cachedPepper;
  }
  const pepper = process.env.TELEGRAM_USER_ID_PEPPER;
  if (!pepper || pepper.length < 16) {
    if (!warned) {
      logger.warn(
        'TELEGRAM_USER_ID_PEPPER is missing or too short (<16 chars). ' +
          'Telegram user IDs will be hashed against an empty pepper — ' +
          'add the Docker secret telegram_user_id_pepper before going to production.'
      );
      warned = true;
    }
    return ''; // proceed with empty pepper rather than crashing the bot
  }
  cachedPepper = pepper;
  return cachedPepper;
}

/**
 * Hash a Telegram user id (numeric or string) into the canonical 64-char hex form.
 * @param {number|string} telegramUserId
 * @returns {string|null} 64-char hex, or null if input was null/undefined
 */
function hashUserId(telegramUserId) {
  if (telegramUserId === null || telegramUserId === undefined) {
    return null;
  }
  return crypto.createHmac('sha256', getPepper()).update(String(telegramUserId)).digest('hex');
}

module.exports = { hashUserId };
