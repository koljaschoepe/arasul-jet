/**
 * Crypto Service for Telegram Bot Token Encryption
 * Uses AES-256-GCM (Authenticated Encryption)
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

/**
 * Get encryption key from environment variable
 * Falls back to deriving from JWT_SECRET if TELEGRAM_ENCRYPTION_KEY not set
 * @returns {Buffer} 32-byte encryption key
 */
function getEncryptionKey() {
  const envKey = process.env.TELEGRAM_ENCRYPTION_KEY;

  if (envKey && envKey.length >= KEY_LENGTH) {
    // Use first 32 bytes of the provided key
    return Buffer.from(envKey.slice(0, KEY_LENGTH), 'utf8');
  }

  if (envKey) {
    // Key provided but too short - derive using SHA-256
    logger.warn('TELEGRAM_ENCRYPTION_KEY is shorter than 32 characters, deriving key');
    return crypto.createHash('sha256').update(envKey).digest();
  }

  // Fallback to deriving from JWT_SECRET (defense-in-depth, still secure)
  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret) {
    logger.warn('TELEGRAM_ENCRYPTION_KEY not set, deriving from JWT_SECRET');
    // Use HKDF-like derivation to create separate key
    const derived = crypto.createHmac('sha256', jwtSecret)
      .update('telegram-token-encryption')
      .digest();
    return derived;
  }

  throw new Error('No encryption key available. Set TELEGRAM_ENCRYPTION_KEY or JWT_SECRET');
}

/**
 * Encrypt a plaintext string using AES-256-GCM
 * @param {string} plaintext - Text to encrypt
 * @returns {Object} { encrypted, iv, authTag } - All as hex strings
 */
function encrypt(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Plaintext must be a non-empty string');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

/**
 * Decrypt a ciphertext using AES-256-GCM
 * @param {string} encrypted - Hex-encoded ciphertext
 * @param {string} iv - Hex-encoded initialization vector
 * @param {string} authTag - Hex-encoded authentication tag
 * @returns {string} Decrypted plaintext
 */
function decrypt(encrypted, iv, authTag) {
  if (!encrypted || !iv || !authTag) {
    throw new Error('Missing required parameters for decryption');
  }

  const key = getEncryptionKey();
  const ivBuffer = Buffer.from(iv, 'hex');
  const authTagBuffer = Buffer.from(authTag, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
  decipher.setAuthTag(authTagBuffer);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Mask a token for display (show only last 4 characters)
 * @param {string} token - Full token
 * @returns {string} Masked token like "****XXXX"
 */
function maskToken(token) {
  if (!token || token.length < 4) {
    return '****';
  }
  const visiblePart = token.slice(-4);
  return `****${visiblePart}`;
}

/**
 * Validate that a token looks like a Telegram bot token
 * Format: {bot_id}:{random_string} e.g., 123456789:ABCDefGHIjklMNOpqrsTUVwxyz
 * @param {string} token - Token to validate
 * @returns {boolean} Whether token format is valid
 */
function isValidTokenFormat(token) {
  if (!token || typeof token !== 'string') {
    return false;
  }
  // Telegram bot tokens are typically {number}:{alphanumeric}, 40-50 chars
  const tokenPattern = /^\d{8,10}:[A-Za-z0-9_-]{35,}$/;
  return tokenPattern.test(token);
}

/**
 * Generate a secure random confirmation token
 * @returns {string} UUID v4 token
 */
function generateConfirmationToken() {
  return crypto.randomUUID();
}

module.exports = {
  encrypt,
  decrypt,
  maskToken,
  isValidTokenFormat,
  generateConfirmationToken,
  ALGORITHM,
  IV_LENGTH,
  AUTH_TAG_LENGTH
};
