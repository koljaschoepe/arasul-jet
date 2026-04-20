const { z } = require('zod');

// POST /llm/models/pull
const PullModelBody = z
  .object({
    model_name: z
      .string({ error: 'Model name is required' })
      .trim()
      .min(1, 'Model name is required')
      .max(200),
  })
  .strict();

module.exports = {
  PullModelBody,
};
