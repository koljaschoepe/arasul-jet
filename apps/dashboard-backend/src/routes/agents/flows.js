/**
 * Fluss-CRUD + Lauf (Plan 010, Schritt 4) — gemountet unter /api/agents/flows.
 *
 * Owner-scoped (fremd/unbekannt → 404). Dünne Routen: validieren → Service/
 * Runner → {data}-Envelope. Der Lauf streamt per SSE, jedes Frame trägt die
 * Knoten-ID (Multiplexing paralleler Zweige); der Stream öffnet lazy, damit
 * 401/404 echte HTTP-Status bleiben.
 */

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const router = express.Router();
const { requireAuth } = require('../../middleware/auth');
const { llmLimiter, webhookLimiter } = require('../../middleware/rateLimit');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateBody, validateParams } = require('../../middleware/validate');
const { UnauthorizedError, ServiceUnavailableError } = require('../../utils/errors');
const { initSSE, trackConnection } = require('../../utils/sseHelper');
const {
  FlowIdParam,
  CreateFlowBody,
  UpdateFlowBody,
  RunFlowBody,
  ExternalRunFlowBody,
} = require('../../schemas/flows');
const flowsService = require('../../services/agents/flowsService');
const runFlow = require('../../services/agents/runFlow');
const { logSecurityEvent } = require('../../utils/auditLog');

// GET /api/agents/flows — eigene Flüsse auflisten
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const flows = await flowsService.listFlows(req.user.id);
    res.json({ data: flows, total: flows.length, timestamp: new Date().toISOString() });
  })
);

// POST /api/agents/flows — Fluss anlegen
router.post(
  '/',
  requireAuth,
  validateBody(CreateFlowBody),
  asyncHandler(async (req, res) => {
    const flow = await flowsService.createFlow(req.user.id, req.body);
    res.status(201).json({ data: flow, timestamp: new Date().toISOString() });
  })
);

// GET /api/agents/flows/:id — einen Fluss laden
router.get(
  '/:id',
  requireAuth,
  validateParams(FlowIdParam),
  asyncHandler(async (req, res) => {
    const flow = await flowsService.getFlow(req.params.id, req.user.id);
    res.json({ data: flow, timestamp: new Date().toISOString() });
  })
);

// PUT /api/agents/flows/:id — Fluss aktualisieren
router.put(
  '/:id',
  requireAuth,
  validateParams(FlowIdParam),
  validateBody(UpdateFlowBody),
  asyncHandler(async (req, res) => {
    const flow = await flowsService.updateFlow(req.params.id, req.user.id, req.body);
    res.json({ data: flow, timestamp: new Date().toISOString() });
  })
);

// DELETE /api/agents/flows/:id — Fluss löschen
router.delete(
  '/:id',
  requireAuth,
  validateParams(FlowIdParam),
  asyncHandler(async (req, res) => {
    await flowsService.deleteFlow(req.params.id, req.user.id);
    res.json({ data: { id: req.params.id, deleted: true }, timestamp: new Date().toISOString() });
  })
);

// POST /api/agents/flows/:id/run/stream — Fluss ausführen, Knoten-Events per SSE
router.post(
  '/:id/run/stream',
  requireAuth,
  llmLimiter,
  validateParams(FlowIdParam),
  validateBody(RunFlowBody),
  asyncHandler(async (req, res) => {
    let sseStarted = false;
    const ensureSSE = () => {
      if (!sseStarted) {
        initSSE(res);
        trackConnection(res);
        sseStarted = true;
      }
    };
    const send = evt => {
      ensureSSE();
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(evt)}\n\n`);
      }
    };

    await runFlow.runById({
      flowId: req.params.id,
      userId: req.user.id,
      trigger: 'manual',
      input: req.body.input,
      onEvent: send,
    });

    ensureSSE();
    if (!res.writableEnded) {
      res.end();
    }
  })
);

// POST /api/agents/flows/:id/token — Webhook-Token (neu) erzeugen/rotieren.
// Cookie/Session-authentifiziert, owner-scoped. Der Klartext-Token wird EINMAL
// zurückgegeben; gespeichert wird nur sein bcrypt-Hash (ersetzt einen früheren).
router.post(
  '/:id/token',
  requireAuth,
  validateParams(FlowIdParam),
  asyncHandler(async (req, res) => {
    // Existenz + Ownership (wirft 404 für fremd/unbekannt).
    const flow = await flowsService.getFlow(req.params.id, req.user.id);

    const token = `flrun_${crypto.randomBytes(32).toString('base64url')}`;
    const tokenHash = await bcrypt.hash(token, 10);
    await flowsService.setRunTokenHash(flow.id, tokenHash);

    logSecurityEvent({
      userId: req.user.id,
      action: 'flow_run_token_rotated',
      details: { flowId: flow.id },
      ipAddress: req.ip,
    });

    res.status(201).json({
      token,
      message:
        'Dieses Token wird nur EINMAL angezeigt und ersetzt ein zuvor erzeugtes. ' +
        'Sicher speichern — es kann nicht erneut abgerufen werden.',
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/agents/flows/:id/run — externer, token-authentifizierter Lauf (n8n).
// NICHT cookie-authentifiziert: Authorization: Bearer <token>. Ein JSON rein,
// ein JSON raus (nicht-streamend). Jeder Fehlermodus (fehlend/unbekannt/kein
// Token gesetzt/falsch) fällt auf ein einzelnes 401 zurück, damit die Route
// nicht verrät, welche Flüsse existieren. Erfolg autorisiert ALS OWNER.
router.post(
  '/:id/run',
  webhookLimiter,
  validateParams(FlowIdParam),
  validateBody(ExternalRunFlowBody),
  asyncHandler(async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const token = bearer || String(req.headers['x-flow-token'] || '').trim();
    if (!token) {
      throw new UnauthorizedError('Fluss-Token erforderlich (Authorization: Bearer <token>)');
    }

    const flow = await flowsService.getFlowByIdUnscoped(req.params.id);
    const hash = flow && flow.runTokenHash;
    if (!hash || !(await bcrypt.compare(token, hash))) {
      throw new UnauthorizedError('Ungültiges oder fehlendes Fluss-Token');
    }

    // Als Owner ausführen (userId = flow.user_id) — die Engine-interne
    // Owner-Prüfung der Agenten passt damit.
    const run = await runFlow.runById({
      flowId: flow.id,
      userId: flow.userId,
      trigger: 'webhook',
      input: req.body.input,
    });
    if (run.error) {
      throw new ServiceUnavailableError(`Fluss-Lauf fehlgeschlagen: ${run.error}`);
    }

    res.json({ result: run.result, timestamp: new Date().toISOString() });
  })
);

module.exports = router;
