const { z } = require('zod');

const ResourceLimits = z
  .object({
    cpu: z.number().positive().max(64).optional(),
    memory: z
      .string()
      .regex(/^\d+[mMgG]?$/)
      .optional(),
    gpu: z.boolean().optional(),
  })
  .strict();

const EnvironmentMap = z.record(z.string(), z.string()).optional();

const NetworkMode = z.enum(['bridge', 'host', 'none', 'arasul']).optional();

const CreateProjectBody = z
  .object({
    name: z.string().trim().min(1).max(64),
    description: z.string().trim().max(500).optional(),
    icon: z.string().max(32).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    baseImage: z.string().trim().min(1).max(128).optional(),
    resourceLimits: ResourceLimits.optional(),
    environment: EnvironmentMap,
    network_mode: NetworkMode,
  })
  .strict();

const UpdateProjectBody = CreateProjectBody.partial();

const ListProjectsQuery = z
  .object({
    status: z.enum(['running', 'stopped', 'error', 'archived']).optional(),
    search: z.string().trim().max(128).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict();

module.exports = {
  CreateProjectBody,
  UpdateProjectBody,
  ListProjectsQuery,
};
