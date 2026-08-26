const { z } = require('zod');

// POST /password/dashboard — shape only
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
module.exports = {
  PasswordChangeBody,
};
