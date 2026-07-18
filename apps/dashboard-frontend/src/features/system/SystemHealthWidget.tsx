/**
 * SystemHealthWidget — "System-Gesundheit" aggregate tile.
 *
 * Shows one consolidated badge + 4 sub-lines (backup, restore-drill,
 * service-health, unacknowledged alerts) driven by GET /api/ops/overview.
 * Admin-only endpoint; renders nothing for non-admin users.
 *
 * Aus dem entfernten Dashboard-Feature in die System-Einstellungen (Settings →
 * System → System-Status) übernommen (Plan 008).
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ShieldAlert, ShieldX, ExternalLink } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../contexts/AuthContext';
import { DashboardCard, DashboardCardTitle } from './DashboardCard';

interface OpsOverview {
  status: 'OK' | 'WARNING' | 'CRITICAL';
  warnings: string[];
  criticals: string[];
  backup: {
    status: string;
    ageHours?: number;
    stale: boolean;
    totalSize?: string | null;
  };
  restore_drill: {
    status: string;
    ageDays?: number;
    stale: boolean;
  };
  services: {
    total: number;
    healthy: number;
    degraded: number;
    down: number;
    down_services: string[];
  };
  alerts: {
    active: number;
  };
  notifications: {
    unsent_critical_24h: number;
  };
  timestamp: string;
}

const REFRESH_INTERVAL_MS = 30_000;

const statusMeta: Record<
  OpsOverview['status'],
  { icon: React.ReactNode; label: string; color: string }
> = {
  OK: {
    icon: <ShieldCheck size={20} />,
    label: 'Alle Systeme OK',
    color: 'var(--success-color)',
  },
  WARNING: {
    icon: <ShieldAlert size={20} />,
    label: 'Warnung',
    color: 'var(--warning-color)',
  },
  CRITICAL: {
    icon: <ShieldX size={20} />,
    label: 'Kritisch',
    color: 'var(--danger-color)',
  },
};

const SystemHealthWidget: React.FC = () => {
  const api = useApi();
  const { user } = useAuth();
  const [data, setData] = useState<OpsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin =
    (typeof user?.role === 'string' && user.role === 'admin') || user?.is_admin === true;

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    const fetchOnce = async () => {
      try {
        const res = await api.get<OpsOverview>('/ops/overview', { showError: false });
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
        }
      }
    };

    fetchOnce();
    const id = window.setInterval(fetchOnce, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [api, isAdmin]);

  if (!isAdmin) return null;

  if (error && !data) {
    return (
      <DashboardCard>
        <DashboardCardTitle>System-Gesundheit</DashboardCardTitle>
        <p className="text-ui text-text-muted">{error}</p>
      </DashboardCard>
    );
  }

  if (!data) {
    return (
      <DashboardCard className="min-h-[200px]">
        <DashboardCardTitle>System-Gesundheit</DashboardCardTitle>
        <p className="text-ui text-text-muted">Lade…</p>
      </DashboardCard>
    );
  }

  // Fall back to a neutral "unknown" state if the payload omits/garbles status —
  // a malformed /ops/overview response must not crash the whole view.
  const meta = statusMeta[data.status] ?? {
    icon: <ShieldAlert size={20} />,
    label: 'Status unbekannt',
    color: 'var(--text-muted)',
  };

  // Normalize every nested field the render reads, so a partial/empty payload
  // degrades gracefully instead of throwing on `.length`/nested access.
  const criticals = data.criticals ?? [];
  const warnings = data.warnings ?? [];
  const backup = data.backup ?? { status: 'unknown', stale: false };
  const restoreDrill = data.restore_drill ?? { status: 'never_run', stale: false };
  const services = data.services ?? {
    total: 0,
    healthy: 0,
    degraded: 0,
    down: 0,
    down_services: [],
  };
  const alerts = data.alerts ?? { active: 0 };
  const notifications = data.notifications ?? { unsent_critical_24h: 0 };

  return (
    <DashboardCard>
      <DashboardCardTitle>System-Gesundheit</DashboardCardTitle>

      <div
        className="mb-ui-3 flex min-w-0 items-center gap-ui-2 rounded-lg border bg-bg-subtle p-ui-2"
        style={{ borderColor: meta.color }}
      >
        <div className="shrink-0" style={{ color: meta.color }}>
          {meta.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold" style={{ color: meta.color }}>
            {meta.label}
          </div>
          {criticals.length > 0 && (
            <div className="truncate text-ui-xs text-text-muted">{criticals[0]}</div>
          )}
          {criticals.length === 0 && warnings.length > 0 && (
            <div className="truncate text-ui-xs text-text-muted">{warnings[0]}</div>
          )}
        </div>
      </div>

      <div className="grid min-w-0 gap-ui-1 text-ui">
        <Link
          to="/settings?tab=system"
          className="flex min-w-0 items-center justify-between gap-ui-2 text-inherit no-underline"
        >
          <span className="min-w-0 truncate">Letztes Backup</span>
          <span
            className="inline-flex shrink-0 items-center gap-ui-1 whitespace-nowrap"
            style={{ color: backup.stale ? 'var(--danger-color)' : 'var(--success-color)' }}
          >
            {backup.status === 'missing'
              ? 'fehlt'
              : backup.ageHours !== undefined
                ? `vor ${backup.ageHours}h`
                : backup.status}
            <ExternalLink size={12} className="shrink-0" aria-hidden="true" />
          </span>
        </Link>

        <div className="flex min-w-0 items-center justify-between gap-ui-2">
          <span className="min-w-0 truncate">Restore-Drill</span>
          <span
            className="shrink-0 whitespace-nowrap"
            style={{
              color:
                restoreDrill.status === 'never_run' || restoreDrill.stale
                  ? 'var(--warning-color)'
                  : 'var(--success-color)',
            }}
          >
            {restoreDrill.status === 'never_run'
              ? 'nie ausgeführt'
              : `vor ${restoreDrill.ageDays}d`}
          </span>
        </div>

        <div className="flex min-w-0 items-center justify-between gap-ui-2">
          <span className="min-w-0 truncate">Services</span>
          <span
            className="shrink-0 whitespace-nowrap"
            style={{ color: services.down > 0 ? 'var(--danger-color)' : 'var(--success-color)' }}
          >
            {services.healthy}/{services.total} healthy
            {services.down > 0 && ` · ${services.down} down`}
          </span>
        </div>

        <Link
          to="/settings?tab=system"
          className="flex min-w-0 items-center justify-between gap-ui-2 text-inherit no-underline"
        >
          <span className="min-w-0 truncate">Aktive Alerts</span>
          <span
            className="inline-flex shrink-0 items-center gap-ui-1 whitespace-nowrap"
            style={{ color: alerts.active > 0 ? 'var(--warning-color)' : 'var(--success-color)' }}
          >
            {alerts.active}
            <ExternalLink size={12} className="shrink-0" aria-hidden="true" />
          </span>
        </Link>

        {notifications.unsent_critical_24h > 0 && (
          <div className="flex min-w-0 items-center justify-between gap-ui-2">
            <span className="min-w-0 truncate">Unversandte kritische Events</span>
            <span className="shrink-0 whitespace-nowrap" style={{ color: 'var(--danger-color)' }}>
              {notifications.unsent_critical_24h}
            </span>
          </div>
        )}
      </div>
    </DashboardCard>
  );
};

export default SystemHealthWidget;
