const { z } = require('zod');

// PUT /settings
const UpdateSettingsBody = z
  .object({
    settings: z.record(z.string(), z.unknown(), {
      error: 'Settings object is required',
    }),
  })
  .strict();

// POST /zero-config/token
const ZeroConfigTokenBody = z
  .object({
    setupToken: z
      .string({ error: 'Setup-Token und Bot-Token sind erforderlich' })
      .trim()
      .min(1, 'Setup-Token und Bot-Token sind erforderlich')
      .max(200),
    botToken: z
      .string({ error: 'Setup-Token und Bot-Token sind erforderlich' })
      .trim()
      .min(1, 'Setup-Token und Bot-Token sind erforderlich')
      .max(500),
  })
  .strict();

// POST /zero-config/cancel
const ZeroConfigCancelBody = z
  .object({
    setupToken: z
      .string({ error: 'Setup-Token ist erforderlich' })
      .trim()
      .min(1, 'Setup-Token ist erforderlich')
      .max(200),
  })
  .strict();

// POST /zero-config/complete
const ZeroConfigCompleteBody = z
  .object({
    setupToken: z
      .string({ error: 'Setup-Token ist erforderlich' })
      .trim()
      .min(1, 'Setup-Token ist erforderlich')
      .max(200),
  })
  .strict();

// POST /rules
const CreateRuleBody = z
  .object({
    name: z
      .string({ error: 'Name, Event-Quelle, Event-Typ und Nachrichtenvorlage sind erforderlich' })
      .trim()
      .min(1, 'Name, Event-Quelle, Event-Typ und Nachrichtenvorlage sind erforderlich')
      .max(200),
    description: z.string().max(2000).optional().nullable(),
    eventSource: z
      .string({ error: 'Name, Event-Quelle, Event-Typ und Nachrichtenvorlage sind erforderlich' })
      .trim()
      .min(1, 'Name, Event-Quelle, Event-Typ und Nachrichtenvorlage sind erforderlich')
      .max(100),
    eventType: z
      .string({ error: 'Name, Event-Quelle, Event-Typ und Nachrichtenvorlage sind erforderlich' })
      .trim()
      .min(1, 'Name, Event-Quelle, Event-Typ und Nachrichtenvorlage sind erforderlich')
      .max(100),
    triggerCondition: z.record(z.string(), z.unknown()).optional().nullable(),
    severity: z.string().trim().max(50).optional(),
    messageTemplate: z
      .string({ error: 'Name, Event-Quelle, Event-Typ und Nachrichtenvorlage sind erforderlich' })
      .trim()
      .min(1, 'Name, Event-Quelle, Event-Typ und Nachrichtenvorlage sind erforderlich')
      .max(10000),
    cooldownSeconds: z.number().int().nonnegative().max(86400).optional(),
    isEnabled: z.boolean().optional(),
  })
  .strict();

// PUT /rules/:id — all optional (service filters allowed fields)
const UpdateRuleBody = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).optional().nullable(),
    eventSource: z.string().trim().min(1).max(100).optional(),
    eventType: z.string().trim().min(1).max(100).optional(),
    triggerCondition: z.record(z.string(), z.unknown()).optional().nullable(),
    severity: z.string().trim().max(50).optional(),
    messageTemplate: z.string().trim().min(1).max(10000).optional(),
    cooldownSeconds: z.number().int().nonnegative().max(86400).optional(),
    isEnabled: z.boolean().optional(),
  })
  .strict();

// PUT /config
const UpdateConfigBody = z
  .object({
    notificationsEnabled: z.boolean().optional(),
    quietHoursStart: z.string().trim().max(10).optional().nullable(),
    quietHoursEnd: z.string().trim().max(10).optional().nullable(),
    minSeverity: z.string().trim().max(50).optional(),
    claudeNotifications: z.boolean().optional(),
    systemNotifications: z.boolean().optional(),
    n8nNotifications: z.boolean().optional(),
  })
  .strict();

module.exports = {
  UpdateSettingsBody,
  ZeroConfigTokenBody,
  ZeroConfigCancelBody,
  ZeroConfigCompleteBody,
  CreateRuleBody,
  UpdateRuleBody,
  UpdateConfigBody,
};
