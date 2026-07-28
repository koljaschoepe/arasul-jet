/**
 * FlowRunDetail — die Detailansicht EINES Flow-Laufs in der Flow-Zentrale.
 *
 * Öffnet sich aus „Letzte Läufe" im FlowDashboard. Kern ist dieselbe RunCard
 * wie im Chat: sie verbindet sich über den Ereignis-Strom, zeigt einen noch
 * laufenden Lauf also LIVE (Agenten-Baum wächst mit) und einen beendeten aus
 * dem gespeicherten Verlauf. Drumherum nur eine Kopfzeile mit Zurück-Pfeil
 * und Lauf-Metadaten — die Wahrheit liegt in der Karte.
 */
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import RunCard from './RunCard';

interface FlowRunDetailProps {
  runId: number;
  flowName: string;
  /** Startzeit aus der Lauf-Liste — steht sofort da, ohne auf den Strom zu warten. */
  gestartet?: string | null;
  zurueck: () => void;
}

function zeitpunkt(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function FlowRunDetail({ runId, flowName, gestartet, zurueck }: FlowRunDetailProps) {
  const start = zeitpunkt(gestartet);
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="flow-run-detail">
      <div className="flex shrink-0 items-center gap-2 pb-3">
        <Button type="button" variant="outline" size="sm" onClick={zurueck}>
          <ArrowLeft className="size-4" /> Alle Läufe
        </Button>
        <span className="min-w-0 truncate text-sm font-semibold text-foreground">
          Lauf #{runId}
        </span>
        {start && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{start}</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <RunCard runId={runId} flowName={flowName} />
      </div>
    </div>
  );
}
