/**
 * StoreDetailModal Component
 * Unified detail modal for both models and apps
 * Migrated to TypeScript + shadcn + Tailwind
 */

import React from 'react';
import { Link } from 'react-router-dom';
import {
  Cpu,
  Package,
  Download,
  Play,
  OctagonX,
  Check,
  RefreshCw,
  ExternalLink,
  Trash2,
  Star,
  Zap,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/shadcn/dialog';
import { Button } from '@/components/ui/shadcn/button';
import { Badge } from '@/components/ui/shadcn/badge';
import { ScrollArea } from '@/components/ui/shadcn/scroll-area';
import { cn } from '@/lib/utils';
import ConfirmIconButton from '../../components/ui/ConfirmIconButton';
import { sanitizeUrl } from '../../utils/sanitizeUrl';
import { formatModelSize as formatSize } from '../../utils/formatting';

// --- Types ---

interface ModelItem {
  id: string;
  name: string;
  effective_ollama_name?: string;
  description: string;
  size_bytes: number;
  ram_required_gb: number;
  category: string;
  model_type?: string;
  capabilities?: string[];
  recommended_for?: string[];
  install_status: string;
  performance_tier?: number;
  ollama_library_url?: string;
}

interface AppItem {
  id: string;
  name: string;
  description: string;
  longDescription?: string;
  version: string;
  category: string;
  author?: string;
  status: string;
  ports?: { external?: number };
  homepage?: string;
  hasCustomPage?: boolean;
  customPageRoute?: string;
  builtin?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StoreItem = (ModelItem | AppItem) & Record<string, any>;

interface LoadedModel {
  model_id: string;
  ram_usage_mb?: number;
}

interface StoreDetailModalProps {
  type: 'model' | 'app';
  item: StoreItem | null;
  onClose: () => void;
  onAction?: (id: string, action: string) => void;
  // Model-specific props
  loadedModel?: LoadedModel | null;
  defaultModel?: string;
  isDownloading?: (id: string) => boolean;
  downloadState?: Record<string, unknown>;
  activating?: string | null;
  activatingPercent?: number;
  onDownload?: (id: string, name: string) => void;
  onActivate?: (id: string) => void;
  onDelete?: (id: string) => void;
  onSetDefault?: (id: string) => void;
  // App-specific props
  actionLoading?: Record<string, string | boolean | null>;
  onUninstall?: (id: string, name: string) => void;
}

// --- Config ---

const sizeConfig: Record<string, { label: string; description: string }> = {
  small: { label: 'Klein', description: '7-12 GB RAM' },
  medium: { label: 'Mittel', description: '15-25 GB RAM' },
  large: { label: 'Groß', description: '30-40 GB RAM' },
  xlarge: { label: 'Sehr Groß', description: '45+ GB RAM' },
};

const typeConfig: Record<string, { label: string }> = {
  llm: { label: 'LLM' },
  ocr: { label: 'OCR' },
  vision: { label: 'Vision' },
};

const getAppUrl = (app: StoreItem): string => {
  if (app.hasCustomPage && app.customPageRoute) {
    return app.customPageRoute;
  }
  const traefikPaths: Record<string, string> = { n8n: '/n8n' };
  if (traefikPaths[app.id]) {
    return `${window.location.origin}${traefikPaths[app.id]}`;
  }
  if (app.ports?.external) {
    return `http://${window.location.hostname}:${app.ports.external}`;
  }
  return '#';
};

// --- Component ---

function StoreDetailModal({
  type,
  item,
  onClose,
  onAction,
  loadedModel,
  defaultModel,
  isDownloading,
  downloadState,
  activating,
  activatingPercent,
  onDownload,
  onActivate,
  onDelete,
  onSetDefault,
  actionLoading,
  onUninstall,
}: StoreDetailModalProps) {
  if (!item) return null;

  const isModel = type === 'model';

  // Model state
  const isInstalled = isModel && item.install_status === 'available';
  const isLoaded =
    isModel &&
    (loadedModel?.model_id === item.id || loadedModel?.model_id === item.effective_ollama_name);
  const isDefault = isModel && defaultModel === item.id;
  const isActivating = isModel && activating === item.id;
  const modelDownloading = isModel && isDownloading?.(item.id);

  // App state
  const appLoading = !isModel && actionLoading?.[item.id];

  return (
    <Dialog open={!!item} onOpenChange={open => !open && onClose()}>
      <DialogContent className="model-detail-modal sm:max-w-[600px] max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-6 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-3">
            {isModel ? (
              <Cpu className="size-5 text-primary" />
            ) : (
              <Package className="size-5 text-primary" />
            )}
            <span>{item.name}</span>
            <div className="flex items-center gap-2 ml-3">
              {isModel && isLoaded && (
                <Badge
                  variant="secondary"
                  className="badge-loaded bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                >
                  <Zap className="size-3" /> Aktiv
                </Badge>
              )}
              {isModel && isDefault && (
                <Badge
                  variant="secondary"
                  className="badge-default bg-amber-500/20 text-amber-400 border-amber-500/30"
                >
                  <Star className="size-3" /> Standard
                </Badge>
              )}
              {!isModel && item.status === 'running' && (
                <Badge
                  variant="secondary"
                  className="badge-running bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                >
                  <Zap className="size-3" /> Aktiv
                </Badge>
              )}
              {!isModel && item.status === 'installed' && (
                <Badge variant="secondary" className="badge-installed">
                  Gestoppt
                </Badge>
              )}
              {isModel && (
                <Badge variant="secondary" className="badge-type">
                  {typeConfig[item.model_type ?? '']?.label || 'LLM'}
                </Badge>
              )}
              {!isModel && (
                <Badge variant="secondary" className="badge-category">
                  App
                </Badge>
              )}
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">Details</DialogDescription>
        </DialogHeader>

        {/* Body */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6">
            <p className="text-muted-foreground leading-relaxed">
              {isModel ? item.description : item.longDescription || item.description}
            </p>

            {/* Specs Grid */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mt-6 pt-6 border-t border-border">
              {isModel ? (
                <>
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                      Modell-ID
                    </span>
                    <code className="text-foreground font-medium text-sm">{item.id}</code>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                      Download-Größe
                    </span>
                    <span className="text-foreground font-medium">
                      {formatSize(item.size_bytes)}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                      RAM-Bedarf
                    </span>
                    <span className="text-foreground font-medium">{item.ram_required_gb} GB</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                      Kategorie
                    </span>
                    <Badge variant="secondary" className="badge-category">
                      {sizeConfig[item.category]?.label}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                      Typ
                    </span>
                    <Badge variant="secondary" className="badge-type">
                      {typeConfig[item.model_type ?? '']?.label || 'LLM'}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                      Performance
                    </span>
                    <span className="text-foreground font-medium">
                      {item.performance_tier === 1
                        ? 'Schnell'
                        : item.performance_tier === 2
                          ? 'Mittel'
                          : 'Langsam'}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                      Version
                    </span>
                    <span className="text-foreground font-medium">v{item.version}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                      Kategorie
                    </span>
                    <span className="text-foreground font-medium">{item.category}</span>
                  </div>
                  {item.author && (
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                        Autor
                      </span>
                      <span className="text-foreground font-medium">{item.author}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                      Status
                    </span>
                    <span className="text-foreground font-medium">
                      {item.status === 'running'
                        ? 'Aktiv'
                        : item.status === 'installed'
                          ? 'Gestoppt'
                          : item.status === 'error'
                            ? 'Fehler'
                            : 'Verfügbar'}
                    </span>
                  </div>
                  {item.ports?.external && (
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                        Port
                      </span>
                      <span className="text-foreground font-medium">{item.ports.external}</span>
                    </div>
                  )}
                  {item.homepage && (
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                        Homepage
                      </span>
                      <a
                        href={sanitizeUrl(item.homepage)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {item.homepage}
                      </a>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Capabilities/Tags (Models only) */}
            {isModel && item.capabilities && item.capabilities.length > 0 && (
              <div className="mt-6 pt-6 border-t border-border">
                <h3 className="text-sm font-semibold text-foreground mb-3">Fähigkeiten</h3>
                <div className="flex flex-wrap gap-2">
                  {item.capabilities.map((cap: string) => (
                    <span
                      key={cap}
                      className="capability-tag bg-muted text-muted-foreground px-2 py-1 rounded text-xs"
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {isModel && item.recommended_for && item.recommended_for.length > 0 && (
              <div className="mt-6 pt-6 border-t border-border">
                <h3 className="text-sm font-semibold text-foreground mb-3">Empfohlen für</h3>
                <div className="flex flex-wrap gap-2">
                  {item.recommended_for.map((use: string) => (
                    <span
                      key={use}
                      className="capability-tag bg-primary/10 text-primary px-2 py-1 rounded text-xs"
                    >
                      {use}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {isModel && item.ollama_library_url && (
              <div className="mt-6 pt-6 border-t border-border">
                <a
                  href={sanitizeUrl(item.ollama_library_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="secondary">
                    <ExternalLink className="size-4" /> Ollama Library ansehen
                  </Button>
                </a>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <DialogFooter className="p-4 border-t border-border flex-wrap">
          {isModel ? (
            <>
              {/* Model: Download */}
              {!isInstalled && !modelDownloading && (
                <Button onClick={() => onDownload?.(item.id, item.name)}>
                  <Download className="size-4" /> Herunterladen
                </Button>
              )}

              {/* Model: Activate + Set Default + Delete */}
              {isInstalled && !isLoaded && (
                <>
                  <Button
                    onClick={() => onActivate?.(item.id)}
                    disabled={isActivating}
                    style={
                      isActivating
                        ? {
                            background: `linear-gradient(90deg, var(--color-success) ${activatingPercent}%, var(--card) ${activatingPercent}%)`,
                            borderColor: 'var(--color-success)',
                          }
                        : {}
                    }
                  >
                    {isActivating ? (
                      <>
                        <RefreshCw className="size-4 animate-spin" /> {activatingPercent}%
                      </>
                    ) : (
                      <>
                        <Play className="size-4" /> Aktivieren
                      </>
                    )}
                  </Button>
                  {!isDefault && (
                    <Button variant="secondary" onClick={() => onSetDefault?.(item.id)}>
                      <Star className="size-4" /> Als Standard setzen
                    </Button>
                  )}
                  <Button variant="destructive" onClick={() => onDelete?.(item.id)}>
                    <Trash2 className="size-4" /> Löschen
                  </Button>
                </>
              )}

              {/* Model: Active */}
              {isLoaded && (
                <>
                  <Button variant="secondary" disabled>
                    <Check className="size-4" /> Aktiv
                  </Button>
                  {!isDefault && (
                    <Button variant="secondary" onClick={() => onSetDefault?.(item.id)}>
                      <Star className="size-4" /> Als Standard setzen
                    </Button>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              {/* App: Install */}
              {item.status === 'available' && (
                <Button onClick={() => onAction?.(item.id, 'install')} disabled={!!appLoading}>
                  {appLoading === 'install' ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  Installieren
                </Button>
              )}

              {/* App: Start + Delete */}
              {item.status === 'installed' && (
                <>
                  <Button onClick={() => onAction?.(item.id, 'start')} disabled={!!appLoading}>
                    {appLoading === 'start' ? (
                      <RefreshCw className="size-4 animate-spin" />
                    ) : (
                      <Play className="size-4" />
                    )}
                    Starten
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      onClose();
                      onUninstall?.(item.id, item.name);
                    }}
                    disabled={!!appLoading}
                  >
                    <Trash2 className="size-4" /> Löschen
                  </Button>
                </>
              )}

              {/* App: Open + Stop + Restart */}
              {item.status === 'running' && (
                <>
                  {item.hasCustomPage && item.customPageRoute ? (
                    <Button asChild>
                      <Link to={item.customPageRoute} onClick={onClose}>
                        <ExternalLink className="size-4" /> Öffnen
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild>
                      <a href={getAppUrl(item)} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="size-4" /> Öffnen
                      </a>
                    </Button>
                  )}
                  {!item.builtin && (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => onAction?.(item.id, 'restart')}
                        disabled={!!appLoading}
                      >
                        <RefreshCw className="size-4" /> Neustarten
                      </Button>
                      <ConfirmIconButton
                        icon={<OctagonX />}
                        label="Stoppen"
                        confirmText="Stoppen?"
                        onConfirm={() => onAction?.(item.id, 'stop')}
                        variant="danger"
                        disabled={!!appLoading}
                      />
                    </>
                  )}
                </>
              )}

              {/* App: Error - Restart + Delete */}
              {item.status === 'error' && (
                <>
                  <Button onClick={() => onAction?.(item.id, 'start')} disabled={!!appLoading}>
                    <RefreshCw className="size-4" /> Erneut starten
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      onClose();
                      onUninstall?.(item.id, item.name);
                    }}
                    disabled={!!appLoading}
                  >
                    <Trash2 className="size-4" /> Löschen
                  </Button>
                </>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default StoreDetailModal;
