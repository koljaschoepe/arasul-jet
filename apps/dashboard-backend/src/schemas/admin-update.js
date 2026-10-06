const { z } = require('zod');

// POST /api/v1/external/update und POST /api/update/fassung/einspielen
const UpdateFassungBody = z
  .object({
    fassung: z
      .string()
      .trim()
      .regex(/^\d+\.\d+\.\d+$/, 'Eine Fassung hat die Form X.Y.Z, zum Beispiel 0.8.15.')
      .optional(),
  })
  .strict();

// PUT /fassung/nachts
const UpdateNachtsBody = z.object({ aktiv: z.boolean() }).strict();

module.exports = {
  UpdateFassungBody,
  UpdateNachtsBody,
};
