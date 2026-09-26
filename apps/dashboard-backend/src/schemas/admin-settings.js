const { z } = require('zod');

// POST /password/dashboard — shape only
const PasswordChangeBody = z
  .object({
    currentPassword: z
      .string({ error: 'Current password and new password are required' })
      .min(1, 'Current password and new password are required')
      .max(500),
    newPassword: z
      .string({ error: 'Current password and new password are required' })
      .min(1, 'Current password and new password are required')
      .max(500),
  })
  .strict();

// PUT /firmenname — der Name des Unternehmens ueber dem Anmeldeformular.
// Leer heisst: keiner gesetzt, die Anmeldeseite zeigt den Produktnamen.
const FirmennameBody = z
  .object({
    firmenname: z
      .string({ error: 'firmenname muss eine Zeichenkette sein' })
      .trim()
      .max(120, 'Der Firmenname darf hoechstens 120 Zeichen lang sein'),
  })
  .strict();

// PATCH /sprachmodell — die Standardwerte, mit denen das Geraet ein Modell
// fragt (system_settings, gelesen von llmOllamaStream und systemPromptBuilder).
// Die Grenzen sind dieselben, die bis Phase B4 unter /api/rag/settings galten.
// Nur was mitkommt, wird geschrieben; null beim Kontextfenster heisst
// „Vorgabe des Modells", ein leerer Basis-Prompt heisst „eingebauter Prompt".
const SprachmodellBody = z
  .object({
    llm_num_ctx_default: z.number().int().min(512).max(131072).nullable().optional(),
    llm_keep_alive_seconds: z.number().int().min(0).max(86400).optional(),
    llm_num_predict_default: z.number().int().min(64).max(16384).optional(),
    llm_base_system_prompt: z.string().trim().max(4000).nullable().optional(),
  })
  .strict()
  .refine(body => Object.keys(body).length > 0, { message: 'Keine Einstellung angegeben' });

module.exports = {
  PasswordChangeBody,
  FirmennameBody,
  SprachmodellBody,
};
