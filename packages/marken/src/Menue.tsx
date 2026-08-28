import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/**
 * Das Menue hinter dem Hamburger-Knopf (Phase D7).
 *
 * Unter 900 px gibt es keine drei Spalten und keine Aktivitaetsleiste; was
 * dort links stand, steht hier. Es ist eine Flaeche UEBER der Seite, mit
 * einem Schleier davor -- und es ist das einzige Ding der Bibliothek, das
 * etwas verdeckt. Deshalb gilt fuer es dieselbe Regel wie fuer alles, was
 * verdeckt: es faengt zu an, und jede Ansicht, die kommt, macht es zu.
 *
 * Escape schliesst, ein Klick auf den Schleier schliesst, und der Fokus
 * springt beim Oeffnen hinein. Das letzte ist kein Feinschliff: wer mit der
 * Tastatur arbeitet, staende sonst mit einem offenen Menue vor einer Seite,
 * durch die er weitertabbt, als waere nichts.
 */
export interface MenueProps {
  offen: boolean;
  onSchliessen: () => void;
  titel?: string;
  kennzeichen?: string;
  children: ReactNode;
}

export function Menue({ offen, onSchliessen, titel = 'Menü', kennzeichen, children }: MenueProps) {
  const flaeche = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!offen) return undefined;
    const aufTaste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSchliessen();
    };
    document.addEventListener('keydown', aufTaste);
    // Der erste Knopf im Menue, sonst die Flaeche selbst.
    const erster = flaeche.current?.querySelector<HTMLElement>('button, a, input, [tabindex]');
    erster?.focus();
    return () => document.removeEventListener('keydown', aufTaste);
  }, [offen, onSchliessen]);

  if (!offen) return null;

  return (
    <>
      {/* Ein Knopf und kein `div`: der Schleier schliesst, und was schliesst,
          gehoert der Tastatur genauso wie dem Zeiger. */}
      <button
        type="button"
        className="ara-menue__schleier"
        aria-label={`${titel} schließen`}
        onClick={onSchliessen}
      />
      <div
        className="ara-menue"
        role="dialog"
        aria-modal="true"
        aria-label={titel}
        data-testid={kennzeichen}
        ref={flaeche}
      >
        <div className="ara-menue__kopf">
          <span>{titel}</span>
          <button
            type="button"
            className="ara-menue__zu"
            aria-label={`${titel} schließen`}
            onClick={onSchliessen}
          >
            ×
          </button>
        </div>
        <div className="ara-menue__inhalt">{children}</div>
      </div>
    </>
  );
}
