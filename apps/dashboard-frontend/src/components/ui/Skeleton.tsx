import * as React from 'react';
import { cn } from '@/lib/utils';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

function Skeleton({ width, height, borderRadius, className = '', style = {} }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-accent', className)}
      style={{
        width: width || '100%',
        height: height || '1rem',
        borderRadius: borderRadius || undefined,
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({
  lines = 3,
  width = '100%',
  lineHeight = '1rem',
  gap = '0.5rem',
}: {
  lines?: number;
  width?: string | number;
  lineHeight?: string;
  gap?: string;
}) {
  return (
    <div className="flex flex-col" style={{ width, gap }} aria-hidden="true">
      {Array(lines)
        .fill(0)
        .map((_, i) => (
          <Skeleton key={i} height={lineHeight} width={i === lines - 1 ? '60%' : '100%'} />
        ))}
    </div>
  );
}

function SkeletonAvatar({ size = '40px' }: { size?: string }) {
  return <Skeleton width={size} height={size} borderRadius="50%" />;
}

export function SkeletonCard({
  hasAvatar = true,
  lines = 2,
}: {
  hasAvatar?: boolean;
  lines?: number;
}) {
  return (
    <div className="rounded-lg border border-border p-4" aria-hidden="true">
      <div className="flex items-center gap-3 mb-3">
        {hasAvatar && <SkeletonAvatar size="32px" />}
        <Skeleton height="1rem" width="60%" />
      </div>
      <SkeletonText lines={lines} />
    </div>
  );
}

export function SkeletonList({
  count = 5,
  hasAvatar = true,
}: {
  count?: number;
  hasAvatar?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3" aria-label="Lade Inhalte..." role="status">
      {Array(count)
        .fill(0)
        .map((_, i) => (
          <SkeletonCard key={i} hasAvatar={hasAvatar} />
        ))}
    </div>
  );
}

function SkeletonDocumentItem() {
  return (
    <div className="flex items-center gap-3 py-3 px-4" aria-hidden="true">
      <Skeleton width="24px" height="24px" borderRadius="4px" />
      <div className="flex-1 flex flex-col gap-1">
        <Skeleton height="1rem" width="70%" />
        <Skeleton height="0.75rem" width="40%" />
      </div>
      <Skeleton width="60px" height="1.5rem" borderRadius="4px" />
    </div>
  );
}

export function SkeletonDocumentList({ count = 5 }: { count?: number }) {
  return (
    <div
      className="flex flex-col divide-y divide-border"
      aria-label="Lade Dokumente..."
      role="status"
    >
      {Array(count)
        .fill(0)
        .map((_, i) => (
          <SkeletonDocumentItem key={i} />
        ))}
    </div>
  );
}
