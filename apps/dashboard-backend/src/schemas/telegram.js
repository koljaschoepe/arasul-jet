const { z } = require('zod');

const TELEGRAM_TOKEN_REGEX = /^\d+:[A-Za-z0-9_-]{35,}$/;

// ----------- bots.js -----------

const CreateBotBody = z
  .object({
    name: z
      .string({ error: 'Name und Token sind erforderlich' })
      .trim()
      .min(1, 'Name muss ein String mit 1-100 Zeichen sein')
      .max(100, 'Name muss ein String mit 1-100 Zeichen sein'),
    token: z
      .string({ error: 'Name und Token sind erforderlich' })
      .trim()
      .regex(TELEGRAM_TOKEN_REGEX, 'Ungültiges Telegram-Bot-Token-Format'),
    llmProvider: z.string().max(50).optional(),
    llmModel: z.string().max(200).optional(),
    systemPrompt: z.string().max(20000).optional(),
    claudeApiKey: z.string().max(500).optional().nullable(),
    ragEnabled: z.boolean().optional(),
    ragSpaceIds: z
      .array(z.union([z.string(), z.number()]))
      .max(50)
      .optional()
      .nullable(),
    ragShowSources: z.boolean().optional(),
    setupToken: z.string().max(200).optional(),
  })
  .strict();

const UpdateBotBody = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    llmProvider: z.string().max(50).optional(),
    llmModel: z.string().max(200).optional(),
    systemPrompt: z.string().max(20000).optional().nullable(),
    claudeApiKey: z.string().max(500).optional().nullable(),
    token: z.string().trim().regex(TELEGRAM_TOKEN_REGEX).optional(),
    ragEnabled: z.boolean().optional(),
    ragSpaceIds: z
      .array(z.union([z.string(), z.number()]))
      .max(50)
      .optional()
      .nullable(),
    ragShowSources: z.boolean().optional(),
    toolsEnabled: z.boolean().optional(),
    voiceEnabled: z.boolean().optional(),
    maxContextTokens: z.number().int().positive().max(1000000).optional(),
    maxResponseTokens: z.number().int().positive().max(100000).optional(),
    rateLimitPerMinute: z.number().int().nonnegative().max(1000).optional(),
    allowedUsers: z
      .array(z.union([z.string(), z.number()]))
      .max(1000)
      .optional()
      .nullable(),
    restrictUsers: z.boolean().optional(),
  })
  .strict();

const ValidateTokenBody = z
  .object({
    token: z
      .string({ error: 'Token ist erforderlich' })
      .trim()
      .min(1, 'Token ist erforderlich')
      .max(200),
  })
  .strict();

const CreateCommandBody = z
  .object({
    command: z
      .string({ error: 'Command, Beschreibung und Prompt sind erforderlich' })
      .trim()
      .min(1, 'Command, Beschreibung und Prompt sind erforderlich')
      .max(50),
    description: z
      .string({ error: 'Command, Beschreibung und Prompt sind erforderlich' })
      .trim()
      .min(1, 'Command, Beschreibung und Prompt sind erforderlich')
      .max(500),
    prompt: z
      .string({ error: 'Command, Beschreibung und Prompt sind erforderlich' })
      .trim()
      .min(1, 'Command, Beschreibung und Prompt sind erforderlich')
      .max(10000),
    sortOrder: z.number().int().optional(),
  })
  .strict();

const UpdateCommandBody = z
  .object({
    command: z.string().trim().min(1).max(50).optional(),
    description: z.string().trim().min(1).max(500).optional(),
    prompt: z.string().trim().min(1).max(10000).optional(),
    isEnabled: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();

const SetWebhookBody = z
  .object({
    url: z
      .string({ error: 'URL ist erforderlich' })
      .trim()
      .min(1, 'URL ist erforderlich')
      .max(2000),
  })
  .strict();

const TestMessageBody = z
  .object({
    chatId: z.union([z.string().trim().min(1), z.number().int()], {
      error: 'Chat-ID und Text sind erforderlich',
    }),
    text: z
      .string({ error: 'Chat-ID und Text sind erforderlich' })
      .trim()
      .min(1, 'Chat-ID und Text sind erforderlich')
      .max(4096),
  })
  .strict();

// ----------- settings.js -----------

const ThresholdValuesBody = z
  .object({
    thresholds: z.record(z.string(), z.unknown(), {
      error: 'Thresholds object is required',
    }),
  })
  .strict();

const TelegramTestBody = z
  .object({
    chat_id: z.union([z.string().trim().min(1).max(50), z.number().int()]).optional(),
  })
  .strict();

const AuditCleanupBody = z
  .object({
    retentionDays: z.number().int().positive().max(3650).optional(),
  })
  .strict();

module.exports = {
  CreateBotBody,
  UpdateBotBody,
  ValidateTokenBody,
  CreateCommandBody,
  UpdateCommandBody,
  SetWebhookBody,
  TestMessageBody,
  ThresholdValuesBody,
  TelegramTestBody,
  AuditCleanupBody,
};
