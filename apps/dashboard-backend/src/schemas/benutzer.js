const { z } = require('zod');
const { ROLLEN } = require('../middleware/auth');

// Dieselben Grenzen wie SetupAdminBody (schemas/auth.js): der erste Admin und
// jeder spaetere Benutzer entstehen nach derselben Regel. Die Komplexitaet
// (Grossbuchstabe, Zahl, Sonderzeichen) prueft `hashPassword`-seitig niemand;
// sie gilt fuer den Passwortwechsel (`passwordService`), nicht fuers Anlegen,
// weil der Administrator ein Startpasswort vergibt, das der Mitarbeiter
// ohnehin wechselt.
const CreateBenutzerBody = z
  .object({
    username: z.string({ error: 'Benutzername fehlt' }).trim().min(1, 'Benutzername fehlt').max(64),
    password: z
      .string({ error: 'Passwort fehlt' })
      .min(8, 'Passwort braucht mindestens 8 Zeichen')
      .max(256),
    email: z.string().trim().email('Keine gueltige E-Mail-Adresse').max(255).optional(),
    rolle: z.enum(ROLLEN, { error: `Rolle muss ${ROLLEN.join(' oder ')} sein` }),
  })
  .strict();

const BenutzerIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

module.exports = { CreateBenutzerBody, BenutzerIdParams };
