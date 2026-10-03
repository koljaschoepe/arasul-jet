const { z } = require('zod');

// Leer heisst „nicht gesetzt": die Oberflaeche schickt einen leeren String,
// wenn jemand ein Feld leert, und gespeichert wird dann NULL.
const optionalText = max =>
  z
    .string()
    .trim()
    .max(max)
    .transform(t => (t === '' ? null : t))
    .nullable()
    .optional();

const ProfilBody = z
  .object({
    vorname: z.string({ error: 'Vorname fehlt' }).trim().min(1, 'Vorname fehlt').max(100),
    nachname: z.string({ error: 'Nachname fehlt' }).trim().min(1, 'Nachname fehlt').max(100),
    funktion: optionalText(100),
    kuerzel: optionalText(8),
  })
  .strict();

/** Hoechstgroesse des Bildes nach dem Dekodieren; die Datenbank prueft dieselbe Grenze. */
const BILD_MAX_BYTES = 512 * 1024;

// Ein Data-URL: `data:image/png;base64,...`. Die Oberflaeche verkleinert das
// Bild vorher auf eine Kantenlaenge von 256 px; hier gilt nur die Obergrenze.
const BildBody = z
  .object({
    bild: z
      .string({ error: 'Bild fehlt' })
      .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'Nur PNG, JPEG oder WebP')
      .max(Math.ceil((BILD_MAX_BYTES * 4) / 3) + 64, 'Das Bild ist zu groß (höchstens 512 KB)'),
  })
  .strict();

module.exports = { ProfilBody, BildBody, BILD_MAX_BYTES };
