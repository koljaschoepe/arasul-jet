const { z } = require('zod');
const { AppId, Stand } = require('./apps');

/**
 * Freigaben (Phase C2, Tester-Kreis aus C3).
 *
 * Die Kennung einer App gehoert dem App-Modell, nicht den Freigaben: sie steht
 * in `schemas/apps.js` und wird hier nur benutzt. Bis C3 stand sie hier, weil
 * es das Manifest noch nicht gab; jetzt gibt es nur noch eine Regel fuer sie.
 */

const BenutzerId = z.coerce.number().int().positive();

const FreigabeBody = z
  .object({
    app_id: AppId,
    benutzer_id: BenutzerId,
    // Wie weit freigegeben wird. Ohne Angabe der Normalfall: der Livestand.
    // Wer `test` bekommt, ist Tester und sieht zusaetzlich /apps/<id>/test/.
    stand: Stand.default('live'),
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
