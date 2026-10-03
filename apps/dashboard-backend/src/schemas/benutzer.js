const { z } = require('zod');

// Eine Person entsteht aus Vorname, Nachname und E-Mail (M5). Das Startpasswort
// vergibt das Geraet, der Administrator tippt keins mehr: es kommt einmal in
// der Antwort und steht danach nirgends. Der Benutzername ist die E-Mail.
// `verwaltung: true` macht die Person zum Administrator (Schalter
// „Verwaltung"); ohne Angabe ist sie Mitarbeiter.
const CreateBenutzerBody = z
  .object({
    vorname: z.string({ error: 'Vorname fehlt' }).trim().min(1, 'Vorname fehlt').max(100),
    nachname: z.string({ error: 'Nachname fehlt' }).trim().min(1, 'Nachname fehlt').max(100),
    email: z
      .string({ error: 'E-Mail fehlt' })
      .trim()
      .email('Keine gültige E-Mail-Adresse')
      .max(255),
    verwaltung: z.boolean().optional(),
  })
  .strict();

const BenutzerIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

// Ohne Angabe erzeugt das Geraet ein neues Startpasswort und nennt es einmal.
// Mit Angabe gilt die Untergrenze von acht Zeichen; die Komplexitaetsregeln
// greifen dort, wo der Mensch sein eigenes Passwort waehlt.
const SetzePasswortBody = z
  .object({
    password: z.string().min(8, 'Passwort braucht mindestens 8 Zeichen').max(256).optional(),
  })
  .strict();

// `aktiv: false` legt still, `aktiv: true` laesst wieder zu. Ein Wert, zwei
// Richtungen — zwei Endpunkte („sperren", „entsperren") waeren zwei Wege zu
// demselben Feld.
const SetzeAktivBody = z
  .object({
    aktiv: z.boolean({ error: 'aktiv muss true oder false sein' }),
  })
  .strict();

// Der Schalter „Verwaltung": `true` macht zum Administrator, `false` nimmt es.
const SetzeVerwaltungBody = z
  .object({
    verwaltung: z.boolean({ error: 'verwaltung muss true oder false sein' }),
  })
  .strict();

module.exports = {
  CreateBenutzerBody,
  BenutzerIdParams,
  SetzePasswortBody,
  SetzeAktivBody,
  SetzeVerwaltungBody,
};
