/**
 * License API routes
 * Handles license validation, activation, and feature gate queries
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ValidationError } = require('../../utils/errors');
const { validateBody } = require('../../middleware/validate');
const { ActivateLicenseBody } = require('../../schemas/admin-license');
const { logSecurityEvent } = require('../../utils/auditLog');
const licenseService = require('../../services/app/licenseService');
const logger = require('../../utils/logger');

// GET /api/license/info - Get current license status and hardware fingerprint
router.get(
  '/info',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const info = await licenseService.getLicenseInfo();

    res.json({
      ...info,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/license/fingerprint - Get device hardware fingerprint (for license provisioning)
router.get(
  '/fingerprint',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const fingerprint = await licenseService.getHardwareFingerprint();

    res.json({
      hardwareFingerprint: fingerprint,
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/license/activate - Activate a license key
router.post(
  '/activate',
  requireAuth,
  requireAdmin,
  validateBody(ActivateLicenseBody),
  asyncHandler(async (req, res) => {
    const { licenseKey } = req.body;

    const result = await licenseService.activateLicense(licenseKey);

    logSecurityEvent({
      userId: req.user.id,
      action: 'license_activate',
      details: {
        success: result.success,
        tier: result.license?.tier,
        customer: result.license?.customer,
        error: result.error,
      },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });

    if (!result.success) {
      throw new ValidationError(result.error || 'License activation failed');
    }

    logger.info(`License activated by ${req.user.username}: tier=${result.license.tier}`);

    res.json({
      success: true,
      license: result.license,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/license/check/:feature - Check if a feature is allowed
router.get(
  '/check/:feature',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { feature } = req.params;
    const allowed = await licenseService.isFeatureAllowed(feature);

    res.json({
      feature,
      allowed,
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
