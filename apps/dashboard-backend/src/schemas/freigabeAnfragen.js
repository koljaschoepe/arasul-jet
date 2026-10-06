/**
 * Zod-Schemas fuer Freigabe-Anfragen aus einem Flow (Phase C7).
 *
 * NICHT zu verwechseln mit `schemas/freigaben.js` -- das ist die Freigabe
 * einer App fuer einen Menschen (`app_members`, Phase C2). Hier geht es um
 * einen Lauf, der anhaelt und auf eine Entscheidung wartet.
 */

const { z } = require('zod');

/** `:id` einer Anfrage in der URL. */
const AnfrageParams = z.object({ id: z.coerce.number().int().positive() }).strict();

/**
 * Die Begruendung einer Ablehnung.
 *
 * PFLICHT, und das ist eine Entscheidung ueber Umgangsformen, nicht ueber
 * Datenfelder: eine Ablehnung beendet den Lauf eines anderen Menschen. Sie
 * ohne ein Wort zu bekommen ist das, was in einem Unternehmen die naechste
 * Mail kostet. Der Grund steht danach am Lauf (`flow_runs.error`) und in der
 * Zeile der Anfrage.
 */
const AblehnenBody = z
  .object({
    begruendung: z
      .string()
      .trim()
      .min(1, 'Eine Ablehnung braucht eine Begründung, der Lauf endet damit')
      .max(2000),
  })
  .strict();

/**
 * Body des Bestaetigens: leer, oder die Felder, die der Mensch korrigiert hat.
 *
 * Wer bestaetigt, sagt ja. Seit M5 (Migration 197) darf er dabei die Felder
 * aendern, die die App in der Rolle als `aenderbar` erklaert: `felder` nennt je
 * Feld den Wert, mit dem der Lauf weiterarbeitet. Ob ein Feld aenderbar ist,
 * prueft der Dienst gegen die Anfrage, nicht dieses Schema. Alles andere bleibt
 * `.strict()`: ein Feld, das jemand mitschickt, ist ein Missverstaendnis und
 * soll als 400 auffallen.
 */
const BestaetigenBody = z
  .object({
    felder: z
      .record(
        z.string().trim().min(1).max(60),
        z.string().max(2000, 'Ein Feld hat höchstens 2000 Zeichen')
      )
      .refine(f => Object.keys(f).length <= 10, 'Höchstens 10 Felder')
      .optional(),
  })
  .strict();

/**
 * Body des Weitergebens (M5): an wen, als Benutzername. Ob der die Anfrage
 * entscheiden darf, prueft der Dienst gegen den Kreis.
 */
const WeitergebenBody = z
  .object({
    an: z.string().trim().min(1, 'An wen? Ein Benutzername').max(100),
  })
  .strict();

/** Body des Uebernehmens: leer, aus demselben Grund wie beim Bestaetigen. */
const UebernehmenBody = z.object({}).strict();

module.exports = {
  AnfrageParams,
  AblehnenBody,
  BestaetigenBody,
  WeitergebenBody,
  UebernehmenBody,
};
