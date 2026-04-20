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

module.exports = {
  UpdateQuietHoursDayBody,
  BatchQuietHoursBody,
  TestWebhookBody,
};
