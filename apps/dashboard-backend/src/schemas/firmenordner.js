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
    /**
     * Ebene 1 und 2 -- und seit dem Auftrag firmenordner-rechte-im-frontend
     * (22.09.2026) die 0 fuer die eine Wurzel. Sie darf weggelassen werden,
     * wenn `art` sie ohnehin sagt: das CLI der Wurzel legt sie mit
     * `art: 'wurzel'` an und muss die Null nicht kennen.
     */
    ebene: z.coerce
      .number()
      .int()
      .refine(n => n === 0 || n === 1 || n === 2, 'Es gibt die Wurzel (0), Ebene 1 und Ebene 2')
      .optional(),
    /** Nur auf Ebene 2, und dort Pflicht — die Verwaltung prueft das mit Satz. */
    eltern: Kennung.optional(),
    /**
     * `am_geraet` ist die vierte Stufe aus dem Zielbild: ein Ordner, der nie
     * abgeglichen wird und den nur Flows am Geraet lesen. Er geht nur auf
     * Ebene 1, weil er im Dienst ein eigener Raum OHNE Mitglieder ist --
     * innerhalb eines geteilten Raums laesst sich nichts verbergen
     * (21.09.2026 gemessen).
     *
     * `wurzel` ist die Ebene 0: genau eine je Geraet, jeder aktive Mensch
     * liest sie, Administratoren schreiben, keine Rechte-Zeile.
     */
    art: z.enum(['geteilt', 'am_geraet', 'wurzel']).default('geteilt'),
  })
  .strict()
  .superRefine((wert, ctx) => {
    const ebene = wert.ebene ?? (wert.art === 'wurzel' ? 0 : undefined);
    if (ebene === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ebene'], message: 'Die Ebene fehlt' });
      return;
    }
    if (wert.art === 'wurzel' && ebene !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ebene'],
        message: 'Die Wurzel ist Ebene 0',
      });
    }
    if (wert.art !== 'wurzel' && ebene === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['art'],
        message: 'Ebene 0 ist allein die Wurzel (art: wurzel)',
      });
    }
    if (wert.art === 'am_geraet' && ebene !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ebene'],
        message: 'Ein Ordner am Geraet liegt auf Ebene 1',
      });
    }
  })
  .transform(wert => ({ ...wert, ebene: wert.ebene ?? (wert.art === 'wurzel' ? 0 : 1) }));

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
