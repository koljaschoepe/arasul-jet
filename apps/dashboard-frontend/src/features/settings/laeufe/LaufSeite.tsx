/**
 * Ein Lauf auf einer eigenen Seite, unter seiner eigenen Adresse
 * (`/workspace/verwaltung/laeufe/<nummer>`): so lässt er sich verlinken und
 * frisch laden. Der Weg zurück führt zur Liste mit derselben Auswahl.
 */
import { ArrowLeft, ListOrdered } from 'lucide-react';
import { Button, Kopf } from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { LaufDetail, LaufZustand } from '../apps/LaufAnsicht';
import { LaufAktionen } from './LaufAktionen';
import { personText } from './personText';
import { useLauf } from './useLaeufe';

export function LaufSeite({
  runId,
  appName,
  onZurueck,
}: {
  runId: number;
  appName: (appId: string | null | undefined) => string;
  onZurueck: () => void;
}) {
  const { data: lauf, isLoading, isError, error } = useLauf(runId);
  const nichtDa = isError && (error as { status?: number } | null)?.status === 404;

  return (
    <div className="flex flex-col gap-4" data-testid="lauf-seite">
      <Button
        variant="ghost"
        size="sm"
        onClick={onZurueck}
        className="self-start"
        data-testid="lauf-zurueck"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Zurück zu den Läufen
      </Button>

      {isLoading && <SkeletonText lines={5} />}

      {isError && (
        <p className="text-sm text-muted-foreground" data-testid="lauf-fehler">
          {nichtDa ? `Einen Lauf ${runId} gibt es nicht.` : 'Der Lauf ließ sich nicht laden.'}
        </p>
      )}

      {lauf && (
        <>
          <Kopf titel={`Lauf ${lauf.id}: ${lauf.flow_name}`} symbol={<ListOrdered />} />
          <div className="flex flex-wrap items-center gap-2">
            <LaufZustand status={lauf.status} />
            <span className="text-xs text-muted-foreground" data-testid="lauf-seite-app">
              {appName(lauf.app_id)}
              {lauf.stand ? (lauf.stand === 'test' ? ', Test' : ', Live') : ''}
            </span>
            <LaufAktionen lauf={lauf} />
          </div>
          <LaufDetail lauf={lauf} person={personText(lauf)} />
        </>
      )}
    </div>
  );
}
