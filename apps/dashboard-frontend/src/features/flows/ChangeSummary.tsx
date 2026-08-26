/**
 * ChangeSummary — die Datei-Änderungen eines Flow-Laufs (Plan 011, Schritt 16).
 *
 * Flows schreiben und löschen Dateien ohne Rückfrage. Diese Übersicht ist die
 * Gegenleistung: Am Ende eines Laufs sieht man lückenlos, was passiert ist —
 * neu, geändert, gelöscht, jede Zeile aufklappbar mit Vorher/Nachher.
 *
 * Rein darstellend: Die Daten kommen fertig aus dem Lauf (`useFlowRun.changes`),
 * live gemeldet oder aus dem gespeicherten Verlauf. Der Vergleich selbst
 * passiert serverseitig (changeTracker.js).
 */
import { useState } from 'react';
import { ChevronRight, FilePenLine, FilePlus2, FileX2 } from 'lucide-react';
import type { FlowRunChange } from '@/hooks/useFlowRun';

const ART_META: Record<
  FlowRunChange['art'],
  { label: string; farbe: string; Icon: typeof FilePlus2 }
> = {
  neu: { label: 'neu', farbe: 'text-success', Icon: FilePlus2 },
  geaendert: { label: 'geändert', farbe: 'text-warning', Icon: FilePenLine },
  geloescht: { label: 'gelöscht', farbe: 'text-destructive', Icon: FileX2 },
};

/** „2 neu · 1 geändert · 1 gelöscht" — nur die Arten, die vorkommen. */
function zusammenfassung(changes: FlowRunChange[]): string {
  const zahl: Record<FlowRunChange['art'], number> = { neu: 0, geaendert: 0, geloescht: 0 };
  for (const c of changes) zahl[c.art] += 1;
  return (['neu', 'geaendert', 'geloescht'] as const)
    .filter(art => zahl[art] > 0)
    .map(art => `${zahl[art]} ${ART_META[art].label}`)
    .join(' · ');
}

export default function ChangeSummary({ changes }: { changes: FlowRunChange[] }) {
  const [offen, setOffen] = useState(false);
  if (!changes || changes.length === 0) return null;

  return (
    <div className="border-t border-border" data-testid="change-summary">
      <button
        type="button"
        onClick={() => setOffen(o => !o)}
        aria-expanded={offen}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-ui-xs text-muted-foreground hover:bg-accent/50"
      >
        <ChevronRight
          className={`size-3 shrink-0 transition-transform ${offen ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
        <span className="font-medium text-foreground">Datei-Änderungen ({changes.length})</span>
        <span className="min-w-0 flex-1 truncate">{zusammenfassung(changes)}</span>
      </button>

      {offen && (
        <div data-testid="change-list">
          {changes.map((c, i) => (
            <ChangeRow key={`${c.art}-${c.pfad}-${i}`} change={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChangeRow({ change }: { change: FlowRunChange }) {
  const [offen, setOffen] = useState(false);
  const meta = ART_META[change.art];
  const { Icon } = meta;
  // Bis B2 öffnete ein Knopf die Datei im Editor; ohne Editor bleibt die
  // Vorschau hier das Ergebnis.

  return (
    <div className="border-t border-border/60" data-testid="change-row">
      <div className="flex w-full items-center gap-2 pr-2.5 hover:bg-accent/50">
        <button
          type="button"
          onClick={() => setOffen(o => !o)}
          aria-expanded={offen}
          className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 pl-7 text-left text-ui-xs"
        >
          <ChevronRight
            className={`size-3 shrink-0 transition-transform ${offen ? 'rotate-90' : ''}`}
            aria-hidden="true"
          />
          <Icon className={`size-3.5 shrink-0 ${meta.farbe}`} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate font-mono text-foreground">{change.pfad}</span>
          <span className={`shrink-0 ${meta.farbe}`}>{meta.label}</span>
        </button>
      </div>

      {offen && (
        <div className="space-y-2 px-2.5 pb-2 pl-7 text-ui-xs" data-testid="change-detail">
          {/* Vorhandene Vorschauen immer zeigen; der Hinweis (Binär/zu groß)
              steht daneben, verdeckt sie aber nicht. */}
          {change.vorher != null && (
            <Diff titel="Vorher" text={change.vorher} klasse="text-destructive/90" />
          )}
          {change.nachher != null && (
            <Diff titel="Nachher" text={change.nachher} klasse="text-success" />
          )}
          {change.hinweis && (
            <div className="text-muted-foreground/70 italic">{change.hinweis}</div>
          )}
          {change.gekuerzt && (
            <div className="text-muted-foreground/60">
              … Vorschau gekürzt, die vollständige Datei liegt im erlaubten Ordner.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Diff({ titel, text, klasse }: { titel: string; text: string; klasse: string }) {
  return (
    <div>
      <div className="mb-0.5 font-medium uppercase tracking-wide text-[10px] text-muted-foreground/70">
        {titel}
      </div>
      <pre
        className={`max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-1.5 font-mono text-[11px] ${klasse}`}
      >
        {text}
      </pre>
    </div>
  );
}
