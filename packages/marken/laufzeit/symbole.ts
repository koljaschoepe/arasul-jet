/**
 * Die Symbole zur Laufzeit (`/marken/<haupt>/symbole.js`, seit 5.9.0): Lucide,
 * wie `@marken/symbole` in der Quelle. Ein eigener Eingang, weil Lucide ueber
 * tausend Symbole hat: eine App ohne Bau, die keine braucht, laedt ihn nie,
 * und eine App mit Bau bindet `@marken/symbole` hierher, statt Lucide selbst
 * einzupacken (`scripts/test/bausteine.py`, Regel 10). Gezeichnet wird mit
 * `Icon` aus `marken.js`: drei Groessen, eine Strichstaerke.
 */
export * from '../src/symbole';
