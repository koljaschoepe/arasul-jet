import { useLayoutEffect, useRef } from 'react';

/**
 * Ein weicher Wechsel, wenn eine andere Ansicht vorn steht (J53, M7,
 * `gestaltung.md`, Gemeinsame Linie: „Ansichten wechseln ohne Neuladen mit
 * einer kurzen, weichen Bewegung, 150 bis 250 ms“).
 *
 * Der Inhalt blendet in 200 ms ein und hebt sich dabei 6 px an. Es wird NICHTS
 * neu eingehängt: der Schlüssel löst nur die Bewegung aus, die Komponenten
 * darunter (und das iframe einer App) bleiben, was sie sind. Beim ersten
 * Zeichnen bewegt sich nichts, und wer „weniger Bewegung“ eingestellt hat,
 * sieht sofort den Endzustand. Ohne Web Animations (jsdom) geschieht nichts.
 */
export function useWeicherWechsel<T extends HTMLElement>(schluessel: string) {
  const ref = useRef<T>(null);
  const vorher = useRef<string | null>(null);
  useLayoutEffect(() => {
    const erster = vorher.current === null;
    vorher.current = schluessel;
    const el = ref.current;
    if (erster || !el || typeof el.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    el.animate(
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 200, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
    );
  }, [schluessel]);
  return ref;
}
