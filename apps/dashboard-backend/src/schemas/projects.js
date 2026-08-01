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

// --- Projektablage (Datei-API) ---------------------------------------------
// Pfade sind RELATIV zum Projektordner. Die harte Einsperrung übernimmt der
// Service (resolveRealWithinRoots); das Schema hält nur Offensichtliches fern.
const AblagePfad = z
  .string({ error: 'Pfad ist erforderlich' })
  .trim()
  .min(1, 'Pfad ist erforderlich')
  .max(500)
  .refine(p => !p.startsWith('/'), 'Pfad muss relativ sein')
  .refine(p => !p.split('/').includes('..'), 'Pfad darf nicht nach oben zeigen');

const ProjectIdParams = z.object({ id: ProjectIdField }).strict();

const AblageReadQuery = z.object({ pfad: AblagePfad }).strict();

const AblageSucheQuery = z
  .object({ q: z.string().trim().min(2, 'Mindestens 2 Zeichen').max(200) })
  .strict();

const AblageWriteBody = z
  .object({
    pfad: AblagePfad,
    inhalt: z.string().max(1_100_000, 'Datei zu groß für den Editor (max. 1 MB)'),
  })
  .strict();

const AblageOrdnerBody = z.object({ pfad: AblagePfad }).strict();

const AblageDeleteQuery = z.object({ pfad: AblagePfad }).strict();

const AblageMoveBody = z.object({ von: AblagePfad, nach: AblagePfad }).strict();

// Ohne pfad: der ganze Projektordner (als .tar.gz).
const AblageDownloadQuery = z
  .object({
    pfad: z
      .string()
      .trim()
      .max(500)
      .refine(p => !p.startsWith('/'), 'Pfad muss relativ sein')
      .refine(p => !p.split('/').includes('..'), 'Pfad darf nicht nach oben zeigen')
      .optional(),
  })
  .strict();

module.exports = {
  ProjectIdField,
  ProjectIdParams,
  CreateProjectBody,
  UpdateProjectBody,
  SetActiveProjectBody,
  AblagePfad,
  AblageReadQuery,
  AblageSucheQuery,
  AblageWriteBody,
  AblageOrdnerBody,
  AblageDeleteQuery,
  AblageMoveBody,
  AblageDownloadQuery,
};
