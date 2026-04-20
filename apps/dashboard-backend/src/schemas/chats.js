const { z } = require('zod');

const ProjectIdField = z.union([
  z.number().int().positive(),
  z.string().trim().min(1).max(200),
  z.null(),
]);

const CreateChatBody = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    project_id: ProjectIdField.optional(),
  })
  .strict();

const PostMessageBody = z
  .object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().min(1),
    thinking: z.string().optional().nullable(),
  })
  .strict();

const PatchChatBody = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    project_id: ProjectIdField.optional(),
  })
  .strict()
  .refine(v => v.title !== undefined || v.project_id !== undefined, {
    message: 'Title or project_id is required',
  });

const PatchChatSettingsBody = z
  .object({
    use_rag: z.boolean().optional(),
    use_thinking: z.boolean().optional(),
    preferred_model: z.string().max(200).nullable().optional(),
    preferred_space_id: z.string().max(200).nullable().optional(),
  })
  .strict()
  .refine(
    v =>
      v.use_rag !== undefined ||
      v.use_thinking !== undefined ||
      v.preferred_model !== undefined ||
      v.preferred_space_id !== undefined,
    { message: 'Mindestens ein Setting muss angegeben werden' }
  );

module.exports = {
  CreateChatBody,
  PostMessageBody,
  PatchChatBody,
  PatchChatSettingsBody,
};
