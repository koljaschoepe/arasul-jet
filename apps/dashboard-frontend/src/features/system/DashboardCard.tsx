/**
 * DashboardCard — kompakte Karten-Primitive der System-Status-Ansicht.
 *
 * Flache Karte auf Theme-Tokens, keine festen Breiten — die Größe kommt
 * vollständig vom umgebenden auto-fit-Grid. (Aus dem entfernten Dashboard-
 * Feature in die System-Einstellungen übernommen; Plan 008.)
 */

import React from 'react';
import { cn } from '@/lib/utils';

interface DashboardCardProps {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export function DashboardCard({ className, style, children }: DashboardCardProps) {
  return (
    <div
      className={cn('min-w-0 rounded-lg border border-border bg-bg-card p-ui-3', className)}
      style={style}
    >
      {children}
    </div>
  );
}

export function DashboardCardTitle({ className, children }: DashboardCardProps) {
  return (
    <h3
      className={cn(
        'mb-ui-2 flex items-center gap-ui-1 text-ui-lg font-semibold text-text-primary',
        className
      )}
    >
      {children}
    </h3>
  );
}
