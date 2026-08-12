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
    // Projektablage-Anschluss (Batch 3): der Ablage-Ordner dieses Projekts wird
    // beim Container-Start rw als /workspace/projekt gemountet. null = trennen.
    project_id: z.uuid('Ungültige Projekt-ID').nullish(),
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

// Zentraler KI-Zugang (Plan 013): Abo-Token (mode 'token' → CLAUDE_CODE_OAUTH_TOKEN)
// oder API-Key (mode 'apikey' → ANTHROPIC_API_KEY). Der Wert wird verschlüsselt
// abgelegt und nie an den Client zurückgegeben.
const ClaudeAuthBody = z
  .object({
    mode: z.enum(['token', 'apikey']),
    value: z.string().trim().min(10).max(8192),
  })
  .strict();

// Abschluss des eigenen OAuth-PKCE-Handshakes (Plan 015, Phase 3): der Nutzer
// fügt den auf der Anthropic-Callback-Seite angezeigten Code ein — Form `CODE#STATE`
// oder nur `CODE` plus separates `state`-Feld. Der State schützt gegen CSRF.
const ClaudeOAuthCompleteBody = z
  .object({
    code: z.string().trim().min(1).max(4096),
    state: z.string().trim().min(1).max(512).optional(),
  })
  .strict();

// Projekt-Verbindungen (Plan 017 Schritt 5). `env` = eine Umgebungsvariable
// (name = Variablenname, value = Geheimwert); `mcp` = ein MCP-Server (command +
// args; value = optionaler Token, der als Env unter valueEnv injiziert wird).
// Der Wert wird verschlüsselt abgelegt und nie zurückgegeben.
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
// MCP-Server-Name: landet als TOML-Sektionskopf ([mcp_servers.<name>]) und als
// JSON-Schlüssel in .mcp.json — daher hart auf ein sicheres Zeichenset
// begrenzt (kein Punkt/Klammer/Whitespace, sonst Config-Injection möglich).
const MCP_NAME_RE = /^[A-Za-z0-9_-]{1,60}$/;

const CreateConnectionBody = z
  .object({
    kind: z.enum(['env', 'mcp']).default('env'),
    name: z.string().trim().min(1).max(100),
    value: z.string().max(8192).optional(),
    // Nur für kind='mcp':
    command: z.string().trim().max(200).optional(),
    args: z.array(z.string().max(500)).max(50).optional(),
    valueEnv: z.string().trim().regex(ENV_NAME_RE).max(100).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.kind === 'env') {
      if (!ENV_NAME_RE.test(val.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['name'],
          message: 'Bei einer Env-Verbindung muss der Name ein gültiger Variablenname sein',
        });
      }
      if (val.value === undefined || val.value.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['value'],
          message: 'Bei einer Env-Verbindung ist ein Wert erforderlich',
        });
      }
    }
    if (val.kind === 'mcp') {
      if (!val.command) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['command'],
          message: 'Bei einem MCP-Server ist ein command erforderlich',
        });
      }
      if (!MCP_NAME_RE.test(val.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['name'],
          message: 'MCP-Server-Name: nur Buchstaben, Ziffern, _ und - (max. 60 Zeichen)',
        });
      }
    }
  });

const UpdateConnectionBody = z
  .object({
    value: z.string().max(8192).optional(),
    command: z.string().trim().min(1).max(200).optional(),
    args: z.array(z.string().max(500)).max(50).optional(),
    valueEnv: z.string().trim().regex(ENV_NAME_RE).max(100).optional(),
  })
  .strict();

const ProjectIdParams = z.object({ id: z.string().trim().min(1).max(100) }).strict();
const ConnectionIdParams = z
  .object({
    id: z.string().trim().min(1).max(100),
    connId: z.string().uuid(),
  })
  .strict();

// Sitzungs-Titel umbenennen (Plan 017 Schritt 6): Schlüssel Projekt + tmux-Name.
const TMUX_NAME_RE = /^[A-Za-z0-9_-]{1,40}$/;
const SessionTitleParams = z
  .object({
    id: z.string().trim().min(1).max(100),
    tmux: z.string().trim().regex(TMUX_NAME_RE, 'Ungültiger tmux-Name'),
  })
  .strict();
const SessionTitleBody = z.object({ title: z.string().trim().min(1).max(80) }).strict();

module.exports = {
  CreateProjectBody,
  UpdateProjectBody,
  ListProjectsQuery,
  WorkspaceParams,
  ClaudeAuthBody,
  ClaudeOAuthCompleteBody,
  CreateConnectionBody,
  UpdateConnectionBody,
  ProjectIdParams,
  ConnectionIdParams,
  SessionTitleParams,
  SessionTitleBody,
};
