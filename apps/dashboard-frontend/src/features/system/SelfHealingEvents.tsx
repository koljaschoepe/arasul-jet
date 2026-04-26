import { useState, useEffect, useRef, useMemo } from 'react';
import { useApi } from '../../hooks/useApi';
import { SkeletonList } from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import {
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Activity,
  Cpu,
  HardDrive,
  Thermometer,
  Power,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { formatRelativeDate } from '../../utils/formatting';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/shadcn/button';

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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['Letzte Stunde']));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchEvents(false, controller.signal);

    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        fetchEvents(true, controller.signal);
      }, 15000);
    }

    return () => {
      controller.abort();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh]);

  const fetchEvents = async (silent = false, signal?: AbortSignal) => {
    if (!silent) setLoading(true);
    setError('');

    try {
      const data = await api.get('/self-healing/events?limit=50', { signal, showError: false });
      setEvents(data.events || []);
    } catch (err: unknown) {
      if (signal?.aborted) return;
      setError('Selbstheilungs-Ereignisse konnten nicht geladen werden');
      console.error('Failed to fetch events:', err);
    } finally {
      if (!silent) setLoading(false);
    }
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
    return <IconComponent className="size-4" />;
  };

  const filteredEvents = events.filter(event => {
    if (filter === 'all') return true;
    return event.severity === filter;
  });

  const groupedEvents = useMemo(() => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const groups: { label: string; events: SelfHealingEvent[] }[] = [
      { label: 'Letzte Stunde', events: [] },
      { label: 'Heute', events: [] },
      { label: 'Gestern', events: [] },
      { label: 'Letzte 7 Tage', events: [] },
      { label: 'Älter', events: [] },
    ];

    for (const event of filteredEvents) {
      const ts = new Date(event.timestamp);
      if (ts >= oneHourAgo) {
        groups[0].events.push(event);
      } else if (ts >= todayStart) {
        groups[1].events.push(event);
      } else if (ts >= yesterdayStart) {
        groups[2].events.push(event);
      } else if (ts >= weekAgo) {
        groups[3].events.push(event);
      } else {
        groups[4].events.push(event);
      }
    }

    return groups.filter(g => g.events.length > 0);
  }, [filteredEvents]);

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const getEventStats = () => {
    const stats = { total: events.length, INFO: 0, WARNING: 0, CRITICAL: 0 };
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
      <div className="animate-in fade-in">
        <div className="mb-8 pb-6 border-b border-border">
          <h1 className="text-2xl font-bold text-foreground mb-2">Self-Healing</h1>
        </div>
        <SkeletonList count={5} hasAvatar={false} />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in">
      {/* Header */}
      <div className="mb-8 pb-6 border-b border-border">
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Self-Healing</h1>
            <p className="text-sm text-muted-foreground">Systemwiederherstellung und Wartung</p>
          </div>
          <div className="flex gap-2 items-center">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={e => setAutoRefresh(e.target.checked)}
                className="cursor-pointer size-3.5 accent-primary"
              />
              Auto (15s)
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchEvents()}
              className="h-7 text-xs"
            >
              <RefreshCw className="size-3.5" /> Aktualisieren
            </Button>
          </div>
        </div>
      </div>

      {/* Statistics - inline, minimal */}
      <div className="flex gap-6 mb-6 text-sm">
        <div>
          <span className="text-lg font-bold text-foreground">{stats.total}</span>
          <span className="text-muted-foreground ml-1.5">Gesamt</span>
        </div>
        <div>
          <span className="text-lg font-bold text-primary">{stats.INFO}</span>
          <span className="text-muted-foreground ml-1.5">Info</span>
        </div>
        <div>
          <span className="text-lg font-bold text-muted-foreground">{stats.WARNING}</span>
          <span className="text-muted-foreground ml-1.5">Warnungen</span>
        </div>
        <div>
          <span className="text-lg font-bold text-foreground">{stats.CRITICAL}</span>
          <span className="text-muted-foreground ml-1.5">Kritisch</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 mb-6">
        {[
          { value: 'all' as SeverityFilter, label: 'Alle' },
          { value: 'INFO' as SeverityFilter, label: 'Info' },
          { value: 'WARNING' as SeverityFilter, label: 'Warnungen' },
          { value: 'CRITICAL' as SeverityFilter, label: 'Kritisch' },
        ].map(({ value, label }) => (
          <Button
            key={value}
            variant={filter === value ? 'default' : 'ghost'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-3 p-3 border border-border rounded-lg mb-6 text-sm text-muted-foreground">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Events List — grouped by time */}
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
        <div className="flex flex-col gap-3">
          {groupedEvents.map(group => {
            const isExpanded = expandedGroups.has(group.label);
            return (
              <div key={group.label} className="border border-border/50 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium text-foreground">{group.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{group.events.length}</span>
                </button>

                {isExpanded && (
                  <div className="divide-y divide-border/50 border-t border-border/50">
                    {group.events.map(event => (
                      <div key={event.id} className="px-4 py-3">
                        <div className="flex items-center gap-3 mb-1.5">
                          <div
                            className={cn(
                              'shrink-0 text-muted-foreground',
                              event.severity === 'INFO' && 'text-primary',
                              event.severity === 'CRITICAL' && 'text-foreground'
                            )}
                          >
                            {getEventTypeIcon(event.event_type)}
                          </div>
                          <span className="text-sm font-medium text-foreground flex-1 min-w-0 truncate">
                            {event.event_type?.replace(/_/g, ' ')}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {formatRelativeDate(event.timestamp)}
                          </span>
                          <span
                            className={cn(
                              'text-xs font-medium shrink-0',
                              event.severity === 'INFO' && 'text-primary',
                              event.severity === 'WARNING' && 'text-muted-foreground',
                              event.severity === 'CRITICAL' && 'text-foreground'
                            )}
                          >
                            {event.severity}
                          </span>
                        </div>

                        <p className="text-sm text-muted-foreground pl-7">{event.description}</p>

                        {(event.action_taken ||
                          event.service_name ||
                          event.duration_ms ||
                          event.error_message) && (
                          <div className="pl-7 mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {event.action_taken && (
                              <span>
                                <strong className="text-foreground">Maßnahme:</strong>{' '}
                                {event.action_taken}
                              </span>
                            )}
                            {event.service_name && (
                              <span>
                                <strong className="text-foreground">Service:</strong>{' '}
                                {event.service_name}
                              </span>
                            )}
                            {event.duration_ms && (
                              <span>
                                <strong className="text-foreground">Dauer:</strong>{' '}
                                {event.duration_ms}ms
                              </span>
                            )}
                            {event.error_message && (
                              <span className="basis-full text-foreground/60 font-mono">
                                {event.error_message}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SelfHealingEvents;
