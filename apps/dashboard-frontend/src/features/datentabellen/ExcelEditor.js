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
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import useConfirm from '../../hooks/useConfirm';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import GridCellEditor from '../../components/editor/GridEditor/CellEditor';
import useExcelClipboard from './useExcelClipboard';
import useExcelHistory from './useExcelHistory';
import useExcelKeyboard from './useExcelKeyboard';
import '../database/Database.css';

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
  const api = useApi();
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
      await api.post(
        `/v1/datentabellen/tables/${tableSlug}/fields`,
        {
          name: name.trim(),
          field_type: type,
          is_required: false,
          is_unique: false,
        },
        { showError: false }
      );
      onColumnAdded();
      setName('');
      setMode('button');
    } catch (err) {
      setError(err.data?.error || err.message);
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
 * ColumnMenu - Dropdown menu for column actions
 */
const ColumnMenu = memo(function ColumnMenu({
  field,
  tableSlug,
  onClose,
  onFieldUpdated,
  position,
}) {
  const api = useApi();
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
      await api.patch(
        `/v1/datentabellen/tables/${tableSlug}/fields/${field.slug}`,
        { name: newName.trim() },
        { showError: false }
      );
      onFieldUpdated();
      onClose();
    } catch (err) {
      setError(err.data?.error || err.message);
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
      await api.patch(
        `/v1/datentabellen/tables/${tableSlug}/fields/${field.slug}`,
        { field_type: newType },
        { showError: false }
      );
      onFieldUpdated();
      onClose();
    } catch (err) {
      setError(err.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!(await showConfirm({ message: `Spalte "${field.name}" wirklich löschen?` }))) return;

    setLoading(true);
    try {
      await api.del(`/v1/datentabellen/tables/${tableSlug}/fields/${field.slug}`, {
        showError: false,
      });
      onFieldUpdated();
      onClose();
    } catch (err) {
      setError(err.data?.error || err.message);
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
  const api = useApi();
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
      const data = await api.post(
        `/v1/datentabellen/query/natural`,
        {
          query: query.trim(),
          tableSlug,
        },
        { showError: false }
      );

      setResult(data.data);
    } catch (err) {
      setError(err.data?.error || err.message);
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
  const api = useApi();
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

  // Column widths
  const [columnWidths, setColumnWidths] = useState({});
  const [resizingColumn, setResizingColumn] = useState(null);

  // Refs
  const tableRef = useRef(null);
  const handleCellSaveRef = useRef(null);

  // History (undo/redo) - uses ref to break circular dep with handleCellSave
  const { undoStack, redoStack, pushUndo, clearStacks, handleUndo, handleRedo } =
    useExcelHistory(handleCellSaveRef);

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
        api.get(`/v1/datentabellen/tables/${tableSlug}`, { showError: false }),
        api.get(`/v1/datentabellen/tables/${tableSlug}/rows?${rowsParams}`, { showError: false }),
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
        const data = await api.post(
          `/v1/datentabellen/tables/${tableSlug}/rows`,
          { [fieldSlug]: value },
          { showError: false }
        );

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
      const data = await api.post(
        `/v1/datentabellen/tables/${tableSlug}/rows`,
        {},
        { showError: false }
      );
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
        const data = await api
          .patch(
            `/v1/datentabellen/tables/${tableSlug}/rows/${rowId}`,
            {
              [fieldSlug]: value,
              _expected_updated_at: oldRow?._updated_at,
            },
            { showError: false }
          )
          .catch(err => {
            if (err.status === 409) {
              setError('Konflikt: Daten wurden geändert. Neu laden.');
              clearStacks();
            }
            throw err;
          });

        setRows(prev => prev.map(row => (row._id === rowId ? { ...row, ...data.data } : row)));

        if (!skipUndo) {
          pushUndo({ rowId, fieldSlug, oldValue, newValue: value });
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
    [rows, tableSlug, loadTable, handleGhostRowEdit, moveToCell, pushUndo, clearStacks]
  );

  // Keep ref in sync for history hook
  handleCellSaveRef.current = handleCellSave;

  // Clipboard
  const { clipboard, handleCopy, handleCut, handlePaste } = useExcelClipboard({
    activeCell,
    displayRows,
    fields,
    handleCellSave,
    setSaveStatus,
  });

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
      const data = await api.get(`/v1/datentabellen/tables/${tableSlug}/rows?${exportParams}`, {
        showError: false,
      });
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
      await api.request(`/v1/datentabellen/tables/${tableSlug}/rows/bulk`, {
        method: 'DELETE',
        body: { ids: Array.from(selectedRows) },
        showError: false,
      });
      setSelectedRows(new Set());
      await loadTable();
      setSaveStatus('success');
    } catch (err) {
      setError(err.data?.error || err.message);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  // Keyboard navigation
  useExcelKeyboard({
    tableRef,
    activeCell,
    setActiveCell,
    editingCell,
    setEditingCell,
    displayRows,
    fields,
    moveToCell,
    handleCopy,
    handleCut,
    handlePaste,
    handleUndo,
    handleRedo,
    handleCellSave,
  });

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
          <LoadingSpinner message="Tabelle wird geladen..." />
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
                          <GridCellEditor
                            value={row[field.slug]}
                            field={field}
                            onSave={(val, dir) => handleCellSave(row._id, field.slug, val, dir)}
                            onCancel={() => setEditingCell(null)}
                            classPrefix="excel"
                            validate={false}
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
