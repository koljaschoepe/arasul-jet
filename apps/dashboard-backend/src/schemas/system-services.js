const { z } = require('zod');

// POST /llm/models/pull
const PullModelBody = z
  .object({
    model_name: z
      .string({ error: 'Der Modellname fehlt.' })
      .trim()
      .min(1, 'Der Modellname fehlt.')
      .max(200),
  })
  .strict();

module.exports = {
  PullModelBody,
};
