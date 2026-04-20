const { z } = require('zod');

const MAX_QUERY_LENGTH = 5000;

// POST /query
const TerminalQueryBody = z
  .object({
    query: z
      .string({ error: 'Query is required' })
      .min(1, 'Query is required')
      .max(MAX_QUERY_LENGTH, `Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters`),
    includeContext: z.boolean().optional(),
    timeout: z.number().int().positive().max(120000).optional(),
  })
  .strict();

module.exports = {
  TerminalQueryBody,
  MAX_QUERY_LENGTH,
};
