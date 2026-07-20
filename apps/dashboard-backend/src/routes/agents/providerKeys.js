/**
 * Admin-Routen für externe Modell-Provider-Keys (Plan 010, Schritt 1).
 *
 * Nur Admins dürfen Cloud-API-Keys sehen (Metadaten), setzen/rotieren und
 * löschen. Der Key selbst verlässt das Backend nie — die Liste zeigt nur, DASS
 * ein Key hinterlegt ist. Alle Routen: requireAuth → requireAdmin → asyncHandler,
 * geworfene custom errors (kein try/catch, kein throw new Error).
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateBody, validateParams } = require('../../middleware/validate');
const { NotFoundError } = require('../../utils/errors');
const { ProviderParam, SaveProviderKeyBody } = require('../../schemas/flowAgents');
const providerKeysService = require('../../services/agents/providerKeysService');
const { logSecurityEvent } = require('../../utils/auditLog');

// GET /api/agents/provider-keys — konfigurierte Provider auflisten (nur Metadaten)
router.get(
  '/',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const providers = await providerKeysService.listProviders();
    res.json({ data: providers, timestamp: new Date().toISOString() });
  })
);

// PUT /api/agents/provider-keys/:provider — Key anlegen/rotieren
router.put(
  '/:provider',
  requireAuth,
  requireAdmin,
  validateParams(ProviderParam),
  validateBody(SaveProviderKeyBody),
  asyncHandler(async (req, res) => {
    const saved = await providerKeysService.saveKey(req.params.provider, req.body, req.user.id);
    logSecurityEvent({
      userId: req.user.id,
      action: 'flow_provider_key_saved',
      details: { provider: req.params.provider },
      ipAddress: req.ip,
    });
    res.json({ data: saved, timestamp: new Date().toISOString() });
  })
);

// DELETE /api/agents/provider-keys/:provider — Key löschen
router.delete(
  '/:provider',
  requireAuth,
  requireAdmin,
  validateParams(ProviderParam),
  asyncHandler(async (req, res) => {
    const removed = await providerKeysService.deleteKey(req.params.provider);
    if (!removed) {
      throw new NotFoundError(`Kein Key für Provider "${req.params.provider}" hinterlegt`);
    }
    logSecurityEvent({
      userId: req.user.id,
      action: 'flow_provider_key_deleted',
      details: { provider: req.params.provider },
      ipAddress: req.ip,
    });
    res.json({
      data: { provider: req.params.provider, deleted: true },
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
