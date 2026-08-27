/**
 * Die Mitte, solange keine App offen ist (Phase D1).
 *
 * MITARBEITER-SICHT ZUERST, und das ist die Reihenfolge des Auftrags: was hier
 * steht, gilt für jeden, der sich anmeldet. Der Administrator sieht dasselbe
 * und daneben seine Verwaltungswege — in der Aktivitätsleiste, nicht hier.
 * Eine zweite Übersicht „für Admins" wäre der Anfang von zwei Oberflächen.
 *
 * Drei Sachen, mehr nicht: wer ich bin, welche Apps ich habe, was auf mich
 * wartet. Der Systemzustand (CPU, GPU, Dienste) gehört ausdrücklich NICHT
 * hierher; er steht in den Einstellungen unter System, und ein Mitarbeiter,
 * der einen Urlaubsantrag stellt, hat mit der GPU-Temperatur nichts zu tun.
 */
import { AppWindow, ClipboardCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useOffeneFreigaben } from '@/hooks/useOffeneFreigaben';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useMeineApps, zuEintraegen, type AppEintrag } from './meineApps';

/** Eine App als Kachel. Ein Klick öffnet sie als Tab in der Mitte. */
function AppKachel({ eintrag, onOeffnen }: { eintrag: AppEintrag; onOeffnen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOeffnen}
      data-testid={`uebersicht-app-${eintrag.id}-${eintrag.stand}`}
      className="flex min-h-11 flex-col items-start gap-1 rounded-md border border-border bg-card p-ui-3 text-left transition-colors hover:border-primary/50 hover:bg-accent"
    >
      <span className="flex w-full items-center gap-2">
        <AppWindow className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{eintrag.name}</span>
        {eintrag.stand === 'test' && (
          <span className="shrink-0 rounded bg-warning/15 px-1.5 py-0.5 text-ui-xs font-medium text-warning">
            Test
          </span>
        )}
      </span>
      {eintrag.beschreibung && (
        <span className="line-clamp-2 text-sm text-muted-foreground">{eintrag.beschreibung}</span>
      )}
      <span className="text-ui-xs text-muted-foreground/70">Fassung {eintrag.version}</span>
    </button>
  );
}

export function Uebersicht() {
  const { user } = useAuth();
  const openTab = useWorkspaceStore(s => s.openTab);
  const { data: apps, isLoading } = useMeineApps();
  const { data: freigaben } = useOffeneFreigaben();

  const eintraege = zuEintraegen(apps ?? []);
  const offen = freigaben?.length ?? 0;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <PageHeader
        title={user?.username ? `Guten Tag, ${user.username}` : 'Guten Tag'}
        description="Die Apps, die für dich freigegeben sind. Alles läuft auf diesem Gerät."
      />

      {offen > 0 && (
        <p
          className="mb-6 flex items-center gap-2 rounded-md border border-border bg-card p-ui-3 text-sm text-foreground"
          data-testid="uebersicht-freigaben"
        >
          <ClipboardCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {offen === 1
            ? 'Eine Freigabe wartet auf deine Entscheidung.'
            : `${offen} Freigaben warten auf deine Entscheidung.`}
        </p>
      )}

      {isLoading ? (
        <SkeletonText lines={3} />
      ) : eintraege.length === 0 ? (
        <EmptyState
          icon={<AppWindow />}
          title="Noch keine App für dich"
          description="Ein Administrator gibt Apps für einzelne Menschen frei. Sobald eine für dich dabei ist, steht sie hier und links in der Leiste."
        />
      ) : (
        <div className="grid grid-cols-1 gap-ui-2 sm:grid-cols-2">
          {eintraege.map(e => (
            <AppKachel
              key={`${e.id}:${e.stand}`}
              eintrag={e}
              onOeffnen={() => openTab({ type: 'app', appId: e.id, stand: e.stand, title: e.name })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
