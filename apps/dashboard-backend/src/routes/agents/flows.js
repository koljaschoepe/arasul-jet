/**
 * Fluss-CRUD + Lauf (Plan 010, Schritt 4) — gemountet unter /api/agents/flows.
 *
 * Owner-scoped (fremd/unbekannt → 404). Dünne Routen: validieren → Service/
 * Runner → {data}-Envelope. Der Lauf streamt per SSE, jedes Frame trägt die
 * Knoten-ID (Multiplexing paralleler Zweige); der Stream öffnet lazy, damit
 * 401/404 echte HTTP-Status bleiben.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middleware/auth');
const { llmLimiter } = require('../../middleware/rateLimit');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateBody, validateParams } = require('../../middleware/validate');
const { initSSE, trackConnection } = require('../../utils/sseHelper');
const { FlowIdParam, CreateFlowBody, UpdateFlowBody, RunFlowBody } = require('../../schemas/flows');
const flowsService = require('../../services/agents/flowsService');
const runFlow = require('../../services/agents/runFlow');

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

module.exports = router;
