/**
 * FlowDashboard — die Flow-Zentrale (Detail-Ansicht eines Flows).
 *
 * Klickt man in der Sidebar auf einen Flow, öffnet der zentrale Flow-Tab NICHT
 * mehr direkt den Editor, sondern dieses Dashboard: auf einen Blick, wie der Flow
 * ausgelöst wird (Trigger-URL + kopierbares curl + API-Schlüssel mit Scope
 * `flow:run`), was er tut (Pipeline aus Schritten/Rollen), wohin er schreibt
 * (Arbeitsverzeichnis) und wann er zuletzt lief. Von hier führt „Bearbeiten" in
 * den Editor.
 *
 * Bewusst read-only bis auf die Schlüssel-Verwaltung — die Definition ändert man
 * im Editor, hier geht es ums Betreiben.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Copy,
  KeyRound,
  Loader2,
  Pencil,
  Play,
  Plus,
  Trash2,
  Webhook,
  Wrench,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { useApi } from '@/hooks/useApi';
import { useToast } from '@/contexts/ToastContext';
import type { FlowDefinition, FlowRunSummary, FlowRunStatus } from '@/types/flows';
import FlowRunDetail from './FlowRunDetail';

/** Ein API-Schlüssel, wie ihn GET /v1/external/api-keys liefert. */
interface ApiKey {
  id: number | string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  allowed_endpoints: string[] | null;
  last_used_at: string | null;
}

async function copy(text: string, toast: ReturnType<typeof useToast>, was: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${was} kopiert`);
  } catch {
    toast.error('Kopieren nicht möglich');
  }
}

const STATUS_META: Record<FlowRunStatus, { label: string; cls: string }> = {
  laeuft: { label: 'läuft', cls: 'text-primary' },
  fertig: { label: 'fertig', cls: 'text-success' },
  fehler: { label: 'Fehler', cls: 'text-destructive' },
  abgebrochen: { label: 'abgebrochen', cls: 'text-muted-foreground' },
};

function zeit(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Card({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function FlowDashboard({
  name,
  flow,
  onEdit,
  onDelete,
}: {
  name: string;
  flow: FlowDefinition | undefined;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const triggerUrl = `${origin}/api/v1/external/flows/${name}/run`;
  const curl =
    `curl -X POST '${triggerUrl}' \\\n` +
    `  -H 'X-API-Key: DEIN_SCHLÜSSEL' \\\n` +
    `  -H 'Content-Type: application/json' \\\n` +
    `  -d '{"args": {}}'`;

  // Letzte Läufe dieses Flows — serverseitig gefiltert (?flow=).
  const { data: runsRes } = useQuery({
    queryKey: ['flow-runs', 'fuer-flow', name],
    queryFn: () =>
      api.get<{ data: FlowRunSummary[] }>(
        `/flows/laeufe?limit=20&flow=${encodeURIComponent(name)}`,
        {
          showError: false,
        }
      ),
    refetchInterval: 8000,
    staleTime: 4000,
  });
  const runs = useMemo(() => runsRes?.data ?? [], [runsRes]);

  // Aufgeklappter Lauf: die Detailansicht (Agenten-Baum, live) ersetzt die
  // Karten-Übersicht, bis „Alle Läufe" zurückführt.
  const [laufDetail, setLaufDetail] = useState<FlowRunSummary | null>(null);

  // API-Schlüssel mit Scope flow:run.
  const { data: keysRes } = useQuery({
    queryKey: ['external-api-keys'],
    queryFn: () => api.get<{ api_keys: ApiKey[] }>('/v1/external/api-keys', { showError: false }),
    staleTime: 30_000,
  });
  const flowKeys = useMemo(
    () =>
      (keysRes?.api_keys ?? []).filter(
        k => k.is_active && (k.allowed_endpoints ?? []).includes('flow:run')
      ),
    [keysRes]
  );

  const [neuerKey, setNeuerKey] = useState<string | null>(null);
  const erzeugeKey = useMutation({
    mutationFn: () =>
      api.post<{ api_key: string }>('/v1/external/api-keys', {
        name: `Flow-Trigger ${name}`,
        description: `Erzeugt in der Flow-Zentrale für /${name}`,
        allowed_endpoints: ['flow:run'],
      }),
    onSuccess: res => {
      setNeuerKey(res.api_key);
      qc.invalidateQueries({ queryKey: ['external-api-keys'] });
      toast.success('API-Schlüssel erzeugt — jetzt kopieren, er wird nur einmal gezeigt');
    },
  });

  // Pipeline: bevorzugt die deterministische Schritt-Kette, sonst die Rollen,
  // sonst „modellgetrieben".
  const schritte = flow?.schritte ?? [];
  const rollen = flow?.rollen ?? [];
  const arbeitsordner = flow?.ordner?.find(Boolean) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="flow-dashboard">
      {/* Kopfzeile */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">/{name}</div>
          {flow?.beschreibung && (
            <div className="truncate text-xs text-muted-foreground">{flow.beschreibung}</div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" size="sm" onClick={onEdit}>
            <Pencil className="size-4" /> Bearbeiten
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-4" /> Löschen
          </Button>
        </div>
      </div>

      {laufDetail ? (
        <div className="min-h-0 flex-1 overflow-hidden p-4">
          <div className="mx-auto h-full w-full max-w-3xl">
            <FlowRunDetail
              runId={Number(laufDetail.id)}
              flowName={name}
              gestartet={laufDetail.created_at}
              zurueck={() => setLaufDetail(null)}
            />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            {/* Trigger */}
            <Card
              title="So wird dieser Flow ausgelöst"
              icon={<Webhook className="size-4 text-primary" />}
            >
              <p className="text-xs text-muted-foreground">
                Im Chat per Slash-Befehl{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-foreground">/{name}</code> — oder
                extern per HTTP an diese URL (POST):
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted px-2 py-1.5 font-mono text-xs text-foreground">
                  {triggerUrl}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copy(triggerUrl, toast, 'URL')}
                >
                  <Copy className="size-3.5" /> URL
                </Button>
              </div>
              <div className="relative">
                <pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono text-[11px] leading-relaxed text-foreground">
                  {curl}
                </pre>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="absolute right-2 top-2"
                  onClick={() => copy(curl, toast, 'curl-Beispiel')}
                >
                  <Copy className="size-3.5" /> curl
                </Button>
              </div>

              {/* Schlüssel-Verwaltung */}
              <div className="flex flex-col gap-2 rounded-md border border-border/70 bg-background p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <KeyRound className="size-3.5 text-muted-foreground" /> API-Schlüssel (Scope
                    flow:run)
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={erzeugeKey.isPending}
                    onClick={() => erzeugeKey.mutate()}
                  >
                    {erzeugeKey.isPending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                    Neuer Schlüssel
                  </Button>
                </div>

                {neuerKey && (
                  <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-2">
                    <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
                      {neuerKey}
                    </code>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => copy(neuerKey, toast, 'Schlüssel')}
                    >
                      <Copy className="size-3.5" /> Kopieren
                    </Button>
                  </div>
                )}

                {flowKeys.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    Noch kein Schlüssel mit diesem Scope. Ohne Schlüssel lässt sich der Flow nur im
                    Chat starten.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {flowKeys.map(k => (
                      <li
                        key={k.id}
                        className="flex items-center gap-2 text-[11px] text-muted-foreground"
                      >
                        <KeyRound className="size-3 shrink-0" />
                        <span className="truncate text-foreground">{k.name}</span>
                        <code className="shrink-0 rounded bg-muted px-1">{k.key_prefix}…</code>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>

            {/* Pipeline */}
            <Card title="Ablauf" icon={<Wrench className="size-4 text-primary" />}>
              {schritte.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {schritte.map((s, i) => (
                    <span key={i} className="flex items-center gap-1.5">
                      <span className="flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-xs text-foreground">
                        {s.typ === 'subagent' ? (
                          <Bot className="size-3 text-muted-foreground" />
                        ) : (
                          <Wrench className="size-3 text-muted-foreground" />
                        )}
                        {s.typ === 'subagent' ? (s.rolle ?? 'Rolle') : (s.werkzeug ?? 'Werkzeug')}
                      </span>
                      {i < schritte.length - 1 && (
                        <ArrowRight className="size-3 text-muted-foreground" />
                      )}
                    </span>
                  ))}
                </div>
              ) : rollen.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">
                    Modellgetrieben — das Modell ruft bei Bedarf diese Rollen:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {rollen.map(r => (
                      <span
                        key={r.name}
                        className="flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-xs text-foreground"
                      >
                        <Bot className="size-3 text-muted-foreground" /> {r.name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Modellgetrieben — der Prompt entscheidet selbst über die Werkzeuge.
                </p>
              )}
            </Card>

            {/* Ausgabe */}
            {arbeitsordner && (
              <Card title="Ausgabeort" icon={<Play className="size-4 text-primary" />}>
                <p className="text-xs text-muted-foreground">
                  Dateien schreibt dieser Flow in sein Arbeitsverzeichnis:
                </p>
                <code className="block truncate rounded-md border border-border bg-muted px-2 py-1.5 font-mono text-xs text-foreground">
                  {arbeitsordner === 'projekt://aktiv'
                    ? 'Projektablage des aktiven Projekts'
                    : arbeitsordner}
                </code>
                {arbeitsordner === 'projekt://aktiv' && (
                  <p className="text-[11px] text-muted-foreground">
                    Die Dateien erscheinen im Explorer unter „Projektablage&ldquo;.
                  </p>
                )}
              </Card>
            )}

            {/* Letzte Läufe — jede Zeile öffnet die Detailansicht mit dem
              aufklappbaren Agenten-Baum (laufende Läufe live). */}
            <Card title="Letzte Läufe" icon={<Loader2 className="size-4 text-primary" />}>
              {runs.length === 0 ? (
                <p className="text-xs text-muted-foreground">Noch keine Läufe.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border/60">
                  {runs.map(r => {
                    const meta = STATUS_META[r.status];
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => setLaufDetail(r)}
                          data-testid="flow-run-row"
                          className="-mx-1 flex w-full items-center gap-2 rounded px-1 py-1.5 text-left text-xs hover:bg-accent/50"
                        >
                          {r.status === 'fertig' ? (
                            <CheckCircle2 className="size-3.5 shrink-0 text-success" />
                          ) : r.status === 'fehler' ? (
                            <XCircle className="size-3.5 shrink-0 text-destructive" />
                          ) : r.status === 'laeuft' ? (
                            <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
                          ) : (
                            <XCircle className="size-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <span className={`shrink-0 font-medium ${meta.cls}`}>{meta.label}</span>
                          <span className="shrink-0 text-muted-foreground/70">
                            {r.steps_used === 1 ? '1 Schritt' : `${r.steps_used} Schritte`}
                          </span>
                          <span className="ml-auto shrink-0 text-muted-foreground">
                            {zeit(r.created_at)}
                          </span>
                          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
