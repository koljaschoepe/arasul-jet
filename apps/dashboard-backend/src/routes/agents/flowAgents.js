/**
 * Flow-Agenten CRUD + Einzel-Lauf (Plan 010, Schritt 2) — gemountet unter /api/agents.
 *
 * Alle Nutzer dürfen ihre EIGENEN Agenten anlegen, bearbeiten, ausführen und
 * löschen (owner-scoped; fremd/unbekannt → 404). Dünne Routen: validieren →
 * Service/Runner → {data}-Envelope. Der Lauf streamt per SSE (Muster wie die
 * Datei-Agenten-Run-Route, Plan 008): der Stream öffnet lazy beim ersten Event,
 * damit 401/404 echte HTTP-Status bleiben.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middleware/auth');
const { llmLimiter } = require('../../middleware/rateLimit');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateBody, validateParams } = require('../../middleware/validate');
const { initSSE, trackConnection } = require('../../utils/sseHelper');
const {
  AgentIdParam,
  CreateAgentBody,
  UpdateAgentBody,
  RunAgentBody,
} = require('../../schemas/flowAgents');
const flowAgentsService = require('../../services/agents/flowAgentsService');
const runFlowAgent = require('../../services/agents/runFlowAgent');

// GET /api/agents — eigene Agenten auflisten
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const agents = await flowAgentsService.listAgents(req.user.id);
    res.json({ data: agents, total: agents.length, timestamp: new Date().toISOString() });
  })
);

// POST /api/agents — Agenten anlegen
router.post(
  '/',
  requireAuth,
  validateBody(CreateAgentBody),
  asyncHandler(async (req, res) => {
    const agent = await flowAgentsService.createAgent(req.user.id, req.user.role, req.body);
    res.status(201).json({ data: agent, timestamp: new Date().toISOString() });
  })
);

// GET /api/agents/:id — einen eigenen Agenten laden
router.get(
  '/:id',
  requireAuth,
  validateParams(AgentIdParam),
  asyncHandler(async (req, res) => {
    const agent = await flowAgentsService.getAgent(req.params.id, req.user.id);
    res.json({ data: agent, timestamp: new Date().toISOString() });
  })
);

// PUT /api/agents/:id — Agenten aktualisieren
router.put(
  '/:id',
  requireAuth,
  validateParams(AgentIdParam),
  validateBody(UpdateAgentBody),
  asyncHandler(async (req, res) => {
    const agent = await flowAgentsService.updateAgent(
      req.params.id,
      req.user.id,
      req.user.role,
      req.body
    );
    res.json({ data: agent, timestamp: new Date().toISOString() });
  })
);

// DELETE /api/agents/:id — Agenten löschen
router.delete(
  '/:id',
  requireAuth,
  validateParams(AgentIdParam),
  asyncHandler(async (req, res) => {
    await flowAgentsService.deleteAgent(req.params.id, req.user.id);
    res.json({ data: { id: req.params.id, deleted: true }, timestamp: new Date().toISOString() });
  })
);

// POST /api/agents/:id/run/stream — Agenten einmal ausführen, Ergebnis per SSE
router.post(
  '/:id/run/stream',
  requireAuth,
  llmLimiter,
  validateParams(AgentIdParam),
  validateBody(RunAgentBody),
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

    await runFlowAgent.runById({
      agentId: req.params.id,
      userId: req.user.id,
      trigger: 'manual',
      userInput: req.body.input,
      onEvent: send,
    });

    ensureSSE();
    if (!res.writableEnded) {
      res.end();
    }
  })
);

module.exports = router;
