const { z } = require('zod');

// POST /password/dashboard, /password/minio, /password/n8n — shape only
const PasswordChangeBody = z
  .object({
    currentPassword: z
      .string({ error: 'Current password and new password are required' })
      .min(1, 'Current password and new password are required')
      .max(500),
    newPassword: z
      .string({ error: 'Current password and new password are required' })
      .min(1, 'Current password and new password are required')
      .max(500),
  })
  .strict();

// PUT /company-context
const CompanyContextBody = z
  .object({
    content: z.string({ error: 'Inhalt ist erforderlich' }).max(1000000, 'Inhalt ist zu lang'),
  })
  .strict();

module.exports = {
  PasswordChangeBody,
  CompanyContextBody,
};
