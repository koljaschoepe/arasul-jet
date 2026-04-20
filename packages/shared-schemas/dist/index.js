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

// src/errors.ts
import { z as z2 } from "zod";
var ErrorBody = z2.object({
  code: z2.string().min(1),
  message: z2.string().min(1),
  details: z2.unknown().optional()
}).strict();
var ErrorEnvelope = z2.object({
  error: ErrorBody,
  timestamp: z2.string().min(1)
}).strict();
var ERROR_CODES = [
  "INTERNAL_ERROR",
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE"
];
export {
  ChatBody,
  ERROR_CODES,
  ErrorBody,
  ErrorEnvelope,
  PrioritizeJobBody
};
