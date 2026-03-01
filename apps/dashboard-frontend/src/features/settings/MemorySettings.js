/**
 * MemorySettings - KI-Gedächtnis Settings Page
 *
 * Shows: AI profile editor, memory list with search, edit/delete, stats.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  FiSearch,
  FiTrash2,
  FiEdit3,
  FiCheck,
  FiX,
  FiRefreshCw,
  FiDownload,
  FiLoader,
  FiChevronLeft,
  FiAlertCircle,
  FiActivity,
} from 'react-icons/fi';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import useConfirm from '../../hooks/useConfirm';
import './MemorySettings.css';

const TYPE_LABELS = {
  fact: 'Fakt',
  decision: 'Entscheidung',
  preference: 'Präferenz',
};

const TYPE_COLORS = {
  fact: 'var(--primary-color)',
  decision: 'var(--warning-color)',
  preference: 'var(--success-color)',
};

function MemorySettings({ onBack }) {
  const api = useApi();
  const { addToast } = useToast();
  const confirm = useConfirm();

  // Profile state
  const [profile, setProfile] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileDraft, setProfileDraft] = useState('');

  // Memories state
  const [memories, setMemories] = useState([]);
  const [memoriesTotal, setMemoriesTotal] = useState(0);
  const [memoriesLoading, setMemoriesLoading] = useState(true);
  const [memoriesOffset, setMemoriesOffset] = useState(0);
  const [filterType, setFilterType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');

  // Stats state
  const [stats, setStats] = useState(null);

  // Context stats state
  const [contextStats, setContextStats] = useState(null);

  // Action loading
  const [actionLoading, setActionLoading] = useState(false);

  const LIMIT = 20;

  // Load profile
  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const data = await api.get('/memory/profile', { showError: false });
      setProfile(data.profile || '');
    } catch {
      // No profile yet
    } finally {
      setProfileLoading(false);
    }
  }, [api]);

  // Load memories
  const loadMemories = useCallback(async () => {
    setMemoriesLoading(true);
    try {
      const params = new URLSearchParams({ limit: LIMIT, offset: memoriesOffset });
      if (filterType) params.set('type', filterType);

      const data = await api.get(`/memory/list?${params}`, { showError: false });
      setMemories(data.memories || []);
      setMemoriesTotal(data.total || 0);
    } catch {
      setMemories([]);
    } finally {
      setMemoriesLoading(false);
    }
  }, [memoriesOffset, filterType, api]);

  // Load stats
  const loadStats = useCallback(async () => {
    try {
      setStats(await api.get('/memory/stats', { showError: false }));
    } catch {
      // Non-critical
    }
  }, [api]);

  // Load context management stats
  const loadContextStats = useCallback(async () => {
    try {
      setContextStats(await api.get('/memory/context-stats', { showError: false }));
    } catch {
      // Non-critical
    }
  }, [api]);

  useEffect(() => {
    loadProfile();
    loadMemories();
    loadStats();
    loadContextStats();
  }, [loadProfile, loadMemories, loadStats, loadContextStats]);

  // Save profile
  const handleSaveProfile = async () => {
    try {
      await api.put('/memory/profile', { profile: profileDraft }, { showError: false });
      setProfile(profileDraft);
      setProfileEditing(false);
      addToast('Profil gespeichert', 'success');
      loadStats();
    } catch (err) {
      addToast(err.message || 'Speichern fehlgeschlagen', 'error');
    }
  };

  // Search memories
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    try {
      const data = await api.get(`/memory/search?q=${encodeURIComponent(searchQuery)}&limit=10`, {
        showError: false,
      });
      setSearchResults(data.memories || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  // Delete memory
  const handleDelete = async id => {
    const ok = await confirm(
      'Erinnerung löschen',
      'Möchten Sie diese Erinnerung wirklich löschen?'
    );
    if (!ok) return;

    try {
      await api.del(`/memory/${id}`, { showError: false });
      addToast('Erinnerung gelöscht', 'success');
      loadMemories();
      loadStats();
    } catch {
      addToast('Löschen fehlgeschlagen', 'error');
    }
  };

  // Save edit
  const handleSaveEdit = async id => {
    try {
      await api.put(`/memory/${id}`, { content: editContent }, { showError: false });
      setEditingId(null);
      addToast('Erinnerung aktualisiert', 'success');
      loadMemories();
    } catch {
      addToast('Speichern fehlgeschlagen', 'error');
    }
  };

  // Delete all
  const handleDeleteAll = async () => {
    const ok = await confirm(
      'Alle Erinnerungen löschen',
      'Dies löscht ALLE gespeicherten Erinnerungen unwiderruflich. Fortfahren?'
    );
    if (!ok) return;

    setActionLoading(true);
    try {
      await api.request('/memory/all', {
        method: 'DELETE',
        body: { confirm: true },
        showError: false,
      });
      addToast('Alle Erinnerungen gelöscht', 'success');
      loadMemories();
      loadStats();
    } catch {
      addToast('Löschen fehlgeschlagen', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Reindex
  const handleReindex = async () => {
    setActionLoading(true);
    try {
      const data = await api.post('/memory/reindex', null, { showError: false });
      addToast(`${data.indexed} Erinnerungen neu indiziert`, 'success');
    } catch {
      addToast('Neuindizierung fehlgeschlagen', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Export
  const handleExport = async () => {
    try {
      const data = await api.post('/memory/export', null, { showError: false });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `arasul-memories-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast('Export heruntergeladen', 'success');
    } catch {
      addToast('Export fehlgeschlagen', 'error');
    }
  };

  const displayedMemories = searchResults !== null ? searchResults : memories;

  return (
    <div className="memory-settings">
      {/* Header */}
      <div className="memory-header">
        <div className="memory-header-left">
          {onBack && (
            <button type="button" className="btn btn-ghost" onClick={onBack}>
              <FiChevronLeft /> Zurück
            </button>
          )}
          <h1>KI-Gedächtnis</h1>
        </div>
        <div className="memory-header-right">
          <div className="memory-search-bar">
            <FiSearch className="search-icon" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Semantische Suche..."
              className="memory-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear"
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults(null);
                }}
              >
                <FiX />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Profile Section */}
      <section className="memory-section">
        <h2>Unternehmensprofil</h2>
        {profileLoading ? (
          <div className="memory-loading">
            <FiLoader className="spin" />
          </div>
        ) : profileEditing ? (
          <div className="profile-editor">
            <textarea
              value={profileDraft}
              onChange={e => setProfileDraft(e.target.value)}
              className="profile-textarea"
              rows={8}
              placeholder="YAML-Profil eingeben..."
            />
            <div className="profile-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveProfile}>
                <FiCheck /> Speichern
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setProfileEditing(false)}
              >
                Abbrechen
              </button>
            </div>
          </div>
        ) : profile ? (
          <div className="profile-display">
            <pre className="profile-yaml">{profile}</pre>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setProfileDraft(profile);
                setProfileEditing(true);
              }}
            >
              <FiEdit3 /> Bearbeiten
            </button>
          </div>
        ) : (
          <div className="memory-empty">
            <p>Noch kein Profil erstellt. Es wird beim Setup-Wizard oder automatisch angelegt.</p>
          </div>
        )}
      </section>

      {/* Memories Section */}
      <section className="memory-section">
        <div className="section-header">
          <h2>Gespeicherte Erinnerungen ({memoriesTotal})</h2>
          <div className="filter-tabs">
            <button
              type="button"
              className={`filter-tab ${filterType === '' ? 'active' : ''}`}
              onClick={() => {
                setFilterType('');
                setMemoriesOffset(0);
              }}
            >
              Alle
            </button>
            {Object.entries(TYPE_LABELS).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`filter-tab ${filterType === key ? 'active' : ''}`}
                onClick={() => {
                  setFilterType(key);
                  setMemoriesOffset(0);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {memoriesLoading ? (
          <div className="memory-loading">
            <FiLoader className="spin" />
          </div>
        ) : displayedMemories.length > 0 ? (
          <>
            <div className="memory-list">
              {displayedMemories.map(mem => (
                <div key={mem.id || mem.content} className="memory-item">
                  <div className="memory-item-header">
                    <span
                      className="memory-type-badge"
                      style={{ borderColor: TYPE_COLORS[mem.type] || 'var(--text-muted)' }}
                    >
                      {TYPE_LABELS[mem.type] || mem.type}
                    </span>
                    <span className="memory-date">
                      {mem.created_at ? new Date(mem.created_at).toLocaleDateString('de-DE') : ''}
                    </span>
                    {mem.score != null && (
                      <span className="memory-score">{Math.round(mem.score * 100)}%</span>
                    )}
                  </div>

                  {editingId === mem.id ? (
                    <div className="memory-edit">
                      <textarea
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        className="memory-edit-textarea"
                        rows={3}
                      />
                      <div className="memory-edit-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => handleSaveEdit(mem.id)}
                        >
                          <FiCheck />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setEditingId(null)}
                        >
                          <FiX />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="memory-content">{mem.content}</p>
                  )}

                  {editingId !== mem.id && mem.id && (
                    <div className="memory-item-actions">
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={() => {
                          setEditingId(mem.id);
                          setEditContent(mem.content);
                        }}
                        title="Bearbeiten"
                      >
                        <FiEdit3 />
                      </button>
                      <button
                        type="button"
                        className="btn-icon danger"
                        onClick={() => handleDelete(mem.id)}
                        title="Löschen"
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {searchResults === null && memoriesTotal > LIMIT && (
              <div className="memory-pagination">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={memoriesOffset === 0}
                  onClick={() => setMemoriesOffset(prev => Math.max(0, prev - LIMIT))}
                >
                  Zurück
                </button>
                <span className="pagination-info">
                  {memoriesOffset + 1}–{Math.min(memoriesOffset + LIMIT, memoriesTotal)} von{' '}
                  {memoriesTotal}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={memoriesOffset + LIMIT >= memoriesTotal}
                  onClick={() => setMemoriesOffset(prev => prev + LIMIT)}
                >
                  Weiter
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="memory-empty">
            <p>
              {searchResults !== null
                ? 'Keine passenden Erinnerungen gefunden.'
                : 'Noch keine Erinnerungen gespeichert. Sie werden automatisch aus Gesprächen extrahiert.'}
            </p>
          </div>
        )}
      </section>

      {/* Stats Section */}
      {stats && (
        <section className="memory-section">
          <h2>Statistiken</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-value">{stats.total}</span>
              <span className="stat-label">Gesamt</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.facts}</span>
              <span className="stat-label">Fakten</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.decisions}</span>
              <span className="stat-label">Entscheidungen</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.preferences}</span>
              <span className="stat-label">Präferenzen</span>
            </div>
          </div>

          {stats.lastUpdated && (
            <p className="stats-last-update">
              Letztes Update: {new Date(stats.lastUpdated).toLocaleString('de-DE')}
            </p>
          )}

          <div className="stats-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleExport}
              disabled={actionLoading}
            >
              <FiDownload /> Exportieren
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleReindex}
              disabled={actionLoading}
            >
              <FiRefreshCw className={actionLoading ? 'spin' : ''} /> Neu indizieren
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm danger-text"
              onClick={handleDeleteAll}
              disabled={actionLoading || stats.total === 0}
            >
              <FiTrash2 /> Alle löschen
            </button>
          </div>
        </section>
      )}
      {/* Context Management Section */}
      {contextStats && (
        <section className="memory-section">
          <h2>
            <FiActivity style={{ marginRight: '0.4rem', verticalAlign: '-2px' }} />
            Kontext-Management
          </h2>

          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-value">{contextStats.compaction.total}</span>
              <span className="stat-label">Kompaktierungen</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{contextStats.compaction.avgCompression}%</span>
              <span className="stat-label">Ø Kompression</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{contextStats.compaction.totalMemoriesExtracted}</span>
              <span className="stat-label">Extrahiert</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{contextStats.tokens.totalJobs}</span>
              <span className="stat-label">LLM-Jobs</span>
            </div>
          </div>

          {contextStats.tokens.totalJobs > 0 && (
            <div className="context-stats-details">
              <div className="context-stats-row">
                <span className="context-stats-label">Ø Prompt-Tokens</span>
                <span className="context-stats-value">
                  {contextStats.tokens.avgPromptTokens.toLocaleString('de-DE')}
                </span>
              </div>
              <div className="context-stats-row">
                <span className="context-stats-label">Ø Antwort-Tokens</span>
                <span className="context-stats-value">
                  {contextStats.tokens.avgCompletionTokens.toLocaleString('de-DE')}
                </span>
              </div>
              <div className="context-stats-row">
                <span className="context-stats-label">Ø Context-Window</span>
                <span className="context-stats-value">
                  {contextStats.tokens.avgContextWindow.toLocaleString('de-DE')}
                </span>
              </div>
              {contextStats.compaction.total > 0 && (
                <>
                  <div className="context-stats-row">
                    <span className="context-stats-label">Ø Tokens vor Kompaktierung</span>
                    <span className="context-stats-value">
                      {contextStats.compaction.avgTokensBefore.toLocaleString('de-DE')}
                    </span>
                  </div>
                  <div className="context-stats-row">
                    <span className="context-stats-label">Ø Tokens nach Kompaktierung</span>
                    <span className="context-stats-value">
                      {contextStats.compaction.avgTokensAfter.toLocaleString('de-DE')}
                    </span>
                  </div>
                  <div className="context-stats-row">
                    <span className="context-stats-label">Ø Kompaktierungsdauer</span>
                    <span className="context-stats-value">
                      {(contextStats.compaction.avgDurationMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {contextStats.recentCompactions.length > 0 && (
            <div className="context-recent">
              <h3>Letzte Kompaktierungen</h3>
              <div className="context-recent-list">
                {contextStats.recentCompactions.map((entry, i) => (
                  <div key={i} className="context-recent-item">
                    <div className="context-recent-header">
                      <span className="context-recent-title">
                        {entry.conversation_title || `Chat #${entry.conversation_id}`}
                      </span>
                      <span className="context-recent-date">
                        {new Date(entry.created_at).toLocaleString('de-DE')}
                      </span>
                    </div>
                    <div className="context-recent-meta">
                      <span>{entry.messages_compacted} Nachr.</span>
                      <span>
                        {entry.tokens_before} → {entry.tokens_after} Tok.
                      </span>
                      <span>{entry.compression_ratio}%</span>
                      {entry.memories_extracted > 0 && (
                        <span className="context-recent-memories">
                          +{entry.memories_extracted} Erinnerungen
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="stats-last-update">Zeitraum: {contextStats.period}</p>
        </section>
      )}
    </div>
  );
}

export default MemorySettings;
