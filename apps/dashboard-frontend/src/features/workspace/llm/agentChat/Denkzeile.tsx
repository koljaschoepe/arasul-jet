/**
 * Eine Zeile, die sagt, was gerade passiert (Plan 023 E3).
 *
 * Vorher standen beim Absenden drei Anzeigen nebeneinander: die Aufgabenliste,
 * der Denk-Ticker und eine Statuszeile aus dem Backend. Alle drei zugleich,
 * alle drei träge, und der Denktext darin auf Englisch. Der Nutzer sah viel und
 * erfuhr nichts.
 *
 * Ab jetzt: genau eine Zeile, solange der Lauf läuft. Sie nennt den jüngsten
 * Schritt in derselben deutschen Sprache wie die Schrittliste danach
 * (`schrittText.tsx`, eine Quelle für beide) und zählt die Sekunden mit. Wer
 * mehr sehen will, klappt sie auf; darunter liegen dieselbe Schrittliste und
 * derselbe Gedankengang wie im Verlauf.
 *
 * Zwei Dinge, die die Abnahme verlangt und die deshalb nicht vom Backend
 * abhängen dürfen:
 *
 *  - **Innerhalb einer Sekunde sichtbar.** Die Zeile erscheint, sobald die
 *    Nachricht auf `streaming` steht, also unmittelbar beim Absenden, ohne auf
 *    ein erstes Ereignis aus dem Netz zu warten.
 *  - **Alle zwei Sekunden neu.** Der Sekundenzähler tickt selbst. Käme die
 *    Bewegung nur aus den Schritt-Ereignissen, stünde die Zeile während einer
 *    langen Modellrunde minutenlang still, und niemand könnte von außen
 *    unterscheiden, ob das Gerät arbeitet oder hängt.
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentToolStep } from '@/contexts/ChatContext';
import { agentStepLabel } from './schrittText';

/**
 * Was das Gerät gerade tut, in einem Satzteil.
 *
 * Die Reihenfolge ist eine Rangfolge, keine Geschmacksfrage: ein laufender
 * Werkzeug-Schritt ist die konkreteste Auskunft, die es gibt, und schlägt
 * jeden allgemeinen Satz. Erst wenn es keinen gibt, kommt die Meldung des
 * Backends (Warteschlangenplatz, Modell wird geladen), dann das Denken, und
 * ganz zuletzt ein ehrliches „arbeitet".
 *
 * Der Denktext selbst wird NICHT gezeigt. Er ist englisch, und die Abnahme
 * verlangt eine deutsche Zeile. Aufgeklappt steht er vollständig da.
 */
export function laufText({
  steps,
  statusMessage,
  denktGerade,
}: {
  steps: AgentToolStep[];
  statusMessage?: string;
  denktGerade: boolean;
}): string {
  const laufend = [...steps].reverse().find(s => s.status === 'running');
  if (laufend) {
    return agentStepLabel(laufend);
  }
  if (statusMessage && statusMessage.trim()) {
    return statusMessage.trim();
  }
  if (denktGerade) {
    return 'denkt nach';
  }
  return 'arbeitet';
}

/**
 * Sekunden seit dem Erscheinen dieser Zeile, einmal je Sekunde neu.
 *
 * Die Zeile erscheint mit dem Absenden und verschwindet mit dem Abschluss,
 * ihre Lebensdauer IST also die Laufzeit. Das erspart ein weiteres Feld an
 * `ChatMessage`, das beim Nachladen aus der Datenbank ohnehin fehlen wuerde.
 */
function useSekunden(): number {
  const [start] = useState(() => Date.now());
  const [jetzt, setJetzt] = useState(start);
  useEffect(() => {
    const uhr = setInterval(() => setJetzt(Date.now()), 1000);
    return () => clearInterval(uhr);
  }, []);
  return Math.max(0, Math.floor((jetzt - start) / 1000));
}

/** „12 s" bis 99 Sekunden, danach „2:05 min". */
export function dauerText(sekunden: number): string {
  if (sekunden < 100) {
    return `${sekunden} s`;
  }
  const min = Math.floor(sekunden / 60);
  const rest = String(sekunden % 60).padStart(2, '0');
  return `${min}:${rest} min`;
}

export function Denkzeile({
  steps,
  statusMessage,
  thinking,
  children,
}: {
  steps: AgentToolStep[];
  statusMessage?: string;
  /** Der rohe Gedankengang des Modells, nur aufgeklappt sichtbar. */
  thinking?: string;
  /** Was aufgeklappt darunter steht (Schrittliste, Aufgaben). */
  children?: React.ReactNode;
}) {
  const [offen, setOffen] = useState(false);
  const sekunden = useSekunden();
  const denktGerade = Boolean(thinking && thinking.trim());
  const text = useMemo(
    () => laufText({ steps, statusMessage, denktGerade }),
    [steps, statusMessage, denktGerade]
  );

  return (
    <div className="my-1" data-testid="denkzeile">
      <button
        type="button"
        onClick={() => setOffen(o => !o)}
        className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs text-primary hover:bg-accent"
        aria-expanded={offen}
        aria-live="polite"
      >
        <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-medium" data-testid="denkzeile-text">
          {text}
        </span>
        <span className="shrink-0 tabular-nums opacity-70" data-testid="denkzeile-dauer">
          {dauerText(sekunden)}
        </span>
        <ChevronRight
          className={cn('size-3 shrink-0 transition-transform', offen && 'rotate-90')}
          aria-hidden="true"
        />
      </button>
      {offen && (
        <div className="ml-5 mt-0.5 flex flex-col gap-1" data-testid="denkzeile-details">
          {children}
          {thinking && thinking.trim() && (
            <div className="rounded border border-border bg-card px-2 py-1.5 text-xs whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">
              {thinking}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Denkzeile;
