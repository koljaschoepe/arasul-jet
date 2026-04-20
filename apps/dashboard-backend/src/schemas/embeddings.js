const { z } = require('zod');

// POST /api/embeddings
const EmbedBody = z
  .object({
    text: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)], {
      error: 'Text is required',
    }),
  })
  .strict();

module.exports = {
  EmbedBody,
};
