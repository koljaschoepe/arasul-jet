import { useState, useEffect, useCallback } from 'react';
import {
  Server,
  RefreshCw,
  Check,
  AlertCircle,
  X,
  AlertTriangle,
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
  Info,
  type LucideIcon,
} from 'lucide-react';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { useApi } from '../../hooks/useApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
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
import { Badge } from '@/components/ui/shadcn/badge';
import { cn } from '@/lib/utils';

interface Service {
  id: string;
  name: string;
  status: string;
  canRestart?: boolean;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; dot: string }
> = {
  healthy: { label: 'Aktiv', variant: 'default', dot: 'bg-green-500' },
  starting: { label: 'Startet...', variant: 'secondary', dot: 'bg-yellow-500 animate-pulse' },
  restarting: { label: 'Neustart...', variant: 'secondary', dot: 'bg-yellow-500 animate-pulse' },
  failed: { label: 'Fehler', variant: 'destructive', dot: 'bg-red-500' },
  unhealthy: { label: 'Fehler', variant: 'destructive', dot: 'bg-red-500' },
  exited: { label: 'Beendet', variant: 'destructive', dot: 'bg-red-500' },
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
      } catch (error: any) {
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
    } catch (error: any) {
      if (error.status === 429) {
        setMessage({
          type: 'error',
          text:
            error.data?.message || 'Bitte warten Sie, bevor Sie diesen Service erneut neustarten',
        });
      } else {
        setMessage({
          type: 'error',
          text: error.data?.message || error.message || 'Netzwerkfehler beim Neustart des Service',
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
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          <SkeletonCard hasAvatar={false} lines={2} />
          <SkeletonCard hasAvatar={false} lines={2} />
          <SkeletonCard hasAvatar={false} lines={2} />
          <SkeletonCard hasAvatar={false} lines={2} />
          <SkeletonCard hasAvatar={false} lines={2} />
          <SkeletonCard hasAvatar={false} lines={2} />
        </div>
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

      <div className="flex flex-col gap-6">
        {/* Service Cards Grid */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {services.map(service => {
            const config = STATUS_CONFIG[service.status] || {
              label: 'Unbekannt',
              variant: 'outline' as const,
              dot: 'bg-muted-foreground',
            };
            const info = getServiceInfo(service.name);
            const ServiceIcon = info.icon;
            const isRestarting = restartingService === service.name;

            return (
              <Card key={service.id} className="relative overflow-hidden">
                <CardContent className="pt-5 pb-4 px-5 flex flex-col gap-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <ServiceIcon className="size-4.5 text-primary" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold text-foreground leading-tight">
                          {info.displayName}
                        </span>
                        <span className="text-[11px] text-muted-foreground/70 font-mono">
                          {service.name}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-2">
                      <div className={cn('size-2 rounded-full', config.dot)} />
                      <Badge variant={config.variant} className="text-xs">
                        {config.label}
                      </Badge>
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
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Hints Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hinweise</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-col gap-3">
              {[
                {
                  icon: AlertTriangle,
                  color: 'warning' as const,
                  title: 'Downtime beachten',
                  desc: 'Während des Neustarts ist der Dienst kurzzeitig nicht verfügbar',
                },
                {
                  icon: AlertCircle,
                  color: 'warning' as const,
                  title: 'Rate Limit',
                  desc: 'Jeder Dienst kann maximal einmal pro Minute neugestartet werden',
                },
                {
                  icon: Info,
                  color: 'primary' as const,
                  title: 'Audit-Log',
                  desc: 'Alle Neustarts werden im Self-Healing Event-Log protokolliert',
                },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full',
                      item.color === 'warning'
                        ? 'bg-warning/20 text-warning'
                        : 'bg-primary/10 text-primary'
                    )}
                  >
                    <item.icon className="size-3.5" />
                  </div>
                  <div className="flex flex-col">
                    <strong className="text-sm text-foreground">{item.title}</strong>
                    <span className="text-xs text-muted-foreground">{item.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={!!confirmRestart} onOpenChange={open => !open && setConfirmRestart(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-warning" />
              Service neustarten?
            </DialogTitle>
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
