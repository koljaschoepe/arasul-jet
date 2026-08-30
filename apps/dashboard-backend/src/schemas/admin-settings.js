const { z } = require('zod');

// POST /password/dashboard — shape only
const PasswordChangeBody = z
  .object({
    currentPassword: z
      .string({ error: 'Current password and new password are required' })
      .min(1, 'Current password and new password are required')
      .max(500),
    newPassword: z
      .string({ error: 'Current password and new password are required' })
      .min(1, 'Current password and new password are required')
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
      .max(120, 'Der Firmenname darf hoechstens 120 Zeichen lang sein'),
  })
  .strict();

module.exports = {
  PasswordChangeBody,
  FirmennameBody,
};
