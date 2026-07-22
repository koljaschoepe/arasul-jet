/**
 * RunCard — die Lauf-Karte eines Skills im Chat-Verlauf (Plan 011, Schritt 15).
 *
 * Bekommt nur eine Lauf-ID und hängt sich über `useSkillRun.verbinden` an den
 * Ereignis-Strom: Ein laufender Lauf wird live gezeigt, ein bereits beendeter
 * liefert seinen gespeicherten Verlauf in einem Rutsch und schließt — dieselbe
 * Karte deckt also „arbeitet gerade" und „steht im Verlauf" ab (Wiederverbinden
 * aus Schritt 12). Die Kopfzeile nennt den Befehl, darunter je Schritt eine
 * RunStep-Zeile, am Ende die Antwort. Der Abbrechen-Knopf bleibt sichtbar,
 * solange der Lauf läuft.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2, Square } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { CompactMarkdown } from '@/components/ui/CompactMarkdown';
import { useSkillRun, type SkillRunStatus, type SkillRunStep } from '@/hooks/useSkillRun';
import RunStep from './RunStep';
import ChangeSummary from './ChangeSummary';

const STATUS_TEXT: Record<SkillRunStatus, string> = {
  laeuft: 'läuft',
  fertig: 'fertig',
  fehler: 'Fehler',
  abgebrochen: 'abgebrochen',
};

const STATUS_KLASSE: Record<SkillRunStatus, string> = {
  laeuft: 'text-primary',
  fertig: 'text-success',
  fehler: 'text-destructive',
  abgebrochen: 'text-muted-foreground',
};

interface RunCardProps {
  runId: number;
  /** Skill-Name aus der Lauf-Liste — als Kopfzeile schon vor dem ersten Frame. */
  skillName?: string;
  onFinished?: () => void;
}

interface RawStep {
  position?: number;
  raw_output?: string | null;
}

export default function RunCard({ runId, skillName, onFinished }: RunCardProps) {
  const api = useApi();
  const run = useSkillRun();
  const { verbinden, abbrechen } = run;

  // Rohdaten je Schritt-Position — bei Bedarf (erstes Aufklappen) einmalig geladen.
  const [rawByPos, setRawByPos] = useState<Record<number, string | null> | null>(null);
  const [rawLoading, setRawLoading] = useState(false);
  const rawAngefragt = useRef(false);

  // Beim Einhängen mit dem Lauf verbinden. Der Hook räumt die Verbindung beim
  // Aushängen selbst auf (AbortController).
  useEffect(() => {
    void verbinden(runId);
  }, [runId, verbinden]);

  // Genau einmal melden, wenn der Lauf terminal wird (z. B. Liste aktualisieren).
  const gemeldet = useRef(false);
  useEffect(() => {
    if (!gemeldet.current && run.status && run.status !== 'laeuft') {
      gemeldet.current = true;
      onFinished?.();
    }
  }, [run.status, onFinished]);

  const ladeRaw = () => {
    if (rawAngefragt.current) return;
    rawAngefragt.current = true;
    setRawLoading(true);
    api
      .get<{ data: { steps?: RawStep[] } }>(`/skills/laeufe/${runId}?raw=1`, { showError: false })
      .then(res => {
        const map: Record<number, string | null> = {};
        for (const s of res.data.steps ?? []) {
          if (typeof s.position === 'number') map[s.position] = s.raw_output ?? null;
        }
        setRawByPos(map);
      })
      .catch(() => setRawByPos({}))
      .finally(() => setRawLoading(false));
  };

  const status = run.status ?? 'laeuft';
  const name = run.skillName ?? skillName ?? '';
  const argWerte = Object.values(run.args).filter(Boolean);
  const laeuft = status === 'laeuft';

  return (
    <div
      className="my-2 overflow-hidden rounded-lg border border-border bg-card"
      data-testid="run-card"
    >
      {/* Kopfzeile: Befehl + Status + Abbrechen */}
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
        {laeuft && <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />}
        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
          <span className="font-medium">/{name}</span>
          {argWerte.length > 0 && (
            <span className="text-muted-foreground"> {argWerte.join(' ')}</span>
          )}
        </span>
        <span className={`shrink-0 text-ui-xs ${STATUS_KLASSE[status]}`}>
          {STATUS_TEXT[status]}
        </span>
        {laeuft && (
          <button
            type="button"
            onClick={() => void abbrechen()}
            aria-label="Lauf abbrechen"
            title="Abbrechen"
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Square className="size-3.5" />
          </button>
        )}
      </div>

      {/* Schritte */}
      {run.steps.length > 0 && (
        <div data-testid="run-steps">
          {run.steps.map((step: SkillRunStep, i) => {
            const pos = step.position ?? i;
            return (
              <RunStep
                key={step.id ?? pos}
                step={step}
                rawOutput={rawByPos ? rawByPos[pos] : undefined}
                rawLoading={rawLoading}
                onExpand={ladeRaw}
              />
            );
          })}
        </div>
      )}

      {/* Datei-Änderungen (neu / geändert / gelöscht, aufklappbar) */}
      <ChangeSummary changes={run.changes} />

      {/* Antwort / Fehler — dieselbe reiche Markdown-Darstellung wie im Chat
          (Überschriften, Listen, Codeblöcke mit Kopier-Knopf), Schritt 19. */}
      {run.result != null && run.result !== '' && (
        <div className="border-t border-border px-2.5 py-2" data-testid="run-result">
          <CompactMarkdown content={run.result} />
        </div>
      )}
      {run.error && (
        <div
          className="border-t border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-ui-xs text-destructive"
          data-testid="run-error"
        >
          {run.error}
        </div>
      )}
    </div>
  );
}
