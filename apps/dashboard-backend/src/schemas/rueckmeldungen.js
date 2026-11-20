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

/*
 * Die Schnittstelle fuer das Kit (J43, M7, Karte rueckmeldung-schnittstelle).
 * Vertrag: docs/features/RUECKMELDUNG.md, Abschnitt „Schnittstelle für das Kit".
 */

/** Die vier Staende einer Meldung (company/schleife.md). */
const STAENDE_MELDUNG = Object.freeze(['neu', 'angenommen', 'umgesetzt', 'abgelehnt']);
const StandMeldung = z.enum(STAENDE_MELDUNG, {
  error: 'Stand einer Meldung ist „neu", „angenommen", „umgesetzt" oder „abgelehnt"',
});

/** `?stand_meldung=neu,angenommen` -- eine Liste mit Komma, jeder Wert einer der vier. */
const StandMeldungListe = z
  .string()
  .trim()
  .min(1)
  .transform(s => [...new Set(s.split(',').map(t => t.trim()))])
  .pipe(z.array(StandMeldung).min(1));

const KitRueckmeldungenParams = z.object({ id: AppId }).strict();

const KitRueckmeldungParams = z
  .object({ id: AppId, nr: z.coerce.number().int().positive() })
  .strict();

const KitRueckmeldungenQuery = z
  .object({
    stand_meldung: StandMeldungListe.optional(),
    stand: Stand.optional(),
    grenze: z.coerce.number().int().min(1).max(500).default(200),
  })
  .strict();

const StandSetzenBody = z
  .object({
    stand_meldung: StandMeldung,
    grund: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .refine(b => b.stand_meldung !== 'abgelehnt' || Boolean(b.grund), {
    message: 'Wer eine Meldung ablehnt, nennt den Grund (`grund`).',
    path: ['grund'],
  });

/** Der Schalter je App (Einstellungen › Apps). */
const BilderAnAgentenBody = z.object({ erlaubt: z.boolean() }).strict();

module.exports = {
  RueckmeldungBody,
  RueckmeldungId,
  RueckmeldungenQuery,
  STAENDE_MELDUNG,
  KitRueckmeldungenParams,
  KitRueckmeldungParams,
  KitRueckmeldungenQuery,
  StandSetzenBody,
  BilderAnAgentenBody,
};
