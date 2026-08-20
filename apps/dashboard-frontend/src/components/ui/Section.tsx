/**
 * Section — eine Feldgruppe innerhalb einer Seite.
 *
 * Ersetzt die von Hand gesetzten Gruppen in Firmenprofil, Kontext,
 * Sprachmodell, Sicherheit und Datenschutz. Dieselbe Klassenkette stand dort
 * mehrfach, mal mit Trennlinie, mal ohne, mal mit `mb-4` unter der
 * Beschreibung, mal ohne.
 *
 * Das optionale Symbol bleibt: Passwortverwaltung, Theme-Auswahl,
 * USB-Erkennung und Update-Paket tragen heute eines in der Überschrift. Vier
 * Stellen sind kein Ausrutscher, und sie fallen zu lassen wäre eine
 * Gestaltungsänderung, die C1 nicht beauftragt ist.
 *
 * Überschriftenebene ist `h2`: unterhalb des einen `h1` aus PageHeader ist das
 * die nächste Ebene, und die Einstellungen tragen heute `h3` ohne ein `h2`
 * dazwischen. Die Schriftgröße bleibt `text-sm font-semibold` und folgt damit
 * der Zeile "Label" der Typografie-Tabelle; Ebene und Größe sind zwei Achsen.
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
  /**
   * Trennlinie unter der Gruppe. Voreingestellt an, weil die Einstellungen
   * die Gruppen so trennen. Die letzte Gruppe einer Seite setzt sie ab.
   */
  divider?: boolean;
  children: ReactNode;
  className?: string;
}

export function Section({
  title,
  icon,
  description,
  action,
  divider = true,
  children,
  className,
}: SectionProps) {
  return (
    <section className={cn(divider && 'pb-6 border-b border-border', className)}>
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

export default Section;
