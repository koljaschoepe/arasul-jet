const { z } = require('zod');

// POST /connect
const TailscaleConnectBody = z
  .object({
    authKey: z
      .string({ error: 'Auth-Key ist erforderlich' })
      .min(1, 'Auth-Key ist erforderlich')
      .refine(v => v.startsWith('tskey-') && v.length >= 20 && v.length <= 100, {
        message: 'Ungueltiger Auth-Key (muss mit tskey- beginnen und 20-100 Zeichen lang sein)',
      }),
    hostname: z
      .string()
      .min(1)
      .max(63)
      .regex(/^[a-zA-Z0-9-]+$/, {
        message:
          'Hostname muss 1-63 Zeichen lang sein und darf nur Buchstaben, Ziffern und Bindestriche enthalten',
      })
      .optional()
      .nullable(),
  })
  .strict();

module.exports = {
  TailscaleConnectBody,
};
