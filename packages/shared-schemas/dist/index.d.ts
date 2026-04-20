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

export { ChatBody, type ChatInput, PrioritizeJobBody, type PrioritizeJobInput };
