const { z } = require('zod');

/**
 * Die Kennung einer App. Bis Phase C3 ist sie freier Text — aber nicht
 * beliebiger: sie soll spaeter ohne Umschreiben auf `apps.id` aus dem Manifest
 * `app.json` zeigen und steht dann auch im Pfad (`/apps/<id>/`). Was in einem
 * Pfad nicht vorkommen darf, wird deshalb schon jetzt abgewiesen.
 */
const AppId = z
  .string({ error: 'App-Kennung fehlt' })
  .trim()
  .min(1, 'App-Kennung fehlt')
  .max(64, 'App-Kennung ist zu lang')
  .regex(
    /^[a-z0-9][a-z0-9._-]*$/,
    'App-Kennung: Kleinbuchstaben, Ziffern, Punkt, Bindestrich, Unterstrich; beginnt mit Buchstabe oder Ziffer'
  );

const BenutzerId = z.coerce.number().int().positive();

const FreigabeBody = z
  .object({
    app_id: AppId,
    benutzer_id: BenutzerId,
  })
  .strict();

const FreigabeParams = z.object({
  appId: AppId,
  benutzerId: BenutzerId,
});

// Beide Filter sind freiwillig; ohne Filter kommt alles.
const FreigabenQuery = z
  .object({
    app_id: AppId.optional(),
    benutzer_id: BenutzerId.optional(),
  })
  .strict();

module.exports = { FreigabeBody, FreigabeParams, FreigabenQuery };
