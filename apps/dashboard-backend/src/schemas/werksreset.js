const { z } = require('zod');

const STUFEN = ['inhalte', 'auslieferung'];

/**
 * POST /api/werksreset
 *
 * `stufe` hat bewusst keinen Vorgabewert. Ein fehlendes Feld auf einen Wert zu
 * legen hiesse hier, im Zweifel die groessere Zerstoerung zu waehlen.
 * `.strict()` weist zusaetzliche Felder ab: ein Tippfehler wie `modelle` statt
 * `modelleLoeschen` soll auffallen, nicht still ignoriert werden.
 */
const WerksresetBody = z
  .object({
    stufe: z.enum(STUFEN, {
      error: `Stufe fehlt oder ist unbekannt. Erlaubt: ${STUFEN.join(', ')}`,
    }),
    bestaetigung: z
      .string({ error: 'Bestätigung fehlt: der Gerätename muss eingetippt werden' })
      .trim()
      .min(1, 'Bestätigung fehlt: der Gerätename muss eingetippt werden')
      .max(255),
    modelleLoeschen: z.boolean().optional().default(false),
  })
  .strict();

/** GET /api/werksreset/vorschau */
const WerksresetVorschauQuery = z
  .object({
    stufe: z.enum(STUFEN, {
      error: `Stufe fehlt oder ist unbekannt. Erlaubt: ${STUFEN.join(', ')}`,
    }),
    modelle: z.enum(['true', 'false']).optional(),
  })
  .strict();

module.exports = { WerksresetBody, WerksresetVorschauQuery, STUFEN };
