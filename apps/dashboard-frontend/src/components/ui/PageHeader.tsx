/**
 * PageHeader — die eine Kopfzeile für jede Seite.
 *
 * Ersetzt zwanzig handgebaute Kopfstellen in elf Dateien, die alle dieselbe
 * Klassenkette trugen und trotzdem auseinanderliefen: `ServicesSettings` und
 * `UpdatePage` setzen `text-xl`, die sechs Einstellungsbereiche `text-2xl`.
 * Verbindlich ist `text-2xl`, denn die Typografie-Tabelle in
 * `docs/development/DESIGN.md` gibt für den Seiten-Titel 1.5rem an.
 *
 * Das optionale Symbol gibt es, seit der Werksreset auf diesen Baustein
 * gezogen wurde: dort stand ein Warnzeichen neben dem Titel, und auf einer
 * Seite, die Daten unwiderruflich loescht, ist das keine Verzierung. `Section`
 * hat aus demselben Grund eines.
 *
 * Ein Unterschied zum Vorbild ist Absicht: der Abstand zur Beschreibung sitzt
 * an der Beschreibung (`mt-2`), nicht am Titel (`mb-2`). Ein Kopf ohne
 * Beschreibung hinterlässt sonst einen Abstand, der ins Leere zeigt.
 */

import type { ReactNode } from 'react';

interface PageHeaderProps {
  /** Der Seitentitel. Erscheint als einziges h1 der Seite. */
  title: string;
  /** Symbol links neben dem Titel, in der Größe der Zeile. */
  icon?: ReactNode;
  /** Ein Satz darunter, was die Seite tut. */
  description?: ReactNode;
  /** Aktion rechts, etwa ein Knopf. Rutscht auf schmalen Fenstern unter den Titel. */
  action?: ReactNode;
}

export function PageHeader({ title, icon, description, action }: PageHeaderProps) {
  return (
    <div className="mb-8 pb-6 border-b border-border">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            {icon && (
              <span className="text-muted-foreground [&>svg]:size-6" aria-hidden="true">
                {icon}
              </span>
            )}
            {title}
          </h1>
          {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
