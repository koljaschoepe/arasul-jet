// src/llm.ts
import { z } from "zod";
var PrioritizeJobBody = z.object({
  job_id: z.string().trim().min(1).max(128)
}).strict();
var ChatBody = z.object({
  messages: z.array(z.record(z.string(), z.unknown()), {
    error: "Messages array is required"
  }),
  conversation_id: z.union([z.string().min(1), z.number().int().positive()], {
    error: "conversation_id is required for chat streaming"
  }),
  temperature: z.number().optional(),
  max_tokens: z.number().int().positive().optional(),
  stream: z.boolean().optional(),
  thinking: z.boolean().optional(),
  model: z.string().max(200).optional().nullable(),
  model_sequence: z.array(z.string().max(200)).max(10).optional().nullable(),
  priority: z.number().int().min(0).max(10).optional(),
  images: z.array(z.string()).max(5, "Maximal 5 Bilder pro Nachricht erlaubt").optional().nullable()
}).strict();
export {
  ChatBody,
  PrioritizeJobBody
};
