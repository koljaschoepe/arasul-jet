const { z } = require('zod');

const IdField = z.string().trim().min(1).max(200);

const PatchDocBody = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    category_id: z.number().int().positive().nullable().optional(),
    user_tags: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
    user_notes: z.string().max(10000).nullable().optional(),
    is_favorite: z.boolean().optional(),
  })
  .strict();

const MoveBody = z
  .object({
    space_id: IdField.nullable().optional(),
  })
  .strict();

const ContentBody = z
  .object({
    content: z.string({ error: 'Inhalt erforderlich' }).max(10 * 1024 * 1024),
  })
  .strict();

const SearchBody = z
  .object({
    query: z
      .string({ error: 'Suchbegriff erforderlich' })
      .trim()
      .min(1, 'Suchbegriff erforderlich')
      .max(2000),
    top_k: z.number().int().min(1).max(100).optional(),
    category_id: z.number().int().positive().optional(),
  })
  .strict();

const CreateMarkdownBody = z
  .object({
    filename: z
      .string({ error: 'Dateiname erforderlich' })
      .trim()
      .min(1, 'Dateiname erforderlich')
      .max(255),
    content: z
      .string()
      .max(10 * 1024 * 1024)
      .optional(),
    description: z.string().max(2000).optional(),
    space_id: IdField.nullable().optional(),
  })
  .strict();

const BatchIdsBody = z
  .object({
    ids: z
      .array(IdField)
      .min(1, 'Mindestens eine Dokument-ID erforderlich')
      .max(100, 'Maximal 100 Dokumente gleichzeitig'),
  })
  .strict();

const BatchMoveBody = z
  .object({
    ids: z
      .array(IdField)
      .min(1, 'Mindestens eine Dokument-ID erforderlich')
      .max(100, 'Maximal 100 Dokumente gleichzeitig'),
    space_id: IdField.nullable().optional(),
  })
  .strict();

module.exports = {
  PatchDocBody,
  MoveBody,
  ContentBody,
  SearchBody,
  CreateMarkdownBody,
  BatchIdsBody,
  BatchMoveBody,
};
