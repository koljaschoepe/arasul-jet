/**
 * DatabaseOverview - Main view showing all user-created tables
 * Part of the Datentabellen feature
 */

import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  FiPlus,
  FiSearch,
  FiGrid,
  FiList,
  FiDatabase,
  FiFileText,
  FiRefreshCw,
} from 'react-icons/fi';
import { API_BASE } from '../../config/api';
import { SkeletonCard } from '../Skeleton';
import Modal from '../Modal';
import './Database.css';

/**
 * CreateTableModal - Modal for creating a new table
 */
const CreateTableModal = memo(function CreateTableModal({ isOpen, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('📦');
  const [color, setColor] = useState('#45ADFF');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const icons = ['📦', '📊', '📋', '📝', '💼', '🛒', '👥', '🏢', '📁', '🔧', '💰', '📅'];
  const colors = [
    '#45ADFF',
    '#22C55E',
    '#F59E0B',
    '#EF4444',
    '#8B5CF6',
    '#06B6D4',
    '#EC4899',
    '#14B8A6',
  ];

  const handleSubmit = async e => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      await axios.post(`${API_BASE}/v1/datentabellen/tables`, {
        name: name.trim(),
        description: description.trim() || null,
        icon,
        color,
      });

      setName('');
      setDescription('');
      setIcon('📦');
      setColor('#45ADFF');
      onCreated();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Erstellen der Tabelle');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setError(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Neue Tabelle erstellen">
      <form onSubmit={handleSubmit} className="dt-create-form">
        {error && <div className="dt-error-message">{error}</div>}

        <div className="dt-form-group">
          <label htmlFor="table-name">Name *</label>
          <input
            id="table-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="z.B. Produkte, Kunden, Aufträge"
            autoFocus
            required
          />
        </div>

        <div className="dt-form-group">
          <label htmlFor="table-description">Beschreibung</label>
          <textarea
            id="table-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Kurze Beschreibung der Tabelle..."
            rows={2}
          />
        </div>

        <div className="dt-form-row">
          <div className="dt-form-group">
            <label>Icon</label>
            <div className="dt-icon-picker">
              {icons.map(i => (
                <button
                  key={i}
                  type="button"
                  className={`dt-icon-option ${icon === i ? 'selected' : ''}`}
                  onClick={() => setIcon(i)}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          <div className="dt-form-group">
            <label>Farbe</label>
            <div className="dt-color-picker">
              {colors.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`dt-color-option ${color === c ? 'selected' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="dt-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={handleClose}>
            Abbrechen
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading || !name.trim()}>
            {loading ? 'Erstelle...' : 'Tabelle erstellen'}
          </button>
        </div>
      </form>
    </Modal>
  );
});

/**
 * TableCard - Individual table card in grid view
 */
const TableCard = memo(function TableCard({ table }) {
  const formatDate = dateStr => {
    if (!dateStr) return 'Nie';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Gerade eben';
    if (diff < 3600000) return `vor ${Math.floor(diff / 60000)} Min.`;
    if (diff < 86400000) return `vor ${Math.floor(diff / 3600000)} Std.`;
    if (diff < 604800000) return `vor ${Math.floor(diff / 86400000)} Tagen`;

    return date.toLocaleDateString('de-DE');
  };

  return (
    <Link to={`/database/${table.slug}`} className="dt-table-card">
      <div className="dt-table-card-icon" style={{ color: table.color }}>
        {table.icon}
      </div>
      <div className="dt-table-card-content">
        <h3 className="dt-table-card-name">{table.name}</h3>
        {table.description && <p className="dt-table-card-description">{table.description}</p>}
        <div className="dt-table-card-stats">
          <span className="dt-table-card-stat">
            <FiFileText /> {table.row_count || 0} Einträge
          </span>
          <span className="dt-table-card-stat">
            <FiGrid /> {table.field_count || 0} Felder
          </span>
        </div>
        <div className="dt-table-card-meta">Aktualisiert: {formatDate(table.updated_at)}</div>
      </div>
    </Link>
  );
});

/**
 * DatabaseOverview - Main component
 */
const DatabaseOverview = memo(function DatabaseOverview() {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'

  // AbortController ref for cancelling requests
  const fetchAbortRef = useRef(null);

  const fetchTables = useCallback(async () => {
    // Abort previous request if still pending
    if (fetchAbortRef.current) {
      fetchAbortRef.current.abort();
    }
    fetchAbortRef.current = new AbortController();

    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/v1/datentabellen/tables`, {
        signal: fetchAbortRef.current.signal,
      });
      setTables(response.data.data || []);
      setError(null);
    } catch (err) {
      // Ignore abort errors
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
        return;
      }
      console.error('[Database] Fetch error:', err);
      setError(err.response?.data?.error || 'Fehler beim Laden der Tabellen');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTables();

    // Cleanup: abort request on unmount
    return () => {
      if (fetchAbortRef.current) {
        fetchAbortRef.current.abort();
      }
    };
  }, [fetchTables]);

  const filteredTables = tables.filter(
    t =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleCreateTable = useCallback(() => {
    setShowCreateModal(true);
  }, []);

  if (loading) {
    return (
      <div className="dt-container">
        <div className="dt-table-grid" role="status" aria-label="Lade Tabellen...">
          {Array(4)
            .fill(0)
            .map((_, i) => (
              <SkeletonCard key={i} hasAvatar={false} lines={2} />
            ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dt-container">
        <div className="dt-error">
          <h3>Fehler beim Laden</h3>
          <p>{error}</p>
          <button onClick={fetchTables} className="btn-primary">
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dt-container">
      <div className="dt-header">
        <div className="dt-header-left">
          <FiDatabase className="dt-header-icon" />
          <div>
            <h1 className="dt-title">Datenbank</h1>
            <p className="dt-subtitle">{tables.length} Tabellen</p>
          </div>
        </div>
        <div className="dt-header-actions">
          <button className="btn-primary" onClick={handleCreateTable}>
            <FiPlus /> Neue Tabelle
          </button>
        </div>
      </div>

      <div className="dt-toolbar">
        <div className="dt-search">
          <FiSearch className="dt-search-icon" />
          <input
            type="text"
            placeholder="Tabellen durchsuchen..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="dt-search-input"
          />
        </div>
        <div className="dt-view-toggle">
          <button
            className={`dt-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Kachelansicht"
          >
            <FiGrid />
          </button>
          <button
            className={`dt-view-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
            title="Listenansicht"
          >
            <FiList />
          </button>
        </div>
      </div>

      {filteredTables.length === 0 ? (
        <div className="dt-empty">
          {searchQuery ? (
            <>
              <FiSearch className="dt-empty-icon" />
              <h3>Keine Tabellen gefunden</h3>
              <p>Keine Tabellen entsprechen "{searchQuery}"</p>
            </>
          ) : (
            <>
              <FiDatabase className="dt-empty-icon" />
              <h3>Noch keine Tabellen</h3>
              <p>Erstellen Sie Ihre erste Tabelle, um Daten zu verwalten.</p>
              <button className="btn-primary" onClick={handleCreateTable}>
                <FiPlus /> Erste Tabelle erstellen
              </button>
            </>
          )}
        </div>
      ) : (
        <div className={`dt-grid ${viewMode === 'list' ? 'dt-grid-list' : ''}`}>
          {filteredTables.map(table => (
            <TableCard key={table.id} table={table} />
          ))}
        </div>
      )}

      <CreateTableModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={fetchTables}
      />
    </div>
  );
});

export default DatabaseOverview;
