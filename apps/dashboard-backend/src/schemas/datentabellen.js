const { z } = require('zod');

// POST /query/natural
const NaturalQueryBody = z
  .object({
    query: z
      .string({ error: 'Query parameter is required' })
      .trim()
      .min(5, 'Query is too short (minimum 5 characters)')
      .max(5000),
    tableSlug: z.string().trim().max(200).optional().nullable(),
  })
  .strict();

// POST /query/sql
const SqlQueryBody = z
  .object({
    sql: z
      .string({ error: 'SQL parameter is required' })
      .trim()
      .min(1, 'SQL parameter is required')
      .max(20000),
  })
  .strict();

module.exports = {
  NaturalQueryBody,
  SqlQueryBody,
};
