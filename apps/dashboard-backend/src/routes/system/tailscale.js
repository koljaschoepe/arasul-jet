/**
 * Tailscale API routes
 * Provides remote access status, peer info, and connect/disconnect controls.
 */

const express = require('express');
const router = express.Router();
const tailscaleService = require('../../services/network/tailscaleService');
const logger = require('../../utils/logger');
const { asyncHandler } = require('../../middleware/errorHandler');
const { requireAuth } = require('../../middleware/auth');
const { ValidationError } = require('../../utils/errors');

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/tailscale/status
 * Get current Tailscale connection status
 */
router.get(
  '/status',
  asyncHandler(async (req, res) => {
    const status = await tailscaleService.getStatus();
    res.json(status);
  })
);

/**
 * GET /api/tailscale/peers
 * Get list of connected Tailscale peers
 */
router.get(
  '/peers',
  asyncHandler(async (req, res) => {
    const peers = await tailscaleService.getPeers();
    res.json({ peers });
  })
);

/**
 * POST /api/tailscale/install
 * Install Tailscale on the host system
 */
router.post(
  '/install',
  asyncHandler(async (req, res) => {
    logger.info(`Tailscale installation requested by user ${req.user?.username}`);
    const result = await tailscaleService.install();
    res.json(result);
  })
);

/**
 * POST /api/tailscale/connect
 * Connect to Tailscale with auth key
 * Body: { authKey: string, hostname?: string }
 */
router.post(
  '/connect',
  asyncHandler(async (req, res) => {
    const { authKey, hostname } = req.body;

    if (!authKey || typeof authKey !== 'string') {
      throw new ValidationError('Auth-Key ist erforderlich');
    }

    if (!authKey.startsWith('tskey-') || authKey.length < 20 || authKey.length > 100) {
      throw new ValidationError(
        'Ungueltiger Auth-Key (muss mit tskey- beginnen und 20-100 Zeichen lang sein)'
      );
    }

    if (hostname !== undefined && hostname !== null) {
      if (
        typeof hostname !== 'string' ||
        hostname.length === 0 ||
        hostname.length > 63 ||
        !/^[a-zA-Z0-9-]+$/.test(hostname)
      ) {
        throw new ValidationError(
          'Hostname muss 1-63 Zeichen lang sein und darf nur Buchstaben, Ziffern und Bindestriche enthalten'
        );
      }
    }

    logger.info(`Tailscale connect requested by user ${req.user?.username}`);
    const status = await tailscaleService.connect(authKey, hostname);
    res.json(status);
  })
);

/**
 * POST /api/tailscale/disconnect
 * Disconnect from Tailscale
 */
router.post(
  '/disconnect',
  asyncHandler(async (req, res) => {
    logger.info(`Tailscale disconnect requested by user ${req.user?.username}`);
    const result = await tailscaleService.disconnect();
    res.json(result);
  })
);

module.exports = router;
