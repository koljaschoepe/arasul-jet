const { z } = require('zod');

// POST /activate
const ActivateLicenseBody = z
  .object({
    licenseKey: z
      .string({ error: 'Der Lizenzschlüssel fehlt oder ist ungültig.' })
      .min(10, 'Der Lizenzschlüssel fehlt oder ist ungültig.')
      .max(4096),
  })
  .strict();

module.exports = {
  ActivateLicenseBody,
};
