/**
 * SystemHealthWidget — "System-Gesundheit" aggregate tile.
 *
 * Shows one consolidated badge + 4 sub-lines (backup, restore-drill,
 * service-health, unacknowledged alerts) driven by GET /api/ops/overview.
 * Admin-only endpoint; renders nothing for non-admin users.
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ShieldAlert, ShieldX, ExternalLink } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../contexts/AuthContext';

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
    icon: <ShieldCheck className="stat-icon" />,
    label: 'Alle Systeme OK',
    color: 'var(--success-color)',
  },
  WARNING: {
    icon: <ShieldAlert className="stat-icon" />,
    label: 'Warnung',
    color: 'var(--warning-color)',
  },
  CRITICAL: {
    icon: <ShieldX className="stat-icon" />,
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
      <div className="dashboard-card">
        <h3 className="dashboard-card-title">System-Gesundheit</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="dashboard-card" style={{ minHeight: 200 }}>
        <h3 className="dashboard-card-title">System-Gesundheit</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Lade…</p>
      </div>
    );
  }

  const meta = statusMeta[data.status];

  return (
    <div className="dashboard-card">
      <h3 className="dashboard-card-title">System-Gesundheit</h3>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.75rem',
          borderRadius: '0.5rem',
          background: 'var(--bg-subtle)',
          border: `1px solid ${meta.color}`,
          marginBottom: '1rem',
        }}
      >
        <div style={{ color: meta.color }}>{meta.icon}</div>
        <div>
          <div style={{ fontWeight: 600, color: meta.color }}>{meta.label}</div>
          {data.criticals.length > 0 && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {data.criticals[0]}
            </div>
          )}
          {data.criticals.length === 0 && data.warnings.length > 0 && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {data.warnings[0]}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.875rem' }}>
        <Link
          to="/settings/backup"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            color: 'inherit',
            textDecoration: 'none',
          }}
        >
          <span>Letztes Backup</span>
          <span
            style={{ color: data.backup.stale ? 'var(--danger-color)' : 'var(--success-color)' }}
          >
            {data.backup.status === 'missing'
              ? 'fehlt'
              : data.backup.ageHours !== undefined
                ? `vor ${data.backup.ageHours}h`
                : data.backup.status}
            <ExternalLink
              size={12}
              style={{ display: 'inline', marginLeft: 4, verticalAlign: '-2px' }}
            />
          </span>
        </Link>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Restore-Drill</span>
          <span
            style={{
              color:
                data.restore_drill.status === 'never_run' || data.restore_drill.stale
                  ? 'var(--warning-color)'
                  : 'var(--success-color)',
            }}
          >
            {data.restore_drill.status === 'never_run'
              ? 'nie ausgeführt'
              : `vor ${data.restore_drill.ageDays}d`}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Services</span>
          <span
            style={{
              color: data.services.down > 0 ? 'var(--danger-color)' : 'var(--success-color)',
            }}
          >
            {data.services.healthy}/{data.services.total} healthy
            {data.services.down > 0 && ` · ${data.services.down} down`}
          </span>
        </div>

        <Link
          to="/settings/alerts"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            color: 'inherit',
            textDecoration: 'none',
          }}
        >
          <span>Aktive Alerts</span>
          <span
            style={{
              color: data.alerts.active > 0 ? 'var(--warning-color)' : 'var(--success-color)',
            }}
          >
            {data.alerts.active}
            <ExternalLink
              size={12}
              style={{ display: 'inline', marginLeft: 4, verticalAlign: '-2px' }}
            />
          </span>
        </Link>

        {data.notifications.unsent_critical_24h > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Unversandte kritische Events</span>
            <span style={{ color: 'var(--danger-color)' }}>
              {data.notifications.unsent_critical_24h}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default SystemHealthWidget;
