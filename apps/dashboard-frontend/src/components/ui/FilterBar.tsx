/**
 * FilterBar — die eine Leiste zum Umschalten zwischen Unterbereichen.
 *
 * Ersetzt zwei getrennt gewachsene Leisten: die handgebaute `nav` in
 * `SystemSettings` und die shadcn-`TabsList variant="line"` in
 * `PasswordManagement`. Beide sahen ähnlich aus und verhielten sich anders.
 *
 * Rollen: eine echte Tab-Leiste, also `tablist` mit `tab` und `tabpanel`.
 * Der erste Entwurf war eine `nav` mit `aria-current="page"`, wie
 * `SystemSettings` sie heute trägt. Das ist die schwächere der beiden
 * abgelösten Formen: keine der Leisten wechselt eine Seite, beide tauschen
 * Inhalt an Ort und Stelle aus, und genau dafür ist `tablist` gemacht.
 * Zusammenführen auf die schlechtere Form wäre ein Rückschritt gewesen.
 *
 * Deshalb bringt der Baustein den Inhalt mit, statt ihn dem Aufrufer zu
 * überlassen: `tab` und `tabpanel` müssen über Kennungen aufeinander zeigen.
 * Liegen beide Hälften in einer Hand, kann der Aufrufer sie nicht verfehlen.
 *
 * Tastatur nach WAI-ARIA: Pfeile wechseln umlaufend, Pos1 und Ende springen
 * an die Ränder, und nur der aktive Reiter liegt im Tabulator-Lauf.
 * Auf schmalen Fenstern rollt die Leiste seitlich, statt umzubrechen. Eine
 * umgebrochene Leiste mit `border-b` zerlegt die Trennlinie in Stücke.
 */

import { useId, useRef, type ComponentType, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface FilterBarItem<Id extends string = string> {
  id: Id;
  label: string;
  /** Optionales Icon links vom Text, etwa aus lucide-react. */
  icon?: ComponentType<{ className?: string }>;
}

interface FilterBarProps<Id extends string> {
  items: readonly FilterBarItem<Id>[];
  active: Id;
  onChange: (id: Id) => void;
  /** Beschriftung der Leiste für Vorlesewerkzeuge, etwa "System-Unterbereiche". */
  label: string;
  /** Der Inhalt zum aktiven Reiter. */
  children?: ReactNode;
  /** Klassen für die Leiste selbst. */
  className?: string;
  /** Klassen für die Inhaltsfläche. */
  panelClassName?: string;
}

export function FilterBar<Id extends string>({
  items,
  active,
  onChange,
  label,
  children,
  className,
  panelClassName,
}: FilterBarProps<Id>) {
  const kennung = useId();
  const knoepfe = useRef<(HTMLButtonElement | null)[]>([]);
  const panelId = `${kennung}-panel`;
  const tabId = (id: Id) => `${kennung}-tab-${id}`;

  const springe = (ziel: number) => {
    const eintrag = items[ziel];
    if (!eintrag) return;
    onChange(eintrag.id);
    knoepfe.current[ziel]?.focus();
  };

  const beiTaste = (event: KeyboardEvent<HTMLElement>, index: number) => {
    if (items.length === 0) return;
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        // Umlaufend, damit die Leiste an keinem Ende in eine Sackgasse führt.
        springe((index + 1) % items.length);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        springe((index - 1 + items.length) % items.length);
        break;
      case 'Home':
        event.preventDefault();
        springe(0);
        break;
      case 'End':
        event.preventDefault();
        springe(items.length - 1);
        break;
      default:
        break;
    }
  };

  const aktiverEintrag = items.find(item => item.id === active);

  return (
    <>
      <div
        role="tablist"
        aria-label={label}
        aria-orientation="horizontal"
        className={cn('flex gap-1 overflow-x-auto border-b border-border', className)}
      >
        {items.map((item, index) => {
          const Icon = item.icon;
          const istAktiv = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={tabId(item.id)}
              aria-selected={istAktiv}
              aria-controls={panelId}
              // Roving tabindex: die Leiste ist ein Halt im Tabulator-Lauf,
              // nicht so viele Halte, wie sie Reiter hat.
              tabIndex={istAktiv ? 0 : -1}
              ref={element => {
                knoepfe.current[index] = element;
              }}
              onClick={() => onChange(item.id)}
              onKeyDown={event => beiTaste(event, index)}
              className={cn(
                'flex shrink-0 items-center gap-2 -mb-px border-b-2 px-4 py-2.5 text-sm transition-colors',
                istAktiv
                  ? 'border-primary font-semibold text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {Icon && <Icon className={cn('size-4 shrink-0', istAktiv && 'text-primary')} />}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={panelId}
        {...(aktiverEintrag ? { 'aria-labelledby': tabId(aktiverEintrag.id) } : {})}
        className={panelClassName}
      >
        {children}
      </div>
    </>
  );
}

export default FilterBar;
