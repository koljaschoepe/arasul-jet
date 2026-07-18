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

// POST /api/sandbox/projects/:workspace/agenten/token (params) — token route
// operates on a whole workspace, so it only needs the workspace ref.
const AgentTokenParams = AgentListParams;

// POST body for the EXTERNAL (token-authenticated) run route. Called by n8n
// or any HTTP client, so we are lenient about the field name (`input` or the
// German `eingabe`) and about extra keys the caller may attach — everything
// is normalised down to a single `input` string. Unknown keys are dropped by
// the transform rather than rejected, so a webhook body isn't brittle.
const ExternalRunAgentBody = z
  .object({
    input: z.string().max(20000).optional(),
    eingabe: z.string().max(20000).optional(),
  })
  .passthrough()
  .transform(data => ({ input: data.input ?? data.eingabe ?? '' }));

module.exports = {
  AgentListParams,
  RunAgentParams,
  RunAgentBody,
  AgentTokenParams,
  ExternalRunAgentBody,
};
