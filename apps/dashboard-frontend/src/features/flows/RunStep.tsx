/**
 * RunStep — eine Zeile eines Flow-Laufs in der Lauf-Karte (Plan 011, Schritt 15).
 *
 * Zusammengeklappt: Symbol nach Art (Werkzeug/Subagent/Modell/Hinweis), eine
 * Kurzfassung des Auftrags, die Dauer und ein Status-Punkt. Aufgeklappt zeigt es
 * den vollen Auftrag, das verdichtete Ergebnis (was das Modell gesehen hat) und
 * die Rohdaten (die das Modell NICHT gesehen hat — Seiteninhalt, Dateitext).
 *
 * Die Zeile ist rein darstellend: die Rohdaten lädt die Lauf-Karte bei Bedarf
 * nach (ein `?raw=1`-Aufruf für alle Schritte) und reicht sie hier herein.
 */
import { useState } from 'react';
import {
  Bot,
  ChevronRight,
  FileText,
  Globe,
  Loader2,
  Search,
  Sparkles,
  TerminalSquare,
  Wrench,
} from 'lucide-react';
import type { FlowRunStep, FlowRunStatus } from '@/hooks/useFlowRun';

/** Ein Feld aus dem (unbekannt geformten) Schritt-Input als String lesen. */
function feld(input: unknown, ...keys: string[]): string {
  if (input == null || typeof input !== 'object') return '';
  const obj = input as Record<string, unknown>;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v) return v;
  }
  return '';
}

/**
 * Kürzt einen Text auf eine knackige Zeile: erste Zeile, hart auf `max` Zeichen
 * gedeckelt, mit Ellipse. Bewusst NICHT am Punkt trennen — das zerhackt URLs und
 * Befehle. Ein kleines Modell schreibt gern einen Absatz in den Auftrag; die
 * Kopfzeile soll aber nur zeigen, WAS läuft, nicht den ganzen Prompt.
 */
function kuerze(text: string, max = 40): string {
  const eineZeile = text.trim().split('\n', 1)[0]?.trim() ?? '';
  if (eineZeile.length <= max) return eineZeile;
  return eineZeile.slice(0, max).trimEnd() + '…';
}

/** Die Kurzfassung des Auftrags — eine Zeile, die sagt, was der Schritt tut. */
export function stepLabel(step: FlowRunStep): string {
  if (step.kind === 'subagent') {
    const name = step.name || 'Subagent';
    const auftrag = feld(step.input, 'auftrag', 'prompt', 'aufgabe');
    const kurz = kuerze(auftrag);
    return kurz ? `${name} · ${kurz}` : name;
  }
  if (step.kind === 'modell') return 'Modell-Antwort';
  if (step.kind === 'hinweis') return feld(step.input, 'text', 'hinweis') || step.name || 'Hinweis';
  // Werkzeug: je nach echtem Werkzeugnamen (siehe services/flows/tools/) eine
  // sprechende Zeile — Parameterschlüssel wie im Backend (`frage`, `suchbegriff`, …).
  switch (step.name) {
    case 'dateien_lesen': {
      const aktion = feld(step.input, 'aktion').toLowerCase();
      const pfad = feld(step.input, 'pfad') || '/';
      return aktion === 'list' ? `listet ${pfad}` : `liest ${pfad}`;
    }
    case 'dateien_schreiben':
      return `schreibt ${feld(step.input, 'pfad') || '/'}`;
    case 'rag_suche': {
      const q = feld(step.input, 'frage');
      return q ? `sucht: ${kuerze(q)}` : 'durchsucht das Wissen';
    }
    case 'web_suche': {
      const q = feld(step.input, 'suchbegriff');
      return q ? `Web-Suche: ${kuerze(q)}` : 'sucht im Web';
    }
    case 'web_lesen': {
      const u = feld(step.input, 'adresse');
      return u ? `liest ${kuerze(u, 48)}` : 'liest eine Webseite';
    }
    case 'terminal': {
      const cmd = feld(step.input, 'befehl');
      return cmd ? `führt aus: ${kuerze(cmd, 48)}` : 'führt einen Befehl aus';
    }
    // Im Live-Stream kommt eine Delegation als WERKZEUG-Aufruf `subagent` an
    // (erst der gespeicherte Verlauf trägt kind='subagent' + Rollenname) —
    // gleiche Beschriftung wie oben, sonst zeigt dieselbe Karte vor und nach
    // einem Reload verschiedene Zeilen.
    case 'subagent': {
      const rolle = feld(step.input, 'rolle') || 'Subagent';
      const kurz = kuerze(feld(step.input, 'auftrag'));
      return kurz ? `${rolle} · ${kurz}` : rolle;
    }
    default:
      return `nutzt ${step.name || 'Werkzeug'}`;
  }
}

function stepIcon(step: FlowRunStep) {
  if (step.kind === 'subagent' || step.name === 'subagent') return <Bot className="size-3.5" />;
  if (step.kind === 'modell') return <Sparkles className="size-3.5" />;
  switch (step.name) {
    case 'dateien_lesen':
    case 'dateien_schreiben':
      return <FileText className="size-3.5" />;
    case 'rag_suche':
      return <Search className="size-3.5" />;
    case 'web_suche':
    case 'web_lesen':
      return <Globe className="size-3.5" />;
    case 'terminal':
      return <TerminalSquare className="size-3.5" />;
    default:
      return <Wrench className="size-3.5" />;
  }
}

/** Status als Text & Farbe — keine Punkte/Icons (Nutzer-Entscheid 2026-07-28). */
const STATUS_META: Record<FlowRunStatus, { label: string; cls: string }> = {
  laeuft: { label: 'läuft', cls: 'text-primary' },
  fertig: { label: 'fertig', cls: 'text-success' },
  fehler: { label: 'Fehler', cls: 'text-destructive' },
  abgebrochen: { label: 'abgebrochen', cls: 'text-muted-foreground' },
};

/** Die Dauer eines Schritts als „1,2 s" / „340 ms", wenn beide Zeitstempel da sind. */
export function stepDauer(step: FlowRunStep): string {
  if (!step.created_at || !step.finished_at) return '';
  const ms = new Date(step.finished_at).getTime() - new Date(step.created_at).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1).replace('.', ',')} s` : `${ms} ms`;
}

interface RunStepProps {
  step: FlowRunStep;
  /** Rohdaten dieses Schritts (von der Karte nachgeladen). `undefined` = noch nicht geladen. */
  rawOutput?: string | null;
  rawLoading?: boolean;
  /** Wird beim ersten Aufklappen gerufen — Anlass für die Karte, die Rohdaten zu laden. */
  onExpand?: () => void;
  /** Kind-Schritte eines Schritts (Agenten-Baum) — für Subagent-Zeilen. */
  holeKinder?: (step: FlowRunStep) => FlowRunStep[];
  /** Rohdaten eines beliebigen Schritts — für die Kind-Zeilen. */
  holeRaw?: (step: FlowRunStep) => string | null | undefined;
  /** Verschachtelungstiefe (0 = oberste Ebene) — steuert nur die Optik. */
  tiefe?: number;
}

export default function RunStep({
  step,
  rawOutput,
  rawLoading,
  onExpand,
  holeKinder,
  holeRaw,
  tiefe = 0,
}: RunStepProps) {
  const [offen, setOffen] = useState(false);
  const dauer = stepDauer(step);
  const laeuft = step.status === 'laeuft';
  const kinder = holeKinder ? holeKinder(step) : [];

  const toggle = () => {
    const neu = !offen;
    setOffen(neu);
    if (neu) onExpand?.();
  };

  return (
    <div className="border-t border-border/60 first:border-t-0" data-testid="run-step">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={offen}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-ui-xs text-muted-foreground hover:bg-accent/50"
      >
        <ChevronRight
          className={`size-3 shrink-0 transition-transform ${offen ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
        <span className="shrink-0 text-muted-foreground">{stepIcon(step)}</span>
        <span className="min-w-0 flex-1 truncate text-foreground">{stepLabel(step)}</span>
        {kinder.length > 0 && (
          <span className="shrink-0 rounded bg-muted px-1 text-[10px] tabular-nums text-muted-foreground">
            {kinder.length} {kinder.length === 1 ? 'Schritt' : 'Schritte'}
          </span>
        )}
        {step.modell && (
          <span
            className="hidden shrink-0 truncate rounded bg-muted px-1 text-[10px] text-muted-foreground sm:inline"
            title={`Modell: ${step.modell}`}
          >
            {step.modell}
          </span>
        )}
        {dauer && <span className="shrink-0 tabular-nums text-muted-foreground/70">{dauer}</span>}
        {laeuft ? (
          <Loader2 className="size-3 shrink-0 animate-spin text-primary" aria-label="läuft" />
        ) : (
          <span className={`shrink-0 text-[10px] font-medium ${STATUS_META[step.status].cls}`}>
            {STATUS_META[step.status].label}
          </span>
        )}
      </button>

      {offen && (
        <div className="space-y-2 px-2 pb-2 pl-7 text-ui-xs" data-testid="run-step-detail">
          <Abschnitt titel="Auftrag">
            <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
              {typeof step.input === 'string'
                ? step.input
                : JSON.stringify(step.input ?? {}, null, 2)}
            </pre>
          </Abschnitt>

          {/* Agenten-Baum: die inneren Werkzeug-Aufrufe dieses Subagenten als
              eigene, wieder aufklappbare Zeilen. */}
          {kinder.length > 0 && (
            <Abschnitt titel="Arbeitsschritte des Agenten">
              <div
                className="overflow-hidden rounded-md border border-border/60"
                data-testid="run-step-children"
              >
                {kinder.map((k, i) => (
                  <RunStep
                    key={k.id ?? `${tiefe}-${i}`}
                    step={k}
                    rawOutput={holeRaw ? holeRaw(k) : undefined}
                    rawLoading={rawLoading}
                    onExpand={onExpand}
                    holeKinder={holeKinder}
                    holeRaw={holeRaw}
                    tiefe={tiefe + 1}
                  />
                ))}
              </div>
            </Abschnitt>
          )}

          {step.output != null && step.output !== '' && (
            <Abschnitt titel="Ergebnis">
              <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] text-foreground">
                {step.output}
              </pre>
            </Abschnitt>
          )}
          <Abschnitt titel="Rohdaten (vom Modell nicht gesehen)">
            {rawLoading ? (
              <span className="text-muted-foreground">lädt …</span>
            ) : rawOutput ? (
              <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
                {rawOutput}
              </pre>
            ) : (
              <span className="text-muted-foreground/60">keine Rohdaten</span>
            )}
          </Abschnitt>
        </div>
      )}
    </div>
  );
}

function Abschnitt({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 font-medium uppercase tracking-wide text-[10px] text-muted-foreground/70">
        {titel}
      </div>
      {children}
    </div>
  );
}
