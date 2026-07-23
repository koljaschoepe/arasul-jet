const { z } = require('zod');
const { EXTENSION_ID_RE } = require('../services/extensions/extensionPackage');

const ExtensionIdParams = z
  .object({
    id: z.string().trim().regex(EXTENSION_ID_RE, 'Ungültige Erweiterungs-Id'),
  })
  .strict();

/** Paketieren aus einer Sandbox-Werkstatt. */
const BuildExtensionBody = z
  .object({
    slug: z.string().trim().min(1).max(100),
    // Unterordner relativ zur Sandbox; '.' = die Sandbox selbst ist das Paket.
    subfolder: z.string().trim().max(200).default('.'),
    overwrite: z.boolean().default(false),
  })
  .strict();

/** Fork einer installierten Erweiterung in eine neue Werkstatt. */
const ForkExtensionBody = z
  .object({
    name: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

const SetEnabledBody = z.object({ enabled: z.boolean() }).strict();

module.exports = {
  ExtensionIdParams,
  BuildExtensionBody,
  ForkExtensionBody,
  SetEnabledBody,
};
