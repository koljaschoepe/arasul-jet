const { z } = require('zod');
const { AppId, Stand } = require('./apps');

/**
 * Rueckmeldungen aus dem Rahmen (J42, M7). Vertrag:
 * docs/features/RUECKMELDUNG.md.
 *
 * Das Bild kommt als `data:image/png;base64,...`. Die Laenge hier ist die
 * grobe Grenze vor dem Dekodieren (6 MB Bytes sind rund 8 MB Text); die
 * genaue Pruefung auf PNG und Groesse macht der Dienst.
 */

/** Eine Stelle auf dem Bild, in Anteilen von Breite und Hoehe (0 bis 1). */
const Anteil = z.number().min(0).max(1);
const Markierung = z.object({ x: Anteil, y: Anteil, breite: Anteil, hoehe: Anteil }).strict();

const RueckmeldungBody = z
  .object({
    app_id: AppId,
    stand: Stand,
    seite: z.string().trim().min(1).max(2000),
    text: z.string().trim().min(1, 'Bitte schreiben Sie, was fehlt oder nicht stimmt.').max(5000),
    bild: z
      .string()
      .max(8 * 1024 * 1024 + 64)
      .regex(/^data:image\/png;base64,/, 'Das Bildschirmfoto muss ein PNG sein.')
      .nullable()
      .optional(),
    markierung: Markierung.nullable().optional(),
  })
  .strict();

const RueckmeldungId = z.object({ id: z.coerce.number().int().positive() });

const RueckmeldungenQuery = z.object({ app_id: AppId.optional() }).strict();

module.exports = { RueckmeldungBody, RueckmeldungId, RueckmeldungenQuery };
