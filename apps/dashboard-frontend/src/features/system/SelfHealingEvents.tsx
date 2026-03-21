import { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import { SkeletonList } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import {
  RefreshCw,
  Info,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Activity,
  Cpu,
  HardDrive,
  Thermometer,
  Power,
} from 'lucide-react';
import { formatRelativeDate } from '../../utils/formatting';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/shadcn/button';
import { Badge } from '@/components/ui/shadcn/badge';

interface SelfHealingEvent {
  id: number;
  event_type: string;
  severity: string;
  description: string;
  action_taken?: string;
  service_name?: string;
  duration_ms?: number;
  error_message?: string;
  timestamp: string;
}

type SeverityFilter = 'all' | 'INFO' | 'WARNING' | 'CRITICAL';

const SelfHealingEvents = () => {
  const api = useApi();
  const [events, setEvents] = useState<SelfHealingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<SeverityFilter>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState<ReturnType<typeof setInterval> | null>(
    null
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchEvents(false, controller.signal);

    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchEvents(true, controller.signal); // Silent refresh
      }, 15000); // Refresh every 15 seconds

      setRefreshInterval(interval);

      return () => {
        controller.abort();
        if (interval) clearInterval(interval);
      };
    } else {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        setRefreshInterval(null);
      }
      return () => controller.abort();
    }
  }, [autoRefresh]);

  const fetchEvents = async (silent = false, signal?: AbortSignal) => {
    if (!silent) setLoading(true);
    setError('');

    try {
      const data = await api.get('/self-healing/events?limit=50', { signal, showError: false });
      setEvents(data.events || []);
    } catch (err: any) {
      if (signal?.aborted) return;
      setError('Selbstheilungs-Ereignisse konnten nicht geladen werden');
      console.error('Failed to fetch events:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const getSeverityBadge = (severity: string) => {
    const severityMap: Record<string, { color: string; Icon: typeof Info }> = {
      INFO: { color: 'info', Icon: Info },
      WARNING: { color: 'warning', Icon: AlertTriangle },
      CRITICAL: { color: 'critical', Icon: AlertCircle },
    };

    const config = severityMap[severity] || { color: 'neutral', Icon: Activity };
    const IconComponent = config.Icon;

    return (
      <Badge
        variant="outline"
        className={cn(
          'badge gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold',
          severity === 'INFO' && 'border-primary bg-primary/10 text-primary',
          severity === 'WARNING' && 'border-amber-500 bg-amber-500/10 text-amber-500',
          severity === 'CRITICAL' && 'border-destructive bg-destructive/10 text-destructive',
          !severityMap[severity] && 'border-muted-foreground bg-muted text-muted-foreground'
        )}
      >
        <IconComponent className="size-3.5 shrink-0" />
        {severity}
      </Badge>
    );
  };

  const getEventTypeIcon = (eventType: string) => {
    const icons: Record<string, typeof Activity> = {
      service_restart: RefreshCw,
      service_down: AlertCircle,
      recovery_action: Activity,
      gpu_error: Cpu,
      disk_cleanup: HardDrive,
      memory_warning: Cpu,
      temperature_warning: Thermometer,
      system_reboot: Power,
    };

    const IconComponent = icons[eventType] || Activity;
    return <IconComponent className="size-6" />;
  };

  const filteredEvents = events.filter(event => {
    if (filter === 'all') return true;
    return event.severity === filter;
  });

  const getEventStats = () => {
    const stats = {
      total: events.length,
      INFO: 0,
      WARNING: 0,
      CRITICAL: 0,
    };

    events.forEach(event => {
      if (event.severity in stats) {
        stats[event.severity as keyof Omit<typeof stats, 'total'>]++;
      }
    });

    return stats;
  };

  const stats = getEventStats();

  if (loading) {
    return (
      <div className="self-healing-events">
        <SkeletonList count={5} hasAvatar={false} />
      </div>
    );
  }

  return (
    <div className="self-healing-events">
      {/* Header */}
      <div className="events-header flex justify-between items-start mb-8 pb-6 border-b border-border/50 flex-wrap gap-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground mb-2">Selbstheilungs-Ereignisse</h2>
          <p className="text-muted-foreground text-sm m-0">Systemwiederherstellung und Wartung</p>
        </div>

        <div className="flex gap-4 items-center max-md:flex-col max-md:items-stretch">
          <label className="flex items-center gap-2.5 py-3 px-5 bg-muted border border-border/50 rounded-md cursor-pointer transition-all font-medium text-sm text-muted-foreground hover:bg-primary/8 hover:border-primary/30 hover:text-foreground">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="cursor-pointer size-4 accent-primary"
            />
            <span>Auto-Aktualisierung (15s)</span>
          </label>

          <Button
            type="button"
            onClick={() => fetchEvents()}
            className="py-3 px-6 bg-gradient-to-r from-primary to-primary/80 text-white border-none rounded-md font-semibold text-sm cursor-pointer transition-all flex items-center gap-2 shadow-sm hover:-translate-y-0.5 hover:shadow-md"
          >
            <RefreshCw className="size-4" /> Aktualisieren
          </Button>
        </div>
      </div>

      {/* Statistics */}
      <div className="events-stats grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <div className="bg-card/80 backdrop-blur-sm p-7 rounded-xl border border-border shadow-md border-l-[3px] border-l-border transition-all backdrop-blur-sm hover:-translate-y-1 hover:shadow-lg">
          <div className="text-4xl font-bold text-foreground mb-2 leading-none">{stats.total}</div>
          <div className="text-muted-foreground text-sm font-semibold uppercase tracking-wide">
            Gesamt
          </div>
        </div>
        <div className="bg-card/80 backdrop-blur-sm p-7 rounded-xl border border-border shadow-md border-l-[3px] border-l-primary transition-all backdrop-blur-sm hover:-translate-y-1 hover:shadow-lg">
          <div className="text-4xl font-bold text-foreground mb-2 leading-none">{stats.INFO}</div>
          <div className="text-muted-foreground text-sm font-semibold uppercase tracking-wide">
            Info
          </div>
        </div>
        <div className="bg-card/80 backdrop-blur-sm p-7 rounded-xl border border-border shadow-md border-l-[3px] border-l-amber-500 transition-all backdrop-blur-sm hover:-translate-y-1 hover:shadow-lg">
          <div className="text-4xl font-bold text-foreground mb-2 leading-none">
            {stats.WARNING}
          </div>
          <div className="text-muted-foreground text-sm font-semibold uppercase tracking-wide">
            Warnungen
          </div>
        </div>
        <div className="bg-card/80 backdrop-blur-sm p-7 rounded-xl border border-border shadow-md border-l-[3px] border-l-destructive transition-all backdrop-blur-sm hover:-translate-y-1 hover:shadow-lg">
          <div className="text-4xl font-bold text-foreground mb-2 leading-none">
            {stats.CRITICAL}
          </div>
          <div className="text-muted-foreground text-sm font-semibold uppercase tracking-wide">
            Kritisch
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="events-filters flex gap-3 mb-6 flex-wrap">
        {[
          { value: 'all' as SeverityFilter, label: 'Alle' },
          { value: 'INFO' as SeverityFilter, label: 'Info' },
          { value: 'WARNING' as SeverityFilter, label: 'Warnungen' },
          { value: 'CRITICAL' as SeverityFilter, label: 'Kritisch' },
        ].map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={cn(
              'filter-btn py-3 px-6 border border-primary/20 bg-primary/5 rounded-md font-semibold text-sm cursor-pointer transition-all text-muted-foreground hover:border-primary/40 hover:bg-primary/[0.12] hover:text-foreground',
              filter === value &&
                'active bg-gradient-to-r from-primary to-primary/80 border-transparent text-white shadow-md -translate-y-0.5'
            )}
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-4 p-4 px-5 bg-destructive/10 border border-destructive/30 text-destructive rounded-md mb-6 border-l-[3px] border-l-destructive text-sm">
          <AlertTriangle className="size-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Events List */}
      {filteredEvents.length === 0 ? (
        <EmptyState
          icon={<CheckCircle />}
          title={filter === 'all' ? 'Keine Ereignisse' : `Keine ${filter}-Ereignisse`}
          description={
            filter === 'all'
              ? 'Das System läuft einwandfrei. Es wurden keine Selbstheilungs-Ereignisse aufgezeichnet.'
              : `Es sind keine Ereignisse mit Schweregrad \u201e${filter}\u201c vorhanden.`
          }
          action={
            filter !== 'all' ? (
              <Button variant="outline" size="sm" onClick={() => setFilter('all')}>
                Alle anzeigen
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {filteredEvents.map(event => (
            <div
              key={event.id}
              className={cn(
                'bg-card/80 backdrop-blur-sm rounded-xl p-6 border border-border shadow-md border-l-[3px] border-l-border transition-all backdrop-blur-sm hover:-translate-y-1 hover:shadow-lg',
                event.severity?.toLowerCase() === 'info' && 'border-l-primary',
                event.severity?.toLowerCase() === 'warning' && 'border-l-amber-500',
                event.severity?.toLowerCase() === 'critical' && 'border-l-destructive'
              )}
            >
              <div className="flex items-center gap-5 mb-5">
                <div className="text-2xl size-12 flex items-center justify-center bg-primary/10 rounded-md shrink-0 text-primary">
                  {getEventTypeIcon(event.event_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-base font-semibold text-foreground capitalize mb-1 m-0">
                    {event.event_type?.replace(/_/g, ' ').toUpperCase()}
                  </h4>
                  <span className="text-sm text-muted-foreground">
                    {formatRelativeDate(event.timestamp)}
                  </span>
                </div>
                <div className="shrink-0">{getSeverityBadge(event.severity)}</div>
              </div>

              <div className="flex flex-col gap-3.5">
                <p className="text-muted-foreground leading-relaxed text-sm m-0">
                  {event.description}
                </p>

                {event.action_taken && (
                  <div className="flex gap-3 p-3.5 px-4 bg-muted border border-border/50 rounded-md border-l-[3px] border-l-green-500 transition-all hover:translate-x-1">
                    <span className="font-semibold text-muted-foreground text-sm min-w-[120px] shrink-0">
                      Maßnahme:
                    </span>
                    <span className="text-foreground flex-1 text-sm">{event.action_taken}</span>
                  </div>
                )}

                {event.service_name && (
                  <div className="flex gap-3 p-3.5 px-4 bg-primary/5 border border-border/50 rounded-md transition-all hover:translate-x-1">
                    <span className="font-semibold text-muted-foreground text-sm min-w-[120px] shrink-0">
                      Service:
                    </span>
                    <span className="text-foreground flex-1 text-sm">{event.service_name}</span>
                  </div>
                )}

                {event.duration_ms && (
                  <div className="flex gap-3 p-3.5 px-4 bg-primary/5 border border-border/50 rounded-md transition-all hover:translate-x-1">
                    <span className="font-semibold text-muted-foreground text-sm min-w-[120px] shrink-0">
                      Dauer:
                    </span>
                    <span className="text-foreground flex-1 text-sm">{event.duration_ms}ms</span>
                  </div>
                )}

                {event.error_message && (
                  <div className="p-4 bg-destructive/10 border border-destructive/20 border-l-[3px] border-l-destructive rounded-md">
                    <span className="font-semibold text-destructive block mb-1.5 text-sm">
                      Fehler:
                    </span>
                    <span className="text-muted-foreground font-mono text-sm block leading-relaxed">
                      {event.error_message}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SelfHealingEvents;
