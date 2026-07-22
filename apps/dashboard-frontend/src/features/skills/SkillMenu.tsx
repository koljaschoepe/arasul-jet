/**
 * SkillMenu — das Slash-Menü im Chat-Eingabefeld (Plan 011, Schritt 13).
 *
 * Angelehnt an Claude Code: `/` öffnet eine Liste, Tippen filtert nach dem
 * Namen, Pfeiltasten wählen, Enter übernimmt. Jeder Skill trägt rechts ein
 * Stift-Symbol zum Bearbeiten. Unter den Skills stehen zwei feste Befehle:
 * `/skills` (Übersicht) und `/neuer-skill` (Anlegen).
 *
 * Diese Komponente ist rein darstellend: Die Filterung und die aktive Auswahl
 * (Pfeiltasten) steuert der Composer und reicht `items` + `activeIndex` herein.
 * So liegt die gesamte Tastatur-Logik an EINER Stelle (im Eingabefeld), und das
 * Menü muss nur zeichnen und Mausklicks melden.
 */
import { FilePlus2, List, Pencil, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Skill } from '@/types/skills';

/** Die festen Befehle unter den Skills. `name` ist das, was hinter dem `/` steht. */
export const SKILL_COMMANDS = [
  { name: 'skills', label: '/skills', beschreibung: 'Alle Skills verwalten' },
  { name: 'neuer-skill', label: '/neuer-skill', beschreibung: 'Neuen Skill anlegen' },
] as const;

export type SkillCommandName = (typeof SKILL_COMMANDS)[number]['name'];

export type SkillMenuItem =
  | { kind: 'skill'; name: string; beschreibung: string; skill: Skill }
  | { kind: 'command'; name: SkillCommandName; label: string; beschreibung: string };

/**
 * Baut die gefilterte Menü-Liste aus dem Tippen (`query`, ohne führenden `/`)
 * und den verfügbaren Skills. Rein und deshalb direkt testbar.
 *
 * - Gefiltert wird über den Namens-ANFANG (wie ein Befehl: `/rech` → `recherche`).
 * - Passende Skills kommen zuerst, danach die passenden festen Befehle.
 */
export function buildMenuItems(query: string, skills: Skill[]): SkillMenuItem[] {
  const q = query.trim().toLowerCase();
  const passt = (name: string) => name.toLowerCase().startsWith(q);

  const skillItems: SkillMenuItem[] = skills
    .filter(s => passt(s.name))
    .map(s => ({ kind: 'skill', name: s.name, beschreibung: s.beschreibung, skill: s }));

  const commandItems: SkillMenuItem[] = SKILL_COMMANDS.filter(c => passt(c.name)).map(c => ({
    kind: 'command',
    name: c.name,
    label: c.label,
    beschreibung: c.beschreibung,
  }));

  return [...skillItems, ...commandItems];
}

interface SkillMenuProps {
  items: SkillMenuItem[];
  activeIndex: number;
  /** Eintrag übernehmen (Skill einsetzen bzw. Befehl auslösen). */
  onPick: (item: SkillMenuItem) => void;
  /** Stift geklickt — nur bei Skill-Einträgen vorhanden. */
  onEdit: (skillName: string) => void;
  /** Maus über einem Eintrag: hebt die Auswahl mit (hält Tastatur & Maus synchron). */
  onHover: (index: number) => void;
}

export default function SkillMenu({ items, activeIndex, onPick, onEdit, onHover }: SkillMenuProps) {
  return (
    <div
      className="absolute bottom-full left-0 z-20 mb-1 max-h-64 w-72 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md"
      data-testid="skill-menu"
      role="listbox"
      aria-label="Skills"
    >
      {items.map((item, i) => {
        const aktiv = i === activeIndex;
        const istSkill = item.kind === 'skill';
        return (
          <div
            key={`${item.kind}-${item.name}`}
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
            {istSkill ? (
              <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
            ) : item.name === 'neuer-skill' ? (
              <FilePlus2 className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <List className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-foreground">
                {istSkill ? `/${item.name}` : item.label}
              </div>
              {item.beschreibung && (
                <div className="truncate text-ui-xs text-muted-foreground">{item.beschreibung}</div>
              )}
            </div>
            {istSkill && (
              <button
                type="button"
                aria-label={`Skill „${item.name}" bearbeiten`}
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
