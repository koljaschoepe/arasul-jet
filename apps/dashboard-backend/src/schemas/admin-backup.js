const { z } = require('zod');

/**
 * POST /api/backup/wiederherstellung (Phase C9)
 *
 * `bestaetigung` muss das Wort `wiederherstellen` sein. Kein Wahlfeld, kein
 * `true`: dieser Aufruf ersetzt die GANZE Datenbank des Geraets, und ein
 * `{"bestaetigung": true}` schreibt sich in einem Skript versehentlich hin.
 * Ein Wort, das man tippen muss, tippt niemand aus Versehen -- dasselbe
 * Muster wie beim Werksreset und beim Entfernen einer App.
 *
 * `datei` ist ein NAME, kein Pfad. Der Sicherungsordner steht fest; ein Pfad
 * von aussen koennte auf alles zeigen, was der Sicherungs-Container sieht,
 * und das Ergebnis waere eine Datenbank aus unbekannter Quelle. Ohne Angabe
 * gilt die neueste Sicherung.
 */
const WiederherstellungBody = z
  .object({
    datei: z
      .string()
      .trim()
      .max(255)
      .regex(
        /^[A-Za-z0-9._-]+$/,
        'Nur der Name der Sicherung, kein Pfad (Buchstaben, Ziffern, Punkt, Strich, Unterstrich)'
      )
      .optional(),
    bestaetigung: z.literal('wiederherstellen', {
      error:
        'Zum Bestaetigen muss das Feld `bestaetigung` das Wort "wiederherstellen" enthalten. ' +
        'Dieser Aufruf ersetzt die ganze Datenbank.',
    }),
  })
  .strict();

module.exports = { WiederherstellungBody };
