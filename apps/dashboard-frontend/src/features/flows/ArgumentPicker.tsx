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
 * Die Datenquellen: Auswahllisten stehen im Flow selbst (`optionen`),
 * Wissensbasen liefert `/flows/sammlungen`, Dateien der Workspace-Baum
 * (`/spaces/tree`). Der Datei-Wert ist vorerst der Dateiname; wie ein Flow die
 * Datei liest, klärt Schritt 15 (dokumentiert als Naht).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, FolderOpen, Library, ListChecks } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import type { FlowArgument } from '@/types/flows';

interface PickerItem {
  value: string;
  label: string;
  /** Zweite Zeile (z. B. Ordner/Beschreibung) — optional. */
  detail?: string;
}

/**
 * Sinnvoller Anzeige-Titel oder null (F-10). Viele PDF-Export-Werkzeuge betten
 * die Literale „Untitled"/„Untitled document"/„Unbenannt" o. Ä. als PDF-Titel
 * ein; die landen dann 1:1 in `documents.title`. Ein reiner Falsy-Check
 * (`title || filename`) greift da nicht, weil der Titel technisch gefüllt ist.
 * Deshalb zusätzlich leere/whitespace-Titel und die bekannten „ohne Titel"-
 * Varianten (DE/EN/FR/IT/ES) als „kein Titel" behandeln → Dateiname anzeigen.
 * Die Liste ist bewusst nicht erschöpfend (locale-abhängig), deckt aber die
 * gemeldeten Fälle ab.
 */
const OHNE_TITEL =
  /^(untitled|unbenannt|ohne titel|sans titre|senza titolo|sin t[íi]tulo)(\s+(document|dokument))?$/i;
function sinnvollerTitel(title: string | null): string | null {
  const t = (title ?? '').trim();
  if (!t || OHNE_TITEL.test(t)) {
    return null;
  }
  return t;
}

interface SammlungenResponse {
  data: { id: string; name: string; slug: string; description?: string }[];
}
interface TreeResponse {
  documents: { id: string; filename: string; title: string | null; space_id: string | null }[];
  spaces: { id: string; name: string }[];
}
interface AktivesProjektResponse {
  data: { project: { id: string; name: string } | null };
}
interface AblageResponse {
  data: { eintraege: { pfad: string; name: string; typ: 'ordner' | 'datei' }[] };
}

interface ArgumentPickerProps {
  arg: FlowArgument;
  onPick: (value: string, label: string) => void;
  onClose: () => void;
}

export default function ArgumentPicker({ arg, onPick, onClose }: ArgumentPickerProps) {
  const api = useApi();
  const [suche, setSuche] = useState('');
  const [aktiv, setAktiv] = useState(0);
  // Ordner-Argumente können auf ANDERE Projekte zeigen (Plan 014, Phase 1:
  // projektübergreifende Flows). null = das aktive Projekt (projekt://aktiv).
  const [gewaehltesProjekt, setGewaehltesProjekt] = useState<string | null>(null);
  const sucheRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    sucheRef.current?.focus();
  }, []);

  // Wissensbasen nur laden, wenn dieses Argument sie braucht.
  const sammlungen = useQuery({
    queryKey: ['flows', 'sammlungen'],
    queryFn: () => api.get<SammlungenResponse>('/flows/sammlungen', { showError: false }),
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

  // Ordner der Projektablage nur für ein Ordner-Argument (Kundenordner-Fall).
  // Bewusst über das AKTIVE Projekt (dieselbe Sicht wie der Explorer); der
  // Wert ist die stabile projekt://aktiv-Form, die der Runner auflöst.
  const aktivesProjekt = useQuery({
    queryKey: ['projects', 'active'],
    queryFn: () => api.get<AktivesProjektResponse>('/projects/active', { showError: false }),
    enabled: arg.typ === 'ordner',
    staleTime: 30_000,
  });
  const aktivId = aktivesProjekt.data?.data.project?.id ?? null;
  // Für die Projektwahl: alle Projekte (nur beim Ordner-Argument geladen).
  const projekte = useQuery({
    queryKey: ['projects'],
    queryFn: () =>
      api.get<{ data: { id: string; name: string }[] }>('/projects', { showError: false }),
    enabled: arg.typ === 'ordner',
    staleTime: 30_000,
  });
  const projektId = gewaehltesProjekt ?? aktivId;
  const ordnerBaum = useQuery({
    queryKey: ['projekt-dateien', projektId],
    queryFn: () => api.get<AblageResponse>(`/projects/${projektId}/dateien`, { showError: false }),
    enabled: arg.typ === 'ordner' && !!projektId,
    staleTime: 30_000,
  });
  // Werte im aktiven Projekt bleiben in der stabilen projekt://aktiv-Form;
  // ein anderes Projekt wird über seine UUID adressiert (projekt://<uuid>).
  const projektPrefix =
    projektId && projektId !== aktivId ? `projekt://${projektId}` : 'projekt://aktiv';

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
        // Wert = Dateiname (Naht zu Schritt 15); Label = sinnvoller Titel, sonst
        // Dateiname — nie „Untitled" (F-10).
        value: d.filename,
        label: sinnvollerTitel(d.title) ?? d.filename,
        detail: d.space_id ? spaceName.get(d.space_id) : undefined,
      }));
    }
    if (arg.typ === 'ordner') {
      const ordner = (ordnerBaum.data?.data.eintraege ?? [])
        .filter(e => e.typ === 'ordner')
        .map(e => ({
          value: `${projektPrefix}/${e.pfad}`,
          label: e.name,
          detail: e.pfad.includes('/') ? e.pfad : undefined,
        }));
      return [
        { value: projektPrefix, label: 'Projektablage (Wurzel)', detail: 'gesamtes Projekt' },
        ...ordner,
      ];
    }
    return [];
  }, [arg, sammlungen.data, baum.data, ordnerBaum.data, projektPrefix]);

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
    (arg.typ === 'wissensbasis' && sammlungen.isLoading) ||
    (arg.typ === 'datei' && baum.isLoading) ||
    (arg.typ === 'ordner' && (aktivesProjekt.isLoading || ordnerBaum.isLoading));

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

  const Icon =
    arg.typ === 'datei'
      ? FileText
      : arg.typ === 'ordner'
        ? FolderOpen
        : arg.typ === 'wissensbasis'
          ? Library
          : ListChecks;
  const titel =
    arg.typ === 'datei'
      ? 'Datei wählen'
      : arg.typ === 'ordner'
        ? 'Ordner wählen'
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
      {/* Projektwahl beim Ordner-Argument (Plan 014): globale Flows dürfen auf
          Ordner ANDERER Projekte zeigen — Standard bleibt das aktive Projekt. */}
      {arg.typ === 'ordner' && (projekte.data?.data ?? []).length > 1 && (
        <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
          <span className="shrink-0 text-ui-xs text-muted-foreground">Projekt</span>
          <select
            value={projektId ?? ''}
            onChange={e => setGewaehltesProjekt(e.target.value === aktivId ? null : e.target.value)}
            aria-label="Projekt für den Ordner wählen"
            data-testid="ordner-projekt-wahl"
            className="min-w-0 flex-1 rounded border border-border bg-transparent px-1.5 py-0.5 text-ui-xs text-foreground focus:outline-none"
          >
            {(projekte.data?.data ?? []).map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.id === aktivId ? ' (aktiv)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}
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
