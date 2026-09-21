const { z } = require('zod');

/**
 * Der Ausweis eines Mitarbeiters (Bruecke, 21.09.2026, J34).
 *
 * Es gibt genau ein Feld, das ein Mensch eingibt: den Namen des Rechners.
 * Alles andere -- der Wert, sein Vorsatz, die Pruefsumme -- macht das Geraet.
 */

/**
 * Der Name eines Rechners.
 *
 * Er ist die einzige Art, zwei Ausweise auseinanderzuhalten: den Wert sieht
 * niemand wieder. Deshalb darf er nicht leer sein und nicht nur aus
 * Leerzeichen bestehen -- eine Zeile ohne Namen waere eine Zeile, die man nur
 * noch am Datum erkennt.
 */
const AusweisName = z
  .string({ error: 'Name fehlt: wie heisst der Rechner, auf dem der Ausweis liegt?' })
  .trim()
  .min(1, 'Name fehlt: wie heisst der Rechner, auf dem der Ausweis liegt?')
  .max(60, 'Name ist zu lang (hoechstens 60 Zeichen)');

const AusweisBody = z.object({ name: AusweisName }).strict();

/** Die Nummer aus der Adresse. Sie kommt als Text und ist eine Zahl. */
const AusweisParams = z.object({
  id: z.coerce.number().int().positive('Ausweis-Nummer ist eine positive Zahl'),
});

module.exports = { AusweisName, AusweisBody, AusweisParams };
