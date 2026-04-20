const { z } = require('zod');

const LoginBody = z
  .object({
    username: z
      .string({ error: 'Username is required' })
      .trim()
      .min(1, 'Username is required')
      .max(64),
    password: z.string({ error: 'Password is required' }).min(1, 'Password is required').max(256),
  })
  .strict();

const ChangePasswordBody = z
  .object({
    currentPassword: z
      .string({ error: 'currentPassword is required' })
      .min(1, 'currentPassword is required')
      .max(256),
    newPassword: z
      .string({ error: 'newPassword is required' })
      .min(8, 'Password does not meet complexity requirements (min 8 chars)')
      .max(256),
  })
  .strict();

module.exports = {
  LoginBody,
  ChangePasswordBody,
};
