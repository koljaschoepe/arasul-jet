const { z } = require('zod');

const ModelIdField = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/, {
    message: 'Ungültige model_id (erlaubt: Buchstaben, Ziffern, . : - _ /)',
  });

const DownloadBody = z
  .object({
    model_id: ModelIdField,
  })
  .strict();

const DefaultModelBody = z
  .object({
    model_id: ModelIdField,
  })
  .strict();

module.exports = {
  ModelIdField,
  DownloadBody,
  DefaultModelBody,
};
