/**
 * Zod-Schema fuer die Darstellung der Oberflaeche (Phase H1).
 *
 * Drei Werte, und die Liste steht genau hier -- nicht daneben noch einmal in
 * der Route. Dieselben stehen im CHECK der Spalte (Migration 180, 194) und in
 * `index.css` als `:root` und `[data-theme='dark']`; ein dritter waere eine
 * Aenderung an allen dreien und damit ohnehin eine Migration.
 *
 * `z.enum` und nicht `z.string()`: ein unbekannter Wert soll eine 400 mit
 * lesbarer Meldung ergeben und nicht eine 500 aus dem CHECK der Datenbank.
 */

const { z } = require('zod');

// `system` (Migration 194) heisst: das Betriebssystem entscheidet, die
// Oberflaeche loest es zu hell oder dunkel auf.
const THEMES = ['light', 'dark', 'system'];

const DarstellungBody = z
  .object({
    theme: z.enum(THEMES),
  })
  .strict();

module.exports = { DarstellungBody, THEMES };
