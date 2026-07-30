const { z } = require('zod');

const CreateChatBody = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

/**
 * Relativer Ablage-Pfad (wie schemas/projects.js): nie absolut, nie mit '..'.
 * Hier dupliziert statt importiert, damit die Chat-Schemas eigenständig bleiben.
 */
const DateiPfad = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(p => !p.startsWith('/') && !p.split('/').includes('..'), {
    message: 'Pfad muss relativ und ohne .. sein',
  });

/** Datei-Verweis einer Nachricht (Karte im Chat, Migration 127). */
const PutMessageDateiBody = z
  .object({
    art: z.literal('projektdatei'),
    project_id: z.uuid(),
    pfad: DateiPfad,
    name: z.string().trim().min(1).max(255),
  })
  .strict();

const PostMessageBody = z
  .object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().min(1),
    thinking: z.string().optional().nullable(),
    // Chat-Anhang (Ein-Ordner-Modell): der ins Projekt hochgeladene Anhang
    // hängt als Projektdatei-Karte direkt an der Nutzer-Nachricht.
    datei: PutMessageDateiBody.optional(),
  })
  .strict();

const PatchChatBody = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .refine(v => v.title !== undefined, {
    message: 'Title is required',
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
  PutMessageDateiBody,
  PatchChatBody,
  PatchChatSettingsBody,
};
