import { z } from 'zod';

export const ErrorBody = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  })
  .strict();

export const ErrorEnvelope = z
  .object({
    error: ErrorBody,
    timestamp: z.string().min(1),
  })
  .strict();

export type ErrorBodyPayload = z.infer<typeof ErrorBody>;
export type ErrorEnvelopePayload = z.infer<typeof ErrorEnvelope>;

export const ERROR_CODES = [
  'INTERNAL_ERROR',
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
] as const;

export type KnownErrorCode = (typeof ERROR_CODES)[number];
