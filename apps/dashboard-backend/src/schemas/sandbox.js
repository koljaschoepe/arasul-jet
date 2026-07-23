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

// Muss zu sandboxService/DB passen (Migrationen 074 + 100): 'isolated'
// (bridge, nur Internet), 'internal' (Backend-Netz mit LLM/DB-Zugriff) oder
// 'infrastructure' (wie internal + Plattform-Repo rw + Docker-Socket — nur
// Admin-Rolle, Durchsetzung in sandboxService). Die alten Docker-Level-Werte
// hier blockierten jede Projekt-Anlage mit Netzwerkwahl.
const NetworkMode = z.enum(['isolated', 'internal', 'infrastructure']).optional();

// Plan 012 Phase E · Schritt 13: Sandbox-Typ. 'standard' = normale Terminal-
// Sandbox; 'erweiterungs-werkstatt' = beim Anlegen mit Template-Wissen bestückt.
const WorkspaceType = z.enum(['standard', 'erweiterungs-werkstatt']).optional();

const CreateProjectBody = z
  .object({
    name: z.string().trim().min(1).max(64),
    // nullish: der Dialog schickte historisch null für "keine Beschreibung" —
    // tolerant annehmen statt 400 (Projekt-Anlage ohne Beschreibung schlug fehl)
    description: z
      .string()
      .trim()
      .max(500)
      .nullish()
      .transform(v => v ?? undefined),
    icon: z.string().max(32).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    baseImage: z.string().trim().min(1).max(128).optional(),
    resourceLimits: ResourceLimits.optional(),
    environment: EnvironmentMap,
    network_mode: NetworkMode,
    workspaceType: WorkspaceType,
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

// Params für die workspace-gebundenen Claude-Login-Routen (Plan 008,
// Schritt 14): identifiziert einen Workspace per Id oder Slug.
const WorkspaceParams = z
  .object({
    workspace: z.string().trim().min(1).max(100),
  })
  .strict();

module.exports = {
  CreateProjectBody,
  UpdateProjectBody,
  ListProjectsQuery,
  WorkspaceParams,
};
