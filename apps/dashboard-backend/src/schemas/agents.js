/**
 * Zod schemas for the workspace-agent run surface (Plan 008, Schritt 11).
 * Params identify a workspace (id or slug) and an agent by name; the body
 * carries the user's free-text input.
 */

const { z } = require('zod');

// GET /api/sandbox/projects/:workspace/agenten
const AgentListParams = z
  .object({
    workspace: z.string().trim().min(1).max(100),
  })
  .strict();

// POST /api/sandbox/projects/:workspace/agenten/:agent/run/stream (params)
const RunAgentParams = z
  .object({
    workspace: z.string().trim().min(1).max(100),
    agent: z.string().trim().min(1).max(100),
  })
  .strict();

// POST body — the user's message to the agent (may be empty for a bare @agent).
const RunAgentBody = z
  .object({
    input: z.string().max(20000).default(''),
  })
  .strict();

module.exports = { AgentListParams, RunAgentParams, RunAgentBody };
