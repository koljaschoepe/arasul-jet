const { z } = require('zod');

// POST /password/dashboard — shape only
const PasswordChangeBody = z
  .object({
    currentPassword: z
      .string({ error: 'Das aktuelle und das neue Passwort werden gebraucht.' })
      .min(1, 'Das aktuelle und das neue Passwort werden gebraucht.')
      .max(500),
    newPassword: z
      .string({ error: 'Das aktuelle und das neue Passwort werden gebraucht.' })
      .min(1, 'Das aktuelle und das neue Passwort werden gebraucht.')
      .max(500),
  })
  .strict();

// PUT /firmenname — der Name des Unternehmens ueber dem Anmeldeformular.
// Leer heisst: keiner gesetzt, die Anmeldeseite zeigt den Produktnamen.
const FirmennameBody = z
  .object({
    firmenname: z
      .string({ error: 'firmenname muss eine Zeichenkette sein' })
      .trim()
      .max(120, 'Der Firmenname darf höchstens 120 Zeichen lang sein'),
  })
  .strict();

// PUT /logo — das Logo des Hauses als Daten-Adresse (`data:image/png;base64,…`).
// Art und Groesse prueft `utils/logoBild.js` nach dem Entschluesseln; hier nur,
// dass es eine Zeichenkette in vernuenftiger Laenge ist (256 KB als Base64 sind
// rund 350 000 Zeichen).
const LogoBody = z
  .object({
    bild: z
      .string({ error: 'Das Logo fehlt' })
      .min(1, 'Das Logo fehlt')
      .max(360000, 'Das Logo darf höchstens 256 KB groß sein'),
  })
  .strict();

module.exports = {
  PasswordChangeBody,
  FirmennameBody,
  LogoBody,
};
