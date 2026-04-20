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
const { validateBody } = require('../../middleware/validate');
const { TailscaleConnectBody } = require('../../schemas/tailscale');

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
  validateBody(TailscaleConnectBody),
  asyncHandler(async (req, res) => {
    const { authKey, hostname } = req.body;

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
