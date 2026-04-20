const { z } = require('zod');

// Workspaces
const CreateWorkspaceBody = z
  .object({
    name: z
      .string({ error: 'Name und Host-Pfad sind erforderlich' })
      .trim()
      .min(1, 'Name und Host-Pfad sind erforderlich')
      .max(100)
      .regex(
        /^[a-zA-Z0-9\s\-_äöüÄÖÜß]+$/,
        'Ungültiger Name. Nur Buchstaben, Zahlen, Leerzeichen und Bindestriche erlaubt.'
      ),
    description: z.string().max(1000).optional(),
    hostPath: z
      .string({ error: 'Name und Host-Pfad sind erforderlich' })
      .trim()
      .min(1, 'Name und Host-Pfad sind erforderlich')
      .max(1000),
  })
  .strict();

const UpdateWorkspaceBody = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9\s\-_äöüÄÖÜß]+$/, 'Ungültiger Name')
      .optional(),
    description: z.string().max(1000).optional(),
  })
  .strict();

// Workflows
const WorkflowExecutionBody = z
  .object({
    workflow_name: z
      .string({ error: 'workflow_name is required' })
      .trim()
      .min(1, 'workflow_name is required')
      .max(255),
    execution_id: z.union([z.string().max(100), z.number().int()]).optional(),
    status: z.enum(['success', 'error', 'running', 'waiting'], {
      error: 'status must be one of: success, error, running, waiting',
    }),
    duration_ms: z.number().int().nonnegative().optional(),
    error: z.string().max(10000).optional().nullable(),
  })
  .strict();

// AppStore
const AppUninstallBody = z
  .object({
    removeVolumes: z.boolean().optional(),
  })
  .strict();

const AppRestartBody = z
  .object({
    applyConfig: z.boolean().optional(),
    async: z.boolean().optional(),
  })
  .strict();

const AppConfigBody = z
  .object({
    config: z.record(z.string(), z.unknown(), {
      error: 'Ungültige Konfiguration: config muss ein Objekt sein',
    }),
  })
  .strict()
  .refine(v => Object.keys(v.config).length <= 50, {
    message: 'Zu viele Konfigurationseinträge (max. 50)',
    path: ['config'],
  });

module.exports = {
  CreateWorkspaceBody,
  UpdateWorkspaceBody,
  WorkflowExecutionBody,
  AppUninstallBody,
  AppRestartBody,
  AppConfigBody,
};
