import { useState, useEffect, useCallback } from 'react';
import {
  Server,
  RefreshCw,
  Check,
  AlertCircle,
  X,
  Database,
  Bot,
  Sparkles,
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
import { Kopf } from '@marken';
import {
  Alert,
  AlertDescription,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@marken';

interface Service {
  id: string;
  name: string;
  status: string;
  canRestart?: boolean;
  /** Der deutsche Name des Dienstes, vom Gerät (J35). */
  anzeige?: string;
}

const STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  healthy: { label: 'Läuft', dot: 'bg-primary' },
  starting: { label: 'Startet…', dot: 'bg-muted-foreground animate-pulse' },
  restarting: { label: 'Startet neu…', dot: 'bg-muted-foreground animate-pulse' },
  failed: { label: 'Fehler', dot: 'bg-foreground/40' },
  unhealthy: { label: 'Fehler', dot: 'bg-foreground/40' },
  exited: { label: 'Beendet', dot: 'bg-foreground/40' },
};

/**
 * Je Dienst das Symbol. Der NAME kommt vom Gerät (`anzeige` aus
 * `GET /api/services/all`, eine Tabelle in `utils/dienstNamen.js` des
 * Backends, J35) -- bis dahin standen hier „LLM Service", „Document Indexer"
 * und „Dashboard UI", und dieselbe Sache hieß in der Selbstheilung wieder
 * anders.
 */
const DIENST_SYMBOL: Record<string, LucideIcon> = {
  'postgres-db': Database,
  'llm-service': Bot,
  'embedding-service': Sparkles,
  'document-indexer': FileSearch,
  'reverse-proxy': Globe,
  'dashboard-backend': Server,
  'dashboard-frontend': Monitor,
  'metrics-collector': BarChart3,
  'self-healing-agent': Wrench,
  'backup-service': Archive,
};

function dienstName(service: Service): string {
  return service.anzeige || service.name;
}

export function ServicesSettings() {
  const api = useApi();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [restartingService, setRestartingService] = useState<string | null>(null);
  const [confirmRestart, setConfirmRestart] = useState<Service | null>(null);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Services whose restart briefly drops the dashboard connection itself.
  const SELF_RESTART_SERVICES = ['dashboard-backend', 'dashboard-frontend'];

  const fetchServices = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await api.get<{ services?: Service[] }>('/services/all', {
          signal,
          showError: false,
        });
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

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchServices();
    } finally {
      setRefreshing(false);
    }
  };

  const handleConfirmRestart = async () => {
    if (!confirmRestart) return;

    const serviceName = confirmRestart.name;
    const anzeige = dienstName(confirmRestart);
    setRestartingService(serviceName);
    setConfirmRestart(null);
    setMessage(null);

    try {
      // The restart route always throws on failure, so reaching here means success.
      const data = await api.post<{ success: boolean; duration_ms?: number }>(
        `/services/restart/${serviceName}`,
        null,
        { showError: false }
      );
      setMessage({
        type: 'success',
        text:
          data.duration_ms !== undefined
            ? `„${anzeige}“ ist neu gestartet (${(data.duration_ms / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Sekunden).`
            : `„${anzeige}“ ist neu gestartet.`,
      });
      setTimeout(fetchServices, 2000);
    } catch (error: unknown) {
      const err = error as { status?: number; data?: { message?: string }; message?: string };
      if (err.status === 429) {
        setMessage({
          type: 'error',
          text: err.data?.message || 'Bitte kurz warten, bevor dieser Dienst wieder neu startet',
        });
      } else {
        setMessage({
          type: 'error',
          text:
            err.data?.message ||
            err.message ||
            'Der Dienst ließ sich nicht neu starten. Versuchen Sie es in einer Minute noch einmal.',
        });
      }
    } finally {
      setRestartingService(null);
    }
  };

  if (loading) {
    return (
      <div className="animate-in fade-in">
        <Kopf titel="Dienste" />
        <SkeletonCard hasAvatar={false} lines={6} />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in" data-testid="dienste-seite">
      <Kopf
        titel="Dienste"
        beschreibung="Die Teile des Geräts, die im Hintergrund laufen. Hier sehen Sie ihren Zustand und starten einen bei Bedarf neu."
        aktionen={
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs shrink-0"
            onClick={handleRefresh}
            loading={refreshing}
          >
            {!refreshing && <RefreshCw className="size-3.5" />}
            Aktualisieren
          </Button>
        }
      />

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
          const ServiceIcon = DIENST_SYMBOL[service.name] ?? Server;
          const isRestarting = restartingService === service.name;

          return (
            <div
              key={service.id}
              className="flex items-center justify-between px-4 py-3 group transition-colors hover:bg-muted/30"
            >
              <div className="flex items-center gap-3 min-w-0">
                <ServiceIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground truncate">
                  {dienstName(service)}
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
                    loading={isRestarting}
                  >
                    {!isRestarting && <RefreshCw className="size-3.5" />}
                    {isRestarting ? 'Startet neu…' : 'Neu starten'}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Hints */}
      <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
        Während eines Neustarts ist der Dienst kurz nicht verfügbar. Jeder Dienst lässt sich
        höchstens einmal pro Minute neu starten. Jeder Neustart steht danach unter Selbstheilung.
      </p>

      {/* Confirmation Dialog */}
      <Dialog open={!!confirmRestart} onOpenChange={open => !open && setConfirmRestart(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dienst neu starten?</DialogTitle>
            <DialogDescription>
              Soll der Dienst <strong>{confirmRestart ? dienstName(confirmRestart) : ''}</strong>{' '}
              wirklich neu starten? Er ist dabei kurz nicht verfügbar.
            </DialogDescription>
          </DialogHeader>
          {confirmRestart && SELF_RESTART_SERVICES.includes(confirmRestart.name) && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>
                Achtung: Während dieser Dienst neu startet, ist diese Oberfläche kurz nicht
                erreichbar.
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRestart(null)}>
              Abbrechen
            </Button>
            <Button onClick={handleConfirmRestart}>
              <RefreshCw className="size-4" />
              Neu starten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
