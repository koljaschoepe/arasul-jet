/**
 * Zod-Schema fuer die Darstellung der Oberflaeche (Phase H1).
 *
 * Zwei Werte, und die Liste steht genau hier -- nicht daneben noch einmal in
 * der Route. Dieselben zwei stehen im CHECK der Spalte (Migration 180) und in
 * `index.css` als `:root` und `[data-theme='dark']`; ein dritter waere eine
 * Aenderung an allen dreien und damit ohnehin eine Migration.
 *
 * `z.enum` und nicht `z.string()`: ein unbekannter Wert soll eine 400 mit
 * lesbarer Meldung ergeben und nicht eine 500 aus dem CHECK der Datenbank.
 */

const { z } = require('zod');

const THEMES = ['light', 'dark'];

const DarstellungBody = z
  .object({
    theme: z.enum(THEMES),
  })
  .strict();

module.exports = { DarstellungBody, THEMES };
