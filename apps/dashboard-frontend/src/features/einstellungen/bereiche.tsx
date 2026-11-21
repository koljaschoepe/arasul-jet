import { Lock, Monitor, Palette, User } from '@marken/symbole';

/**
 * Die Bereiche der Einstellungen, in dieser Reihenfolge (`frontend.md`).
 * Eine eigene Datei, weil zwei sie lesen: die Einstellungen selbst und die
 * Befehlspalette der Shell (J51), die dafür nicht die ganze Seite laden soll.
 */
export const BEREICHE = [
  { id: 'profil', name: 'Profil', symbol: <User />, gruppe: 'Konto' },
  { id: 'passwort', name: 'Passwort', symbol: <Lock />, gruppe: 'Konto' },
  { id: 'rechner', name: 'Angemeldete Rechner', symbol: <Monitor />, gruppe: 'Konto' },
  { id: 'erscheinungsbild', name: 'Erscheinungsbild', symbol: <Palette />, gruppe: 'Darstellung' },
] as const;

export type BereichId = (typeof BEREICHE)[number]['id'];
