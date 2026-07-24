const { z } = require('zod');

const ProjectIdField = z.uuid('Ungültige Projekt-ID');

const CreateProjectBody = z
  .object({
    name: z
      .string({ error: 'Name ist erforderlich' })
      .trim()
      .min(1, 'Name ist erforderlich')
      .max(100),
    description: z.string().trim().max(4000).nullable().optional(),
    icon: z.string().trim().max(50).optional(),
    color: z.string().trim().max(50).optional(),
  })
  .strict();

const UpdateProjectBody = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    icon: z.string().trim().max(50).optional(),
    color: z.string().trim().max(50).optional(),
    sort_order: z.number().int().optional(),
  })
  .strict();

const SetActiveProjectBody = z
  .object({
    project_id: ProjectIdField,
  })
  .strict();

module.exports = {
  ProjectIdField,
  CreateProjectBody,
  UpdateProjectBody,
  SetActiveProjectBody,
};
