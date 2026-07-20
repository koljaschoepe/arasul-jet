/**
 * Zod-Schemas für die Flow-Agenten-Routen (Plan 010).
 *
 * Bewusst getrennt von schemas/agents.js (Datei-Agenten, Plan 008): Flow-Agenten
 * sind eine eigene v2 mit eigenen DB-Tabellen und Routen.
 *
 * Schritt 1: nur die Admin-Provider-Key-Verwaltung. Agent-/Fluss-CRUD folgt in
 * späteren Schritten und wird hier ergänzt.
 */

const { z } = require('zod');

// Provider, für die ein API-Key verwaltet werden kann (ollama = lokal, keiner).
const KeyedProvider = z.enum(['openai', 'anthropic']);

const ProviderParam = z
  .object({
    provider: KeyedProvider,
  })
  .strict();

const SaveProviderKeyBody = z
  .object({
    apiKey: z.string().trim().min(1, 'apiKey darf nicht leer sein').max(500),
    baseUrl: z.string().trim().url('baseUrl muss eine gültige URL sein').max(500).optional(),
  })
  .strict();

// --- Agent-CRUD (Schritt 2) ---

const Provider = z.enum(['ollama', 'openai', 'anthropic']);

// Erlaubte Flow-Agent-Tools (Schritt 3). Muss mit flowToolRegistry.TOOL_CLASSES
// übereinstimmen — 'web' ist extern und greift zur Laufzeit nur bei allow_external.
const ToolName = z.enum(['rag', 'minio', 'n8n', 'web']);

const AgentIdParam = z
  .object({
    id: z.coerce.number().int().positive(),
  })
  .strict();

const CreateAgentBody = z
  .object({
    name: z.string().trim().min(1, 'Name darf nicht leer sein').max(120),
    description: z.string().max(2000).default(''),
    systemPrompt: z.string().max(20000).default(''),
    provider: Provider.default('ollama'),
    model: z.string().trim().max(200).default(''),
    tools: z.array(ToolName).max(20).default([]),
    allowExternal: z.boolean().default(false),
  })
  .strict();

// Update: alle Felder optional, aber mindestens eins vorhanden.
const UpdateAgentBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(2000).optional(),
    systemPrompt: z.string().max(20000).optional(),
    provider: Provider.optional(),
    model: z.string().trim().max(200).optional(),
    tools: z.array(ToolName).max(20).optional(),
    allowExternal: z.boolean().optional(),
  })
  .strict()
  .refine(obj => Object.keys(obj).length > 0, { message: 'Keine Felder zum Aktualisieren' });

const RunAgentBody = z
  .object({
    input: z.string().max(20000).default(''),
  })
  .strict();

module.exports = {
  ProviderParam,
  SaveProviderKeyBody,
  KeyedProvider,
  AgentIdParam,
  CreateAgentBody,
  UpdateAgentBody,
  RunAgentBody,
  Provider,
  ToolName,
};
