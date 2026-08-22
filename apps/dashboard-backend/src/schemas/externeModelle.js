/**
 * Eingabepruefung fuer die externen Cloud-Anbieter (Plan 023 D9).
 */

const { z } = require('zod');
const { anbieterNamen } = require('../services/llm/extern/providerRegistry');

/**
 * Der Anbietername kommt aus der Registry, nicht als abgeschriebene Liste.
 * Kaeme ein dritter Anbieter dazu und diese Datei wuesste nichts davon, waere
 * er ueber die Oberflaeche unerreichbar, ohne dass irgendwo ein Fehler stuende.
 */
const ExternerAnbieterParams = z
  .object({
    anbieter: z.enum(anbieterNamen()),
  })
  .strict();

const ExternerSchluesselBody = z
  .object({
    // Kein Muster und keine Laengenpruefung nach oben hinaus: Anbieter aendern
    // die Form ihrer Schluessel, und eine Pruefung, die das nicht mitmacht,
    // sperrt den Nutzer aus einem gueltigen Schluessel aus. Ob er stimmt,
    // sagt ohnehin nur der Anbieter selbst, ueber /pruefen.
    schluessel: z.string().trim().min(8).max(500),
  })
  .strict();

const ExternerSchalterBody = z
  .object({
    aktiv: z.boolean(),
  })
  .strict();

module.exports = {
  ExternerAnbieterParams,
  ExternerSchluesselBody,
  ExternerSchalterBody,
};
