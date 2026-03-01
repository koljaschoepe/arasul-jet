/**
 * Token Encryption/Decryption Utilities
 *
 * AES-256-GCM encryption using a key derived from JWT_SECRET.
 * Shared between telegramApp routes and telegramSetupPollingService.
 */

const crypto = require('crypto');

/**
 * Derive a consistent encryption key from JWT_SECRET.
 * Throws if JWT_SECRET is not set (startup guard in jwt.js should prevent this).
 */
function getEncryptionKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set - cannot encrypt/decrypt tokens');
  }
  return crypto.scryptSync(secret, 'arasul-token-encryption', 32);
}

/**
 * Encrypt a token for database storage
 * @param {string} token - Plaintext token
 * @returns {Buffer} IV + AuthTag + Encrypted data
 */
function encryptToken(token) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, Buffer.from(encrypted, 'hex')]);
}

/**
 * Decrypt a token from database storage
 * @param {Buffer} encryptedBuffer - IV + AuthTag + Encrypted data
 * @returns {string|null} Decrypted token or null
 */
function decryptToken(encryptedBuffer) {
  if (!encryptedBuffer) {
    return null;
  }

  const key = getEncryptionKey();

  const iv = encryptedBuffer.slice(0, 16);
  const authTag = encryptedBuffer.slice(16, 32);
  const encrypted = encryptedBuffer.slice(32);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, null, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = { encryptToken, decryptToken };
