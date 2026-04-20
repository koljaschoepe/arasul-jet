const { z } = require('zod');

const CreateSpaceBody = z
  .object({
    name: z
      .string({ error: 'Name ist erforderlich' })
      .trim()
      .min(1, 'Name ist erforderlich')
      .max(200),
    description: z
      .string({ error: 'Beschreibung ist erforderlich' })
      .trim()
      .min(1, 'Beschreibung ist erforderlich')
      .max(4000),
    icon: z.string().trim().max(100).optional(),
    color: z.string().trim().max(50).optional(),
  })
  .strict();

const UpdateSpaceBody = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(4000).optional(),
    icon: z.string().trim().max(100).optional(),
    color: z.string().trim().max(50).optional(),
    sort_order: z.number().int().optional(),
  })
  .strict();

const RouteQueryBody = z
  .object({
    query: z
      .string({ error: 'Query ist erforderlich' })
      .trim()
      .min(1, 'Query ist erforderlich')
      .max(4000),
    top_k: z.number().int().min(1).max(20).optional(),
    threshold: z.number().min(0).max(1).optional(),
  })
  .strict();

module.exports = {
  CreateSpaceBody,
  UpdateSpaceBody,
  RouteQueryBody,
};
