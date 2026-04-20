const { z } = require('zod');

// POST /llm/chat
const ExternalLlmChatBody = z
  .object({
    prompt: z
      .string({ error: 'prompt is required and must be a string' })
      .min(1, 'prompt is required and must be a string')
      .max(100000),
    model: z.string().max(200).optional().nullable(),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().positive().max(32768).optional(),
    thinking: z.boolean().optional(),
    wait_for_result: z.boolean().optional(),
    timeout_seconds: z.number().int().positive().max(600).optional(),
  })
  .strict();

// POST /api-keys
const CreateApiKeyBody = z
  .object({
    name: z.string({ error: 'name is required' }).trim().min(1, 'name is required').max(200),
    description: z.string().max(2000).optional().nullable(),
    rate_limit_per_minute: z.number().int().positive().max(100000).optional(),
    allowed_endpoints: z.array(z.string().max(100)).max(50).optional(),
    expires_at: z.string().max(50).optional().nullable(),
  })
  .strict();

module.exports = {
  ExternalLlmChatBody,
  CreateApiKeyBody,
};
