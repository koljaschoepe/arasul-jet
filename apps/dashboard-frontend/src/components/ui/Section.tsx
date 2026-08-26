/**
 * Section — eine Feldgruppe innerhalb einer Seite, und SectionList — die Spalte
 * darum, die die Trennlinien setzt.
 *
 * Ersetzt fünf Arten, eine Feldgruppe zu trennen: `pb-6 border-b`,
 * `pt-6 border-t`, `space-y-3` ganz ohne Linie, `space-y-5` mit `mb-1` am
 * Titel, und ein alleinstehendes `<div className="border-t border-border" />`
 * als eigenes Trennstück zwischen zwei Abschnitten.
 *
 * **Die Trennlinie gehört zwischen die Abschnitte, nicht an sie.** Der erste
 * Entwurf hatte eine Eigenschaft `divider`, die der letzte Abschnitt einer
 * Seite abschalten musste. Das ist eine Falle: wer einen Abschnitt anhängt,
 * muss daran denken, sie am alten letzten wieder einzuschalten. Genau so ist
 * die doppelte Linie zwischen „Über Arasul" und der damaligen n8n-Anleitung entstanden,
 * die dieser Plan gerade beseitigt hat. Jetzt trägt jeder Abschnitt seine
 * Linie, und `SectionList` nimmt sie dem letzten wieder ab. Eine Stelle,
 * die es entscheidet, und sie sieht die Reihenfolge.
 *
 * Das optionale Symbol bleibt: Passwortverwaltung, Theme-Auswahl,
 * USB-Erkennung und Update-Paket tragen heute eines in der Überschrift. Vier
 * Stellen sind kein Ausrutscher.
 *
 * Überschriftenebene ist `h2`: unterhalb des einen `h1` aus PageHeader ist das
 * die nächste Ebene, und die Einstellungen trugen `h3` ohne ein `h2` dazwischen.
 * Die Schriftgröße bleibt `text-sm font-semibold` und folgt damit der Zeile
 * „Label" der Typografie-Tabelle; Ebene und Größe sind zwei Achsen.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionProps {
  title: string;
  /** Symbol links neben der Überschrift, in der Größe der Zeile. */
  icon?: ReactNode;
  description?: ReactNode;
  /** Aktion rechts neben der Überschrift, etwa ein Schalter. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Section({ title, icon, description, action, children, className }: SectionProps) {
  return (
    <section className={cn('pb-6 border-b border-border', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {icon && (
              <span className="text-muted-foreground [&>svg]:size-4" aria-hidden="true">
                {icon}
              </span>
            )}
            {title}
          </h2>
          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

interface SectionListProps {
  children: ReactNode;
  className?: string;
}

/**
 * Die Abstandsspalte einer Seite. `last-child` und ausdrücklich nicht
 * `last-of-type`: Die Linie fällt nur weg, wenn nach dem Abschnitt gar nichts
 * mehr kommt. Steht dahinter noch etwas, das kein Abschnitt ist, behält er sie.
 * Bis Phase B5 folgte in „Allgemein" die n8n-Anleitung, und dort trennte genau
 * diese Linie.
 * Mit `last-of-type` wäre sie verschwunden, weil der Wähler nur auf die
 * Abschnitte untereinander sieht und nicht auf das, was danach steht.
 *
 * Ein Abschnitt, der bedingt gar nicht gezeichnet wird, zählt nicht mit: React
 * schreibt für einen falschen Zweig nichts ins Dokument, und der Wähler greift
 * auf das Dokument.
 */
export function SectionList({ children, className }: SectionListProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-8',
        '[&>section:last-child]:border-b-0 [&>section:last-child]:pb-0',
        className
      )}
    >
      {children}
    </div>
  );
}
