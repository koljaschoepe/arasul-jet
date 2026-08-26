const { z } = require('zod');

// AppStore
const AppUninstallBody = z
  .object({
    removeVolumes: z.boolean().optional(),
  })
  .strict();

const AppRestartBody = z
  .object({
    applyConfig: z.boolean().optional(),
    async: z.boolean().optional(),
  })
  .strict();

const AppConfigBody = z
  .object({
    config: z.record(z.string(), z.unknown(), {
      error: 'Ungültige Konfiguration: config muss ein Objekt sein',
    }),
  })
  .strict()
  .refine(v => Object.keys(v.config).length <= 50, {
    message: 'Zu viele Konfigurationseinträge (max. 50)',
    path: ['config'],
  });

// POST /:id/install — optional config object (same shape as AppConfigBody but config is optional)
const AppInstallBody = z
  .object({
    config: z
      .record(z.string(), z.unknown(), {
        error: 'config muss ein Objekt sein',
      })
      .optional(),
  })
  .strict()
  .refine(v => !v.config || Object.keys(v.config).length <= 50, {
    message: 'Zu viele Konfigurationseinträge (max. 50)',
    path: ['config'],
  });

module.exports = {
  AppUninstallBody,
  AppRestartBody,
  AppConfigBody,
  AppInstallBody,
};
