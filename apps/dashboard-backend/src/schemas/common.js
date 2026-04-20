const { z } = require('zod');

const PositiveIntIdParam = z
  .object({
    id: z.coerce.number().int().positive().max(2147483647),
  })
  .strict();

const UuidIdParam = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

const ModelIdParam = z
  .object({
    modelId: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/),
  })
  .strict();

module.exports = {
  PositiveIntIdParam,
  UuidIdParam,
  ModelIdParam,
};
