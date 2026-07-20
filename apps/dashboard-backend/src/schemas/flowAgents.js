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

module.exports = { ProviderParam, SaveProviderKeyBody, KeyedProvider };
