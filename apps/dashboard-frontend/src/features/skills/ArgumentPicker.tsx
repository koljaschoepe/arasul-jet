/**
 * ArgumentPicker — die Auswahl für Nicht-Freitext-Argumente (Plan 011, Schritt 14).
 *
 * Landet die Argument-Eingabe (Tab) auf einem Argument vom Typ Datei, Auswahlliste
 * oder Wissensbasis, öffnet sich statt freien Tippens diese Auswahl. Sie bringt
 * ihre eigene Suche und Tastatur mit (Pfeile, Enter, Escape) und meldet beim
 * Übernehmen ZWEI Dinge zurück: den `label` (steht im Feld) und den `value` (geht
 * später an den Lauf). Für eine Wissensbasis ist das die ID, fürs Feld der Name —
 * deshalb sind Label und Wert getrennt.
 *
 * Die Datenquellen: Auswahllisten stehen im Skill selbst (`optionen`),
 * Wissensbasen liefert `/skills/sammlungen`, Dateien der Workspace-Baum
 * (`/spaces/tree`). Der Datei-Wert ist vorerst der Dateiname; wie ein Skill die
 * Datei liest, klärt Schritt 15 (dokumentiert als Naht).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Library, ListChecks } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import type { SkillArgument } from '@/types/skills';

interface PickerItem {
  value: string;
  label: string;
  /** Zweite Zeile (z. B. Ordner/Beschreibung) — optional. */
  detail?: string;
}

interface SammlungenResponse {
  data: { id: string; name: string; slug: string; description?: string }[];
}
interface TreeResponse {
  documents: { id: string; filename: string; title: string | null; space_id: string | null }[];
  spaces: { id: string; name: string }[];
}

interface ArgumentPickerProps {
  arg: SkillArgument;
  onPick: (value: string, label: string) => void;
  onClose: () => void;
}

export default function ArgumentPicker({ arg, onPick, onClose }: ArgumentPickerProps) {
  const api = useApi();
  const [suche, setSuche] = useState('');
  const [aktiv, setAktiv] = useState(0);
  const sucheRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    sucheRef.current?.focus();
  }, []);

  // Wissensbasen nur laden, wenn dieses Argument sie braucht.
  const sammlungen = useQuery({
    queryKey: ['skills', 'sammlungen'],
    queryFn: () => api.get<SammlungenResponse>('/skills/sammlungen', { showError: false }),
    enabled: arg.typ === 'wissensbasis',
    staleTime: 60_000,
  });
  // Workspace-Dateien nur für ein Datei-Argument.
  const baum = useQuery({
    queryKey: ['spaces', 'tree'],
    queryFn: () => api.get<TreeResponse>('/spaces/tree', { showError: false }),
    enabled: arg.typ === 'datei',
    staleTime: 60_000,
  });

  const alle: PickerItem[] = useMemo(() => {
    if (arg.typ === 'auswahl') {
      return (arg.optionen ?? []).map(o => ({ value: o, label: o }));
    }
    if (arg.typ === 'wissensbasis') {
      return (sammlungen.data?.data ?? []).map(s => ({
        value: s.id,
        label: s.name,
        detail: s.description || s.slug,
      }));
    }
    if (arg.typ === 'datei') {
      const spaceName = new Map((baum.data?.spaces ?? []).map(s => [s.id, s.name]));
      return (baum.data?.documents ?? []).map(d => ({
        // Wert = Dateiname (Naht zu Schritt 15); Label = Titel, sonst Dateiname.
        value: d.filename,
        label: d.title || d.filename,
        detail: d.space_id ? spaceName.get(d.space_id) : undefined,
      }));
    }
    return [];
  }, [arg, sammlungen.data, baum.data]);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return alle;
    return alle.filter(i => i.label.toLowerCase().includes(q));
  }, [alle, suche]);

  // Aktive Auswahl im gültigen Bereich halten, wenn sich die Liste ändert.
  useEffect(() => {
    setAktiv(0);
  }, [suche, arg]);

  const laedt =
    (arg.typ === 'wissensbasis' && sammlungen.isLoading) || (arg.typ === 'datei' && baum.isLoading);

  const uebernehmen = (item: PickerItem | undefined) => {
    if (item) onPick(item.value, item.label);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAktiv(i => (gefiltert.length ? (i + 1) % gefiltert.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAktiv(i => (gefiltert.length ? (i - 1 + gefiltert.length) % gefiltert.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      uebernehmen(gefiltert[aktiv]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const Icon = arg.typ === 'datei' ? FileText : arg.typ === 'wissensbasis' ? Library : ListChecks;
  const titel =
    arg.typ === 'datei'
      ? 'Datei wählen'
      : arg.typ === 'wissensbasis'
        ? 'Wissensbasis wählen'
        : `Wert für „${arg.name}"`;

  return (
    <div
      className="absolute bottom-full left-0 z-20 mb-1 flex max-h-72 w-80 flex-col overflow-hidden rounded-md border border-border bg-popover shadow-md"
      data-testid="argument-picker"
      role="dialog"
      aria-label={titel}
    >
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-ui-xs font-medium text-muted-foreground">{titel}</span>
      </div>
      {/* Das Suchfeld ist IMMER da — auch bei einer festen Auswahlliste. Es trägt
          den Fokus und die Tastatur (Pfeile/Enter/Escape); ohne es bliebe der
          Fokus in der Textarea und Enter würde den halben Befehl abschicken. */}
      <input
        ref={sucheRef}
        value={suche}
        onChange={e => setSuche(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Suchen …"
        aria-label="Auswahl durchsuchen"
        className="border-b border-border bg-transparent px-2.5 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-1" role="listbox" aria-label={titel}>
        {laedt && <div className="px-2 py-2 text-ui-xs text-muted-foreground">Wird geladen …</div>}
        {!laedt && gefiltert.length === 0 && (
          <div className="px-2 py-2 text-ui-xs text-muted-foreground">Nichts gefunden.</div>
        )}
        {gefiltert.map((item, i) => (
          <div
            key={`${item.value}-${i}`}
            role="option"
            aria-selected={i === aktiv}
            tabIndex={-1}
            onMouseMove={() => setAktiv(i)}
            onMouseDown={e => {
              e.preventDefault();
              uebernehmen(item);
            }}
            className={`flex cursor-pointer flex-col rounded-sm px-2 py-1.5 ${
              i === aktiv ? 'bg-accent' : 'hover:bg-accent/60'
            }`}
          >
            <span className="truncate text-[13px] text-foreground">{item.label}</span>
            {item.detail && (
              <span className="truncate text-ui-xs text-muted-foreground">{item.detail}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
