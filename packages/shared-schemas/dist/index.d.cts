import { z } from 'zod';

declare const ErrorBody: z.ZodObject<{
    code: z.ZodString;
    message: z.ZodString;
    details: z.ZodOptional<z.ZodUnknown>;
}, z.core.$strict>;
declare const ErrorEnvelope: z.ZodObject<{
    error: z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        details: z.ZodOptional<z.ZodUnknown>;
    }, z.core.$strict>;
    timestamp: z.ZodString;
}, z.core.$strict>;
type ErrorBodyPayload = z.infer<typeof ErrorBody>;
type ErrorEnvelopePayload = z.infer<typeof ErrorEnvelope>;
declare const ERROR_CODES: readonly ["INTERNAL_ERROR", "VALIDATION_ERROR", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "RATE_LIMITED", "SERVICE_UNAVAILABLE"];
type KnownErrorCode = (typeof ERROR_CODES)[number];

export { ERROR_CODES, ErrorBody, type ErrorBodyPayload, ErrorEnvelope, type ErrorEnvelopePayload, type KnownErrorCode };
