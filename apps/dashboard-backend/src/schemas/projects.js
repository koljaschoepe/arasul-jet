const { z } = require('zod');

const IdField = z.string().trim().min(1).max(200);

const CreateProjectBody = z
  .object({
    name: z
      .string({ error: 'Name ist erforderlich' })
      .trim()
      .min(1, 'Name ist erforderlich')
      .max(100, 'Name darf maximal 100 Zeichen lang sein'),
    description: z.string().max(2000).optional(),
    system_prompt: z.string().max(20000).optional(),
    icon: z.string().trim().max(100).optional(),
    color: z.string().trim().max(50).optional(),
    knowledge_space_id: IdField.nullable().optional(),
  })
  .strict();

const UpdateProjectBody = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name darf nicht leer sein')
      .max(100, 'Name darf maximal 100 Zeichen lang sein')
      .optional(),
    description: z.string().max(2000).optional(),
    system_prompt: z.string().max(20000).optional(),
    icon: z.string().trim().max(100).optional(),
    color: z.string().trim().max(50).optional(),
    knowledge_space_id: IdField.nullable().optional(),
  })
  .strict();

module.exports = {
  CreateProjectBody,
  UpdateProjectBody,
};
