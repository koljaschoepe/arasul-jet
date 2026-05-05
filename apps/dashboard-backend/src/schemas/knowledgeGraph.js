const { z } = require('zod');

// POST /query
const KgQueryBody = z
  .object({
    question: z
      .string({ error: 'question ist erforderlich' })
      .trim()
      .min(1, 'question ist erforderlich')
      .max(5000, 'Frage zu lang (max. 5000 Zeichen)'),
    include_documents: z.boolean().optional(),
    max_depth: z.number().int().positive().max(10).optional(),
    max_entities: z.number().int().positive().max(50).optional(),
  })
  .strict();

module.exports = {
  KgQueryBody,
};
