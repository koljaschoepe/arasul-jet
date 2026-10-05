const { z } = require('zod');

const LoginBody = z
  .object({
    username: z
      .string({ error: 'Der Benutzername fehlt.' })
      .trim()
      .min(1, 'Der Benutzername fehlt.')
      .max(64),
    password: z.string({ error: 'Das Passwort fehlt.' }).min(1, 'Das Passwort fehlt.').max(256),
  })
  .strict();

const ChangePasswordBody = z
  .object({
    currentPassword: z
      .string({ error: 'Das aktuelle Passwort fehlt.' })
      .min(1, 'Das aktuelle Passwort fehlt.')
      .max(256),
    newPassword: z
      .string({ error: 'Das neue Passwort fehlt.' })
      .min(8, 'Das Passwort ist zu einfach (mindestens 8 Zeichen).')
      .max(256),
  })
  .strict();

// Setup-on-first-login: create the very first admin from the web, no terminal
// questions. Only accepted while no admin exists (enforced in the route).
const SetupAdminBody = z
  .object({
    username: z
      .string({ error: 'Der Benutzername fehlt.' })
      .trim()
      .min(1, 'Der Benutzername fehlt.')
      .max(64),
    password: z
      .string({ error: 'Das Passwort fehlt.' })
      .min(8, 'Das Passwort ist zu einfach (mindestens 8 Zeichen).')
      .max(256),
    email: z.string().trim().email('Die E-Mail-Adresse ist ungültig.').max(255).optional(),
  })
  .strict();

module.exports = {
  LoginBody,
  ChangePasswordBody,
  SetupAdminBody,
};
