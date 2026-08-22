/**
 * FlowMenu — das Slash-Menü im Chat-Eingabefeld (Plan 011, Schritt 13).
 *
 * Angelehnt an Claude Code: `/` öffnet eine Liste, Tippen filtert nach dem
 * Namen, Pfeiltasten wählen, Enter übernimmt. Jeder Flow trägt rechts ein
 * Stift-Symbol zum Bearbeiten. Unter den Flows stehen zwei feste Befehle:
 * `/flows` (Übersicht) und `/neuer-flow` (Anlegen).
 *
 * Diese Komponente ist rein darstellend: Die Filterung und die aktive Auswahl
 * (Pfeiltasten) steuert der Composer und reicht `items` + `activeIndex` herein.
 * So liegt die gesamte Tastatur-Logik an EINER Stelle (im Eingabefeld), und das
 * Menü muss nur zeichnen und Mausklicks melden.
 */
import { useEffect, useRef } from 'react';
import { FilePlus2, List, Pencil, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Flow } from '@/types/flows';

/** Die festen Befehle unter den Flows. `name` ist das, was hinter dem `/` steht. */
export const FLOW_COMMANDS = [
  { name: 'flows', label: '/flows', beschreibung: 'Alle Flows verwalten' },
  { name: 'neuer-flow', label: '/neuer-flow', beschreibung: 'Neuen Flow anlegen' },
] as const;

export type FlowCommandName = (typeof FLOW_COMMANDS)[number]['name'];

/** Ab so vielen Buchstaben sucht das Menue auch in der Mitte eines Namens. */
const MIN_ENTHAELT = 3;

export type FlowMenuItem =
  | { kind: 'flow'; name: string; beschreibung: string; flow: Flow }
  | { kind: 'command'; name: FlowCommandName; label: string; beschreibung: string };

/**
 * Baut die gefilterte Menü-Liste aus dem Tippen (`query`, ohne führenden `/`)
 * und den verfügbaren Flows. Rein und deshalb direkt testbar.
 *
 * - Gefiltert wird über den Namens-ANFANG (wie ein Befehl: `/rech` → `recherche`).
 * - Passende Flows kommen zuerst, danach die passenden festen Befehle.
 */
export function buildMenuItems(query: string, flows: Flow[]): FlowMenuItem[] {
  const q = query.trim().toLowerCase();
  const beginnt = (name: string) => name.toLowerCase().startsWith(q);
  // Plan 023 E7: enthaelt, aber NACH beginnt und erst ab drei Buchstaben.
  //
  // Ein Befehlsmenue soll vorne treffen, sonst springt die Auswahl beim
  // Tippen. Wer aber "recherche-lang" sucht und "lang" tippt, fand bisher
  // nichts, und drei Buchstaben aus der Mitte sind eine normale Art zu suchen.
  //
  // Die Untergrenze ist kein Geschmack: bei einem einzigen Buchstaben trifft
  // "enthaelt" fast jeden Namen, und die Liste waere nach dem ersten
  // Tastendruck laenger als ohne Filter.
  const enthaelt = (name: string) =>
    q.length >= MIN_ENTHAELT && !beginnt(name) && name.toLowerCase().includes(q);

  const alsFlow = (s: Flow): FlowMenuItem => ({
    kind: 'flow',
    name: s.name,
    beschreibung: s.beschreibung,
    flow: s,
  });
  const alsBefehl = (c: (typeof FLOW_COMMANDS)[number]): FlowMenuItem => ({
    kind: 'command',
    name: c.name,
    label: c.label,
    beschreibung: c.beschreibung,
  });

  return [
    ...flows.filter(s => beginnt(s.name)).map(alsFlow),
    ...FLOW_COMMANDS.filter(c => beginnt(c.name)).map(alsBefehl),
    ...flows.filter(s => enthaelt(s.name)).map(alsFlow),
    ...FLOW_COMMANDS.filter(c => enthaelt(c.name)).map(alsBefehl),
  ];
}

interface FlowMenuProps {
  items: FlowMenuItem[];
  activeIndex: number;
  /** Eintrag übernehmen (Flow einsetzen bzw. Befehl auslösen). */
  onPick: (item: FlowMenuItem) => void;
  /** Stift geklickt — nur bei Flow-Einträgen vorhanden. */
  onEdit: (flowName: string) => void;
  /** Maus über einem Eintrag: hebt die Auswahl mit (hält Tastatur & Maus synchron). */
  onHover: (index: number) => void;
}

export default function FlowMenu({ items, activeIndex, onPick, onEdit, onHover }: FlowMenuProps) {
  const aktivRef = useRef<HTMLDivElement | null>(null);

  /**
   * Plan 023 E7: die Auswahl in Sicht halten.
   *
   * Die Liste ist auf `max-h-64` gedeckelt und scrollt. Bei dreissig Flows
   * passen davon rund fuenf ins Bild; ohne diese Zeilen wandert die Auswahl
   * beim Blaettern aus dem Sichtfeld, und der Nutzer drueckt Tab auf einen
   * Eintrag, den er nicht sieht. Genau das meint die Abnahme mit "bei 30 Flows
   * noch bedienbar".
   *
   * `block: 'nearest'` scrollt nur so weit wie noetig, statt die Auswahl bei
   * jedem Tastendruck in die Mitte zu ruecken.
   */
  useEffect(() => {
    aktivRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <div
      className="absolute bottom-full left-0 z-20 mb-1 max-h-64 w-72 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md"
      data-testid="flow-menu"
      role="listbox"
      aria-label="Flows"
    >
      {items.map((item, i) => {
        const aktiv = i === activeIndex;
        const istFlow = item.kind === 'flow';
        return (
          <div
            key={`${item.kind}-${item.name}`}
            ref={aktiv ? aktivRef : undefined}
            role="option"
            aria-selected={aktiv}
            // Die Pfeiltasten-Steuerung liegt bewusst im Textarea; die Zeile ist
            // nur per Maus bedienbar. tabIndex={-1} macht sie programmatisch
            // fokussierbar (a11y-Regel), ohne sie in die Tab-Reihenfolge zu nehmen.
            tabIndex={-1}
            onMouseMove={() => onHover(i)}
            // mousedown, damit der Textarea-Blur die Auswahl nicht abfängt.
            onMouseDown={e => {
              e.preventDefault();
              onPick(item);
            }}
            className={cn(
              'group flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left',
              aktiv ? 'bg-accent' : 'hover:bg-accent/60'
            )}
          >
            {istFlow ? (
              <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
            ) : item.name === 'neuer-flow' ? (
              <FilePlus2 className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <List className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-foreground">
                {istFlow ? `/${item.name}` : item.label}
              </div>
              {item.beschreibung && (
                <div className="truncate text-ui-xs text-muted-foreground">{item.beschreibung}</div>
              )}
            </div>
            {istFlow && (
              <button
                type="button"
                aria-label={`Flow „${item.name}" bearbeiten`}
                // mousedown wie oben abfangen, aber NICHT als Auswahl werten:
                // stopPropagation trennt „bearbeiten" sauber von „übernehmen".
                onMouseDown={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  onEdit(item.name);
                }}
                className={cn(
                  'shrink-0 rounded-sm p-1 text-muted-foreground hover:bg-border hover:text-foreground',
                  aktiv ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                )}
              >
                <Pencil className="size-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
