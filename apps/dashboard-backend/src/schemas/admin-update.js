const { z } = require('zod');

// POST /apply
const ApplyUpdateBody = z
  .object({
    file_path: z
      .string({ error: 'Update file path is required' })
      .trim()
      .min(1, 'Update file path is required')
      .max(4096),
  })
  .strict();

// POST /install-from-usb
const InstallFromUsbBody = z
  .object({
    file_path: z
      .string({ error: 'File path is required' })
      .trim()
      .min(1, 'File path is required')
      .max(4096),
  })
  .strict();

// POST /download
const DownloadUpdateBody = z
  .object({
    downloadUrl: z
      .string({ error: 'downloadUrl and version are required' })
      .trim()
      .min(1, 'downloadUrl and version are required')
      .max(4096),
    version: z
      .string({ error: 'downloadUrl and version are required' })
      .trim()
      .min(1, 'downloadUrl and version are required')
      .max(200),
  })
  .strict();

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

module.exports = {
  UpdateFassungBody,
  ApplyUpdateBody,
  InstallFromUsbBody,
  DownloadUpdateBody,
};
