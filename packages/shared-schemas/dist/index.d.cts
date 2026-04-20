import { z } from 'zod';

declare const PrioritizeJobBody: z.ZodObject<{
    job_id: z.ZodString;
}, z.core.$strict>;
type PrioritizeJobInput = z.infer<typeof PrioritizeJobBody>;
declare const ChatBody: z.ZodObject<{
    messages: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    conversation_id: z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>;
    temperature: z.ZodOptional<z.ZodNumber>;
    max_tokens: z.ZodOptional<z.ZodNumber>;
    stream: z.ZodOptional<z.ZodBoolean>;
    thinking: z.ZodOptional<z.ZodBoolean>;
    model: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    model_sequence: z.ZodNullable<z.ZodOptional<z.ZodArray<z.ZodString>>>;
    priority: z.ZodOptional<z.ZodNumber>;
    images: z.ZodNullable<z.ZodOptional<z.ZodArray<z.ZodString>>>;
}, z.core.$strict>;
type ChatInput = z.infer<typeof ChatBody>;

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

export { ChatBody, type ChatInput, ERROR_CODES, ErrorBody, type ErrorBodyPayload, ErrorEnvelope, type ErrorEnvelopePayload, type KnownErrorCode, PrioritizeJobBody, type PrioritizeJobInput };
