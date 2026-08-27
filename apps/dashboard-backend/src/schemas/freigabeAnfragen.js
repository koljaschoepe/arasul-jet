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
      .min(1, 'Eine Ablehnung braucht eine Begruendung, der Lauf endet damit')
      .max(2000),
  })
  .strict();

/**
 * Body des Bestaetigens: leer und `.strict()`.
 *
 * Wer bestaetigt, sagt ja -- mehr gibt es nicht mitzuteilen. Ein Feld, das
 * jemand mitschickt, ist ein Missverstaendnis und soll als 400 auffallen,
 * statt still ins Leere zu laufen (dieselbe Linie wie `WiederholenBody`).
 */
const BestaetigenBody = z.object({}).strict();

module.exports = { AnfrageParams, AblehnenBody, BestaetigenBody };
