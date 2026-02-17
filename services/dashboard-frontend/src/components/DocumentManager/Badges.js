import React, { useState, useEffect, useRef } from 'react';
import {
  FiFolder,
  FiGrid,
  FiCheck,
  FiClock,
  FiRefreshCw,
  FiAlertCircle,
  FiChevronDown,
} from 'react-icons/fi';

// Table badge component for data tables
export const TableBadge = () => (
  <span className="type-badge type-table">
    <FiGrid aria-hidden="true" />
    Tabelle
  </span>
);

// Status badge component
export const StatusBadge = ({ status }) => {
  const statusConfig = {
    pending: { icon: FiClock, color: 'var(--warning-color)', label: 'Wartend' },
    processing: { icon: FiRefreshCw, color: 'var(--primary-color)', label: 'Verarbeitung' },
    indexed: { icon: FiCheck, color: 'var(--text-muted)', label: 'Indexiert' },
    failed: { icon: FiAlertCircle, color: 'var(--danger-color)', label: 'Fehlgeschlagen' },
  };

  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <span
      className={`status-badge status-${status}`}
      style={{ '--status-color': config.color }}
      role="status"
      aria-label={`Status: ${config.label}`}
    >
      <Icon className={status === 'processing' ? 'spin' : ''} aria-hidden="true" />
      {config.label}
    </span>
  );
};

// Category badge component
export const CategoryBadge = ({ name, color }) => (
  <span className="category-badge" style={{ '--cat-color': color || 'var(--text-muted)' }}>
    <FiFolder aria-hidden="true" />
    {name || 'Unkategorisiert'}
  </span>
);

// Space badge component (RAG 2.0) - interactive when docId+onMove provided
export const SpaceBadge = ({ name, color, docId, spaces, onMove }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Static badge (no move capability)
  if (!docId || !onMove) {
    return (
      <span className="space-badge" style={{ '--space-color': color || 'var(--primary-color)' }}>
        <FiFolder aria-hidden="true" />
        {name || 'Allgemein'}
      </span>
    );
  }

  return (
    <span className="space-badge-interactive" ref={ref}>
      <button
        className="space-badge space-badge-btn"
        style={{ '--space-color': color || 'var(--primary-color)' }}
        onClick={e => {
          e.stopPropagation();
          setOpen(!open);
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        title="Bereich ändern"
      >
        <FiFolder aria-hidden="true" />
        {name || 'Kein Bereich'}
        <FiChevronDown className={`space-badge-arrow ${open ? 'open' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="space-badge-dropdown" role="listbox" aria-label="Bereich wählen">
          <button
            className={`space-dropdown-item ${!name ? 'active' : ''}`}
            onClick={e => {
              e.stopPropagation();
              onMove(docId, null, null);
              setOpen(false);
            }}
            role="option"
            aria-selected={!name}
          >
            <span className="space-dot" style={{ background: 'var(--text-muted)' }} />
            Kein Bereich
            {!name && <FiCheck className="space-check" aria-hidden="true" />}
          </button>
          {(spaces || []).map(s => (
            <button
              key={s.id}
              className={`space-dropdown-item ${s.name === name ? 'active' : ''}`}
              onClick={e => {
                e.stopPropagation();
                onMove(docId, s.id, s.name);
                setOpen(false);
              }}
              role="option"
              aria-selected={s.name === name}
            >
              <span
                className="space-dot"
                style={{ background: s.color || 'var(--primary-color)' }}
              />
              {s.name}
              {s.name === name && <FiCheck className="space-check" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </span>
  );
};
