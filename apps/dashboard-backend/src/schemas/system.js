const { z } = require('zod');

// PUT /setup-step
const SetupStepBody = z
  .object({
    step: z
      .number({ error: 'Step must be a number between 0 and 5' })
      .int('Step must be a number between 0 and 5')
      .min(0, 'Step must be a number between 0 and 5')
      .max(5, 'Step must be a number between 0 and 5'),
    companyName: z.string().max(500).optional().nullable(),
    hostname: z.string().max(200).optional().nullable(),
    selectedModel: z.string().max(200).optional().nullable(),
  })
  .strict();

// POST /setup-complete
const SetupCompleteBody = z
  .object({
    companyName: z.string().max(500).optional().nullable(),
    hostname: z.string().max(200).optional().nullable(),
    selectedModel: z.string().max(200).optional().nullable(),
  })
  .strict();

// POST /diagnostics
const DiagnosticsBody = z
  .object({
    days: z.number().int().min(1).max(14).optional(),
    includeLogs: z.boolean().optional(),
  })
  .strict();

module.exports = {
  SetupStepBody,
  SetupCompleteBody,
  DiagnosticsBody,
};
