/**
 * Ein Flow-Lauf zum Nachlesen: Schritte und Gedankengang (Phase D4).
 *
 * WAS EIN LAUF HINTERLÄSST, ist eine Kette von Schritten. Bis D4 waren das nur
 * Werkzeug-Aufrufe und Delegationen — eine Liste von Handgriffen ohne einen
 * Satz dazu. Was das Modell sagte, BEVOR es ein Werkzeug rief, fiel im Runner
 * lautlos weg; seit D4 steht es als Schritt der Art `modell` dazwischen und
 * beantwortet die Frage, die eine reine Werkzeug-Kette offenlässt: warum
 * dieses Werkzeug.
 *
 * DIE SCHRITTE STEHEN FLACH UND EINGERÜCKT, nicht als aufklappbarer Baum. Ein
 * Lauf ist eine Geschichte in zeitlicher Reihenfolge; die inneren Schritte
 * einer Rolle (`parent_step_id`) gehören dazu und nicht hinter einen Klick.
 * Was hinter einem Klick liegt, ist die AUSGABE eines Schritts — die kann
 * mehrere Bildschirme lang sein.
 */
import { useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, Brain, PenLine, Users, Info } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { SkeletonText } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import { formatDate } from '@/utils/formatting';
import type { LaufSchritt } from './useAppVerwaltung';
import { useAppLauf } from './useAppVerwaltung';

/** Der Zustand eines Laufs in einem Wort, mit Farbe. */
export function LaufZustand({ status }: { status: string }) {
  const farbe =
    status === 'fertig'
      ? 'bg-success/15 text-success'
      : status === 'wartend' || status === 'laeuft'
        ? 'bg-primary/15 text-primary'
        : status === 'abgelaufen'
          ? 'bg-warning/15 text-warning'
          : 'bg-destructive/15 text-destructive';
  const wort =
    status === 'laeuft'
      ? 'läuft'
      : status === 'wartend'
        ? 'wartet auf Freigabe'
        : status === 'abgelaufen'
          ? 'Frist abgelaufen'
          : status;
  return <span className={cn('rounded px-1.5 py-0.5 text-ui-xs font-medium', farbe)}>{wort}</span>;
}

const SYMBOL: Record<LaufSchritt['kind'], React.ReactNode> = {
  modell: <Brain className="size-3.5" aria-hidden="true" />,
  werkzeug: <PenLine className="size-3.5" aria-hidden="true" />,
  subagent: <Users className="size-3.5" aria-hidden="true" />,
  hinweis: <Info className="size-3.5" aria-hidden="true" />,
};

function Schritt({ schritt }: { schritt: LaufSchritt }) {
  const [offen, setOffen] = useState(schritt.kind === 'modell');
  const gedanke = schritt.kind === 'modell';
  const eingabe =
    schritt.input && Object.keys(schritt.input).length > 0 ? JSON.stringify(schritt.input) : '';

  return (
    <li
      className={cn('border-b border-border last:border-b-0', schritt.parent_step_id && 'pl-6')}
      data-testid={`schritt-${schritt.id}`}
      data-schritt-art={schritt.kind}
    >
      <button
        type="button"
        onClick={() => setOffen(o => !o)}
        className="flex w-full items-start gap-2 px-1 py-2 text-left hover:bg-accent/40"
      >
        <span className="mt-0.5 shrink-0 text-muted-foreground">
          {offen ? (
            <ChevronDown className="size-3.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-3.5" aria-hidden="true" />
          )}
        </span>
        <span
          className={cn('mt-0.5 shrink-0', gedanke ? 'text-primary' : 'text-muted-foreground')}
          aria-hidden="true"
        >
          {SYMBOL[schritt.kind]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {gedanke ? 'Gedankengang' : schritt.name || schritt.kind}
            </span>
            {schritt.modell && (
              <span className="font-mono text-ui-xs text-muted-foreground">{schritt.modell}</span>
            )}
            {schritt.status !== 'fertig' && (
              <span className="text-ui-xs text-muted-foreground">{schritt.status}</span>
            )}
          </span>
          {!offen && (schritt.output || eingabe) && (
            <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">
              {schritt.output || eingabe}
            </span>
          )}
        </span>
      </button>

      {offen && (
        <div className="ml-9 mb-2 flex flex-col gap-2">
          {eingabe && (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-card p-2 font-mono text-ui-xs text-muted-foreground">
              {eingabe}
            </pre>
          )}
          {schritt.output && (
            <pre
              className={cn(
                'max-h-72 overflow-auto whitespace-pre-wrap break-words rounded border p-2 text-ui-xs',
                gedanke
                  ? 'border-primary/30 bg-primary/5 font-sans text-foreground'
                  : 'border-border bg-card font-mono text-foreground'
              )}
              data-testid={`schritt-${schritt.id}-ausgabe`}
            >
              {schritt.output}
            </pre>
          )}
          {!schritt.output && !eingabe && (
            <p className="text-xs text-muted-foreground">Kein Inhalt.</p>
          )}
        </div>
      )}
    </li>
  );
}

export function LaufAnsicht({
  appId,
  runId,
  onZurueck,
}: {
  appId: string;
  runId: number;
  onZurueck: () => void;
}) {
  const { data: lauf, isLoading, isError } = useAppLauf(appId, runId);

  return (
    <div className="flex flex-col gap-4" data-testid="lauf-ansicht">
      <Button
        variant="ghost"
        size="sm"
        onClick={onZurueck}
        className="self-start"
        data-testid="lauf-zurueck"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Zurück zur App
      </Button>

      {isLoading && <SkeletonText lines={5} />}

      {isError && (
        <p className="text-sm text-muted-foreground" data-testid="lauf-fehler">
          Der Lauf ließ sich nicht laden.
        </p>
      )}

      {lauf && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground">
              Lauf {lauf.id}: {lauf.flow_name}
            </h3>
            <LaufZustand status={lauf.status} />
            <span className="text-ui-xs text-muted-foreground">
              {lauf.stand === 'test' ? 'Teststand' : 'Livestand'}
            </span>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Gestartet</dt>
            <dd className="text-foreground">{formatDate(lauf.created_at)}</dd>
            {lauf.finished_at && (
              <>
                <dt className="text-muted-foreground">Beendet</dt>
                <dd className="text-foreground">{formatDate(lauf.finished_at)}</dd>
              </>
            )}
            {Object.keys(lauf.arguments ?? {}).length > 0 && (
              <>
                <dt className="text-muted-foreground">Argumente</dt>
                <dd className="min-w-0 break-words font-mono text-ui-xs text-foreground">
                  {Object.entries(lauf.arguments)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(', ')}
                </dd>
              </>
            )}
          </dl>

          {lauf.error && (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/10 p-ui-3 text-sm text-destructive"
              data-testid="lauf-grund"
            >
              {lauf.error}
            </p>
          )}

          <div>
            <h4 className="mb-1 text-sm font-semibold text-foreground">
              Schritte und Gedankengang
            </h4>
            {lauf.steps.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="lauf-ohne-schritte">
                Dieser Lauf hat noch keinen Schritt geschrieben.
              </p>
            ) : (
              <ul
                className="rounded-md border border-border"
                data-testid="lauf-schritte"
                data-schritte={lauf.steps.length}
              >
                {lauf.steps.map(s => (
                  <Schritt key={s.id} schritt={s} />
                ))}
              </ul>
            )}
          </div>

          {lauf.result && (
            <div>
              <h4 className="mb-1 text-sm font-semibold text-foreground">Ergebnis</h4>
              <pre
                className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-card p-ui-3 text-sm text-foreground"
                data-testid="lauf-ergebnis"
              >
                {lauf.result}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
