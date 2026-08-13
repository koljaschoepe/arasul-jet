import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge kennt unsere EIGENEN `text-ui*`-Schriftgrößen nicht
 * (`text-ui-xs`/`-sm`/`text-ui`/`-lg`, definiert im `@theme`-Block von
 * index.css). Ohne Kenntnis stuft es sie als Text-FARBE ein — und wirft die
 * Größe weg, sobald in einem `cn()` zusätzlich eine echte Textfarbe steht,
 * z. B. `cn('text-ui-sm', 'text-foreground')` → nur `text-foreground` bleibt.
 * Betroffene Elemente fielen dann still auf die Default-Größe (1rem/17px)
 * zurück — sichtbar u. a. an zu großen Terminal-Sitzungs-Tabs.
 *
 * Wir registrieren die Token explizit in der `font-size`-Gruppe, damit Größe
 * UND Farbe nebeneinander bestehen bleiben. (`text-2xs`/`-md` brauchen das
 * NICHT — deren Namen matcht tailwind-merge bereits als Größe.)
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['ui-xs', 'ui-sm', 'ui', 'ui-lg'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
