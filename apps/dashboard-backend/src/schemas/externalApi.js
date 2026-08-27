const { z } = require('zod');
const { ALLE_ENDPUNKTE } = require('../config/apiBereiche');

// POST /llm/chat
const ExternalLlmChatBody = z
  .object({
    prompt: z
      .string({ error: 'prompt is required and must be a string' })
      .min(1, 'prompt is required and must be a string')
      .max(100000),
    model: z.string().max(200).optional().nullable(),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().positive().max(32768).optional(),
    thinking: z.boolean().optional(),
    wait_for_result: z.boolean().optional(),
    timeout_seconds: z.number().int().positive().max(600).optional(),
  })
  .strict();

// POST /flows/:name/run — einen Flow extern auslösen (Plan 013, B8).
// Argumentwerte kommen als name→Wert (Strings/Zahlen/Booleans, wie im Chat);
// der Runner prüft sie gegen die Deklaration des Flows.
const ExternalFlowRunBody = z
  .object({
    args: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    wait_for_result: z.boolean().optional(),
    timeout_seconds: z.number().int().positive().max(1800).optional(),
  })
  .strict();

// POST /api-keys
const CreateApiKeyBody = z
  .object({
    name: z.string({ error: 'name is required' }).trim().min(1, 'name is required').max(200),
    description: z.string().max(2000).optional().nullable(),
    rate_limit_per_minute: z.number().int().positive().max(100000).optional(),
    // Nur Bereiche, die es gibt. Bis Phase C5 stand hier ein freier Text: ein
    // Tippfehler ergab einen Schluessel, der still nichts durfte, und der
    // Administrator suchte den Fehler beim Aufrufer. Seit es mit `app:deploy`
    // einen Bereich gibt, der wirklich etwas kostet, ist Raten hier nicht mehr
    // vertretbar.
    allowed_endpoints: z
      .array(
        z.enum(ALLE_ENDPUNKTE, {
          error: `Unbekannter Bereich. Erlaubt: ${ALLE_ENDPUNKTE.join(', ')}`,
        })
      )
      .max(ALLE_ENDPUNKTE.length)
      .optional(),
    expires_at: z.string().max(50).optional().nullable(),
  })
  .strict();

module.exports = {
  ExternalLlmChatBody,
  ExternalFlowRunBody,
  CreateApiKeyBody,
};
