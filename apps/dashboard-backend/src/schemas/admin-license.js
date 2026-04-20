const { z } = require('zod');

// POST /activate
const ActivateLicenseBody = z
  .object({
    licenseKey: z
      .string({ error: 'A valid license key is required' })
      .min(10, 'A valid license key is required')
      .max(4096),
  })
  .strict();

module.exports = {
  ActivateLicenseBody,
};
