/**
 * FlowDashboard — der Klartext-Steckbrief eines Flows (Flows-Umbau 2026-08-02).
 *
 * Klickt man in der Sidebar auf einen Flow, zeigt der zentrale Flow-Tab diese
 * Ansicht: in Alltagssprache, was der Flow tut, welche Eingaben er braucht,
 * was am Ende herauskommt und wie man ihn startet (im Chat per /name — die
 * frühere „Jetzt ausführen"-Karte ist bewusst entfernt: gestartet wird im Chat
 * oder extern über n8n). Darunter die letzten Läufe mit den erzeugten
 * Dokumenten. Die Integrations-Technik (Trigger-URL, curl, API-Schlüssel)
 * liegt eingeklappt unter „Für Integrationen (n8n)".
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Bot,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  FolderOpen,
  KeyRound,
  ListChecks,
  Loader2,
  MessageSquareText,
  Pencil,
  Plus,
  Trash2,
  Webhook,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { useToast } from '@/contexts/ToastContext';
import type {
  FlowArgument,
  FlowAusgabe,
  FlowDefinition,
  FlowProjektRef,
  FlowRunSummary,
  FlowRunStatus,
} from '@/types/flows';
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

const ARG_TYP_LABEL: Record<FlowArgument['typ'], string> = {
  freitext: 'Freitext',
  datei: 'Datei',
  ordner: 'Ordner',
  auswahl: 'Auswahl',
  wissensbasis: 'Wissensbasis',
};

const FORMAT_LABEL: Record<FlowAusgabe['format'], string> = {
  keins: 'Antwort im Chat (keine Datei)',
  markdown: 'Markdown-Datei',
  pdf: 'PDF-Dokument',
  docx: 'Word-Dokument',
};

const STUFE_LABEL: Record<string, string> = {
  kurz: 'kurz (½–1 Seite)',
  mittel: 'mittel (2–4 Seiten)',
  ausfuehrlich: 'ausführlich (5+ Seiten)',
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

/** Eine Zeile des Steckbriefs: Label links, Inhalt rechts. */
function SteckbriefZeile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 text-xs">
      <span className="w-24 shrink-0 pt-0.5 text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1 text-foreground">{children}</div>
    </div>
  );
}

/** Die Ausgabe-Deklaration als lesbare Zeile(n). */
function ausgabeText(ausgabe: FlowAusgabe | undefined): string {
  if (!ausgabe || ausgabe.format === 'keins') {
    return FORMAT_LABEL.keins;
  }
  const teile: string[] = [FORMAT_LABEL[ausgabe.format]];
  if (ausgabe.vorlage) teile.push(`Vorlage „${ausgabe.vorlage}"`);
  if (ausgabe.laenge?.wortzahl) teile.push(`~${ausgabe.laenge.wortzahl} Wörter`);
  else if (ausgabe.laenge?.stufe)
    teile.push(STUFE_LABEL[ausgabe.laenge.stufe] ?? ausgabe.laenge.stufe);
  if (ausgabe.sprache) teile.push(ausgabe.sprache);
  if (ausgabe.tonalitaet) teile.push(ausgabe.tonalitaet);
  return teile.join(' · ');
}

export default function FlowDashboard({
  name,
  flow,
  projekt = null,
  onEdit,
  onDelete,
}: {
  name: string;
  flow: FlowDefinition | undefined;
  /** Projekt eines projektgebundenen Flows (Plan 014); null = global. */
  projekt?: FlowProjektRef | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const triggerUrl = `${origin}/api/v1/external/flows/${name}/run`;
  // `ordner_ziel` (optional) lenkt die Enddateien des Laufs in einen
  // Projektablage-Ordner, z. B. den Kundenordner: projekt://aktiv/kunden/x.
  const curl =
    `curl -X POST '${triggerUrl}' \\\n` +
    `  -H 'X-API-Key: DEIN_SCHLÜSSEL' \\\n` +
    `  -H 'Content-Type: application/json' \\\n` +
    `  -d '{"args": {}, "ordner_ziel": "projekt://aktiv"}'`;

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

  // Flow-Wechsel schließt eine offene Lauf-Detailansicht — sonst zeigt der
  // Steckbrief des neuen Flows noch den Lauf des vorherigen.
  useEffect(() => {
    setLaufDetail(null);
  }, [name]);

  // Integrations-Bereich (n8n) — eingeklappt, Technik nur auf Wunsch.
  const [integrationOffen, setIntegrationOffen] = useState(false);

  // „Ab Fehler wiederholen": startet einen neuen Lauf, der die Ausgaben der
  // erfolgreichen Schritte des alten übernimmt (nur Flows mit Schritt-Kette).
  const wiederholen = useMutation({
    mutationFn: (runId: FlowRunSummary['id']) =>
      api.post<{ data: { runId: number } }>(`/flows/laeufe/${runId}/wiederholen`, {}),
    onSuccess: res => {
      toast.success('Neuer Lauf gestartet — erfolgreiche Schritte werden übernommen');
      qc.invalidateQueries({ queryKey: ['flow-runs', 'fuer-flow', name] });
      // Direkt in den neuen Lauf springen — dort sieht man live, wo er aufsetzt.
      setLaufDetail({
        id: res.data.runId,
        flow_name: name,
        conversation_id: null,
        status: 'laeuft',
        steps_used: 0,
        created_at: new Date().toISOString(),
        finished_at: null,
      });
    },
  });

  // API-Schlüssel mit Scope flow:run — erst laden, wenn der Bereich offen ist.
  const { data: keysRes } = useQuery({
    queryKey: ['external-api-keys'],
    queryFn: () => api.get<{ api_keys: ApiKey[] }>('/v1/external/api-keys', { showError: false }),
    staleTime: 30_000,
    enabled: integrationOffen,
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
        description: `Erzeugt in der Flow-Ansicht für /${name}`,
        allowed_endpoints: ['flow:run'],
      }),
    onSuccess: res => {
      setNeuerKey(res.api_key);
      qc.invalidateQueries({ queryKey: ['external-api-keys'] });
      toast.success('API-Schlüssel erzeugt — jetzt kopieren, er wird nur einmal gezeigt');
    },
  });

  const argumente = flow?.argumente ?? [];
  const schritte = flow?.schritte ?? [];
  const rollen = flow?.rollen ?? [];
  const ordnerArgument = argumente.find(a => a.typ === 'ordner');
  const festerOrdner = flow?.ordner?.find(Boolean) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="flow-dashboard">
      {/* Kopfzeile */}
      {/* Zweizeiliger Kopf (Titel + optionale Beschreibung): min-h-ui-header
          hält die einheitliche Panel-Kopfhöhe (Plan 016) und wächst nur, wenn
          eine Beschreibung vorhanden ist — statt fester Höhe, die klippt. */}
      <div className="flex min-h-ui-header shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">/{name}</span>
            <span
              data-testid="flow-scope-badge"
              className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-ui-xs text-muted-foreground"
            >
              {projekt ? `Projekt „${projekt.name}“` : 'Global'}
            </span>
          </div>
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
            {/* Steckbrief — was dieser Flow ist, in Alltagssprache. */}
            <Card title="Steckbrief" icon={<ListChecks className="size-4 text-primary" />}>
              {flow?.beschreibung && <p className="text-xs text-foreground">{flow.beschreibung}</p>}

              <div className="flex flex-col gap-2">
                <SteckbriefZeile label="Eingaben">
                  {argumente.length === 0 ? (
                    <span className="text-muted-foreground">keine — der Flow startet direkt</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {argumente.map(a => (
                        <span
                          key={a.name}
                          title={a.beschreibung || undefined}
                          className="flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5"
                        >
                          {a.typ === 'ordner' && (
                            <FolderOpen className="size-3 text-muted-foreground" />
                          )}
                          {a.typ === 'datei' && (
                            <FileText className="size-3 text-muted-foreground" />
                          )}
                          {a.name}
                          <span className="text-muted-foreground">
                            · {ARG_TYP_LABEL[a.typ]}
                            {a.pflicht ? '' : ' (optional)'}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </SteckbriefZeile>

                <SteckbriefZeile label="Ausgabe">{ausgabeText(flow?.ausgabe)}</SteckbriefZeile>

                <SteckbriefZeile label="Arbeitsordner">
                  {ordnerArgument ? (
                    <span>
                      wird beim Start gewählt (Eingabe „{ordnerArgument.name}&ldquo;) — dort liest
                      der Flow seinen Kontext und legt das Ergebnis ab
                    </span>
                  ) : festerOrdner ? (
                    <code className="rounded bg-muted px-1 py-0.5">
                      {festerOrdner === 'projekt://aktiv'
                        ? 'Projektablage des aktiven Projekts'
                        : festerOrdner}
                    </code>
                  ) : (
                    <span className="text-muted-foreground">
                      keiner — der Flow schreibt keine Dateien
                    </span>
                  )}
                </SteckbriefZeile>

                <SteckbriefZeile label="Start">
                  <span>
                    im Chat mit{' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-foreground">/{name}</code> —
                    oder automatisch über n8n (siehe unten)
                  </span>
                </SteckbriefZeile>

                {/* Ablauf nur zeigen, wenn der Flow wirklich eine Pipeline hat —
                    für den Standard-Flow ist das Rauschen. */}
                {(schritte.length > 0 || rollen.length > 0) && (
                  <SteckbriefZeile label="Ablauf">
                    {schritte.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {schritte.map((s, i) => (
                          <span key={i} className="flex items-center gap-1.5">
                            <span className="flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5">
                              {s.typ === 'subagent' ? (
                                <Bot className="size-3 text-muted-foreground" />
                              ) : (
                                <Wrench className="size-3 text-muted-foreground" />
                              )}
                              {s.typ === 'subagent'
                                ? (s.rolle ?? 'Rolle')
                                : (s.werkzeug ?? 'Werkzeug')}
                            </span>
                            {i < schritte.length - 1 && (
                              <ArrowRight className="size-3 text-muted-foreground" />
                            )}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-muted-foreground">
                          modellgesteuert mit Bausteinen:
                        </span>
                        {rollen.map(r => (
                          <span
                            key={r.name}
                            className="flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5"
                          >
                            <Bot className="size-3 text-muted-foreground" /> {r.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </SteckbriefZeile>
                )}
              </div>
            </Card>

            {/* Letzte Läufe — jede Zeile öffnet die Detailansicht mit dem
              aufklappbaren Agenten-Baum (laufende Läufe live) und den
              erzeugten Dokumenten. */}
            <Card title="Letzte Läufe" icon={<MessageSquareText className="size-4 text-primary" />}>
              {runs.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Noch keine Läufe. Starte den Flow im Chat mit{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-foreground">/{name}</code>.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-border/60">
                  {runs.map(r => {
                    const meta = STATUS_META[r.status];
                    return (
                      <li key={r.id}>
                        {/* Nutzer-Entscheid 2026-07-28: Status nur als Text & Farbe —
                          keine Icon-Punkte am Zeilenanfang. Läuft-Zustand behält
                          den Spinner als einzige Bewegung. Der Wiederholen-Knopf
                          steht NEBEN der klickbaren Zeile (keine Knöpfe in Knöpfen). */}
                        <div className="-mx-1 flex w-full items-center gap-2 rounded px-1 hover:bg-accent/50">
                          <button
                            type="button"
                            onClick={() => setLaufDetail(r)}
                            data-testid="flow-run-row"
                            className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-xs"
                          >
                            <span className="shrink-0 text-muted-foreground">
                              {zeit(r.created_at)}
                            </span>
                            {r.steps_used > 0 && (
                              <span className="shrink-0 text-muted-foreground/70">
                                {r.steps_used === 1 ? '1 Schritt' : `${r.steps_used} Schritte`}
                              </span>
                            )}
                            <span
                              className={`ml-auto flex shrink-0 items-center gap-1.5 font-medium ${meta.cls}`}
                            >
                              {r.status === 'laeuft' && (
                                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                              )}
                              {meta.label}
                            </span>
                          </button>
                          {r.status === 'fehler' && schritte.length > 0 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 shrink-0 px-2 text-[11px]"
                              disabled={wiederholen.isPending}
                              onClick={() => wiederholen.mutate(r.id)}
                              data-testid="run-wiederholen"
                            >
                              {wiederholen.isPending ? 'Startet …' : 'Ab Fehler wiederholen'}
                            </Button>
                          )}
                          <button
                            type="button"
                            onClick={() => setLaufDetail(r)}
                            aria-label={`Lauf vom ${zeit(r.created_at)} öffnen`}
                            className="shrink-0 py-1.5"
                          >
                            <ChevronRight className="size-3.5 text-muted-foreground/60" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            {/* Für Integrationen (n8n) — eingeklappt, weil Technik. */}
            <section className="rounded-lg border border-border bg-card">
              <button
                type="button"
                onClick={() => setIntegrationOffen(o => !o)}
                aria-expanded={integrationOffen}
                data-testid="integration-toggle"
                className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground hover:bg-accent/40"
              >
                <ChevronDown
                  className={cn(
                    'size-4 text-muted-foreground transition-transform',
                    !integrationOffen && '-rotate-90'
                  )}
                />
                <Webhook className="size-4 text-primary" />
                Für Integrationen (n8n)
              </button>

              {integrationOffen && (
                <div className="flex flex-col gap-3 border-t border-border p-4">
                  <p className="text-xs text-muted-foreground">
                    Extern starten per HTTP (POST) — z. B. aus einem n8n-Workflow. Mit{' '}
                    <code className="rounded bg-muted px-1 py-0.5">ordner_ziel</code> lenkst du das
                    Ergebnis pro Aufruf in einen bestimmten Ordner (z. B. den Kundenordner).
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
                        Noch kein Schlüssel mit diesem Scope. Ohne Schlüssel lässt sich der Flow nur
                        im Chat starten.
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
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
