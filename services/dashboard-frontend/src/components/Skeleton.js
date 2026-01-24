/**
 * Skeleton - Loading Placeholder Components
 *
 * PHASE 4: Provides skeleton loading states for better UX.
 * Shows content placeholders while data is loading.
 */

import React from 'react';
import './Skeleton.css';

/**
 * Base skeleton element with shimmer animation
 */
export function Skeleton({ width, height, borderRadius, className = '', style = {} }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width: width || '100%',
        height: height || '1rem',
        borderRadius: borderRadius || '4px',
        ...style
      }}
      aria-hidden="true"
    />
  );
}

/**
 * Skeleton text lines
 */
export function SkeletonText({ lines = 3, width = '100%', lineHeight = '1rem', gap = '0.5rem' }) {
  return (
    <div className="skeleton-text" style={{ width }} aria-hidden="true">
      {Array(lines).fill(0).map((_, i) => (
        <Skeleton
          key={i}
          height={lineHeight}
          width={i === lines - 1 ? '60%' : '100%'}
          style={{ marginBottom: i < lines - 1 ? gap : 0 }}
        />
      ))}
    </div>
  );
}

/**
 * Skeleton avatar/circle
 */
export function SkeletonAvatar({ size = '40px' }) {
  return (
    <Skeleton
      width={size}
      height={size}
      borderRadius="50%"
      className="skeleton-avatar"
    />
  );
}

/**
 * Skeleton card - Common card loading state
 */
export function SkeletonCard({ hasAvatar = true, lines = 2 }) {
  return (
    <div className="skeleton-card" aria-hidden="true">
      <div className="skeleton-card-header">
        {hasAvatar && <SkeletonAvatar size="32px" />}
        <Skeleton height="1rem" width="60%" />
      </div>
      <div className="skeleton-card-body">
        <SkeletonText lines={lines} />
      </div>
    </div>
  );
}

/**
 * Skeleton list - Multiple skeleton cards
 */
export function SkeletonList({ count = 5, hasAvatar = true }) {
  return (
    <div className="skeleton-list" aria-label="Lade Inhalte..." role="status">
      {Array(count).fill(0).map((_, i) => (
        <SkeletonCard key={i} hasAvatar={hasAvatar} />
      ))}
    </div>
  );
}

/**
 * Skeleton table row
 */
export function SkeletonTableRow({ columns = 4 }) {
  return (
    <div className="skeleton-table-row" aria-hidden="true">
      {Array(columns).fill(0).map((_, i) => (
        <Skeleton key={i} height="1rem" width={i === 0 ? '30%' : '80%'} />
      ))}
    </div>
  );
}

/**
 * Skeleton table - Multiple rows
 */
export function SkeletonTable({ rows = 5, columns = 4 }) {
  return (
    <div className="skeleton-table" aria-label="Lade Tabelle..." role="status">
      {/* Header */}
      <div className="skeleton-table-header">
        {Array(columns).fill(0).map((_, i) => (
          <Skeleton key={i} height="1rem" width="60%" />
        ))}
      </div>
      {/* Rows */}
      {Array(rows).fill(0).map((_, i) => (
        <SkeletonTableRow key={i} columns={columns} />
      ))}
    </div>
  );
}

/**
 * Skeleton stat card - Dashboard stat cards
 */
export function SkeletonStatCard() {
  return (
    <div className="skeleton-stat-card" aria-hidden="true">
      <SkeletonAvatar size="48px" />
      <div className="skeleton-stat-content">
        <Skeleton height="0.75rem" width="60%" />
        <Skeleton height="1.5rem" width="40%" style={{ marginTop: '0.5rem' }} />
        <Skeleton height="0.625rem" width="30%" style={{ marginTop: '0.5rem' }} />
      </div>
    </div>
  );
}

/**
 * Skeleton chat message
 */
export function SkeletonChatMessage({ isUser = false }) {
  return (
    <div className={`skeleton-chat-message ${isUser ? 'user' : 'assistant'}`} aria-hidden="true">
      {!isUser && <SkeletonAvatar size="32px" />}
      <div className="skeleton-message-content">
        <SkeletonText lines={isUser ? 1 : 3} width={isUser ? '60%' : '80%'} />
      </div>
      {isUser && <SkeletonAvatar size="32px" />}
    </div>
  );
}

/**
 * Skeleton chat - Multiple messages
 */
export function SkeletonChat({ messageCount = 4 }) {
  return (
    <div className="skeleton-chat" aria-label="Lade Chat..." role="status">
      {Array(messageCount).fill(0).map((_, i) => (
        <SkeletonChatMessage key={i} isUser={i % 2 === 0} />
      ))}
    </div>
  );
}

/**
 * Skeleton document list item
 */
export function SkeletonDocumentItem() {
  return (
    <div className="skeleton-document-item" aria-hidden="true">
      <Skeleton width="24px" height="24px" borderRadius="4px" />
      <div className="skeleton-document-info">
        <Skeleton height="1rem" width="70%" />
        <Skeleton height="0.75rem" width="40%" style={{ marginTop: '0.25rem' }} />
      </div>
      <Skeleton width="60px" height="1.5rem" borderRadius="4px" />
    </div>
  );
}

/**
 * Skeleton document list
 */
export function SkeletonDocumentList({ count = 5 }) {
  return (
    <div className="skeleton-document-list" aria-label="Lade Dokumente..." role="status">
      {Array(count).fill(0).map((_, i) => (
        <SkeletonDocumentItem key={i} />
      ))}
    </div>
  );
}

/**
 * Dashboard skeleton - Full dashboard loading state
 */
export function SkeletonDashboard() {
  return (
    <div className="skeleton-dashboard" aria-label="Lade Dashboard..." role="status">
      {/* Stats row */}
      <div className="skeleton-stats-row">
        {Array(4).fill(0).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
      {/* Chart placeholder */}
      <div className="skeleton-chart">
        <Skeleton height="280px" borderRadius="12px" />
      </div>
      {/* Cards grid */}
      <div className="skeleton-cards-grid">
        <SkeletonCard lines={4} hasAvatar={false} />
        <SkeletonCard lines={4} hasAvatar={false} />
      </div>
    </div>
  );
}

export default Skeleton;
