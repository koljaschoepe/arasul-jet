// src/errors.ts
import { z } from "zod";
var ErrorBody = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional()
}).strict();
var ErrorEnvelope = z.object({
  error: ErrorBody,
  timestamp: z.string().min(1)
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
  ERROR_CODES,
  ErrorBody,
  ErrorEnvelope
};
