/**
 * Update Signature Verification Service
 *
 * Handles cryptographic verification of update packages:
 * - RSA-PSS with SHA-256 signature validation
 * - Public key format checking
 * - File integrity verification (hash computation)
 * - DB audit logging of verification events
 *
 * Extracted from updateService.js for maintainability.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const logger = require('../../utils/logger');
const db = require('../../database');

const DEFAULT_PUBLIC_KEY_PATH = '/arasul/config/public_update_key.pem';

/**
 * Verify digital signature of update package with comprehensive checks
 * @param {string} updateFilePath - Path to the update package
 * @param {string} signatureFilePath - Path to the signature file
 * @returns {Promise<{valid: boolean, hash?: string, error?: string}>}
 */
async function verifySignature(updateFilePath, signatureFilePath) {
  try {
    const publicKeyPath = process.env.UPDATE_PUBLIC_KEY_PATH || DEFAULT_PUBLIC_KEY_PATH;

    // Check if public key exists
    try {
      await fs.access(publicKeyPath);
    } catch (error) {
      logger.error(`Public key not found at ${publicKeyPath}`);
      return { valid: false, error: 'Public key not found - update system not configured' };
    }

    // Read public key
    const publicKey = await fs.readFile(publicKeyPath, 'utf8');

    // Validate public key format
    if (
      !publicKey.includes('-----BEGIN PUBLIC KEY-----') &&
      !publicKey.includes('-----BEGIN RSA PUBLIC KEY-----')
    ) {
      logger.error('Invalid public key format');
      return { valid: false, error: 'Invalid public key format' };
    }

    // Check if signature file exists
    try {
      await fs.access(signatureFilePath);
    } catch (error) {
      logger.error(`Signature file not found at ${signatureFilePath}`);
      return { valid: false, error: 'Signature file not found' };
    }

    // Read signature
    const signature = await fs.readFile(signatureFilePath);

    // Validate signature is not empty
    if (signature.length === 0) {
      logger.error('Signature file is empty');
      return { valid: false, error: 'Empty signature file' };
    }

    // Check update file exists and is not empty
    try {
      const stats = await fs.stat(updateFilePath);
      if (stats.size === 0) {
        logger.error('Update file is empty');
        return { valid: false, error: 'Empty update file' };
      }
      logger.info(
        `Verifying signature for update file (${(stats.size / 1024 / 1024).toFixed(2)} MB)`
      );
    } catch (error) {
      logger.error(`Update file not accessible: ${error.message}`);
      return { valid: false, error: 'Update file not accessible' };
    }

    // Read update file
    const updateData = await fs.readFile(updateFilePath);

    // Calculate hash of update file for logging
    const hashSum = crypto.createHash('sha256');
    hashSum.update(updateData);
    const fileHash = hashSum.digest('hex');
    logger.info(`Update file SHA256: ${fileHash}`);

    // Verify signature using RSA-PSS with SHA-256 (matches sign_update_package.py)
    const isValid = crypto.verify(
      'sha256',
      updateData,
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX_LEN,
      },
      signature
    );

    if (isValid) {
      logger.info(`Signature verification successful for ${path.basename(updateFilePath)}`);

      // Log verification event to database
      try {
        await db.query(
          `INSERT INTO update_events (version_from, version_to, status, source, details)
                       VALUES ($1, $2, $3, $4, $5)`,
          [
            process.env.SYSTEM_VERSION || 'unknown',
            'pending',
            'signature_verified',
            'dashboard',
            JSON.stringify({ file_hash: fileHash, file_size: updateData.length }),
          ]
        );
      } catch (dbError) {
        logger.warn(`Failed to log verification event: ${dbError.message}`);
      }

      return { valid: true, hash: fileHash };
    } else {
      logger.error(`Signature verification FAILED for ${path.basename(updateFilePath)}`);
      logger.error(`This update package may be tampered with or corrupted`);

      // Log failed verification
      try {
        await db.query(
          `INSERT INTO update_events (version_from, version_to, status, source, error)
                       VALUES ($1, $2, $3, $4, $5)`,
          [
            process.env.SYSTEM_VERSION || 'unknown',
            'unknown',
            'signature_verification_failed',
            'dashboard',
            'Invalid signature - possible tampering',
          ]
        );
      } catch (dbError) {
        logger.warn(`Failed to log failed verification: ${dbError.message}`);
      }

      return { valid: false, error: 'Invalid signature - update rejected' };
    }
  } catch (error) {
    logger.error(`Signature verification error: ${error.message}`);
    return { valid: false, error: `Verification failed: ${error.message}` };
  }
}

module.exports = { verifySignature };
