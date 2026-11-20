/**
 * Das Bildschirmfoto, auf dem der Mitarbeiter EINE Stelle markiert (J42, M7).
 *
 * Ziehen zeichnet einen Rahmen, ein Tippen setzt ein kleines Quadrat um den
 * Punkt; jede neue Geste ersetzt die vorige. Gerechnet wird in Anteilen des
 * Bildes (0 bis 1), damit dieselbe Stelle am Rechner und am Handy dieselbe
 * ist, egal wie groß das Bild gerade gezeigt wird.
 *
 * Zeiger-Ereignisse statt Maus und Berührung getrennt: ein Weg für beide.
 * `touch-none` nur auf dem Bild, damit der Finger dort zeichnet und nicht die
 * Seite rollt; außerhalb rollt das Formular wie immer.
 */
import { useRef, useState, type PointerEvent } from 'react';
import type { Markierung as Stelle } from './bildschirmfoto';

interface Props {
  bild: string;
  markierung: Stelle | null;
  beiMarkierung: (m: Stelle | null) => void;
  /** Das Element des Rahmens, damit der Aufrufer dessen Farbe lesen kann. */
  rahmenRef?: React.Ref<HTMLDivElement>;
}

/** Kleiner als dieser Anteil ist kein Ziehen, sondern ein Tippen. */
const TIPPEN = 0.02;
/** Die Seite des Quadrats um einen getippten Punkt, als Anteil der Breite. */
const QUADRAT = 0.12;

const begrenze = (v: number) => Math.min(1, Math.max(0, v));

export function Markierung({ bild, markierung, beiMarkierung, rahmenRef }: Props) {
  const flaeche = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);

  const anteil = (e: PointerEvent<HTMLDivElement>) => {
    const box = flaeche.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return { x: 0, y: 0, seite: 1 };
    return {
      x: begrenze((e.clientX - box.left) / box.width),
      y: begrenze((e.clientY - box.top) / box.height),
      seite: box.width / box.height,
    };
  };

  const rechteck = (a: { x: number; y: number }, b: { x: number; y: number }): Stelle => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    breite: Math.abs(b.x - a.x),
    hoehe: Math.abs(b.y - a.y),
  });

  const runter = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = anteil(e);
    setStart(p);
    beiMarkierung({ x: p.x, y: p.y, breite: 0, hoehe: 0 });
  };

  const bewegt = (e: PointerEvent<HTMLDivElement>) => {
    if (!start) return;
    beiMarkierung(rechteck(start, anteil(e)));
  };

  const hoch = (e: PointerEvent<HTMLDivElement>) => {
    if (!start) return;
    const p = anteil(e);
    const m = rechteck(start, p);
    setStart(null);
    if (m.breite < TIPPEN && m.hoehe < TIPPEN) {
      // Ein Tippen: ein Quadrat um den Punkt, in Anteilen der Höhe umgerechnet.
      const b = QUADRAT;
      const h = QUADRAT * p.seite;
      beiMarkierung({
        x: begrenze(start.x - b / 2),
        y: begrenze(start.y - h / 2),
        breite: Math.min(b, 1 - begrenze(start.x - b / 2)),
        hoehe: Math.min(h, 1 - begrenze(start.y - h / 2)),
      });
      return;
    }
    beiMarkierung(m);
  };

  return (
    <div className="flex justify-center rounded-md border border-border bg-muted/40 p-2">
      <div
        ref={flaeche}
        className="relative inline-block cursor-crosshair touch-none select-none"
        onPointerDown={runter}
        onPointerMove={bewegt}
        onPointerUp={hoch}
        onPointerCancel={() => setStart(null)}
        data-testid="rueckmeldung-markierung"
      >
        <img
          src={bild}
          alt="Bildschirmfoto der Seite"
          draggable={false}
          className="block max-h-[45vh] w-auto max-w-full rounded-sm"
        />
        {markierung && (
          <div
            ref={rahmenRef}
            aria-hidden="true"
            className="pointer-events-none absolute rounded-sm border-2 border-primary bg-primary/10"
            style={{
              left: `${markierung.x * 100}%`,
              top: `${markierung.y * 100}%`,
              width: `${markierung.breite * 100}%`,
              height: `${markierung.hoehe * 100}%`,
            }}
            data-testid="rueckmeldung-stelle"
          />
        )}
      </div>
    </div>
  );
}
