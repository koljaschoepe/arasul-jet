/**
 * StoreDetailPage — die Detailseite eines Store-Eintrags (Full-Width). Erreicht
 * über einen Klick auf eine Karte im Raster (Store.tsx); zeigt oben einen
 * prominenten „← Zurück"-Knopf, der zurück ins Raster führt, darunter Name,
 * Status-Badges, eine gut formatierte Info-Sektion und die Primär-Aktion.
 *
 *   - Modell: Beschreibung, dann der Steckbrief (Plan 023 D2): Modell-ID,
 *     Parameter, Quantisierung, Größe, RAM, Einstufung, gemessene
 *     Geschwindigkeit auf diesem Gerät, Kontextlänge, Lizenz und ein Link auf
 *     die Modellkarte. Fähigkeiten; Aktionen Herunterladen/Aktivieren/Als
 *     Standard/Löschen (DownloadContext/ActivationContext überleben
 *     Navigation). Was Ollama zu einem Modell nicht meldet, bekommt kein
 *     leeres Feld, sondern gar keins.
 *   - Erweiterung (Workspace-App): Beschreibung, Status/Bereich; Primär-Aktion
 *     ist der An/Aus-Schalter über `PUT /workspace-apps/:id`
 *     (useWorkspaceApps.setAppEnabled) — derselbe Fluss wie im Kartenraster.
 *
 * Datenbasis: useStoreCatalog (Modelle) + useWorkspaceApps (Erweiterungen).
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Blocks,
  Cpu,
  Download,
  ExternalLink,
  Package,
  Power,
  PowerOff,
  RefreshCw,
  Star,
  Trash2,
  Upload,
  Zap,
  CircleCheck,
  TriangleAlert,
  CircleX,
} from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { Badge } from '@/components/ui/shadcn/badge';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { useMemoryBudget } from '@/hooks/useMemoryBudget';
import { useToast } from '@/contexts/ToastContext';
import { useDownloads } from '@/contexts/DownloadContext';
import { useActivation } from '@/contexts/ActivationContext';
import useConfirm from '@/hooks/useConfirm';
import { useStoreCatalog } from '@/hooks/useStoreCatalog';
import type { CatalogModel, LoadedModel } from '@/hooks/useStoreCatalog';
import { useWorkspaceApps } from '@/hooks/useWorkspaceApps';
import { useExtensions } from '@/hooks/useExtensions';
import type { InstalledExtension } from '@/hooks/useExtensions';
import { extTypeLabel, accessTierLabel } from './storeExtensionFilters';
import type { WorkspaceApp } from '@/hooks/useWorkspaceApps';
import { useExtensionStore } from '@/stores/extensionStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { formatModelSize as formatSize } from '@/utils/formatting';
import { modellAnzeigeName } from '@/utils/modelDisplay';
import { sanitizeUrl } from '@/utils/sanitizeUrl';
import ActivationButton from './ActivationButton';
import DownloadProgress from './DownloadProgress';

const speedLabel: Record<string, string> = {
  fast: 'Schnell',
  balanced: 'Ausgewogen',
  quality: 'Qualität',
  vision: 'Vision',
  ocr: 'OCR',
  embed: 'Embedding',
};

/** Menschlich lesbarer Name des Workspace-Bereichs einer Erweiterung. */
const areaLabel: Record<string, string> = {
  automationen: 'Automation',
  database: 'Datenbank',
};

/** 131072 → „128k Tokens", 8192 → „8k Tokens", 512 → „512 Tokens". */
function formatContextLength(tokens: number): string {
  if (tokens >= 1000) return `${Math.round(tokens / 1024)}k Tokens`;
  return `${tokens} Tokens`;
}

/**
 * HW-Fit-Banner (Plan 009): schätzt anhand des RAM-Bedarfs des Modells gegen
 * das KI-RAM-Budget dieser Jetson-Box, ob es flüssig läuft. Nutzt den
 * gemeinsamen Hook `useMemoryBudget`, also denselben Cache-Eintrag wie die
 * Statusleiste, das Modellraster und die Speicherkachel im Systemstatus. Ohne
 * eigenen Takt: die Seite zeigt einmal an, ob das Modell ins Budget passt, und
 * dafür braucht es keinen Poll auf dem Jetson. Das ist der Vorteil eines
 * Edge-Stores mit bekannter Hardware: rechnen statt raten.
 */
function ModelFitBanner({ requiredGb }: { requiredGb: number }) {
  const { data: budget } = useMemoryBudget({ refetchInterval: false });

  if (!budget || !requiredGb || requiredGb <= 0) return null;
  const totalGb = budget.totalBudgetMb / 1024;
  if (totalGb <= 0) return null;

  let tone: 'good' | 'tight' | 'too-big';
  let text: string;
  if (requiredGb <= totalGb * 0.8) {
    tone = 'good';
    text = `Läuft flüssig auf dieser Box (~${requiredGb} GB von ${totalGb.toFixed(0)} GB KI-RAM).`;
  } else if (requiredGb <= totalGb) {
    tone = 'tight';
    text = `Läuft, könnte aber knapp werden (~${requiredGb} GB von ${totalGb.toFixed(0)} GB KI-RAM).`;
  } else {
    tone = 'too-big';
    text = `Zu groß für den verfügbaren KI-RAM (~${requiredGb} GB, nur ${totalGb.toFixed(0)} GB).`;
  }

  const toneClass = {
    good: 'border-success/30 bg-success/10 text-success',
    tight: 'border-warning/30 bg-warning/10 text-warning',
    'too-big': 'border-destructive/30 bg-destructive/10 text-destructive',
  }[tone];
  const Icon = tone === 'good' ? CircleCheck : tone === 'tight' ? TriangleAlert : CircleX;

  return (
    // Standard-Tailwind-Skala (text-sm / gap-2.5 / px-3 py-2), damit das Banner
    // in denselben Proportionen wie die restliche Detailseite steht (die Misch-
    // ung aus ui-Skala + Standard-Icon wirkte zu klein/verrutscht).
    <div
      className={cn(
        'mt-4 flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm font-medium',
        toneClass
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

/**
 * Steckbrief-Werte (Plan 023 D2). Sie kommen aus Ollamas /api/show, also aus
 * den Gewichten selbst, und stehen deshalb erst da, wenn das Modell auf diesem
 * Geraet liegt. Ein leeres Feld wird nicht gefuellt, sondern weggelassen; die
 * Zeile darunter sagt, warum.
 */
function zahlDeutsch(wert: string | number | null | undefined): string | null {
  if (wert === null || wert === undefined || wert === '') return null;
  const zahl = Number(wert);
  if (!Number.isFinite(zahl)) return null;
  return zahl.toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

function Spec({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-medium text-foreground">{children}</span>
    </div>
  );
}

function DetailShell({
  onBack,
  icon,
  title,
  badges,
  children,
  footer,
}: {
  onBack: () => void;
  icon: React.ReactNode;
  title: string;
  badges?: React.ReactNode;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col">
      <div className="shrink-0 border-b border-border px-6 pb-4 pt-4">
        <button
          type="button"
          data-testid="store-detail-back"
          onClick={onBack}
          className="mb-3 flex items-center gap-1.5 rounded-md px-2 py-1 text-ui-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground [&_svg]:size-4"
        >
          <ArrowLeft aria-hidden="true" /> Zurück
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-primary [&_svg]:size-5">{icon}</span>
          <h1 className="text-xl font-bold text-foreground">{title}</h1>
          {badges}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      <div className="flex flex-wrap gap-2 border-t border-border px-6 py-4">{footer}</div>
    </div>
  );
}

// --- Model detail ---

/**
 * Verwandte Modelle (Plan 012 Phase C Schritt 8): weitere Modelle desselben
 * Typs (Fallback: dieselbe Kategorie), damit die Detailseite gefüllt wirkt und
 * zum Stöbern einlädt. Ein Klick öffnet die Detailseite des anderen Modells.
 */
function RelatedModels({ current, all }: { current: CatalogModel; all: CatalogModel[] }) {
  const selectExtension = useExtensionStore(s => s.selectExtension);
  const related = all
    .filter(
      m =>
        m.id !== current.id &&
        (current.model_type ? m.model_type === current.model_type : m.category === current.category)
    )
    .slice(0, 4);

  if (related.length === 0) return null;

  return (
    <div className="mt-6 border-t border-border pt-6">
      <h2 className="mb-3 text-sm font-semibold text-foreground">Verwandte Modelle</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {related.map(m => (
          <button
            key={m.id}
            type="button"
            data-testid={`related-model-${m.id}`}
            onClick={() => selectExtension({ kind: 'model', id: m.id })}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-primary/40"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-3.5">
              <Cpu aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {modellAnzeigeName(m)}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {formatSize(m.size_bytes)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ModelDetail({
  model,
  allModels,
  loadedModel,
  defaultModel,
  onChanged,
  onBack,
}: {
  model: CatalogModel;
  allModels: CatalogModel[];
  loadedModel: LoadedModel | null;
  defaultModel: string | null;
  onChanged: () => void;
  onBack: () => void;
}) {
  const api = useApi();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const { startDownload, isDownloading, getDownloadState, onDownloadComplete, cancelDownload } =
    useDownloads();
  const { activation, startActivation, onActivationComplete } = useActivation();

  useEffect(() => {
    const unsub1 = onDownloadComplete(() => onChanged());
    const unsub2 = onActivationComplete(() => onChanged());
    return () => {
      unsub1();
      unsub2();
    };
  }, [onDownloadComplete, onActivationComplete, onChanged]);

  // Plan 023 D1: ein Name fuer die Ueberschrift, jede Meldung und jeden Knopf.
  const anzeige = modellAnzeigeName(model);

  // Plan 023 D2: der Steckbrief. `profile_read_at` unterscheidet "noch nie
  // gelesen" von "gelesen, aber das Modell traegt die Angabe nicht".
  const steckbriefDa = Boolean(model.profile_read_at);
  const gemessen = zahlDeutsch(model.measured_tps);
  const laeufe = zahlDeutsch(model.measured_runs);
  // sanitizeUrl gibt '#' zurueck, wenn nichts Brauchbares dasteht, auch bei
  // undefined. Ein Link auf '#' waere schlimmer als keiner: er sieht aus, als
  // fuehre er irgendwohin.
  const geprueft = sanitizeUrl(model.ollama_library_url);
  const kartenLink = geprueft === '#' ? null : geprueft;

  const isReady = model.install_status === 'available';
  const loadedId = loadedModel?.model_id ?? null;
  const isLoaded =
    loadedId != null && (loadedId === model.id || loadedId === model.effective_ollama_name);
  const isDefault = defaultModel === model.id;
  const isActivating = activation?.modelId === model.id && !activation?.error;
  const downloading = isDownloading(model.id);
  const downloadState = getDownloadState(model.id);
  // Entladen ist synchron (Backend wartet auf Ollama) — der Spinner bleibt,
  // bis die Antwort da ist; danach zieht onChanged die Ansichten nach.
  const [unloading, setUnloading] = useState(false);

  const handleUnload = async () => {
    setUnloading(true);
    try {
      const res = await api.post<{ success?: boolean; error?: string }>(
        `/models/${encodeURIComponent(model.id)}/unload`,
        {},
        { showError: false }
      );
      if (res?.success === false) {
        toast.error(`Entladen fehlgeschlagen: ${res.error ?? 'unbekannter Fehler'}`);
      } else {
        toast.success(`„${anzeige}" aus dem RAM entladen`);
      }
      onChanged();
    } catch {
      toast.error(`Entladen von „${anzeige}" fehlgeschlagen`);
    } finally {
      setUnloading(false);
    }
  };

  const handleSetDefault = async () => {
    try {
      await api.post('/models/default', { model_id: model.id }, { showError: false });
      toast.success(`„${anzeige}" als Standard gesetzt`);
      onChanged();
    } catch {
      toast.error(`Fehler beim Setzen von „${anzeige}" als Standard`);
    }
  };

  const handleDelete = async () => {
    if (!(await confirm({ message: `Modell „${anzeige}" wirklich löschen?` }))) return;
    try {
      await api.del(`/models/${model.id}`, { showError: false });
      onChanged();
    } catch {
      toast.error(`Fehler beim Löschen von „${anzeige}"`);
    }
  };

  return (
    <DetailShell
      onBack={onBack}
      icon={<Cpu />}
      title={anzeige}
      badges={
        <div className="flex items-center gap-2">
          {isLoaded && (
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
              <Zap className="size-3" /> Aktiv
            </Badge>
          )}
          {isDefault && (
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
              <Star className="size-3" /> Standard
            </Badge>
          )}
        </div>
      }
      footer={
        <>
          {!isReady && !downloading && (
            <Button onClick={() => startDownload(model.id, anzeige)}>
              <Download className="size-4" /> Herunterladen
            </Button>
          )}
          {(isReady || isLoaded) && (
            <ActivationButton
              isActivating={!!isActivating}
              isLoaded={!!isLoaded}
              activatingPercent={activation?.progress || 0}
              onActivate={() => startActivation(model.id, anzeige)}
              className="max-w-48"
            />
          )}
          {isLoaded && (
            <Button
              variant="secondary"
              onClick={handleUnload}
              disabled={unloading}
              data-testid="model-unload"
            >
              {unloading ? (
                <>
                  <RefreshCw className="size-4 animate-spin" /> Entlädt …
                </>
              ) : (
                <>
                  <PowerOff className="size-4" /> Aus RAM entladen
                </>
              )}
            </Button>
          )}
          {!isDefault && (isReady || isLoaded) && (
            <Button variant="secondary" onClick={handleSetDefault}>
              <Star className="size-4" /> Als Standard
            </Button>
          )}
          {isReady && !isLoaded && (
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="size-4" /> Löschen
            </Button>
          )}
        </>
      }
    >
      <p className="leading-relaxed text-muted-foreground">{model.description}</p>

      <ModelFitBanner requiredGb={model.ram_required_gb} />

      {downloading && downloadState && (
        // Gleiche Standard-Skala wie das Fit-Banner darüber und die Spec-Liste
        // darunter — die Detailseite bleibt in EINER Proportion.
        <div className="mt-4 rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Download className="size-4 text-primary" /> Wird heruntergeladen
          </div>
          <DownloadProgress
            downloadState={downloadState}
            onCancel={() => cancelDownload(model.id)}
          />
        </div>
      )}

      <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4 border-t border-border pt-6">
        <Spec label="Modell-ID">
          <code className="text-sm">{model.id}</code>
        </Spec>
        {model.parameter_label && <Spec label="Parameter">{model.parameter_label}</Spec>}
        {model.quantization && <Spec label="Quantisierung">{model.quantization}</Spec>}
        <Spec label="Download-Größe">{formatSize(model.size_bytes)}</Spec>
        <Spec label="RAM-Bedarf">{model.ram_required_gb} GB</Spec>
        <Spec label="Einstufung">{speedLabel[model.speed_tier ?? ''] ?? 'Ausgewogen'}</Spec>
        {gemessen && (
          <Spec label="Gemessen auf diesem Gerät">
            {gemessen} Token/s
            {laeufe && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                aus {laeufe} {laeufe === '1' ? 'Lauf' : 'Läufen'}
              </span>
            )}
          </Spec>
        )}
        {model.context_window != null && (
          <Spec label="Kontextlänge">{formatContextLength(model.context_window)}</Spec>
        )}
        {model.license && <Spec label="Lizenz">{model.license}</Spec>}
        {kartenLink && (
          <Spec label="Modellkarte">
            <a
              href={kartenLink}
              target="_blank"
              rel="noreferrer noopener"
              className="text-sm text-primary underline-offset-2 hover:underline"
            >
              Beim Hersteller nachlesen
            </a>
          </Spec>
        )}
      </div>

      {!steckbriefDa && (
        <p className="mt-3 text-xs text-muted-foreground">
          Parameterzahl, Quantisierung und Lizenz liest Arasul aus den Gewichten. Sie stehen hier,
          sobald das Modell auf diesem Gerät liegt.
        </p>
      )}

      {model.capabilities && model.capabilities.length > 0 && (
        <div className="mt-6 border-t border-border pt-6">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Fähigkeiten</h2>
          <div className="flex flex-wrap gap-2">
            {model.capabilities.map(cap => (
              <span key={cap} className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                {cap}
              </span>
            ))}
          </div>
        </div>
      )}

      {model.recommended_for && model.recommended_for.length > 0 && (
        <div className="mt-6 border-t border-border pt-6">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Gut geeignet für</h2>
          <ul className="flex flex-col gap-1.5">
            {model.recommended_for.map(use => (
              <li key={use} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span>{use}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {model.ollama_library_url && (
        <div className="mt-6 border-t border-border pt-6">
          <a href={sanitizeUrl(model.ollama_library_url)} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary">
              <ExternalLink className="size-4" /> Ollama Library ansehen
            </Button>
          </a>
        </div>
      )}

      <RelatedModels current={model} all={allModels} />
      {ConfirmDialog}
    </DetailShell>
  );
}

// --- Extension (Workspace-App) detail ---

function ExtensionDetail({
  app,
  onToggle,
  onBack,
}: {
  app: WorkspaceApp;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onBack: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const handleToggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onToggle(app.id, !app.enabled);
      toast.success(
        app.enabled ? `${app.name} im Workspace ausgeblendet` : `${app.name} aktiviert`
      );
    } catch {
      toast.error('Änderung konnte nicht gespeichert werden');
    } finally {
      setBusy(false);
    }
  };

  return (
    <DetailShell
      onBack={onBack}
      icon={<Package />}
      title={app.name}
      badges={
        app.enabled ? (
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
            <Zap className="size-3" /> Aktiv
          </Badge>
        ) : (
          <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
            Inaktiv
          </Badge>
        )
      }
      footer={
        <Button onClick={handleToggle} disabled={busy}>
          {app.enabled ? (
            <>
              <PowerOff className="size-4" /> Deaktivieren
            </>
          ) : (
            <>
              <Power className="size-4" /> Aktivieren
            </>
          )}
        </Button>
      }
    >
      <p className="leading-relaxed text-muted-foreground">
        {app.longDescription ?? app.description}
      </p>

      {(app.homepage || app.docsUrl) && (
        <div className="mt-5 flex flex-wrap gap-2">
          {app.homepage && (
            <a href={sanitizeUrl(app.homepage)} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm">
                <ExternalLink className="size-4" /> Website
              </Button>
            </a>
          )}
          {app.docsUrl && (
            <a href={sanitizeUrl(app.docsUrl)} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm">
                <ExternalLink className="size-4" /> Dokumentation
              </Button>
            </a>
          )}
        </div>
      )}

      <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4 border-t border-border pt-6">
        <Spec label="Status">{app.enabled ? 'Aktiv' : 'Inaktiv'}</Spec>
        <Spec label="Bereich">{areaLabel[app.tab] ?? app.tab}</Spec>
        <Spec label="Sichtbarkeit">
          {app.enabled ? 'Im Workspace sichtbar' : 'Im Workspace ausgeblendet'}
        </Spec>
      </div>
    </DetailShell>
  );
}

// --- Erweiterungs-Baukasten (Einstieg, Plan 012 Phase C Schritt 9) ---

/**
 * Der Erweiterungs-Baukasten (Plan 012 Phase E · Schritt 16): eine in der
 * Werkstatt-Sandbox gebaute Erweiterung zum Paket machen, oder ein fremdes
 * Paket importieren. Beides landet danach als Karte im Erweiterungen-Raster.
 */
function BuilderDetail({ onBack }: { onBack: () => void }) {
  const api = useApi();
  const toast = useToast();
  const { buildFromSandbox, importPackage } = useExtensions();

  const [slug, setSlug] = useState('');
  const [subfolder, setSubfolder] = useState('.');
  const [overwrite, setOverwrite] = useState(false);
  const [datei, setDatei] = useState<File | null>(null);
  const [busy, setBusy] = useState<'bauen' | 'import' | null>(null);

  // Werkstätten zuerst: eine Erweiterung wird normalerweise dort gebaut.
  const { data: projekte } = useQuery({
    queryKey: ['sandbox-projects-for-build'],
    queryFn: async () => {
      const res = await api.get<{ projects: SandboxProjectLite[] }>('/sandbox/projects', {
        showError: false,
      });
      return res.projects ?? [];
    },
    retry: 1,
    staleTime: 30_000,
  });

  const sortiert = [...(projekte ?? [])].sort((a, b) => {
    const wa = a.workspace_type === 'erweiterungs-werkstatt' ? 0 : 1;
    const wb = b.workspace_type === 'erweiterungs-werkstatt' ? 0 : 1;
    return wa - wb || a.name.localeCompare(b.name);
  });

  const handleBauen = async () => {
    if (!slug || busy) return;
    setBusy('bauen');
    try {
      const ext = await buildFromSandbox(slug, subfolder.trim() || '.', overwrite);
      toast.success(`Erweiterung „${ext.name}" paketiert`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Paketieren fehlgeschlagen');
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async () => {
    if (!datei || busy) return;
    setBusy('import');
    try {
      const ext = await importPackage(datei, overwrite);
      toast.success(`Erweiterung „${ext.name}" importiert`);
      setDatei(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import fehlgeschlagen');
    } finally {
      setBusy(null);
    }
  };

  return (
    <DetailShell
      onBack={onBack}
      icon={<Blocks />}
      title="Eigene Erweiterung bauen"
      badges={
        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
          Baukasten
        </Badge>
      }
      footer={
        <Button onClick={handleBauen} disabled={!slug || busy !== null} data-testid="builder-build">
          <Package className="size-4" />
          {busy === 'bauen' ? 'Paketiere …' : 'Aus Werkstatt paketieren'}
        </Button>
      }
    >
      <p className="leading-relaxed text-muted-foreground">
        Eine Erweiterung ist ein Ordner mit <code>manifest.json</code> und Assets. Bau sie in einer{' '}
        <strong className="text-foreground">Erweiterungs-Werkstatt</strong> (Sandbox mit Terminal
        und Vorlagen), dort helfen die Flows <code>/erweiterung</code> und <code>/execute</code>.
        Danach hier paketieren: das Paket lässt sich herunterladen, forken und auf einem anderen
        Gerät wieder importieren.
      </p>

      <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6">
        <h3 className="text-ui-sm font-semibold text-foreground">Aus Werkstatt paketieren</h3>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Sandbox</span>
          <select
            data-testid="builder-slug"
            value={slug}
            onChange={e => setSlug(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="">Werkstatt wählen</option>
            {sortiert.map(p => (
              <option key={p.slug} value={p.slug}>
                {p.name}
                {p.workspace_type === 'erweiterungs-werkstatt' ? ' · Werkstatt' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Unterordner</span>
          <input
            data-testid="builder-subfolder"
            value={subfolder}
            onChange={e => setSubfolder(e.target.value)}
            placeholder="."
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
          <span className="text-ui-xs text-muted-foreground">
            Ordner mit der <code>manifest.json</code>; <code>.</code> = die Sandbox selbst.
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            data-testid="builder-overwrite"
            checked={overwrite}
            onChange={e => setOverwrite(e.target.checked)}
          />
          Bestehende Erweiterung gleicher Id überschreiben
        </label>
      </div>

      <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6">
        <h3 className="text-ui-sm font-semibold text-foreground">Paket importieren</h3>
        <p className="text-ui-xs text-muted-foreground">
          Ein zuvor exportiertes Paket von einem anderen Gerät einspielen.
        </p>
        <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-border bg-card px-3 py-3 transition-colors hover:border-primary/40">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Upload className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">
              {datei ? datei.name : 'Datei auswählen …'}
            </span>
            <span className="block text-ui-xs text-muted-foreground">.tar.gz oder .tgz</span>
          </span>
          <input
            type="file"
            accept=".tar.gz,.tgz"
            data-testid="builder-import-file"
            onChange={e => setDatei(e.target.files?.[0] ?? null)}
            className="sr-only"
          />
        </label>
        <div>
          <Button
            variant="outline"
            onClick={handleImport}
            disabled={!datei || busy !== null}
            data-testid="builder-import"
          >
            <Download className="size-4 rotate-180" />
            {busy === 'import' ? 'Importiere …' : 'Paket importieren'}
          </Button>
        </div>
      </div>
    </DetailShell>
  );
}

/** Minimal-Sicht auf ein Sandbox-Projekt, nur fürs Werkstatt-Auswahlfeld. */
interface SandboxProjectLite {
  slug: string;
  name: string;
  workspace_type?: string;
}

/**
 * Detailseite eines installierten Erweiterungs-Pakets: Manifest-Fakten plus die
 * vier Aktionen aus Schritt 16 — aktivieren, herunterladen, forken, entfernen.
 */
function InstalledExtensionDetail({
  ext,
  onBack,
}: {
  ext: InstalledExtension;
  onBack: () => void;
}) {
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const { setExtensionEnabled, forkExtension, removeExtension, downloadUrl } = useExtensions();
  const openTab = useWorkspaceStore(s => s.openTab);
  const [busy, setBusy] = useState(false);

  const run = async (aktion: () => Promise<unknown>, erfolg: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await aktion();
      toast.success(erfolg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Aktion fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const specs: Array<[string, string]> = [
    ['Id', ext.id],
    ['Typ', extTypeLabel(ext.type)],
    ['Zugriffs-Stufe', accessTierLabel(ext.accessTier)],
    ['Version', ext.version],
    ['Herkunft', ext.source === 'built' ? 'Selbst gebaut' : 'Importiert'],
    ['Startdatei', String(ext.manifest?.entry ?? '—')],
  ];

  return (
    <DetailShell
      onBack={onBack}
      icon={<Blocks />}
      title={ext.name}
      badges={
        <>
          <Badge
            variant="outline"
            className={cn(
              ext.enabled
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border bg-muted text-muted-foreground'
            )}
          >
            {ext.enabled ? 'Aktiv' : 'Inaktiv'}
          </Badge>
          <Badge variant="outline">{extTypeLabel(ext.type)}</Badge>
          <Badge variant="outline">{accessTierLabel(ext.accessTier)}</Badge>
        </>
      }
      footer={
        <div className="flex flex-wrap gap-2">
          {ext.type === 'app' && (
            <Button
              data-testid="ext-detail-open"
              disabled={!ext.enabled}
              title={ext.enabled ? 'In der Mitte öffnen' : 'Erst aktivieren'}
              onClick={() => openTab({ type: 'extension', extensionId: ext.id, title: ext.name })}
            >
              <ExternalLink className="size-4" /> Öffnen
            </Button>
          )}
          <Button
            data-testid="ext-detail-toggle"
            variant={ext.type === 'app' ? 'outline' : 'default'}
            disabled={busy}
            onClick={() =>
              run(
                () => setExtensionEnabled(ext.id, !ext.enabled),
                ext.enabled ? 'Erweiterung deaktiviert' : 'Erweiterung aktiviert'
              )
            }
          >
            {ext.enabled ? <PowerOff className="size-4" /> : <Power className="size-4" />}
            {ext.enabled ? 'Deaktivieren' : 'Aktivieren'}
          </Button>
          <Button variant="outline" asChild>
            <a href={downloadUrl(ext.id)} download data-testid="ext-detail-download">
              <Download className="size-4" /> Herunterladen
            </a>
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            data-testid="ext-detail-fork"
            onClick={() =>
              run(() => forkExtension(ext.id), 'Fork als neue Werkstatt-Sandbox angelegt')
            }
          >
            <Package className="size-4" /> Forken
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            data-testid="ext-detail-remove"
            onClick={async () => {
              const ok = await confirm({
                title: `„${ext.name}" entfernen?`,
                message: 'Register-Eintrag und Paket-Ordner werden gelöscht.',
                confirmText: 'Entfernen',
              });
              if (ok) {
                await run(() => removeExtension(ext.id), 'Erweiterung entfernt');
                onBack();
              }
            }}
          >
            <Trash2 className="size-4" /> Entfernen
          </Button>
        </div>
      }
    >
      {ConfirmDialog}
      <p className="leading-relaxed text-muted-foreground">
        {ext.description || 'Keine Beschreibung im Manifest hinterlegt.'}
      </p>
      <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-border pt-6 sm:grid-cols-2">
        {specs.map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-ui-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </dt>
            <dd className="truncate text-sm text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </DetailShell>
  );
}

// --- Not found fallback ---

function NotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col">
      <div className="shrink-0 px-6 pb-4 pt-4">
        <button
          type="button"
          data-testid="store-detail-back"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-ui-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground [&_svg]:size-4"
        >
          <ArrowLeft aria-hidden="true" /> Zurück
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Eintrag nicht gefunden.
      </div>
    </div>
  );
}

export function StoreDetailPage({ onBack }: { onBack: () => void }) {
  const selected = useExtensionStore(s => s.selected);
  const { models, loadedModel, defaultModel, invalidateModels } = useStoreCatalog();
  const { apps: workspaceApps, setAppEnabled } = useWorkspaceApps();
  const { extensions } = useExtensions();

  if (!selected) return <NotFound onBack={onBack} />;

  if (selected.kind === 'builder') return <BuilderDetail onBack={onBack} />;

  if (selected.kind === 'extension') {
    const ext = extensions.find(e => e.id === selected.id);
    if (!ext) return <NotFound onBack={onBack} />;
    return <InstalledExtensionDetail ext={ext} onBack={onBack} />;
  }

  if (selected.kind === 'model') {
    const model = models.find(m => m.id === selected.id);
    if (!model) return <NotFound onBack={onBack} />;
    return (
      <ModelDetail
        model={model}
        allModels={models}
        loadedModel={loadedModel}
        defaultModel={defaultModel}
        onChanged={invalidateModels}
        onBack={onBack}
      />
    );
  }

  const app = workspaceApps.find(a => a.id === selected.id);
  if (!app) return <NotFound onBack={onBack} />;
  return <ExtensionDetail app={app} onToggle={setAppEnabled} onBack={onBack} />;
}

export default StoreDetailPage;
