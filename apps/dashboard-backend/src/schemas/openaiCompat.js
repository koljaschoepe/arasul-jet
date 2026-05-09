const { z } = require('zod');

const ChatMessage = z
  .object({
    role: z.enum(['system', 'user', 'assistant', 'tool']),
    content: z.union([z.string(), z.null()]).optional(),
    name: z.string().max(200).optional(),
  })
  .passthrough();

const ChatCompletionsBody = z
  .object({
    model: z.string().max(200).optional().nullable(),
    messages: z.array(ChatMessage).min(1, 'messages must contain at least one entry'),
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().min(0).max(1).optional(),
    max_tokens: z.number().int().positive().max(32768).optional(),
    stream: z.boolean().optional(),
    user: z.string().max(200).optional(),
  })
  .passthrough();

const EmbeddingsBody = z
  .object({
    model: z.string().max(200).optional().nullable(),
    input: z.union([z.string().min(1), z.array(z.string().min(1)).min(1).max(500)], {
      error: 'input is required (string or array of strings)',
    }),
    encoding_format: z.enum(['float', 'base64']).optional(),
    user: z.string().max(200).optional(),
  })
  .passthrough();

module.exports = {
  ChatCompletionsBody,
  EmbeddingsBody,
};
