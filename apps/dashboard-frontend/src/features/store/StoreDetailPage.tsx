/**
 * StoreDetailPage — die Detailseite eines Store-Eintrags (Full-Width). Erreicht
 * über einen Klick auf eine Karte im Raster (Store.tsx); zeigt oben einen
 * prominenten „← Zurück"-Knopf, der zurück ins Raster führt, darunter Name,
 * Status-Badges, eine gut formatierte Info-Sektion und die Primär-Aktion.
 *
 *   - Modell: Beschreibung, Modell-ID/Größe/RAM/Geschwindigkeit/Kontextlänge,
 *     Fähigkeiten; Aktionen Herunterladen/Aktivieren/Als Standard/Löschen
 *     (DownloadContext/ActivationContext überleben Navigation).
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
  Star,
  Trash2,
  Zap,
  CircleCheck,
  TriangleAlert,
  CircleX,
} from 'lucide-react';
import type { MemoryBudget } from '@/types';
import { Button } from '@/components/ui/shadcn/button';
import { Badge } from '@/components/ui/shadcn/badge';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { useToast } from '@/contexts/ToastContext';
import { useDownloads } from '@/contexts/DownloadContext';
import { useActivation } from '@/contexts/ActivationContext';
import useConfirm from '@/hooks/useConfirm';
import { useStoreCatalog } from '@/hooks/useStoreCatalog';
import type { CatalogModel, LoadedModel } from '@/hooks/useStoreCatalog';
import { useWorkspaceApps } from '@/hooks/useWorkspaceApps';
import type { WorkspaceApp } from '@/hooks/useWorkspaceApps';
import { useExtensionStore } from '@/stores/extensionStore';
import { formatModelSize as formatSize } from '@/utils/formatting';
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
 * das KI-RAM-Budget dieser Jetson-Box, ob es flüssig läuft. Nutzt denselben
 * React-Query-Key wie die StatusBar (['models','memory-budget']) → kein
 * zusätzlicher Poll. Das ist der Alleinstellungs-Vorteil eines Edge-Stores
 * (bekannte Hardware): rechnen statt raten.
 */
function ModelFitBanner({ requiredGb }: { requiredGb: number }) {
  const api = useApi();
  const { data: budget } = useQuery({
    queryKey: ['models', 'memory-budget'],
    queryFn: () => api.get<MemoryBudget>('/models/memory-budget', { showError: false }),
    staleTime: 5_000,
    retry: 1,
  });

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
    <div
      className={cn(
        'mt-ui-4 flex items-center gap-2 rounded-lg border px-ui-3 py-ui-2 text-ui-sm font-medium',
        toneClass
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
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
              <span className="block truncate text-sm font-medium text-foreground">{m.name}</span>
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

  const isReady = model.install_status === 'available';
  const loadedId = loadedModel?.model_id ?? null;
  const isLoaded =
    loadedId != null && (loadedId === model.id || loadedId === model.effective_ollama_name);
  const isDefault = defaultModel === model.id;
  const isActivating = activation?.modelId === model.id && !activation?.error;
  const downloading = isDownloading(model.id);
  const downloadState = getDownloadState(model.id);

  const handleSetDefault = async () => {
    try {
      await api.post('/models/default', { model_id: model.id }, { showError: false });
      toast.success(`„${model.name}" als Standard gesetzt`);
      onChanged();
    } catch {
      toast.error(`Fehler beim Setzen von „${model.name}" als Standard`);
    }
  };

  const handleDelete = async () => {
    if (!(await confirm({ message: `Modell „${model.name}" wirklich löschen?` }))) return;
    try {
      await api.del(`/models/${model.id}`, { showError: false });
      onChanged();
    } catch {
      toast.error(`Fehler beim Löschen von „${model.name}"`);
    }
  };

  return (
    <DetailShell
      onBack={onBack}
      icon={<Cpu />}
      title={model.name}
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
            <Button onClick={() => startDownload(model.id, model.name)}>
              <Download className="size-4" /> Herunterladen
            </Button>
          )}
          {(isReady || isLoaded) && (
            <ActivationButton
              isActivating={!!isActivating}
              isLoaded={!!isLoaded}
              activatingPercent={activation?.progress || 0}
              onActivate={() => startActivation(model.id, model.name)}
              className="max-w-48"
            />
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
        <div className="mt-ui-4 rounded-lg border border-border bg-card p-ui-3">
          <div className="mb-ui-2 flex items-center gap-ui-1 text-ui-sm font-medium text-foreground">
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
        <Spec label="Download-Größe">{formatSize(model.size_bytes)}</Spec>
        <Spec label="RAM-Bedarf">{model.ram_required_gb} GB</Spec>
        <Spec label="Geschwindigkeit">{speedLabel[model.speed_tier ?? ''] ?? 'Ausgewogen'}</Spec>
        {model.context_window != null && (
          <Spec label="Kontextlänge">{formatContextLength(model.context_window)}</Spec>
        )}
      </div>

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
      <p className="leading-relaxed text-muted-foreground">{app.description}</p>

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
 * Ehrlicher Einstieg in den Erweiterungs-Baukasten. Der frühere „kommt bald"-
 * Platzhalter im Raster öffnet jetzt diese echte Seite; Phase E (der eigentliche
 * Baukasten) füllt den Aktionsblock mit Vorlagen, Upload und Schnittstelle.
 */
function BuilderDetail({ onBack }: { onBack: () => void }) {
  const steps = [
    'Eine Erweiterung beschreiben (Name, Zweck, Typ)',
    'Zugriffs-Stufe festlegen (nur Internet · interne Dienste · voll)',
    'Aus einer Vorlage starten oder ein Paket hochladen',
    'Aktivieren — die Erweiterung erscheint im Workspace',
  ];
  return (
    <DetailShell
      onBack={onBack}
      icon={<Blocks />}
      title="Eigene Erweiterung bauen"
      badges={
        <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
          In Arbeit
        </Badge>
      }
      footer={
        <Button disabled>
          <Blocks className="size-4" /> Baukasten öffnen — bald verfügbar
        </Button>
      }
    >
      <p className="leading-relaxed text-muted-foreground">
        Der Erweiterungs-Baukasten macht Arasul offen: Über eine definierte Schnittstelle lassen
        sich eigene Apps, n8n-Flows und Werkzeug-Konnektoren bauen und im Workspace bereitstellen —
        vollständig lokal. Die Bau-Oberfläche folgt in Kürze; so wird der Ablauf aussehen:
      </p>
      <ol className="mt-6 flex flex-col gap-2 border-t border-border pt-6">
        {steps.map((step, i) => (
          <li key={step} className="flex items-start gap-3 text-sm text-foreground">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {i + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
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

  if (!selected) return <NotFound onBack={onBack} />;

  if (selected.kind === 'builder') return <BuilderDetail onBack={onBack} />;

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
