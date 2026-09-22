/**
 * Zod-Schemas fuer den Firmenordner (J33, 22.09.2026).
 *
 * DIE KENNUNG IST STRENGER ALS SIE MUESSTE, und das hat einen Grund am
 * anderen Ende der Leitung: sie wird zum Ordnernamen auf der Platte des
 * Geraets UND zum Ordnernamen auf dem Rechner jedes Mitarbeiters, der
 * abgleicht. Ein Leerzeichen, ein Umlaut oder ein Grossbuchstabe darin ist
 * auf macOS, Windows und Linux jeweils etwas anderes -- und ein Ordner, der
 * auf zwei Rechnern anders heisst, ist zwei Ordner. Der Anzeigename daneben
 * darf alles.
 */

const { z } = require('zod');

/** Kleinbuchstaben, Ziffern, Bindestriche; nicht am Rand. Wie die App-Kennung. */
const Kennung = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
    'Nur Kleinbuchstaben, Ziffern und Bindestriche; nicht am Anfang oder Ende'
  );

const OrdnerBody = z
  .object({
    kennung: Kennung,
    name: z.string().trim().min(1).max(80),
    ebene: z.coerce
      .number()
      .int()
      .refine(n => n === 1 || n === 2, 'Es gibt Ebene 1 und Ebene 2'),
    /** Nur auf Ebene 2, und dort Pflicht — die Verwaltung prueft das mit Satz. */
    eltern: Kennung.optional(),
    /**
     * `am_geraet` ist die vierte Stufe aus dem Zielbild: ein Ordner, der nie
     * abgeglichen wird und den nur Flows am Geraet lesen. Er geht nur auf
     * Ebene 1, weil er im Dienst ein eigener Raum OHNE Mitglieder ist --
     * innerhalb eines geteilten Raums laesst sich nichts verbergen
     * (21.09.2026 gemessen).
     */
    art: z.enum(['geteilt', 'am_geraet']).default('geteilt'),
  })
  .strict();

const OrdnerParams = z.object({ id: z.coerce.number().int().positive() }).strict();

/**
 * Abtippen, wie beim Entfernen einer App (C5).
 *
 * Es ist kein zweiter Knopf, sondern die Kennung selbst: wer „projekte"
 * tippt, hat dabei gelesen, was er wegwirft. Ein Bestaetigungsfeld mit `true`
 * waere ein zweiter Klick, kein zweiter Gedanke.
 */
const OrdnerLoeschenQuery = z.object({ kennung: z.string().trim().min(1) }).strict();

const RechtBody = z
  .object({
    ordner_id: z.coerce.number().int().positive(),
    benutzer_id: z.coerce.number().int().positive(),
    recht: z.enum(['lesen', 'schreiben']),
  })
  .strict();

const RechtParams = z
  .object({
    ordnerId: z.coerce.number().int().positive(),
    benutzerId: z.coerce.number().int().positive(),
  })
  .strict();

const RechteQuery = z
  .object({
    ordner_id: z.coerce.number().int().positive().optional(),
    benutzer_id: z.coerce.number().int().positive().optional(),
  })
  .strict();

module.exports = {
  OrdnerBody,
  OrdnerParams,
  OrdnerLoeschenQuery,
  RechtBody,
  RechtParams,
  RechteQuery,
};
