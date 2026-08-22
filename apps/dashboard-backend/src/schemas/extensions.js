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

/** Werkstatt-Inventar eines Projekts (Plan 017 Schritt 4). */
const WerkstattInventarQuery = z
  .object({
    projekt: z.string().trim().min(1).max(100),
  })
  .strict();

/** Fork einer installierten Erweiterung in eine neue Werkstatt. */
const ForkExtensionBody = z
  .object({
    name: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

/**
 * Aktivieren/Deaktivieren. `faehigkeitenFreigeben: true` bestätigt beim
 * Aktivieren die im Manifest deklarierten Brücken-Fähigkeiten (Plan 017
 * Schritt 2 — der Freigabe-Dialog aus Schritt 7 setzt das Flag).
 */
const SetEnabledBody = z
  .object({
    enabled: z.boolean(),
    faehigkeitenFreigeben: z.boolean().default(false),
  })
  .strict();

// ---------------------------------------------------------------------------
// KI-Brücke (Plan 017 Schritt 2)
// ---------------------------------------------------------------------------

const BrueckeLlmBody = z
  .object({
    prompt: z.string().trim().min(1).max(8000),
    system: z.string().trim().max(4000).default(''),
    temperature: z.coerce.number().min(0).max(2).default(0.7),
  })
  .strict();

const BrueckeRagBody = z
  .object({
    frage: z.string().trim().min(1).max(2000),
    anzahl: z.coerce.number().int().min(1).max(15).default(5),
  })
  .strict();

const BrueckeDateienBody = z
  .object({
    aktion: z.enum(['list', 'read', 'write']),
    pfad: z.string().trim().max(500).default('.'),
    inhalt: z
      .string()
      .max(1024 * 1024)
      .optional(),
  })
  .strict();

/**
 * Ein Aufruf nach draußen (Plan 023 H1).
 *
 * Ob die Adresse erlaubt ist, entscheidet NICHT dieses Schema, sondern das
 * Manifest der Erweiterung (`netzZiele.pruefeZiel`). Hier steht nur, was
 * überhaupt eine Adresse sein kann.
 */
const BrueckeNetzBody = z
  .object({
    url: z.string().trim().min(1).max(2000),
    methode: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
    kopf: z.record(z.string().max(4000)).default({}),
    rumpf: z
      .string()
      .max(1024 * 1024)
      .optional(),
  })
  .strict();

/**
 * Eigene Tabellen (Plan 023 H1).
 *
 * Die Erweiterung schickt NIE SQL. Sie sagt, was sie will; das SQL entsteht im
 * Backend aus geprüften Bezeichnern und gebundenen Werten.
 */
const BrueckeTabellenBody = z
  .object({
    aktion: z.enum(['liste', 'anlegen', 'schreiben', 'lesen', 'loeschen']),
    name: z.string().trim().max(64).optional(),
    spalten: z
      .array(
        z
          .object({
            name: z.string().trim().max(64),
            typ: z.string().trim().max(20).default('text'),
          })
          .strict()
      )
      .max(60)
      .optional(),
    werte: z.record(z.unknown()).optional(),
    wo: z.record(z.unknown()).optional(),
    anzahl: z.coerce.number().int().min(1).max(500).optional(),
    alles: z.boolean().optional(),
  })
  .strict();

const BrueckeFlowRunBody = z
  .object({
    args: z.record(z.unknown()).default({}),
  })
  .strict();

// Flow-Namen folgen derselben Slug-Form wie Erweiterungs-Ids.
const BrueckeFlowParams = z
  .object({
    id: z.string().trim().regex(EXTENSION_ID_RE, 'Ungültige Erweiterungs-Id'),
    name: z.string().trim().regex(EXTENSION_ID_RE, 'Ungültiger Flow-Name'),
  })
  .strict();

const BrueckeRunParams = z
  .object({
    id: z.string().trim().regex(EXTENSION_ID_RE, 'Ungültige Erweiterungs-Id'),
    runId: z.coerce.number().int().positive(),
  })
  .strict();

module.exports = {
  ExtensionIdParams,
  BuildExtensionBody,
  ForkExtensionBody,
  SetEnabledBody,
  BrueckeLlmBody,
  BrueckeRagBody,
  BrueckeDateienBody,
  BrueckeNetzBody,
  BrueckeFlowRunBody,
  BrueckeFlowParams,
  BrueckeRunParams,
  WerkstattInventarQuery,
};
