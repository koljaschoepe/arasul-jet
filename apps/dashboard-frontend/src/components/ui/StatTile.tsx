/**
 * StatTile — eine Kennzahl, und StatGrid — das Raster darum.
 *
 * Ersetzt die lokale `StatCard` aus `SystemStatus`. Zwei Unterschiede sind der
 * eigentliche Zweck (Befunde F-24 und F-25 aus dem Rundgang vom 19.08.2026):
 *
 * 1. Kein Icon. Ein Herz neben "Arbeitsspeicher" trägt nichts bei, was die
 *    Beschriftung nicht schon sagt, kostet aber ein Drittel der Kachelbreite.
 * Abstände und Schriftgrößen kommen aus der Dichte-Skala (`*-ui-*`), nicht
 * aus der Tailwind-Voreinstellung. `docs/development/DESIGN_SYSTEM.md` schreibt
 * sie für normierte Ansichten vor, und der Systemstatus ist eine davon; er
 * stammt aus der entfernten Dashboard-Startseite. Der abgelöste `StatCard`
 * folgte ihr, und die Kachel steht unmittelbar neben Flächen, die es weiter
 * tun. Farben dagegen tragen die shadcn-Namen, denn dort steht der Rest des
 * Codes: `text-foreground` an 400 Stellen gegen `text-text-primary` an 7.
 * Beide Familien zeigen in `index.css` auf dieselben Werte.
 *
 * 2. Das Raster liegt hier und nicht beim Aufrufer. `SystemStatus` benutzte
 *    `repeat(auto-fit, minmax(11rem, 1fr))`. Auto-fit füllt so viele Spalten,
 *    wie hineinpassen, und bei vier Kacheln ergibt das je nach Fensterbreite
 *    drei plus eine allein in der zweiten Zeile. StatGrid legt die Spaltenzahl
 *    fest: eine, zwei, vier. Nie drei.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StatTileProps {
  /** Was gemessen wird, etwa "Arbeitsspeicher". */
  label: string;
  /** Die Zahl selbst. */
  value: ReactNode;
  /** Einheit hinter der Zahl, etwa "%" oder "°C". Kleiner und gedämpft gesetzt. */
  unit?: string;
  /** Zeile darunter, etwa "25,5 / 61 GB" oder ein Zustandshinweis. */
  note?: ReactNode;
}

export function StatTile({ label, value, unit, note }: StatTileProps) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-ui-3">
      <div className="truncate text-ui-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-ui-1 flex items-baseline gap-ui-1 text-xl font-bold leading-tight text-foreground">
        {value}
        {unit && <span className="text-ui-sm font-medium text-muted-foreground">{unit}</span>}
      </div>
      {note && <div className="mt-ui-1 text-ui-sm text-muted-foreground">{note}</div>}
    </div>
  );
}

interface StatGridProps {
  children: ReactNode;
  className?: string;
}

/** Feste Spaltenzahl statt auto-fit, siehe Kopfkommentar Punkt 2. */
export function StatGrid({ children, className }: StatGridProps) {
  return (
    <div
      className={cn('grid min-w-0 grid-cols-1 gap-ui-2 sm:grid-cols-2 lg:grid-cols-4', className)}
    >
      {children}
    </div>
  );
}
