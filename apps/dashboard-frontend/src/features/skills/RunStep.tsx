/**
 * RunStep — eine Zeile eines Skill-Laufs in der Lauf-Karte (Plan 011, Schritt 15).
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
import type { SkillRunStep, SkillRunStatus } from '@/hooks/useSkillRun';

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

/** Die Kurzfassung des Auftrags — eine Zeile, die sagt, was der Schritt tut. */
export function stepLabel(step: SkillRunStep): string {
  if (step.kind === 'subagent') {
    const auftrag = feld(step.input, 'auftrag', 'prompt', 'aufgabe');
    return auftrag ? `${step.name || 'Subagent'}: ${auftrag}` : step.name || 'Subagent';
  }
  if (step.kind === 'modell') return 'Modell-Antwort';
  if (step.kind === 'hinweis') return feld(step.input, 'text', 'hinweis') || step.name || 'Hinweis';
  // Werkzeug: je nach echtem Werkzeugnamen (siehe services/skills/tools/) eine
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
      return q ? `sucht: ${q}` : 'durchsucht das Wissen';
    }
    case 'web_suche': {
      const q = feld(step.input, 'suchbegriff');
      return q ? `Web-Suche: ${q}` : 'sucht im Web';
    }
    case 'web_lesen': {
      const u = feld(step.input, 'adresse');
      return u ? `liest ${u}` : 'liest eine Webseite';
    }
    case 'terminal': {
      const cmd = feld(step.input, 'befehl');
      return cmd ? `führt aus: ${cmd}` : 'führt einen Befehl aus';
    }
    default:
      return `nutzt ${step.name || 'Werkzeug'}`;
  }
}

function stepIcon(step: SkillRunStep) {
  if (step.kind === 'subagent') return <Bot className="size-3.5" />;
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

const STATUS_FARBE: Record<SkillRunStatus, string> = {
  laeuft: 'bg-primary',
  fertig: 'bg-success',
  fehler: 'bg-destructive',
  abgebrochen: 'bg-muted-foreground',
};

/** Die Dauer eines Schritts als „1,2 s" / „340 ms", wenn beide Zeitstempel da sind. */
export function stepDauer(step: SkillRunStep): string {
  if (!step.created_at || !step.finished_at) return '';
  const ms = new Date(step.finished_at).getTime() - new Date(step.created_at).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1).replace('.', ',')} s` : `${ms} ms`;
}

interface RunStepProps {
  step: SkillRunStep;
  /** Rohdaten dieses Schritts (von der Karte nachgeladen). `undefined` = noch nicht geladen. */
  rawOutput?: string | null;
  rawLoading?: boolean;
  /** Wird beim ersten Aufklappen gerufen — Anlass für die Karte, die Rohdaten zu laden. */
  onExpand?: () => void;
}

export default function RunStep({ step, rawOutput, rawLoading, onExpand }: RunStepProps) {
  const [offen, setOffen] = useState(false);
  const dauer = stepDauer(step);
  const laeuft = step.status === 'laeuft';

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
        {dauer && <span className="shrink-0 tabular-nums text-muted-foreground/70">{dauer}</span>}
        {laeuft ? (
          <Loader2 className="size-3 shrink-0 animate-spin text-primary" aria-label="läuft" />
        ) : (
          <span
            className={`size-2 shrink-0 rounded-full ${STATUS_FARBE[step.status]}`}
            aria-label={step.status}
          />
        )}
      </button>

      {offen && (
        <div className="space-y-2 px-2 pb-2 pl-7 text-ui-xs" data-testid="run-step-detail">
          <Abschnitt titel="Auftrag">
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
              {typeof step.input === 'string'
                ? step.input
                : JSON.stringify(step.input ?? {}, null, 2)}
            </pre>
          </Abschnitt>
          {step.output != null && step.output !== '' && (
            <Abschnitt titel="Ergebnis">
              <div className="whitespace-pre-wrap break-words text-foreground">{step.output}</div>
            </Abschnitt>
          )}
          <Abschnitt titel="Rohdaten (vom Modell nicht gesehen)">
            {rawLoading ? (
              <span className="text-muted-foreground">lädt …</span>
            ) : rawOutput ? (
              <div className="whitespace-pre-wrap break-words text-muted-foreground">
                {rawOutput}
              </div>
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
