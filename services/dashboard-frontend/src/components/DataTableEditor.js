/**
 * DataTableEditor - Full-screen modal editor for Datentabellen (PostgreSQL)
 * Excel-like interface with keyboard navigation
 */

import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import axios from 'axios';
import {
  FiX,
  FiSave,
  FiPlus,
  FiTrash2,
  FiDownload,
  FiRefreshCw,
  FiCheck,
  FiAlertCircle,
  FiChevronUp,
  FiChevronDown,
  FiColumns,
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
  FiUpload,
  FiDatabase,
} from 'react-icons/fi';
import { API_BASE } from '../config/api';
import { useToast } from '../contexts/ToastContext';
import useConfirm from '../hooks/useConfirm';
import Modal from './Modal';
import './Database/Database.css';

// Maximum undo history size
const MAX_UNDO_HISTORY = 50;

// Page size options
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

// Field types configuration
const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Mehrzeilig' },
  { value: 'number', label: 'Zahl' },
  { value: 'currency', label: 'Währung' },
  { value: 'date', label: 'Datum' },
  { value: 'datetime', label: 'Datum & Zeit' },
  { value: 'select', label: 'Auswahl' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'email', label: 'E-Mail' },
  { value: 'url', label: 'URL' },
  { value: 'phone', label: 'Telefon' },
];

/**
 * AddFieldModal - Modal for adding a new field
 */
const AddFieldModal = memo(function AddFieldModal({ isOpen, onClose, tableSlug, onFieldAdded }) {
  const [name, setName] = useState('');
  const [fieldType, setFieldType] = useState('text');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      await axios.post(`${API_BASE}/v1/datentabellen/tables/${tableSlug}/fields`, {
        name: name.trim(),
        field_type: fieldType,
        is_required: false,
        is_unique: false,
      });

      setName('');
      setFieldType('text');
      onFieldAdded();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Hinzufügen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Neue Spalte">
      <form onSubmit={handleSubmit} className="dt-create-form">
        {error && <div className="dt-error-message">{error}</div>}

        <div className="dt-form-group">
          <label>Spaltenname *</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="z.B. E-Mail, Preis, Status"
            autoFocus
          />
        </div>

        <div className="dt-form-group">
          <label>Typ</label>
          <select value={fieldType} onChange={e => setFieldType(e.target.value)}>
            {FIELD_TYPES.map(t => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="dt-modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="btn-primary" disabled={loading || !name.trim()}>
            {loading ? 'Füge hinzu...' : 'Hinzufügen'}
          </button>
        </div>
      </form>
    </Modal>
  );
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
          className="dt-cell-editor"
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
          className="dt-cell-editor"
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
          className="dt-cell-editor"
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
          className="dt-cell-editor-checkbox"
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
          className="dt-cell-editor"
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
          className="dt-cell-editor"
        />
      );
  }
});

/**
 * ColumnMenu - Dropdown menu for column actions (rename, change type, delete)
 */
const ColumnMenu = memo(function ColumnMenu({
  field,
  tableSlug,
  onClose,
  onFieldUpdated,
  position,
}) {
  const [mode, setMode] = useState('menu'); // 'menu' | 'rename' | 'type'
  const [newName, setNewName] = useState(field.name);
  const [newType, setNewType] = useState(field.field_type);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);

  // Focus input when mode changes
  useEffect(() => {
    if (mode === 'rename' && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [mode]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = e => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Handle rename
  const handleRename = async () => {
    if (!newName.trim() || newName === field.name) {
      onClose();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await axios.patch(`${API_BASE}/v1/datentabellen/tables/${tableSlug}/fields/${field.slug}`, {
        name: newName.trim(),
      });
      onFieldUpdated();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Umbenennen');
    } finally {
      setLoading(false);
    }
  };

  // Handle type change
  const handleTypeChange = async () => {
    if (newType === field.field_type) {
      onClose();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await axios.patch(`${API_BASE}/v1/datentabellen/tables/${tableSlug}/fields/${field.slug}`, {
        field_type: newType,
      });
      onFieldUpdated();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Ändern des Typs');
    } finally {
      setLoading(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (
      !(await confirm({
        message: `Spalte "${field.name}" wirklich löschen? Alle Daten in dieser Spalte gehen verloren.`,
      }))
    ) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await axios.delete(`${API_BASE}/v1/datentabellen/tables/${tableSlug}/fields/${field.slug}`);
      onFieldUpdated();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Löschen');
    } finally {
      setLoading(false);
    }
  };

  // Handle key events
  const handleKeyDown = e => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && mode === 'rename') {
      handleRename();
    }
  };

  return (
    <div
      className="dt-column-menu"
      ref={menuRef}
      style={{ top: position.top, left: position.left }}
      onKeyDown={handleKeyDown}
    >
      {error && <div className="dt-column-menu-error">{error}</div>}

      {mode === 'menu' && (
        <>
          <button
            className="dt-column-menu-item"
            onClick={() => setMode('rename')}
            disabled={loading}
          >
            <FiEdit2 /> Umbenennen
          </button>
          <button
            className="dt-column-menu-item"
            onClick={() => setMode('type')}
            disabled={loading}
          >
            <FiType /> Typ ändern
          </button>
          <div className="dt-column-menu-divider" />
          <button
            className="dt-column-menu-item dt-column-menu-danger"
            onClick={handleDelete}
            disabled={loading}
          >
            <FiTrash2 /> Löschen
          </button>
        </>
      )}

      {mode === 'rename' && (
        <div className="dt-column-menu-form">
          <label>Neuer Name</label>
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Spaltenname"
          />
          <div className="dt-column-menu-actions">
            <button className="btn-secondary btn-sm" onClick={() => setMode('menu')}>
              Zurück
            </button>
            <button
              className="btn-primary btn-sm"
              onClick={handleRename}
              disabled={loading || !newName.trim()}
            >
              {loading ? '...' : 'Speichern'}
            </button>
          </div>
        </div>
      )}

      {mode === 'type' && (
        <div className="dt-column-menu-form">
          <label>Spaltentyp</label>
          <select value={newType} onChange={e => setNewType(e.target.value)}>
            {FIELD_TYPES.map(t => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <div className="dt-column-menu-actions">
            <button className="btn-secondary btn-sm" onClick={() => setMode('menu')}>
              Zurück
            </button>
            <button className="btn-primary btn-sm" onClick={handleTypeChange} disabled={loading}>
              {loading ? '...' : 'Ändern'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

/**
 * CellContextMenu - Right-click context menu for cells
 */
const CellContextMenu = memo(function CellContextMenu({
  position,
  onClose,
  onCopy,
  onPaste,
  onCut,
  onDelete,
  onInsertRowAbove,
  onInsertRowBelow,
  hasClipboard,
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = e => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
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
    <div className="dt-context-menu" ref={menuRef} style={{ top: position.y, left: position.x }}>
      <button className="dt-context-menu-item" onClick={onCopy}>
        <FiCopy /> Kopieren
        <span className="dt-context-shortcut">Strg+C</span>
      </button>
      <button className="dt-context-menu-item" onClick={onCut}>
        <FiScissors /> Ausschneiden
        <span className="dt-context-shortcut">Strg+X</span>
      </button>
      <button className="dt-context-menu-item" onClick={onPaste} disabled={!hasClipboard}>
        <FiClipboard /> Einfügen
        <span className="dt-context-shortcut">Strg+V</span>
      </button>
      <div className="dt-context-menu-divider" />
      <button className="dt-context-menu-item" onClick={onDelete}>
        <FiTrash2 /> Löschen
        <span className="dt-context-shortcut">Entf</span>
      </button>
      <div className="dt-context-menu-divider" />
      <button className="dt-context-menu-item" onClick={onInsertRowAbove}>
        <FiPlus /> Zeile oberhalb
      </button>
      <button className="dt-context-menu-item" onClick={onInsertRowBelow}>
        <FiPlus /> Zeile unterhalb
      </button>
    </div>
  );
});

/**
 * DataTableEditor - Main editor component
 */
function DataTableEditor({ tableSlug, tableName, onClose, onSave }) {
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [table, setTable] = useState(null);
  const [fields, setFields] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [pageInput, setPageInput] = useState('1');

  // Editing state
  const [editingCell, setEditingCell] = useState(null); // { rowId, fieldSlug }
  const [selectedRows, setSelectedRows] = useState(new Set());

  // Sorting
  const [sortField, setSortField] = useState('_created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  // Modal
  const [showAddField, setShowAddField] = useState(false);

  // Column menu state
  const [columnMenu, setColumnMenu] = useState(null); // { field, position: { top, left } }

  // Context menu state (right-click)
  const [contextMenu, setContextMenu] = useState(null); // { position: { x, y }, rowIdx, colIdx }

  // Clipboard state
  const [clipboard, setClipboard] = useState(null); // { value, fieldType, isCut }

  // Undo/Redo state
  const [undoStack, setUndoStack] = useState([]); // Array of { rowId, fieldSlug, oldValue, newValue }
  const [redoStack, setRedoStack] = useState([]);

  // Column widths for resizing
  const [columnWidths, setColumnWidths] = useState({}); // { fieldSlug: width }
  const [resizingColumn, setResizingColumn] = useState(null); // { fieldSlug, startX, startWidth }

  // Active cell for keyboard navigation
  const [activeCell, setActiveCell] = useState({ row: 0, col: 0 });
  const tableRef = useRef(null);

  // Load table data
  const loadTable = useCallback(async () => {
    try {
      setLoading(true);
      const [tableRes, rowsRes] = await Promise.all([
        axios.get(`${API_BASE}/v1/datentabellen/tables/${tableSlug}`),
        axios.get(`${API_BASE}/v1/datentabellen/tables/${tableSlug}/rows`, {
          params: { page, limit: pageSize, sort: sortField, order: sortOrder },
        }),
      ]);

      setTable(tableRes.data.data);
      setFields(tableRes.data.data.fields || []);
      setRows(rowsRes.data.data || []);
      setTotalPages(rowsRes.data.meta?.pages || 1);
      setTotalRows(rowsRes.data.meta?.total || 0);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }, [tableSlug, page, pageSize, sortField, sortOrder]);

  useEffect(() => {
    loadTable();
  }, [loadTable]);

  // Sync pageInput when page changes externally
  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  // Export as CSV
  const handleExportCSV = useCallback(async () => {
    try {
      setSaving(true);
      // Fetch all rows for export
      const response = await axios.get(`${API_BASE}/v1/datentabellen/tables/${tableSlug}/rows`, {
        params: { page: 1, limit: 10000, sort: sortField, order: sortOrder },
      });
      const allRows = response.data.data || [];

      // Build CSV with semicolon separator (German Excel compatible)
      const headers = fields.map(f => `"${f.name.replace(/"/g, '""')}"`).join(';');
      const csvRows = allRows.map(row => {
        return fields
          .map(f => {
            const val = row[f.slug];
            if (val === null || val === undefined) return '';
            if (typeof val === 'string') {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return String(val);
          })
          .join(';');
      });

      const csv = '\uFEFF' + [headers, ...csvRows].join('\n'); // BOM for Excel
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${table?.name || 'tabelle'}_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      setError('Export fehlgeschlagen');
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  }, [tableSlug, fields, table, sortField, sortOrder]);

  // Import from CSV
  const handleImportCSV = useCallback(
    event => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async e => {
        try {
          setSaving(true);
          const text = e.target?.result;
          if (typeof text !== 'string') return;

          // Parse CSV (handle both comma and semicolon)
          const delimiter = text.includes(';') ? ';' : ',';
          const lines = text.split('\n').filter(line => line.trim());
          if (lines.length < 2) {
            setError('CSV muss mindestens eine Kopfzeile und eine Datenzeile haben');
            return;
          }

          // Parse header
          const headerLine = lines[0];
          const headers = headerLine
            .split(delimiter)
            .map(h => h.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));

          // Map headers to field slugs
          const fieldMap = {};
          headers.forEach((header, idx) => {
            const field = fields.find(
              f =>
                f.name.toLowerCase() === header.toLowerCase() ||
                f.slug.toLowerCase() === header.toLowerCase()
            );
            if (field) {
              fieldMap[idx] = field.slug;
            }
          });

          // Parse data rows and import
          let importedCount = 0;
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            const values = line
              .split(delimiter)
              .map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));

            const rowData = {};
            values.forEach((val, idx) => {
              if (fieldMap[idx] && val) {
                rowData[fieldMap[idx]] = val;
              }
            });

            if (Object.keys(rowData).length > 0) {
              await axios.post(`${API_BASE}/v1/datentabellen/tables/${tableSlug}/rows`, rowData);
              importedCount++;
            }
          }

          await loadTable();
          setSaveStatus('success');
          setError(null);
          toast.success(`${importedCount} Zeilen importiert`);
        } catch (err) {
          setError('Import fehlgeschlagen: ' + (err.response?.data?.error || err.message));
          setSaveStatus('error');
        } finally {
          setSaving(false);
          // Reset file input
          event.target.value = '';
        }
      };
      reader.readAsText(file);
    },
    [tableSlug, fields, loadTable]
  );

  // Index table for RAG/LLM
  const [indexStatus, setIndexStatus] = useState(null); // { indexed_rows, total_rows, is_indexed }
  const [indexing, setIndexing] = useState(false);

  // Check index status on load
  useEffect(() => {
    const checkIndexStatus = async () => {
      try {
        const response = await axios.get(
          `${API_BASE}/v1/datentabellen/tables/${tableSlug}/index/status`
        );
        setIndexStatus(response.data.data);
      } catch {
        // Ignore errors
      }
    };
    if (tableSlug) checkIndexStatus();
  }, [tableSlug, totalRows]);

  const handleIndexForRAG = async () => {
    try {
      setIndexing(true);
      setSaving(true);
      const response = await axios.post(`${API_BASE}/v1/datentabellen/tables/${tableSlug}/index`);
      setIndexStatus({
        indexed_rows: response.data.indexed,
        total_rows: totalRows,
        is_indexed: true,
        is_complete: true,
      });
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      setError('Indexierung fehlgeschlagen: ' + (err.response?.data?.error || err.message));
      setSaveStatus('error');
    } finally {
      setIndexing(false);
      setSaving(false);
    }
  };

  // Add new row
  const handleAddRow = async () => {
    try {
      setSaving(true);
      await axios.post(`${API_BASE}/v1/datentabellen/tables/${tableSlug}/rows`, {});
      await loadTable();
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      setSaveStatus('error');
      setError(err.response?.data?.error || 'Fehler beim Hinzufügen');
    } finally {
      setSaving(false);
    }
  };

  // Update cell value with undo support
  const handleCellSave = async (rowId, fieldSlug, value, direction, skipUndo = false) => {
    setEditingCell(null);

    // Get old row for undo and optimistic locking
    const oldRow = rows.find(r => r._id === rowId);
    const oldValue = oldRow ? oldRow[fieldSlug] : null;
    const expectedUpdatedAt = oldRow?._updated_at;

    // Don't save if value hasn't changed
    if (oldValue === value) {
      if (direction === 'next' || direction === 'prev') {
        moveToCell(direction);
      }
      return;
    }

    try {
      setSaving(true);
      const response = await axios.patch(
        `${API_BASE}/v1/datentabellen/tables/${tableSlug}/rows/${rowId}`,
        {
          [fieldSlug]: value,
          _expected_updated_at: expectedUpdatedAt,
        }
      );

      // Update local state with new _updated_at from server
      const updatedRow = response.data.data;
      setRows(prev => prev.map(row => (row._id === rowId ? { ...row, ...updatedRow } : row)));

      // Add to undo stack (unless this is an undo/redo operation)
      if (!skipUndo) {
        setUndoStack(prev => {
          const newStack = [...prev, { rowId, fieldSlug, oldValue, newValue: value }];
          // Limit stack size
          if (newStack.length > MAX_UNDO_HISTORY) {
            return newStack.slice(-MAX_UNDO_HISTORY);
          }
          return newStack;
        });
        // Clear redo stack on new action
        setRedoStack([]);
      }

      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 2000);

      // Handle Tab navigation
      if (direction === 'next' || direction === 'prev') {
        moveToCell(direction);
      }
    } catch (err) {
      // Handle conflict error (409)
      if (err.response?.status === 409) {
        setError(
          'Konflikt: Ein anderer Benutzer hat diesen Datensatz geändert. Daten werden neu geladen.'
        );
        setSaveStatus('error');
        // Clear undo stack since data is stale
        setUndoStack([]);
        setRedoStack([]);
      } else {
        setSaveStatus('error');
      }
      await loadTable(); // Reload on error
    } finally {
      setSaving(false);
    }
  };

  // Move to next/prev cell
  const moveToCell = direction => {
    const rowIdx = activeCell.row;
    const colIdx = activeCell.col;
    const numCols = fields.length;
    const numRows = rows.length;

    if (direction === 'next') {
      if (colIdx < numCols - 1) {
        setActiveCell({ row: rowIdx, col: colIdx + 1 });
      } else if (rowIdx < numRows - 1) {
        setActiveCell({ row: rowIdx + 1, col: 0 });
      }
    } else if (direction === 'prev') {
      if (colIdx > 0) {
        setActiveCell({ row: rowIdx, col: colIdx - 1 });
      } else if (rowIdx > 0) {
        setActiveCell({ row: rowIdx - 1, col: numCols - 1 });
      }
    }
  };

  // Copy current cell value
  const handleCopy = useCallback(() => {
    const { row, col } = activeCell;
    if (rows[row] && fields[col]) {
      const value = rows[row][fields[col].slug];
      const fieldType = fields[col].field_type;
      setClipboard({ value, fieldType, isCut: false });
      // Also copy to system clipboard
      if (value !== null && value !== undefined) {
        navigator.clipboard?.writeText(String(value));
      }
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 1000);
    }
  }, [activeCell, rows, fields]);

  // Cut current cell value
  const handleCut = useCallback(() => {
    const { row, col } = activeCell;
    if (rows[row] && fields[col]) {
      const value = rows[row][fields[col].slug];
      const fieldType = fields[col].field_type;
      setClipboard({ value, fieldType, isCut: true });
      // Copy to system clipboard
      if (value !== null && value !== undefined) {
        navigator.clipboard?.writeText(String(value));
      }
      // Clear the cell
      handleCellSave(rows[row]._id, fields[col].slug, null);
    }
  }, [activeCell, rows, fields, handleCellSave]);

  // Paste from clipboard
  const handlePaste = useCallback(async () => {
    const { row, col } = activeCell;
    if (!rows[row] || !fields[col]) return;

    let valueToPaste = clipboard?.value;

    // Try to get from system clipboard if no internal clipboard
    if (valueToPaste === undefined || valueToPaste === null) {
      try {
        valueToPaste = await navigator.clipboard?.readText();
      } catch {
        // Clipboard access denied
      }
    }

    if (valueToPaste !== undefined && valueToPaste !== null) {
      handleCellSave(rows[row]._id, fields[col].slug, valueToPaste);
    }
  }, [activeCell, rows, fields, clipboard, handleCellSave]);

  // Undo last action
  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;

    const lastAction = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, lastAction]);

    // Revert to old value
    await handleCellSave(lastAction.rowId, lastAction.fieldSlug, lastAction.oldValue, null, true);
  }, [undoStack, handleCellSave]);

  // Redo last undone action
  const handleRedo = useCallback(async () => {
    if (redoStack.length === 0) return;

    const lastAction = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, lastAction]);

    // Apply new value again
    await handleCellSave(lastAction.rowId, lastAction.fieldSlug, lastAction.newValue, null, true);
  }, [redoStack, handleCellSave]);

  // Insert row at specific position
  const handleInsertRow = async position => {
    try {
      setSaving(true);
      await axios.post(`${API_BASE}/v1/datentabellen/tables/${tableSlug}/rows`, {});
      await loadTable();
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      setSaveStatus('error');
      setError(err.response?.data?.error || 'Fehler beim Hinzufügen');
    } finally {
      setSaving(false);
    }
  };

  // Handle right-click context menu
  const handleContextMenu = useCallback((e, rowIdx, colIdx) => {
    e.preventDefault();
    setActiveCell({ row: rowIdx, col: colIdx });
    setContextMenu({
      position: { x: e.clientX, y: e.clientY },
      rowIdx,
      colIdx,
    });
  }, []);

  // Column resize handlers
  const handleResizeStart = useCallback((e, fieldSlug, currentWidth) => {
    e.preventDefault();
    setResizingColumn({
      fieldSlug,
      startX: e.clientX,
      startWidth: currentWidth || 150,
    });
  }, []);

  useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = e => {
      const diff = e.clientX - resizingColumn.startX;
      const newWidth = Math.max(80, resizingColumn.startWidth + diff);
      setColumnWidths(prev => ({
        ...prev,
        [resizingColumn.fieldSlug]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      setResizingColumn(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn]);

  // Delete selected rows
  const handleDeleteSelected = async () => {
    if (selectedRows.size === 0) return;
    if (!(await confirm({ message: `${selectedRows.size} Zeile(n) wirklich löschen?` }))) return;

    try {
      setSaving(true);
      await axios.delete(`${API_BASE}/v1/datentabellen/tables/${tableSlug}/rows/bulk`, {
        data: { ids: Array.from(selectedRows) },
      });
      setSelectedRows(new Set());
      await loadTable();
      setSaveStatus('success');
    } catch (err) {
      setSaveStatus('error');
      setError(err.response?.data?.error || 'Fehler beim Löschen');
    } finally {
      setSaving(false);
    }
  };

  // Keyboard navigation and shortcuts
  const handleKeyDown = useCallback(
    e => {
      // Handle global shortcuts even when editing
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
            if (e.shiftKey) {
              handleRedo();
            } else {
              handleUndo();
            }
            return;
          case 'y':
            e.preventDefault();
            handleRedo();
            return;
          default:
            break;
        }
      }

      if (editingCell) return; // Don't navigate while editing

      const { row, col } = activeCell;
      const numRows = rows.length;
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
          if (rows[row] && fields[col]) {
            setEditingCell({ rowId: rows[row]._id, fieldSlug: fields[col].slug });
          }
          break;
        case 'Delete':
          if (rows[row] && fields[col]) {
            handleCellSave(rows[row]._id, fields[col].slug, null);
          }
          break;
        default:
          break;
      }
    },
    [
      activeCell,
      editingCell,
      rows,
      fields,
      handleCopy,
      handleCut,
      handlePaste,
      handleUndo,
      handleRedo,
    ]
  );

  useEffect(() => {
    const table = tableRef.current;
    if (table) {
      table.addEventListener('keydown', handleKeyDown);
      return () => table.removeEventListener('keydown', handleKeyDown);
    }
  }, [handleKeyDown]);

  // Sort by column
  const handleSort = fieldSlug => {
    if (sortField === fieldSlug) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(fieldSlug);
      setSortOrder('asc');
    }
  };

  // Select all rows
  const handleSelectAll = checked => {
    if (checked) {
      setSelectedRows(new Set(rows.map(r => r._id)));
    } else {
      setSelectedRows(new Set());
    }
  };

  // Toggle row selection
  const toggleRowSelection = rowId => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  // Format cell value for display
  const formatValue = (value, fieldType) => {
    if (value === null || value === undefined || value === '') return '—';

    switch (fieldType) {
      case 'checkbox':
        return value ? '✓' : '✗';
      case 'currency':
        return new Intl.NumberFormat('de-DE', {
          style: 'currency',
          currency: 'EUR',
        }).format(value);
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

  // Close handler with unsaved check
  const handleClose = () => {
    onClose();
    if (onSave) onSave();
  };

  if (loading && !table) {
    return (
      <div className="yaml-editor-overlay">
        <div className="yaml-editor-container">
          <div className="yaml-editor-loading">
            <FiRefreshCw className="spin" />
            <p>Lade Tabelle...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="yaml-editor-overlay">
      <div className="yaml-editor-container" style={{ maxWidth: '1600px' }}>
        {/* Header */}
        <div className="yaml-editor-header">
          <div className="yaml-editor-title">
            <h2>{tableName || table?.name || 'Tabelle'}</h2>
            {table?.description && <p className="yaml-editor-description">{table.description}</p>}
          </div>

          <div className="yaml-editor-actions">
            <div className={`yaml-save-status ${saveStatus || ''}`}>
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

            <button className="yaml-btn yaml-btn-secondary" onClick={handleClose}>
              <FiX /> Schließen
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="yaml-error">
            <FiAlertCircle /> {error}
            <button onClick={() => setError(null)}>
              <FiX />
            </button>
          </div>
        )}

        {/* Toolbar */}
        <div className="yaml-toolbar">
          <button className="yaml-btn yaml-btn-primary" onClick={handleAddRow}>
            <FiPlus /> Neue Zeile
          </button>

          <button className="yaml-btn" onClick={() => setShowAddField(true)}>
            <FiColumns /> Spalte hinzufügen
          </button>

          {selectedRows.size > 0 && (
            <button className="yaml-btn yaml-btn-danger" onClick={handleDeleteSelected}>
              <FiTrash2 /> {selectedRows.size} löschen
            </button>
          )}

          <div className="yaml-toolbar-divider" />

          <button
            className="yaml-btn yaml-btn-icon"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title="Rückgängig (Strg+Z)"
          >
            <FiCornerUpLeft />
          </button>

          <button
            className="yaml-btn yaml-btn-icon"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            title="Wiederholen (Strg+Y)"
          >
            <FiCornerUpRight />
          </button>

          <div className="yaml-toolbar-divider" />

          <button
            className="yaml-btn"
            onClick={handleExportCSV}
            disabled={saving || rows.length === 0}
            title="Als CSV exportieren"
          >
            <FiDownload /> Export
          </button>

          <label className="yaml-btn yaml-btn-upload">
            <FiUpload /> Import
            <input
              type="file"
              accept=".csv,.txt"
              onChange={handleImportCSV}
              style={{ display: 'none' }}
            />
          </label>

          <div className="yaml-toolbar-divider" />

          <button
            className={`yaml-btn ${indexStatus?.is_indexed ? 'yaml-btn-indexed' : ''}`}
            onClick={handleIndexForRAG}
            disabled={indexing || rows.length === 0}
            title={
              indexStatus?.is_indexed
                ? `${indexStatus.indexed_rows} Zeilen für LLM indexiert`
                : 'Für LLM-Abfragen indexieren'
            }
          >
            <FiDatabase />
            {indexing ? 'Indexiere...' : indexStatus?.is_indexed ? 'Indexiert' : 'LLM Index'}
          </button>

          <div className="yaml-toolbar-spacer" />

          <span className="yaml-row-count">
            {totalRows} Zeilen, {fields.length} Spalten
          </span>
        </div>

        {/* Table */}
        <div className="yaml-table-wrapper" ref={tableRef} tabIndex={0}>
          <table className="yaml-table">
            <thead>
              <tr>
                <th className="yaml-th yaml-th-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedRows.size === rows.length && rows.length > 0}
                    onChange={e => handleSelectAll(e.target.checked)}
                  />
                </th>
                {fields.map((field, colIdx) => (
                  <th
                    key={field.slug}
                    className={`yaml-th yaml-th-sortable ${resizingColumn?.fieldSlug === field.slug ? 'yaml-th-resizing' : ''}`}
                    style={{ width: columnWidths[field.slug] || 'auto', minWidth: 80 }}
                  >
                    <div className="yaml-th-content">
                      <span className="yaml-th-name" onClick={() => handleSort(field.slug)}>
                        {field.name}
                        {sortField === field.slug &&
                          (sortOrder === 'asc' ? <FiChevronUp /> : <FiChevronDown />)}
                      </span>
                      <button
                        className="yaml-th-menu-btn"
                        onClick={e => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setColumnMenu({
                            field,
                            position: {
                              top: rect.bottom + 4,
                              left: rect.left,
                            },
                          });
                        }}
                        title="Spaltenoptionen"
                      >
                        <FiMoreVertical />
                      </button>
                    </div>
                    <div
                      className="yaml-th-resize-handle"
                      onMouseDown={e =>
                        handleResizeStart(e, field.slug, columnWidths[field.slug] || 150)
                      }
                      title="Spaltenbreite anpassen"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={fields.length + 1} className="yaml-empty-row">
                    Keine Daten. Klicke "Neue Zeile" um zu beginnen.
                  </td>
                </tr>
              ) : (
                rows.map((row, rowIdx) => (
                  <tr
                    key={row._id}
                    className={selectedRows.has(row._id) ? 'yaml-row-selected' : ''}
                  >
                    <td className="yaml-td yaml-td-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(row._id)}
                        onChange={() => toggleRowSelection(row._id)}
                      />
                    </td>
                    {fields.map((field, colIdx) => {
                      const isEditing =
                        editingCell?.rowId === row._id && editingCell?.fieldSlug === field.slug;
                      const isActive = activeCell.row === rowIdx && activeCell.col === colIdx;

                      return (
                        <td
                          key={field.slug}
                          className={`yaml-td ${isActive ? 'yaml-td-active' : ''}`}
                          style={{ width: columnWidths[field.slug] || 'auto' }}
                          onClick={() => {
                            setActiveCell({ row: rowIdx, col: colIdx });
                            if (!isEditing) {
                              setEditingCell({ rowId: row._id, fieldSlug: field.slug });
                            }
                          }}
                          onContextMenu={e => handleContextMenu(e, rowIdx, colIdx)}
                        >
                          {isEditing ? (
                            <CellEditor
                              value={row[field.slug]}
                              field={field}
                              onSave={(val, dir) => handleCellSave(row._id, field.slug, val, dir)}
                              onCancel={() => setEditingCell(null)}
                            />
                          ) : (
                            <span className={`yaml-cell-value yaml-cell-${field.field_type}`}>
                              {formatValue(row[field.slug], field.field_type)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="yaml-pagination">
          <div className="yaml-pagination-info">
            <span className="yaml-pagination-range">
              {totalRows > 0 ? (
                <>
                  {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalRows)} von {totalRows}
                </>
              ) : (
                '0 Einträge'
              )}
            </span>
          </div>

          <div className="yaml-pagination-controls">
            <button
              className="yaml-pagination-btn"
              disabled={page === 1}
              onClick={() => {
                setPage(1);
                setPageInput('1');
              }}
              title="Erste Seite"
            >
              <FiChevronsLeft />
            </button>
            <button
              className="yaml-pagination-btn"
              disabled={page === 1}
              onClick={() => {
                setPage(p => p - 1);
                setPageInput(String(page - 1));
              }}
              title="Vorherige Seite"
            >
              <FiChevronLeft />
            </button>

            <div className="yaml-pagination-input-group">
              <span>Seite</span>
              <input
                type="text"
                className="yaml-pagination-input"
                value={pageInput}
                onChange={e => setPageInput(e.target.value)}
                onBlur={() => {
                  const num = parseInt(pageInput, 10);
                  if (num >= 1 && num <= totalPages) {
                    setPage(num);
                  } else {
                    setPageInput(String(page));
                  }
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const num = parseInt(pageInput, 10);
                    if (num >= 1 && num <= totalPages) {
                      setPage(num);
                    } else {
                      setPageInput(String(page));
                    }
                  }
                }}
              />
              <span>von {totalPages}</span>
            </div>

            <button
              className="yaml-pagination-btn"
              disabled={page === totalPages || totalPages === 0}
              onClick={() => {
                setPage(p => p + 1);
                setPageInput(String(page + 1));
              }}
              title="Nächste Seite"
            >
              <FiChevronRight />
            </button>
            <button
              className="yaml-pagination-btn"
              disabled={page === totalPages || totalPages === 0}
              onClick={() => {
                setPage(totalPages);
                setPageInput(String(totalPages));
              }}
              title="Letzte Seite"
            >
              <FiChevronsRight />
            </button>
          </div>

          <div className="yaml-pagination-size">
            <label>Zeilen pro Seite:</label>
            <select
              value={pageSize}
              onChange={e => {
                const newSize = parseInt(e.target.value, 10);
                setPageSize(newSize);
                setPage(1);
                setPageInput('1');
              }}
            >
              {PAGE_SIZE_OPTIONS.map(size => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Add Field Modal */}
        <AddFieldModal
          isOpen={showAddField}
          onClose={() => setShowAddField(false)}
          tableSlug={tableSlug}
          onFieldAdded={loadTable}
        />

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

        {/* Cell Context Menu */}
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
              if (rows[row] && fields[col]) {
                handleCellSave(rows[row]._id, fields[col].slug, null);
              }
              setContextMenu(null);
            }}
            onInsertRowAbove={() => {
              handleInsertRow('above');
              setContextMenu(null);
            }}
            onInsertRowBelow={() => {
              handleInsertRow('below');
              setContextMenu(null);
            }}
            hasClipboard={!!clipboard?.value}
          />
        )}
      </div>
      {ConfirmDialog}
    </div>
  );
}

export default DataTableEditor;
