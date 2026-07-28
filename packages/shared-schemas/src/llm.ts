import { z } from 'zod';

export const PrioritizeJobBody = z
  .object({
    job_id: z.string().trim().min(1).max(128),
  })
  .strict();

export type PrioritizeJobInput = z.infer<typeof PrioritizeJobBody>;

export const ChatBody = z
  .object({
    messages: z.array(z.record(z.string(), z.unknown()), {
      error: 'Messages array is required',
    }),
    conversation_id: z.union([z.string().min(1), z.number().int().positive()], {
      error: 'conversation_id is required for chat streaming',
    }),
    temperature: z.number().optional(),
    max_tokens: z.number().int().positive().optional(),
    stream: z.boolean().optional(),
    thinking: z.boolean().optional(),
    model: z.string().max(200).optional().nullable(),
    model_sequence: z.array(z.string().max(200)).max(10).optional().nullable(),
    priority: z.number().int().min(0).max(10).optional(),
    images: z
      .array(z.string())
      .max(5, 'Maximal 5 Bilder pro Nachricht erlaubt')
      .optional()
      .nullable(),
    // Agent-Modus (2026-07-28): Werkzeugschleife im Chat. `datei_modus` bittet
    // den Agenten ausdrücklich um eine Datei; `ablage_ziel` ist ein relativer
    // Zielordner in der Projektablage (per Drag & Drop gesetzt).
    agent: z.boolean().optional(),
    datei_modus: z.boolean().optional(),
    ablage_ziel: z
      .string()
      .trim()
      .max(500)
      .refine(v => !v.startsWith('/') && !v.split('/').includes('..'), {
        message: 'ablage_ziel muss relativ und ohne .. sein',
      })
      .optional()
      .nullable(),
  })
  .strict();

export type ChatInput = z.infer<typeof ChatBody>;
