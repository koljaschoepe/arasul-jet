import { useState, useEffect, useCallback } from 'react';
import {
  Server,
  RefreshCw,
  Check,
  AlertCircle,
  X,
  Database,
  HardDrive,
  Search,
  Bot,
  Sparkles,
  Zap,
  FileSearch,
  Globe,
  Monitor,
  BarChart3,
  Wrench,
  Archive,
  type LucideIcon,
} from 'lucide-react';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { useApi } from '../../hooks/useApi';
import { Button } from '@/components/ui/shadcn/button';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/shadcn/dialog';
import { cn } from '@/lib/utils';

interface Service {
  id: string;
  name: string;
  status: string;
  canRestart?: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  healthy: { label: 'Aktiv', dot: 'bg-primary' },
  starting: { label: 'Startet...', dot: 'bg-primary animate-pulse' },
  restarting: { label: 'Neustart...', dot: 'bg-primary animate-pulse' },
  failed: { label: 'Fehler', dot: 'bg-foreground/40' },
  unhealthy: { label: 'Fehler', dot: 'bg-foreground/40' },
  exited: { label: 'Beendet', dot: 'bg-foreground/40' },
};

const SERVICE_INFO: Record<string, { icon: LucideIcon; displayName: string }> = {
  'postgres-db': { icon: Database, displayName: 'PostgreSQL' },
  minio: { icon: HardDrive, displayName: 'MinIO' },
  qdrant: { icon: Search, displayName: 'Qdrant' },
  'llm-service': { icon: Bot, displayName: 'LLM Service' },
  'embedding-service': { icon: Sparkles, displayName: 'Embeddings' },
  n8n: { icon: Zap, displayName: 'n8n' },
  'document-indexer': { icon: FileSearch, displayName: 'Document Indexer' },
  'reverse-proxy': { icon: Globe, displayName: 'Reverse Proxy' },
  'dashboard-backend': { icon: Server, displayName: 'Dashboard API' },
  'dashboard-frontend': { icon: Monitor, displayName: 'Dashboard UI' },
  'metrics-collector': { icon: BarChart3, displayName: 'Metrics' },
  'self-healing-agent': { icon: Wrench, displayName: 'Self-Healing' },
  'backup-service': { icon: Archive, displayName: 'Backup' },
};

function getServiceInfo(name: string) {
  return SERVICE_INFO[name] || { icon: Server, displayName: name };
}

export function ServicesSettings() {
  const api = useApi();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [restartingService, setRestartingService] = useState<string | null>(null);
  const [confirmRestart, setConfirmRestart] = useState<Service | null>(null);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  const fetchServices = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await api.get('/services/all', { signal, showError: false });
        setServices(data.services || []);
      } catch (error: unknown) {
        if (signal?.aborted) return;
        console.error('Error fetching services:', error);
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchServices(controller.signal);
    const interval = setInterval(() => fetchServices(controller.signal), 15000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchServices]);

  const handleConfirmRestart = async () => {
    if (!confirmRestart) return;

    const serviceName = confirmRestart.name;
    setRestartingService(serviceName);
    setConfirmRestart(null);
    setMessage(null);

    try {
      const data = await api.post(`/services/restart/${serviceName}`, null, { showError: false });
      if (data.success) {
        setMessage({
          type: 'success',
          text: `Service "${getServiceInfo(serviceName).displayName}" wurde erfolgreich neugestartet (${data.duration_ms}ms)`,
        });
        setTimeout(fetchServices, 2000);
      } else {
        setMessage({
          type: 'error',
          text: data.message || 'Fehler beim Neustart des Service',
        });
      }
    } catch (error: unknown) {
      const err = error as { status?: number; data?: { message?: string }; message?: string };
      if (err.status === 429) {
        setMessage({
          type: 'error',
          text: err.data?.message || 'Bitte warten Sie, bevor Sie diesen Service erneut neustarten',
        });
      } else {
        setMessage({
          type: 'error',
          text: err.data?.message || err.message || 'Netzwerkfehler beim Neustart des Service',
        });
      }
    } finally {
      setRestartingService(null);
    }
  };

  if (loading) {
    return (
      <div className="animate-in fade-in">
        <div className="mb-8 pb-6 border-b border-border">
          <h1 className="text-2xl font-bold text-foreground mb-2">Services</h1>
        </div>
        <SkeletonCard hasAvatar={false} lines={6} />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in">
      <div className="mb-8 pb-6 border-b border-border">
        <h1 className="text-2xl font-bold text-foreground mb-2">Services</h1>
        <p className="text-sm text-muted-foreground">
          Verwalten Sie die Arasul Platform Dienste. Hier können Sie den Status einsehen und Dienste
          bei Bedarf neustarten.
        </p>
      </div>

      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'} className="mb-6">
          {message.type === 'success' ? (
            <Check className="size-4" />
          ) : (
            <AlertCircle className="size-4" />
          )}
          <AlertDescription className="flex items-center justify-between">
            <span>{message.text}</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => setMessage(null)}
              aria-label="Meldung schließen"
            >
              <X className="size-4" />
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Service List */}
      <div className="border border-border/50 rounded-lg divide-y divide-border/50">
        {services.map(service => {
          const config = STATUS_CONFIG[service.status] || {
            label: 'Unbekannt',
            dot: 'bg-muted-foreground',
          };
          const info = getServiceInfo(service.name);
          const ServiceIcon = info.icon;
          const isRestarting = restartingService === service.name;

          return (
            <div
              key={service.id}
              className="flex items-center justify-between px-4 py-3 group transition-colors hover:bg-muted/30"
            >
              <div className="flex items-center gap-3 min-w-0">
                <ServiceIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground truncate">
                  {info.displayName}
                </span>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <div className={cn('size-2 rounded-full', config.dot)} />
                  <span className="text-xs text-muted-foreground">{config.label}</span>
                </div>

                {service.canRestart && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      setConfirmRestart(service);
                      setMessage(null);
                    }}
                    disabled={isRestarting}
                  >
                    <RefreshCw className={cn('size-3.5', isRestarting && 'animate-spin')} />
                    {isRestarting ? 'Neustart...' : 'Neustart'}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Hints */}
      <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
        Während eines Neustarts ist der Dienst kurzzeitig nicht verfügbar. Jeder Dienst kann maximal
        einmal pro Minute neugestartet werden. Alle Neustarts werden im Self-Healing Event-Log
        protokolliert.
      </p>

      {/* Confirmation Dialog */}
      <Dialog open={!!confirmRestart} onOpenChange={open => !open && setConfirmRestart(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Service neustarten?</DialogTitle>
            <DialogDescription>
              Möchten Sie den Service{' '}
              <strong>
                {confirmRestart ? getServiceInfo(confirmRestart.name).displayName : ''}
              </strong>{' '}
              wirklich neustarten? Der Dienst wird während des Neustarts kurzzeitig nicht verfügbar
              sein.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRestart(null)}>
              Abbrechen
            </Button>
            <Button onClick={handleConfirmRestart}>
              <RefreshCw className="size-4" />
              Neustarten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
