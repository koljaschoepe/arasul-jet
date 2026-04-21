const { z } = require('zod');

const TIME_REGEX = /^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;

// PUT /quiet-hours/:dayOfWeek — shape of a single day's quiet-hours update
const UpdateQuietHoursDayBody = z
  .object({
    enabled: z.boolean().optional(),
    start_time: z
      .string()
      .regex(TIME_REGEX, 'Ungültiges Startzeit-Format (HH:MM erwartet)')
      .optional()
      .nullable(),
    end_time: z
      .string()
      .regex(TIME_REGEX, 'Ungültiges Endzeit-Format (HH:MM erwartet)')
      .optional()
      .nullable(),
  })
  .strict();

// PUT /quiet-hours — batch update
const BatchQuietHoursBody = z
  .object({
    days: z.array(z.record(z.string(), z.unknown()), {
      error: 'Array von Tagen erwartet',
    }),
  })
  .strict();

// POST /test-webhook
const TestWebhookBody = z
  .object({
    webhook_url: z
      .string({ error: 'Webhook-URL ist erforderlich' })
      .trim()
      .min(1, 'Webhook-URL ist erforderlich')
      .url('Ungültige Webhook-URL')
      .max(2000),
    webhook_secret: z.string().max(500).optional().nullable(),
  })
  .strict();

// PUT /settings — global alert settings (whitelist must match alertEngine.updateSettings validFields)
const UpdateAlertSettingsBody = z
  .object({
    alerts_enabled: z.boolean().optional(),
    webhook_enabled: z.boolean().optional(),
    webhook_url: z.string().trim().url('Ungültige Webhook-URL').max(2000).optional().nullable(),
    webhook_secret: z.string().max(500).optional().nullable(),
    in_app_notifications: z.boolean().optional(),
    audio_enabled: z.boolean().optional(),
    max_history_entries: z.number().int().positive().max(100000).optional(),
  })
  .strict();

// PUT /thresholds/:metricType
const UpdateThresholdBody = z
  .object({
    warning_threshold: z.number().min(0).max(100).optional(),
    critical_threshold: z.number().min(0).max(100).optional(),
    enabled: z.boolean().optional(),
    cooldown_seconds: z.number().int().nonnegative().max(86400).optional(),
    description: z.string().max(1000).optional().nullable(),
  })
  .strict()
  .refine(
    v =>
      v.warning_threshold === undefined ||
      v.critical_threshold === undefined ||
      v.warning_threshold < v.critical_threshold,
    { message: 'Warnschwelle muss kleiner als kritische Schwelle sein' }
  );

module.exports = {
  UpdateQuietHoursDayBody,
  BatchQuietHoursBody,
  TestWebhookBody,
  UpdateAlertSettingsBody,
  UpdateThresholdBody,
};
