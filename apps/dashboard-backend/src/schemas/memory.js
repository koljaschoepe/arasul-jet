const { z } = require('zod');

const UpdateProfileBody = z
  .object({
    profile: z
      .string({ error: 'profile (string) is required' })
      .min(1, 'profile (string) is required')
      .max(65536),
  })
  .strict();

const CreateProfileBody = z
  .object({
    companyName: z
      .string({ error: 'companyName is required' })
      .trim()
      .min(1, 'companyName is required')
      .max(200),
    industry: z.string().trim().max(200).optional(),
    teamSize: z.union([z.string().trim().max(50), z.number().int().nonnegative()]).optional(),
    products: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
    preferences: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const UpdateMemoryBody = z
  .object({
    content: z
      .string({ error: 'content (string) is required' })
      .min(1, 'content (string) is required')
      .max(65536),
  })
  .strict();

const DeleteAllBody = z
  .object({
    confirm: z.literal(true, { error: 'Set confirm: true to delete all memories' }),
  })
  .strict();

module.exports = {
  UpdateProfileBody,
  CreateProfileBody,
  UpdateMemoryBody,
  DeleteAllBody,
};
