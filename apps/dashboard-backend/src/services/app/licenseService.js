/**
 * License Service — Hardware-bound offline license validation
 *
 * License keys are signed JWT-like tokens (actually signed JSON) containing:
 *   - customer name, hardware fingerprint, feature tier, expiry
 *
 * The hardware fingerprint is derived from stable machine identifiers
 * (machine-id, CPU serial, board model) so that a license is bound to
 * a specific Jetson device and cannot be transferred without re-issuance.
 *
 * All validation is offline — no phone-home required.
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const logger = require('../../utils/logger');
const db = require('../../database');

const execFileAsync = promisify(execFile);

const LICENSE_FILE = process.env.LICENSE_FILE || '/arasul/config/license.key';
const LICENSE_PUBLIC_KEY =
  process.env.LICENSE_PUBLIC_KEY_PATH || '/arasul/config/public_license_key.pem';
const GRACE_PERIOD_DAYS = parseInt(process.env.LICENSE_GRACE_PERIOD_DAYS || '30', 10);

// Feature tiers: what each license level unlocks
const FEATURE_TIERS = {
  community: {
    maxUsers: 1,
    maxDocuments: 100,
    maxWorkflows: 3,
    telegramBots: 0,
    rag: true,
    externalApi: false,
    customModels: false,
    priority: 0,
  },
  professional: {
    maxUsers: 5,
    maxDocuments: 10_000,
    maxWorkflows: 50,
    telegramBots: 3,
    rag: true,
    externalApi: true,
    customModels: false,
    priority: 1,
  },
  enterprise: {
    maxUsers: -1, // unlimited
    maxDocuments: -1,
    maxWorkflows: -1,
    telegramBots: -1,
    rag: true,
    externalApi: true,
    customModels: true,
    priority: 2,
  },
};

class LicenseService {
  constructor() {
    this._cachedLicense = null;
    this._cacheExpiry = 0;
    this._hardwareFingerprint = null;
  }

  /**
   * Generate a stable hardware fingerprint from machine identifiers.
   * Uses machine-id + CPU serial + board model, hashed to a fixed-length string.
   * Falls back gracefully when identifiers aren't available (dev machines).
   */
  async getHardwareFingerprint() {
    if (this._hardwareFingerprint) {return this._hardwareFingerprint;}

    const components = [];

    // 1. Machine ID (systemd)
    try {
      const machineId = (await fs.readFile('/etc/machine-id', 'utf8')).trim();
      if (machineId) {components.push(`mid:${machineId}`);}
    } catch {
      /* not available */
    }

    // 2. CPU serial (Jetson-specific, from /proc/cpuinfo)
    try {
      const cpuinfo = await fs.readFile('/proc/cpuinfo', 'utf8');
      const serialMatch = cpuinfo.match(/Serial\s*:\s*([0-9a-fA-F]+)/);
      if (serialMatch) {components.push(`cpu:${serialMatch[1]}`);}
    } catch {
      /* not available */
    }

    // 3. Board model (device-tree)
    try {
      const model = (await fs.readFile('/proc/device-tree/model', 'utf8'))
        .replace(/\0/g, '')
        .trim();
      if (model) {components.push(`model:${model}`);}
    } catch {
      /* not available */
    }

    // 4. Board serial (Jetson)
    try {
      const serial = (await fs.readFile('/proc/device-tree/serial-number', 'utf8'))
        .replace(/\0/g, '')
        .trim();
      if (serial) {components.push(`serial:${serial}`);}
    } catch {
      /* not available */
    }

    // Fallback: hostname + MAC address
    if (components.length === 0) {
      const os = require('os');
      components.push(`host:${os.hostname()}`);
      const interfaces = os.networkInterfaces();
      for (const iface of Object.values(interfaces)) {
        for (const addr of iface) {
          if (!addr.internal && addr.mac !== '00:00:00:00:00:00') {
            components.push(`mac:${addr.mac}`);
            break;
          }
        }
      }
    }

    const raw = components.sort().join('|');
    this._hardwareFingerprint = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
    return this._hardwareFingerprint;
  }

  /**
   * Read and validate the license file.
   * License format: base64(JSON payload) + '.' + base64(RSA signature)
   * @returns {{ valid: boolean, license?: object, error?: string, graceMode?: boolean }}
   */
  async validateLicense() {
    // Cache for 5 minutes to avoid disk/crypto on every request
    if (this._cachedLicense && Date.now() < this._cacheExpiry) {
      return this._cachedLicense;
    }

    try {
      // Check if license file exists
      let licenseData;
      try {
        licenseData = (await fs.readFile(LICENSE_FILE, 'utf8')).trim();
      } catch {
        return this._cacheResult({
          valid: false,
          error: 'No license file found',
          tier: 'community',
          features: FEATURE_TIERS.community,
        });
      }

      // Parse license: payload.signature
      const parts = licenseData.split('.');
      if (parts.length !== 2) {
        return this._cacheResult({
          valid: false,
          error: 'Invalid license format',
          tier: 'community',
          features: FEATURE_TIERS.community,
        });
      }

      const [payloadB64, signatureB64] = parts;
      const payloadBuffer = Buffer.from(payloadB64, 'base64');
      const signature = Buffer.from(signatureB64, 'base64');

      // Verify signature
      let publicKey;
      try {
        publicKey = await fs.readFile(LICENSE_PUBLIC_KEY, 'utf8');
      } catch {
        // No public key = can't verify, but allow grace mode
        logger.warn('License public key not found — running in grace mode');
        return this._cacheResult({
          valid: true,
          graceMode: true,
          tier: 'professional',
          features: FEATURE_TIERS.professional,
          warning: 'License key not configured — grace period active',
        });
      }

      const isValid = crypto.verify(
        'sha256',
        payloadBuffer,
        { key: publicKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING },
        signature
      );

      if (!isValid) {
        return this._cacheResult({
          valid: false,
          error: 'Invalid license signature',
          tier: 'community',
          features: FEATURE_TIERS.community,
        });
      }

      // Parse payload
      const license = JSON.parse(payloadBuffer.toString('utf8'));

      // Check hardware fingerprint
      const fingerprint = await this.getHardwareFingerprint();
      if (license.hardware_id && license.hardware_id !== fingerprint) {
        return this._cacheResult({
          valid: false,
          error: 'License is bound to a different device',
          tier: 'community',
          features: FEATURE_TIERS.community,
          expectedDevice: license.hardware_id,
          currentDevice: fingerprint,
        });
      }

      // Check expiry
      const now = new Date();
      const expiresAt = new Date(license.expires_at);
      const graceDeadline = new Date(expiresAt.getTime() + GRACE_PERIOD_DAYS * 86400_000);

      if (now > graceDeadline) {
        return this._cacheResult({
          valid: false,
          error: `License expired on ${expiresAt.toISOString().split('T')[0]} (grace period ended)`,
          tier: 'community',
          features: FEATURE_TIERS.community,
          expiredAt: license.expires_at,
        });
      }

      const isExpired = now > expiresAt;
      const tier = license.tier || 'professional';
      const features = FEATURE_TIERS[tier] || FEATURE_TIERS.professional;

      return this._cacheResult({
        valid: true,
        graceMode: isExpired,
        tier,
        features,
        customer: license.customer,
        issuedAt: license.issued_at,
        expiresAt: license.expires_at,
        daysRemaining: isExpired
          ? -Math.ceil((now - expiresAt) / 86400_000)
          : Math.ceil((expiresAt - now) / 86400_000),
        warning: isExpired
          ? `License expired — grace period ends ${graceDeadline.toISOString().split('T')[0]}`
          : undefined,
      });
    } catch (error) {
      logger.error(`License validation error: ${error.message}`);
      return this._cacheResult({
        valid: false,
        error: error.message,
        tier: 'community',
        features: FEATURE_TIERS.community,
      });
    }
  }

  /**
   * Check if a specific feature is allowed by the current license.
   * @param {string} feature - Feature key from FEATURE_TIERS
   * @returns {Promise<boolean>}
   */
  async isFeatureAllowed(feature) {
    const result = await this.validateLicense();
    if (!result.valid && !result.graceMode) {return false;}
    return !!result.features[feature];
  }

  /**
   * Check if a numeric limit is exceeded.
   * @param {string} limitKey - Key from FEATURE_TIERS (e.g., 'maxUsers')
   * @param {number} currentCount - Current count
   * @returns {Promise<{ allowed: boolean, limit: number, current: number }>}
   */
  async checkLimit(limitKey, currentCount) {
    const result = await this.validateLicense();
    const limit = result.features[limitKey];
    if (limit === undefined) {return { allowed: true, limit: -1, current: currentCount };}
    if (limit === -1) {return { allowed: true, limit: -1, current: currentCount };}
    return { allowed: currentCount < limit, limit, current: currentCount };
  }

  /**
   * Activate a license key (write to disk + validate).
   * @param {string} licenseKey - The license key string
   * @returns {{ success: boolean, license?: object, error?: string }}
   */
  async activateLicense(licenseKey) {
    // Invalidate cache
    this._cachedLicense = null;
    this._cacheExpiry = 0;

    // Write license file
    const dir = path.dirname(LICENSE_FILE);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(LICENSE_FILE, licenseKey.trim(), 'utf8');

    // Validate
    const result = await this.validateLicense();
    if (!result.valid && !result.graceMode) {
      // Remove invalid license
      await fs.unlink(LICENSE_FILE).catch(() => {});
      return { success: false, error: result.error };
    }

    logger.info(`License activated: tier=${result.tier}, customer=${result.customer}`);
    return { success: true, license: result };
  }

  /**
   * Get license info for display (safe, no secrets).
   */
  async getLicenseInfo() {
    const fingerprint = await this.getHardwareFingerprint();
    const license = await this.validateLicense();

    return {
      ...license,
      hardwareFingerprint: fingerprint,
      featureTiers: Object.keys(FEATURE_TIERS),
    };
  }

  /** Cache result for 5 minutes */
  _cacheResult(result) {
    this._cachedLicense = result;
    this._cacheExpiry = Date.now() + 300_000;
    return result;
  }
}

module.exports = new LicenseService();
module.exports.FEATURE_TIERS = FEATURE_TIERS;
