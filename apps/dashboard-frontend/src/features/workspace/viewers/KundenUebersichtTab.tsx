/**
 * KundenUebersichtTab — die Kundenübersicht des CRM-Pakets (Plan 014, Phase 3).
 *
 * Zeigt alle Kunden des AKTIVEN Projekts als Tabelle: je Unterordner von
 * `Kunden/` eine Zeile mit den Feldern aus dem Steckbrief (Firma, Status,
 * letzter Kontakt, Ansprechpartner). Die Daten kommen direkt von der Platte
 * (`GET /projects/:id/kunden`, Steckbrief-Scanner) — wer den Steckbrief im
 * Editor ändert, sieht die Änderung hier sofort. Ein Klick öffnet den
 * Steckbrief des Kunden als Datei-Tab (der Einstieg in den Kundenordner).
 */
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Users } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useActiveProject } from '../useProjects';
import EmptyState from '@/components/ui/EmptyState';

export interface KundenEintrag {
  ordner: string;
  pfad: string;
  steckbrief_pfad: string | null;
  firma: string;
  webseite: string | null;
  branche: string | null;
  ansprechpartner: string | null;
  email: string | null;
  telefon: string | null;
  status: string | null;
  letzter_kontakt: string | null;
}

export default function KundenUebersichtTab() {
  const api = useApi();
  const openTab = useWorkspaceStore(s => s.openTab);
  const { activeProject, activeId } = useActiveProject();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['projekt-kunden', activeId],
    queryFn: () =>
      api.get<{ data: KundenEintrag[] }>(`/projects/${activeId}/kunden`, { showError: false }),
    enabled: !!activeId,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const kunden = data?.data ?? [];

  const oeffneKunde = (kunde: KundenEintrag) => {
    if (!activeId) return;
    // Der Steckbrief ist der Einstieg in den Kundenordner; fehlt er, gibt es
    // (noch) nichts zu öffnen — die Zeile zeigt das über den Hinweis-Text.
    if (kunde.steckbrief_pfad) {
      openTab({
        type: 'projektdatei',
        projectId: activeId,
        filePath: kunde.steckbrief_pfad,
        title: kunde.firma,
      });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="kunden-uebersicht">
      <div className="flex h-ui-header shrink-0 items-center justify-between gap-3 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Users className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate text-sm font-semibold text-foreground">
            Kundenübersicht{activeProject ? ` — ${activeProject.name}` : ''}
          </span>
          <span className="shrink-0 text-ui-xs tabular-nums text-muted-foreground">
            {kunden.length} {kunden.length === 1 ? 'Kunde' : 'Kunden'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          aria-label="Übersicht aktualisieren"
          title="Aktualisieren"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Kunden werden geladen …</p>
        ) : kunden.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="Noch keine Kunden"
            description="Lege im Chat mit /neuer-kunde den ersten Kunden an, die Firma wird automatisch im Web recherchiert."
          />
        ) : (
          <div className="mx-auto w-full max-w-4xl overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-ui-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Firma</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Letzter Kontakt</th>
                  <th className="px-3 py-2 font-medium">Ansprechpartner</th>
                  <th className="px-3 py-2 font-medium">Kontakt</th>
                </tr>
              </thead>
              <tbody>
                {kunden.map(kunde => (
                  <tr
                    key={kunde.ordner}
                    data-testid="kunden-zeile"
                    onClick={() => oeffneKunde(kunde)}
                    className={`border-b border-border/60 last:border-b-0 ${
                      kunde.steckbrief_pfad
                        ? 'cursor-pointer hover:bg-accent/50'
                        : 'text-muted-foreground'
                    }`}
                  >
                    <td className="px-3 py-2">
                      <span className="font-medium text-foreground">{kunde.firma}</span>
                      {!kunde.steckbrief_pfad && (
                        <span className="ml-2 text-ui-xs text-muted-foreground">
                          (kein Steckbrief)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {kunde.status ? (
                        <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-ui-xs text-foreground">
                          {kunde.status}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {kunde.letzter_kontakt ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {kunde.ansprechpartner ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-ui-xs text-muted-foreground">
                      {[kunde.email, kunde.telefon].filter(Boolean).join(' · ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
