const { z } = require('zod');

const RagQueryBody = z
  .object({
    query: z
      .string({ error: 'Query is required and must be a string' })
      .trim()
      .min(1, 'Query is required and must be a string')
      .max(4000),
    top_k: z.number().int().min(1).max(50).optional(),
    thinking: z.boolean().optional(),
    conversation_id: z.union([z.number().int().positive(), z.string().trim().min(1).max(200)]),
    space_ids: z.array(z.string().trim().min(1).max(200)).max(50).nullable().optional(),
    auto_routing: z.boolean().optional(),
    model: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .strict();

module.exports = {
  RagQueryBody,
};
