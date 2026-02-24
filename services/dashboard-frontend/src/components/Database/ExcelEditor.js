/**
 * ExcelEditor - Fullscreen Excel-like editor for Datentabellen (PostgreSQL)
 * Features: Inline column creation, ghost row, keyboard navigation, clipboard
 */

import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import {
  FiX,
  FiPlus,
  FiTrash2,
  FiDownload,
  FiRefreshCw,
  FiCheck,
  FiAlertCircle,
  FiChevronUp,
  FiChevronDown,
  FiMoreVertical,
  FiEdit2,
  FiType,
  FiCopy,
  FiClipboard,
  FiScissors,
  FiCornerUpLeft,
  FiCornerUpRight,
  FiChevronsLeft,
  FiChevronsRight,
  FiChevronLeft,
  FiChevronRight,
  FiArrowLeft,
  FiMessageSquare,
  FiSend,
  FiCode,
  FiFilter,
} from 'react-icons/fi';
import { API_BASE, getAuthHeaders } from '../../config/api';
import { useToast } from '../../contexts/ToastContext';
import useConfirm from '../../hooks/useConfirm';
import './Database.css';

// Maximum undo history size
const MAX_UNDO_HISTORY = 50;

// Page size options
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

// Field types configuration
const FIELD_TYPES = [
  { value: 'text', label: 'Text', icon: 'T' },
  { value: 'textarea', label: 'Mehrzeilig', icon: 'Tt' },
  { value: 'number', label: 'Zahl', icon: '#' },
  { value: 'currency', label: 'Währung', icon: '€' },
  { value: 'date', label: 'Datum', icon: '📅' },
  { value: 'datetime', label: 'Datum & Zeit', icon: '🕐' },
  { value: 'select', label: 'Auswahl', icon: '▼' },
  { value: 'checkbox', label: 'Checkbox', icon: '☑' },
  { value: 'email', label: 'E-Mail', icon: '@' },
  { value: 'url', label: 'URL', icon: '🔗' },
  { value: 'phone', label: 'Telefon', icon: '📞' },
];

/**
 * InlineColumnCreator - Create columns directly in the header
 */
const InlineColumnCreator = memo(function InlineColumnCreator({
  tableSlug,
  onColumnAdded,
  existingSlugs,
}) {
  const [mode, setMode] = useState('button'); // 'button' | 'name' | 'type'
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const typeRef = useRef(null);

  // Focus input when switching to name mode
  useEffect(() => {
    if (mode === 'name' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [mode]);

  // Focus type dropdown when switching to type mode
  useEffect(() => {
    if (mode === 'type' && typeRef.current) {
      typeRef.current.focus();
    }
  }, [mode]);

  const handleNameSubmit = e => {
    e?.preventDefault();
    if (!name.trim()) {
      setMode('button');
      setName('');
      return;
    }
    setMode('type');
  };

  const handleTypeSelect = async type => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/v1/datentabellen/tables/${tableSlug}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          name: name.trim(),
          field_type: type,
          is_required: false,
          is_unique: false,
        }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Fehler');
      }
      onColumnAdded();
      setName('');
      setMode('button');
    } catch (err) {
      setError(err.message);
      setMode('name');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setMode('button');
    setName('');
    setError(null);
  };

  const handleKeyDown = e => {
    if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'Enter' && mode === 'name') {
      handleNameSubmit();
    }
  };

  if (mode === 'button') {
    return (
      <th className="excel-th excel-th-add">
        <button
          type="button"
          className="excel-add-column-btn"
          onClick={() => setMode('name')}
          title="Neue Spalte hinzufügen"
        >
          <FiPlus />
        </button>
      </th>
    );
  }

  if (mode === 'name') {
    return (
      <th className="excel-th excel-th-add excel-th-input">
        <div className="excel-inline-input">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (!name.trim()) handleCancel();
            }}
            placeholder="Spaltenname..."
            className="excel-column-name-input"
          />
          {error && <span className="excel-inline-error">{error}</span>}
        </div>
      </th>
    );
  }

  if (mode === 'type') {
    return (
      <th className="excel-th excel-th-add excel-th-type">
        <div className="excel-type-selector">
          <span className="excel-type-label">{name}</span>
          <select
            ref={typeRef}
            onChange={e => handleTypeSelect(e.target.value)}
            onBlur={handleCancel}
            onKeyDown={e => {
              if (e.key === 'Escape') handleCancel();
            }}
            disabled={loading}
            className="excel-type-dropdown"
          >
            <option value="">Typ wählen...</option>
            {FIELD_TYPES.map(t => (
              <option key={t.value} value={t.value}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>
        </div>
      </th>
    );
  }

  return null;
});

/**
 * CellEditor - Inline editor for a single cell
 */
const CellEditor = memo(function CellEditor({ value, field, onSave, onCancel }) {
  const [editValue, setEditValue] = useState(value ?? '');
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select?.();
    }
  }, []);

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSave(editValue);
    } else if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      onSave(editValue, e.shiftKey ? 'prev' : 'next');
    }
  };

  const handleBlur = () => {
    onSave(editValue);
  };

  switch (field.field_type) {
    case 'textarea':
      return (
        <textarea
          ref={inputRef}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="excel-cell-editor"
          rows={3}
        />
      );
    case 'number':
    case 'currency':
      return (
        <input
          ref={inputRef}
          type="number"
          step={field.field_type === 'currency' ? '0.01' : 'any'}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="excel-cell-editor"
        />
      );
    case 'date':
      return (
        <input
          ref={inputRef}
          type="date"
          value={editValue ? editValue.split('T')[0] : ''}
          onChange={e => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="excel-cell-editor"
        />
      );
    case 'checkbox':
      return (
        <input
          ref={inputRef}
          type="checkbox"
          checked={editValue === true || editValue === 'true'}
          onChange={e => {
            setEditValue(e.target.checked);
            onSave(e.target.checked);
          }}
          className="excel-cell-editor-checkbox"
        />
      );
    case 'select':
      const options = field.options?.choices || [];
      return (
        <select
          ref={inputRef}
          value={editValue}
          onChange={e => {
            setEditValue(e.target.value);
            onSave(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="excel-cell-editor"
        >
          <option value="">-- Auswählen --</option>
          {options.map(opt => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    default:
      return (
        <input
          ref={inputRef}
          type={
            field.field_type === 'email' ? 'email' : field.field_type === 'url' ? 'url' : 'text'
          }
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="excel-cell-editor"
        />
      );
  }
});

/**
 * ColumnMenu - Dropdown menu for column actions
 */
const ColumnMenu = memo(function ColumnMenu({
  field,
  tableSlug,
  onClose,
  onFieldUpdated,
  position,
}) {
  const { confirm: showConfirm, ConfirmDialog: ColumnConfirmDialog } = useConfirm();
  const [mode, setMode] = useState('menu');
  const [newName, setNewName] = useState(field.name);
  const [newType, setNewType] = useState(field.field_type);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (mode === 'rename' && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [mode]);

  useEffect(() => {
    const handleClickOutside = e => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleRename = async () => {
    if (!newName.trim() || newName === field.name) {
      onClose();
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE}/v1/datentabellen/tables/${tableSlug}/fields/${field.slug}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ name: newName.trim() }),
        }
      );
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Fehler');
      }
      onFieldUpdated();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTypeChange = async () => {
    if (newType === field.field_type) {
      onClose();
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE}/v1/datentabellen/tables/${tableSlug}/fields/${field.slug}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ field_type: newType }),
        }
      );
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Fehler');
      }
      onFieldUpdated();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!(await showConfirm({ message: `Spalte "${field.name}" wirklich löschen?` }))) return;

    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE}/v1/datentabellen/tables/${tableSlug}/fields/${field.slug}`,
        {
          method: 'DELETE',
          headers: getAuthHeaders(),
        }
      );
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Fehler');
      }
      onFieldUpdated();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="excel-column-menu"
      ref={menuRef}
      style={{ top: position.top, left: position.left }}
    >
      {error && <div className="excel-menu-error">{error}</div>}

      {mode === 'menu' && (
        <>
          <button type="button" className="excel-menu-item" onClick={() => setMode('rename')}>
            <FiEdit2 /> Umbenennen
          </button>
          <button type="button" className="excel-menu-item" onClick={() => setMode('type')}>
            <FiType /> Typ ändern
          </button>
          <div className="excel-menu-divider" />
          <button
            type="button"
            className="excel-menu-item excel-menu-danger"
            onClick={handleDelete}
          >
            <FiTrash2 /> Löschen
          </button>
        </>
      )}

      {mode === 'rename' && (
        <div className="excel-menu-form">
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRename()}
            placeholder="Neuer Name"
          />
          <div className="excel-menu-actions">
            <button type="button" onClick={() => setMode('menu')}>
              Zurück
            </button>
            <button type="button" className="primary" onClick={handleRename} disabled={loading}>
              {loading ? '...' : 'Speichern'}
            </button>
          </div>
        </div>
      )}

      {mode === 'type' && (
        <div className="excel-menu-form">
          <select value={newType} onChange={e => setNewType(e.target.value)}>
            {FIELD_TYPES.map(t => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <div className="excel-menu-actions">
            <button type="button" onClick={() => setMode('menu')}>
              Zurück
            </button>
            <button type="button" className="primary" onClick={handleTypeChange} disabled={loading}>
              {loading ? '...' : 'Ändern'}
            </button>
          </div>
        </div>
      )}
      <ColumnConfirmDialog />
    </div>
  );
});

/**
 * CellContextMenu - Right-click context menu
 */
const CellContextMenu = memo(function CellContextMenu({
  position,
  onClose,
  onCopy,
  onPaste,
  onCut,
  onDelete,
  hasClipboard,
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = e => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    const handleEscape = e => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div className="excel-context-menu" ref={menuRef} style={{ top: position.y, left: position.x }}>
      <button type="button" onClick={onCopy}>
        <FiCopy /> Kopieren <span>Strg+C</span>
      </button>
      <button type="button" onClick={onCut}>
        <FiScissors /> Ausschneiden <span>Strg+X</span>
      </button>
      <button type="button" onClick={onPaste} disabled={!hasClipboard}>
        <FiClipboard /> Einfügen <span>Strg+V</span>
      </button>
      <div className="excel-menu-divider" />
      <button type="button" onClick={onDelete}>
        <FiTrash2 /> Löschen <span>Entf</span>
      </button>
    </div>
  );
});

/**
 * AIQueryPanel - Natural language query interface
 */
const AIQueryPanel = memo(function AIQueryPanel({ tableSlug, onResultsApplied, onClose }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = async e => {
    e?.preventDefault();
    if (!query.trim() || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`${API_BASE}/v1/datentabellen/query/natural`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ query: query.trim(), tableSlug }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Abfrage fehlgeschlagen');
      }
      const data = await response.json();

      setResult(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleApplyResults = () => {
    if (result?.results) {
      onResultsApplied(result.results);
      onClose();
    }
  };

  return (
    <div className="excel-ai-panel">
      <div className="excel-ai-header">
        <div className="excel-ai-title">
          <FiMessageSquare /> KI-Abfrage
        </div>
        <button type="button" className="excel-ai-close" onClick={onClose}>
          <FiX />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="excel-ai-form">
        <div className="excel-ai-input-row">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="z.B. 'Zeige alle Produkte über 100€ sortiert nach Preis'"
            className="excel-ai-input"
            disabled={loading}
          />
          <button type="submit" className="excel-ai-submit" disabled={loading || !query.trim()}>
            {loading ? <FiRefreshCw className="spin" /> : <FiSend />}
          </button>
        </div>
      </form>

      {error && (
        <div className="excel-ai-error">
          <FiAlertCircle /> {error}
        </div>
      )}

      {result && (
        <div className="excel-ai-result">
          <div className="excel-ai-explanation">
            <strong>Erklärung:</strong> {result.explanation}
          </div>

          <div className="excel-ai-sql">
            <div className="excel-ai-sql-header">
              <FiCode /> Generiertes SQL
            </div>
            <pre>{result.sql}</pre>
          </div>

          <div className="excel-ai-stats">
            <span>
              {result.rowCount} Ergebnis{result.rowCount !== 1 ? 'se' : ''}
            </span>
            {result.rowCount > 0 && (
              <button type="button" className="excel-ai-apply" onClick={handleApplyResults}>
                <FiFilter /> Als Filter anwenden
              </button>
            )}
          </div>

          {result.results && result.results.length > 0 && (
            <div className="excel-ai-preview">
              <table>
                <thead>
                  <tr>
                    {Object.keys(result.results[0])
                      .slice(0, 5)
                      .map(key => (
                        <th key={key}>{key}</th>
                      ))}
                    {Object.keys(result.results[0]).length > 5 && <th>...</th>}
                  </tr>
                </thead>
                <tbody>
                  {result.results.slice(0, 5).map((row, idx) => (
                    <tr key={idx}>
                      {Object.values(row)
                        .slice(0, 5)
                        .map((val, i) => (
                          <td key={i}>{String(val ?? '-').substring(0, 50)}</td>
                        ))}
                      {Object.keys(row).length > 5 && <td>...</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.results.length > 5 && (
                <div className="excel-ai-more">... und {result.results.length - 5} weitere</div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="excel-ai-hints">
        <strong>Beispielabfragen:</strong>
        <ul>
          <li onClick={() => setQuery('Zeige die 10 neuesten Einträge')}>
            Zeige die 10 neuesten Einträge
          </li>
          <li onClick={() => setQuery('Wie viele Einträge gibt es insgesamt?')}>
            Wie viele Einträge gibt es insgesamt?
          </li>
          <li onClick={() => setQuery('Sortiere nach dem Erstellungsdatum')}>
            Sortiere nach dem Erstellungsdatum
          </li>
        </ul>
      </div>
    </div>
  );
});

/**
 * ExcelEditor - Main fullscreen editor component
 */
function ExcelEditor({ tableSlug, tableName, onClose }) {
  const toast = useToast();
  const { confirm: showConfirm, ConfirmDialog } = useConfirm();
  // Table state
  const [table, setTable] = useState(null);
  const [fields, setFields] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  // AI Query panel
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [filteredResults, setFilteredResults] = useState(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  // Editing state
  const [editingCell, setEditingCell] = useState(null);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [activeCell, setActiveCell] = useState({ row: 0, col: 0 });

  // Sorting
  const [sortField, setSortField] = useState('_created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  // Column menu & context menu
  const [columnMenu, setColumnMenu] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);

  // Clipboard & Undo/Redo
  const [clipboard, setClipboard] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Column widths
  const [columnWidths, setColumnWidths] = useState({});
  const [resizingColumn, setResizingColumn] = useState(null);

  // Refs
  const tableRef = useRef(null);

  // Load table data
  const loadTable = useCallback(async () => {
    try {
      setLoading(true);
      const rowsParams = new URLSearchParams({
        page,
        limit: pageSize,
        sort: sortField,
        order: sortOrder,
      });
      const [tableData, rowsData] = await Promise.all([
        fetch(`${API_BASE}/v1/datentabellen/tables/${tableSlug}`, {
          headers: getAuthHeaders(),
        }).then(r => {
          if (!r.ok) throw new Error('Fehler beim Laden');
          return r.json();
        }),
        fetch(`${API_BASE}/v1/datentabellen/tables/${tableSlug}/rows?${rowsParams}`, {
          headers: getAuthHeaders(),
        }).then(r => {
          if (!r.ok) throw new Error('Fehler beim Laden');
          return r.json();
        }),
      ]);

      setTable(tableData.data);
      setFields(tableData.data.fields || []);
      setRows(rowsData.data || []);
      setTotalPages(rowsData.meta?.pages || 1);
      setTotalRows(rowsData.meta?.total || 0);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tableSlug, page, pageSize, sortField, sortOrder]);

  useEffect(() => {
    loadTable();
  }, [loadTable]);

  // Rows with ghost row for quick adding
  // If filteredResults is set, use those instead of the paginated rows
  const displayRows = useMemo(() => {
    const sourceRows = filteredResults || rows;
    const ghostRow = {
      _id: '__ghost__',
      _isGhost: true,
      ...fields.reduce((acc, f) => ({ ...acc, [f.slug]: '' }), {}),
    };
    // Only add ghost row when not in filtered mode
    if (filteredResults) {
      return sourceRows;
    }
    return [...sourceRows, ghostRow];
  }, [rows, fields, filteredResults]);

  // Clear AI filter
  const clearAIFilter = useCallback(() => {
    setFilteredResults(null);
  }, []);

  // Move to next/prev cell
  const moveToCell = useCallback(
    direction => {
      const { row, col } = activeCell;
      const numCols = fields.length;
      const numRows = displayRows.length;

      if (direction === 'next') {
        if (col < numCols - 1) setActiveCell({ row, col: col + 1 });
        else if (row < numRows - 1) setActiveCell({ row: row + 1, col: 0 });
      } else if (direction === 'prev') {
        if (col > 0) setActiveCell({ row, col: col - 1 });
        else if (row > 0) setActiveCell({ row: row - 1, col: numCols - 1 });
      }
    },
    [activeCell, fields.length, displayRows.length]
  );

  // Handle ghost row edit - creates new row
  const handleGhostRowEdit = useCallback(
    async (fieldSlug, value) => {
      if (!value && value !== false) return;

      try {
        setSaving(true);
        const response = await fetch(`${API_BASE}/v1/datentabellen/tables/${tableSlug}/rows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ [fieldSlug]: value }),
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || 'Fehler beim Erstellen');
        }
        const data = await response.json();

        // Add new row to state
        const newRow = data.data;
        setRows(prev => [...prev, newRow]);
        setTotalRows(prev => prev + 1);

        setSaveStatus('success');
        setTimeout(() => setSaveStatus(null), 2000);
      } catch (err) {
        setError(err.message);
        setSaveStatus('error');
      } finally {
        setSaving(false);
      }
    },
    [tableSlug]
  );

  // Add new row
  const handleAddRow = async () => {
    try {
      setSaving(true);
      const response = await fetch(`${API_BASE}/v1/datentabellen/tables/${tableSlug}/rows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Fehler');
      }
      const data = await response.json();
      setRows(prev => [...prev, data.data]);
      setTotalRows(prev => prev + 1);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      setError(err.message);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  // Update cell value
  const handleCellSave = useCallback(
    async (rowId, fieldSlug, value, direction, skipUndo = false) => {
      setEditingCell(null);

      // Handle ghost row
      if (rowId === '__ghost__') {
        await handleGhostRowEdit(fieldSlug, value);
        return;
      }

      const oldRow = rows.find(r => r._id === rowId);
      const oldValue = oldRow?.[fieldSlug];

      if (oldValue === value) {
        if (direction) moveToCell(direction);
        return;
      }

      try {
        setSaving(true);
        const response = await fetch(
          `${API_BASE}/v1/datentabellen/tables/${tableSlug}/rows/${rowId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({
              [fieldSlug]: value,
              _expected_updated_at: oldRow?._updated_at,
            }),
          }
        );

        if (!response.ok) {
          if (response.status === 409) {
            setError('Konflikt: Daten wurden geändert. Neu laden.');
            setUndoStack([]);
            setRedoStack([]);
            throw new Error('Konflikt');
          }
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || 'Fehler');
        }

        const data = await response.json();

        setRows(prev => prev.map(row => (row._id === rowId ? { ...row, ...data.data } : row)));

        if (!skipUndo) {
          setUndoStack(prev => [
            ...prev.slice(-MAX_UNDO_HISTORY + 1),
            { rowId, fieldSlug, oldValue, newValue: value },
          ]);
          setRedoStack([]);
        }

        setSaveStatus('success');
        setTimeout(() => setSaveStatus(null), 2000);

        if (direction) moveToCell(direction);
      } catch (err) {
        await loadTable();
        setSaveStatus('error');
      } finally {
        setSaving(false);
      }
    },
    [rows, tableSlug, loadTable, handleGhostRowEdit, moveToCell]
  );

  // Clipboard operations
  const handleCopy = useCallback(() => {
    const { row, col } = activeCell;
    if (displayRows[row] && fields[col]) {
      const value = displayRows[row][fields[col].slug];
      setClipboard({ value, fieldType: fields[col].field_type });
      navigator.clipboard?.writeText(String(value ?? ''));
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 1000);
    }
  }, [activeCell, displayRows, fields]);

  const handleCut = useCallback(() => {
    const { row, col } = activeCell;
    if (displayRows[row] && fields[col] && displayRows[row]._id !== '__ghost__') {
      const value = displayRows[row][fields[col].slug];
      setClipboard({ value, fieldType: fields[col].field_type, isCut: true });
      navigator.clipboard?.writeText(String(value ?? ''));
      handleCellSave(displayRows[row]._id, fields[col].slug, null);
    }
  }, [activeCell, displayRows, fields, handleCellSave]);

  const handlePaste = useCallback(async () => {
    const { row, col } = activeCell;
    if (!displayRows[row] || !fields[col]) return;

    let value = clipboard?.value;
    if (value === undefined) {
      try {
        value = await navigator.clipboard?.readText();
      } catch {}
    }

    if (value !== undefined) {
      handleCellSave(displayRows[row]._id, fields[col].slug, value);
    }
  }, [activeCell, displayRows, fields, clipboard, handleCellSave]);

  // Undo/Redo
  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, last]);
    await handleCellSave(last.rowId, last.fieldSlug, last.oldValue, null, true);
  }, [undoStack, handleCellSave]);

  const handleRedo = useCallback(async () => {
    if (redoStack.length === 0) return;
    const last = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, last]);
    await handleCellSave(last.rowId, last.fieldSlug, last.newValue, null, true);
  }, [redoStack, handleCellSave]);

  // Export CSV
  const handleExportCSV = useCallback(async () => {
    try {
      setSaving(true);
      const exportParams = new URLSearchParams({
        page: 1,
        limit: 10000,
        sort: sortField,
        order: sortOrder,
      });
      const response = await fetch(
        `${API_BASE}/v1/datentabellen/tables/${tableSlug}/rows?${exportParams}`,
        {
          headers: getAuthHeaders(),
        }
      );
      if (!response.ok) throw new Error('Export fehlgeschlagen');
      const data = await response.json();
      const allRows = data.data || [];

      const headers = fields.map(f => `"${f.name.replace(/"/g, '""')}"`).join(';');
      const csvRows = allRows.map(row =>
        fields
          .map(f => {
            const val = row[f.slug];
            if (val === null || val === undefined) return '';
            return typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : String(val);
          })
          .join(';')
      );

      const csv = '\uFEFF' + [headers, ...csvRows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${table?.name || 'tabelle'}_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      setSaveStatus('success');
    } catch (err) {
      setError('Export fehlgeschlagen');
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  }, [tableSlug, fields, table, sortField, sortOrder]);

  // Delete selected rows
  const handleDeleteSelected = async () => {
    if (selectedRows.size === 0) return;
    if (!(await showConfirm({ message: `${selectedRows.size} Zeile(n) löschen?` }))) return;

    try {
      setSaving(true);
      const response = await fetch(`${API_BASE}/v1/datentabellen/tables/${tableSlug}/rows/bulk`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ ids: Array.from(selectedRows) }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Fehler');
      }
      setSelectedRows(new Set());
      await loadTable();
      setSaveStatus('success');
    } catch (err) {
      setError(err.message);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  // Keyboard navigation
  const handleKeyDown = useCallback(
    e => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'c':
            if (!editingCell) {
              e.preventDefault();
              handleCopy();
            }
            return;
          case 'x':
            if (!editingCell) {
              e.preventDefault();
              handleCut();
            }
            return;
          case 'v':
            if (!editingCell) {
              e.preventDefault();
              handlePaste();
            }
            return;
          case 'z':
            e.preventDefault();
            e.shiftKey ? handleRedo() : handleUndo();
            return;
          case 'y':
            e.preventDefault();
            handleRedo();
            return;
          default:
            break;
        }
      }

      if (editingCell) return;

      const { row, col } = activeCell;
      const numRows = displayRows.length;
      const numCols = fields.length;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          if (row > 0) setActiveCell({ row: row - 1, col });
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (row < numRows - 1) setActiveCell({ row: row + 1, col });
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (col > 0) setActiveCell({ row, col: col - 1 });
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (col < numCols - 1) setActiveCell({ row, col: col + 1 });
          break;
        case 'Tab':
          e.preventDefault();
          moveToCell(e.shiftKey ? 'prev' : 'next');
          break;
        case 'Enter':
        case 'F2':
          e.preventDefault();
          if (displayRows[row] && fields[col]) {
            setEditingCell({ rowId: displayRows[row]._id, fieldSlug: fields[col].slug });
          }
          break;
        case 'Delete':
          if (displayRows[row] && fields[col] && displayRows[row]._id !== '__ghost__') {
            handleCellSave(displayRows[row]._id, fields[col].slug, null);
          }
          break;
        default:
          break;
      }
    },
    [
      activeCell,
      editingCell,
      displayRows,
      fields,
      handleCopy,
      handleCut,
      handlePaste,
      handleUndo,
      handleRedo,
      moveToCell,
      handleCellSave,
    ]
  );

  useEffect(() => {
    const el = tableRef.current;
    if (el) {
      el.addEventListener('keydown', handleKeyDown);
      return () => el.removeEventListener('keydown', handleKeyDown);
    }
  }, [handleKeyDown]);

  // Column resize
  const handleResizeStart = useCallback((e, fieldSlug, currentWidth) => {
    e.preventDefault();
    setResizingColumn({ fieldSlug, startX: e.clientX, startWidth: currentWidth || 150 });
  }, []);

  useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = e => {
      const diff = e.clientX - resizingColumn.startX;
      const newWidth = Math.max(80, Math.min(600, resizingColumn.startWidth + diff));
      setColumnWidths(prev => ({ ...prev, [resizingColumn.fieldSlug]: newWidth }));
    };
    const handleMouseUp = () => setResizingColumn(null);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn]);

  // Sort by column
  const handleSort = fieldSlug => {
    if (sortField === fieldSlug) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(fieldSlug);
      setSortOrder('asc');
    }
  };

  // Format cell value
  const formatValue = (value, fieldType) => {
    if (value === null || value === undefined || value === '') return '';
    switch (fieldType) {
      case 'checkbox':
        return value ? '✓' : '✗';
      case 'currency':
        return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
      case 'number':
        return new Intl.NumberFormat('de-DE').format(value);
      case 'date':
        return new Date(value).toLocaleDateString('de-DE');
      case 'datetime':
        return new Date(value).toLocaleString('de-DE');
      default:
        return String(value);
    }
  };

  // Context menu
  const handleContextMenu = useCallback((e, rowIdx, colIdx) => {
    e.preventDefault();
    setActiveCell({ row: rowIdx, col: colIdx });
    setContextMenu({ position: { x: e.clientX, y: e.clientY }, rowIdx, colIdx });
  }, []);

  if (loading && !table) {
    return (
      <div className="excel-fullscreen">
        <div className="excel-container">
          <div className="excel-loading">
            <FiRefreshCw className="spin" />
            <p>Lade Tabelle...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="excel-fullscreen">
      <div className="excel-container">
        {/* Header */}
        <header className="excel-header">
          <div className="excel-header-left">
            <button type="button" className="excel-back-btn" onClick={onClose} title="Zurück">
              <FiArrowLeft />
            </button>
            <div className="excel-title">
              <h1>{tableName || table?.name}</h1>
              {table?.description && <span>{table.description}</span>}
            </div>
          </div>

          <div className="excel-header-center">
            <div className={`excel-save-status ${saveStatus || ''}`}>
              {saving && (
                <>
                  <FiRefreshCw className="spin" /> Speichere...
                </>
              )}
              {saveStatus === 'success' && (
                <>
                  <FiCheck /> Gespeichert
                </>
              )}
              {saveStatus === 'error' && (
                <>
                  <FiAlertCircle /> Fehler
                </>
              )}
            </div>
          </div>

          <div className="excel-header-right">
            <span className="excel-stats">
              {totalRows} Zeilen, {fields.length} Spalten
            </span>
          </div>
        </header>

        {/* Error bar */}
        {error && (
          <div className="excel-error-bar">
            <FiAlertCircle /> {error}
            <button type="button" onClick={() => setError(null)}>
              <FiX />
            </button>
          </div>
        )}

        {/* Toolbar */}
        <div className="excel-toolbar">
          <button type="button" className="excel-btn excel-btn-primary" onClick={handleAddRow}>
            <FiPlus /> Neue Zeile
          </button>

          {selectedRows.size > 0 && (
            <button
              type="button"
              className="excel-btn excel-btn-danger"
              onClick={handleDeleteSelected}
            >
              <FiTrash2 /> {selectedRows.size} löschen
            </button>
          )}

          <div className="excel-toolbar-divider" />

          <button
            type="button"
            className="excel-btn excel-btn-icon"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title="Rückgängig (Strg+Z)"
          >
            <FiCornerUpLeft />
          </button>
          <button
            type="button"
            className="excel-btn excel-btn-icon"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            title="Wiederholen (Strg+Y)"
          >
            <FiCornerUpRight />
          </button>

          <div className="excel-toolbar-divider" />

          <button
            type="button"
            className="excel-btn"
            onClick={handleExportCSV}
            disabled={saving || rows.length === 0}
          >
            <FiDownload /> Export
          </button>

          <div className="excel-toolbar-divider" />

          <button
            type="button"
            className={`excel-btn ${showAIPanel ? 'excel-btn-active' : ''}`}
            onClick={() => setShowAIPanel(!showAIPanel)}
            title="KI-Abfrage"
          >
            <FiMessageSquare /> KI-Abfrage
          </button>

          {filteredResults && (
            <button type="button" className="excel-btn excel-btn-warning" onClick={clearAIFilter}>
              <FiX /> Filter entfernen ({filteredResults.length})
            </button>
          )}

          <div className="excel-toolbar-spacer" />

          <button type="button" className="excel-btn" onClick={loadTable} disabled={loading}>
            <FiRefreshCw className={loading ? 'spin' : ''} /> Aktualisieren
          </button>
        </div>

        {/* Table */}
        <div className="excel-grid-container" ref={tableRef} tabIndex={0}>
          <table className="excel-table">
            <thead>
              <tr>
                <th className="excel-th excel-th-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedRows.size === rows.length && rows.length > 0}
                    onChange={e => {
                      if (e.target.checked) setSelectedRows(new Set(rows.map(r => r._id)));
                      else setSelectedRows(new Set());
                    }}
                  />
                </th>
                {fields.map(field => (
                  <th
                    key={field.slug}
                    className={`excel-th ${resizingColumn?.fieldSlug === field.slug ? 'excel-th-resizing' : ''}`}
                    style={{ width: columnWidths[field.slug] || 150 }}
                  >
                    <div className="excel-th-content">
                      <span className="excel-th-name" onClick={() => handleSort(field.slug)}>
                        {field.name}
                        {sortField === field.slug &&
                          (sortOrder === 'asc' ? <FiChevronUp /> : <FiChevronDown />)}
                      </span>
                      <button
                        type="button"
                        className="excel-th-menu-btn"
                        onClick={e => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setColumnMenu({
                            field,
                            position: { top: rect.bottom + 4, left: rect.left },
                          });
                        }}
                      >
                        <FiMoreVertical />
                      </button>
                    </div>
                    <div
                      className="excel-th-resize"
                      onMouseDown={e =>
                        handleResizeStart(e, field.slug, columnWidths[field.slug] || 150)
                      }
                    />
                  </th>
                ))}
                <InlineColumnCreator
                  tableSlug={tableSlug}
                  onColumnAdded={loadTable}
                  existingSlugs={fields.map(f => f.slug)}
                />
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, rowIdx) => (
                <tr
                  key={row._id}
                  className={`${selectedRows.has(row._id) ? 'excel-row-selected' : ''} ${row._isGhost ? 'excel-row-ghost' : ''}`}
                >
                  <td className="excel-td excel-td-checkbox">
                    {!row._isGhost && (
                      <input
                        type="checkbox"
                        checked={selectedRows.has(row._id)}
                        onChange={() => {
                          setSelectedRows(prev => {
                            const next = new Set(prev);
                            next.has(row._id) ? next.delete(row._id) : next.add(row._id);
                            return next;
                          });
                        }}
                      />
                    )}
                  </td>
                  {fields.map((field, colIdx) => {
                    const isEditing =
                      editingCell?.rowId === row._id && editingCell?.fieldSlug === field.slug;
                    const isActive = activeCell.row === rowIdx && activeCell.col === colIdx;

                    return (
                      <td
                        key={field.slug}
                        className={`excel-td ${isActive ? 'excel-td-active' : ''} ${row._isGhost ? 'excel-td-ghost' : ''}`}
                        style={{ width: columnWidths[field.slug] || 150 }}
                        onClick={() => {
                          setActiveCell({ row: rowIdx, col: colIdx });
                          if (!isEditing) setEditingCell({ rowId: row._id, fieldSlug: field.slug });
                        }}
                        onContextMenu={e => !row._isGhost && handleContextMenu(e, rowIdx, colIdx)}
                      >
                        {isEditing ? (
                          <CellEditor
                            value={row[field.slug]}
                            field={field}
                            onSave={(val, dir) => handleCellSave(row._id, field.slug, val, dir)}
                            onCancel={() => setEditingCell(null)}
                          />
                        ) : (
                          <span className={`excel-cell-value excel-cell-${field.field_type}`}>
                            {row._isGhost ? '' : formatValue(row[field.slug], field.field_type)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="excel-td excel-td-empty" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="excel-pagination">
          <div className="excel-pagination-info">
            {totalRows > 0
              ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalRows)} von ${totalRows}`
              : '0 Einträge'}
          </div>

          <div className="excel-pagination-controls">
            <button type="button" disabled={page === 1} onClick={() => setPage(1)}>
              <FiChevronsLeft />
            </button>
            <button type="button" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <FiChevronLeft />
            </button>
            <span>
              Seite {page} von {totalPages}
            </span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <FiChevronRight />
            </button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>
              <FiChevronsRight />
            </button>
          </div>

          <div className="excel-pagination-size">
            <select
              value={pageSize}
              onChange={e => {
                setPageSize(+e.target.value);
                setPage(1);
              }}
            >
              {PAGE_SIZE_OPTIONS.map(s => (
                <option key={s} value={s}>
                  {s} Zeilen
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Column Menu */}
        {columnMenu && (
          <ColumnMenu
            field={columnMenu.field}
            tableSlug={tableSlug}
            position={columnMenu.position}
            onClose={() => setColumnMenu(null)}
            onFieldUpdated={loadTable}
          />
        )}

        {/* Context Menu */}
        {contextMenu && (
          <CellContextMenu
            position={contextMenu.position}
            onClose={() => setContextMenu(null)}
            onCopy={() => {
              handleCopy();
              setContextMenu(null);
            }}
            onCut={() => {
              handleCut();
              setContextMenu(null);
            }}
            onPaste={() => {
              handlePaste();
              setContextMenu(null);
            }}
            onDelete={() => {
              const { row, col } = activeCell;
              if (displayRows[row] && fields[col] && displayRows[row]._id !== '__ghost__') {
                handleCellSave(displayRows[row]._id, fields[col].slug, null);
              }
              setContextMenu(null);
            }}
            hasClipboard={!!clipboard?.value}
          />
        )}

        {/* AI Query Panel */}
        {showAIPanel && (
          <AIQueryPanel
            tableSlug={tableSlug}
            onResultsApplied={results => setFilteredResults(results)}
            onClose={() => setShowAIPanel(false)}
          />
        )}
      </div>
      {/* Close excel-container */}
      {ConfirmDialog}
    </div>
  );
}

export default ExcelEditor;
