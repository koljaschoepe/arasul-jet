const { z } = require('zod');

// POST /webhook/n8n
const N8nWebhookBody = z
  .object({
    workflow_id: z
      .union([z.string(), z.number()], {
        error: 'Missing required fields: workflow_id, status',
      })
      .refine(v => (typeof v === 'string' ? v.length > 0 : true), {
        message: 'Missing required fields: workflow_id, status',
      }),
    workflow_name: z.string().max(500).optional().nullable(),
    execution_id: z.union([z.string(), z.number()]).optional().nullable(),
    status: z
      .string({ error: 'Missing required fields: workflow_id, status' })
      .trim()
      .min(1, 'Missing required fields: workflow_id, status')
      .max(100),
    error: z.string().max(10000).optional().nullable(),
    duration_ms: z.number().optional().nullable(),
  })
  .passthrough();

// POST /webhook/self-healing
const SelfHealingWebhookBody = z
  .object({
    action_type: z
      .string({ error: 'Missing required field: action_type' })
      .trim()
      .min(1, 'Missing required field: action_type')
      .max(100),
    service_name: z.string().max(200).optional().nullable(),
    reason: z.string().max(5000).optional().nullable(),
    success: z.boolean().optional(),
    duration_ms: z.number().optional().nullable(),
    error_message: z.string().max(10000).optional().nullable(),
  })
  .passthrough();

// POST /manual
const ManualEventBody = z
  .object({
    event_type: z.string().max(100).optional(),
    event_category: z.string().max(100).optional(),
    source_service: z.string().max(200).optional().nullable(),
    severity: z.string().max(50).optional(),
    title: z.string({ error: 'Title is required' }).trim().min(1, 'Title is required').max(500),
    message: z.string().max(20000).optional().nullable(),
  })
  .strict();

// PUT /settings — notification_settings upsert. HH:MM for quiet hours.
const TIME_REGEX = /^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;

const UpdateNotificationSettingsBody = z
  .object({
    channel: z.enum(['telegram', 'webhook', 'email', 'in_app']).optional(),
    enabled: z.boolean().optional(),
    event_types: z.array(z.string().max(100)).max(100).optional().nullable(),
    min_severity: z.enum(['info', 'warning', 'critical']).optional(),
    rate_limit_per_minute: z.number().int().nonnegative().max(10000).optional(),
    quiet_hours_start: z
      .string()
      .regex(TIME_REGEX, 'Ungültiges Zeitformat (HH:MM erwartet)')
      .optional()
      .nullable(),
    quiet_hours_end: z
      .string()
      .regex(TIME_REGEX, 'Ungültiges Zeitformat (HH:MM erwartet)')
      .optional()
      .nullable(),
    telegram_chat_id: z
      .union([z.string().trim().min(1).max(100), z.number().int()])
      .optional()
      .nullable(),
  })
  .strict();

// POST /test — test notification message
const TestNotificationBody = z
  .object({
    message: z.string().trim().min(1).max(4000).optional(),
  })
  .strict();

module.exports = {
  N8nWebhookBody,
  SelfHealingWebhookBody,
  ManualEventBody,
  UpdateNotificationSettingsBody,
  TestNotificationBody,
};
