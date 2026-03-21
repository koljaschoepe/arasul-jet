import React, { useState, useEffect, useRef } from 'react';
import {
  Folder,
  Grid3x3,
  Check,
  Clock,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  Archive,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// -- Shared base classes --

const badgeBase = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-xs font-medium';

const badgeVariants: Record<string, string> = {
  success: 'bg-primary/10 text-primary',
  warning: 'bg-muted-foreground/10 text-muted-foreground',
  info: 'bg-primary/10 text-primary',
  error: 'bg-destructive/10 text-destructive',
  neutral: 'bg-muted text-foreground/60',
};

// -- TableBadge --

export const TableBadge: React.FC = () => (
  <span className={cn(badgeBase, 'uppercase tracking-wide bg-primary/10 text-primary')}>
    <Grid3x3 className="size-3.5" aria-hidden="true" />
    Tabelle
  </span>
);

// -- StatusBadge --

type DocumentStatus = 'pending' | 'processing' | 'indexed' | 'failed';

interface StatusBadgeProps {
  status: DocumentStatus;
}

interface StatusConfig {
  icon: LucideIcon;
  label: string;
  badge: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const statusConfig: Record<DocumentStatus, StatusConfig> = {
    pending: { icon: Clock, label: 'Wartend', badge: 'warning' },
    processing: { icon: RefreshCw, label: 'Verarbeitung', badge: 'info' },
    indexed: { icon: Check, label: 'Indexiert', badge: 'success' },
    failed: { icon: AlertCircle, label: 'Fehlgeschlagen', badge: 'error' },
  };

  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <span
      className={cn(badgeBase, badgeVariants[config.badge])}
      role="status"
      aria-label={`Status: ${config.label}`}
    >
      <Icon
        className={cn('size-3.5', status === 'processing' && 'animate-spin')}
        aria-hidden="true"
      />
      {config.label}
    </span>
  );
};

// -- TableStatusBadge --

type TableStatus = 'active' | 'draft' | 'archived';

interface TableStatusBadgeProps {
  status: TableStatus;
}

export const TableStatusBadge: React.FC<TableStatusBadgeProps> = ({ status }) => {
  const statusConfig: Record<TableStatus, StatusConfig> = {
    active: { icon: Check, label: 'Aktiv', badge: 'success' },
    draft: { icon: Clock, label: 'Entwurf', badge: 'warning' },
    archived: { icon: Archive, label: 'Archiviert', badge: 'neutral' },
  };

  const config = statusConfig[status] || statusConfig.active;
  const Icon = config.icon;

  return (
    <span
      className={cn(badgeBase, badgeVariants[config.badge])}
      role="status"
      aria-label={`Status: ${config.label}`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {config.label}
    </span>
  );
};

// -- CategoryBadge --

interface CategoryBadgeProps {
  name?: string;
  color?: string;
}

export const CategoryBadge: React.FC<CategoryBadgeProps> = ({ name, color }) => (
  <span
    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-xs bg-muted border border-current"
    style={{ color: color || 'var(--text-muted)' }}
  >
    <Folder className="size-3.5" aria-hidden="true" />
    {name || 'Unkategorisiert'}
  </span>
);

// -- SpaceBadge --

interface Space {
  id: string;
  name: string;
  color?: string;
}

interface SpaceBadgeProps {
  name?: string;
  color?: string;
  docId?: string;
  spaces?: Space[];
  onMove?: (docId: string, spaceId: string | null, spaceName: string | null) => void;
}

export const SpaceBadge: React.FC<SpaceBadgeProps> = ({ name, color, docId, spaces, onMove }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const badgeClasses =
    'inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-xs bg-primary/10 border border-current opacity-90';

  // Static badge (no move capability)
  if (!docId || !onMove) {
    return (
      <span className={badgeClasses} style={{ color: color || 'var(--primary-color)' }}>
        <Folder className="size-3.5" aria-hidden="true" />
        {name || 'Allgemein'}
      </span>
    );
  }

  return (
    <span className="relative inline-block" ref={ref}>
      <button
        className={cn(
          badgeClasses,
          'cursor-pointer transition-all hover:opacity-100 hover:brightness-115'
        )}
        style={{ color: color || 'var(--primary-color)' }}
        onClick={e => {
          e.stopPropagation();
          setOpen(!open);
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        title="Bereich ändern"
      >
        <Folder className="size-3.5" aria-hidden="true" />
        {name || 'Kein Bereich'}
        <ChevronDown
          className={cn('text-[0.65rem] transition-transform ml-0.5 size-3', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          className="absolute top-[calc(100%+4px)] left-0 min-w-[180px] max-h-[240px] overflow-y-auto bg-card border border-border rounded-md shadow-lg z-50 p-1"
          role="listbox"
          aria-label="Bereich wählen"
        >
          <button
            className={cn(
              'flex items-center gap-2 w-full py-2 px-2.5 border-none bg-transparent text-foreground text-xs cursor-pointer rounded-sm text-left transition-colors hover:bg-primary/10',
              !name && 'bg-primary/15 text-primary'
            )}
            onClick={e => {
              e.stopPropagation();
              onMove(docId, null, null);
              setOpen(false);
            }}
            role="option"
            aria-selected={!name}
          >
            <span
              className="size-2 rounded-full shrink-0"
              style={{ background: 'var(--text-muted)' }}
            />
            Kein Bereich
            {!name && (
              <Check className="ml-auto text-xs text-primary size-3.5" aria-hidden="true" />
            )}
          </button>
          {(spaces || []).map(s => (
            <button
              key={s.id}
              className={cn(
                'flex items-center gap-2 w-full py-2 px-2.5 border-none bg-transparent text-foreground text-xs cursor-pointer rounded-sm text-left transition-colors hover:bg-primary/10',
                s.name === name && 'bg-primary/15 text-primary'
              )}
              onClick={e => {
                e.stopPropagation();
                onMove(docId, s.id, s.name);
                setOpen(false);
              }}
              role="option"
              aria-selected={s.name === name}
            >
              <span
                className="size-2 rounded-full shrink-0"
                style={{ background: s.color || 'var(--primary-color)' }}
              />
              {s.name}
              {s.name === name && (
                <Check className="ml-auto text-xs text-primary size-3.5" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      )}
    </span>
  );
};
