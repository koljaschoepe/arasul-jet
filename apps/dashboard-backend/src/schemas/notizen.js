/**
 * Zod-Schema fuer den Zettel in der rechten Spalte (Phase D1).
 *
 * Ein Feld, eine Grenze. Die Grenze steht hier und nicht in der Spalte
 * (`TEXT`, Migration 177): sie ist eine Entscheidung ueber die Oberflaeche --
 * ein Zettel neben der Arbeit, kein Dokument -- und Entscheidungen ueber die
 * Oberflaeche gehoeren an die Schnittstelle, wo sie eine 400 mit einer
 * lesbaren Meldung ergeben statt eines Datenbankfehlers.
 */

const { z } = require('zod');

/** Rund vier Bildschirmseiten. Wer mehr braucht, braucht eine App dafuer. */
const NOTIZ_MAX = 20000;

const NotizBody = z
  .object({
    inhalt: z.string().max(NOTIZ_MAX, `Die Notiz ist laenger als ${NOTIZ_MAX} Zeichen`),
  })
  .strict();

module.exports = { NotizBody, NOTIZ_MAX };
