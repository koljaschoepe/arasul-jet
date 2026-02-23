/**
 * DataTableEditor - Full-screen modal editor for Datentabellen (PostgreSQL)
 * Excel-like interface with keyboard navigation
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  FiColumns,
  FiMoreVertical,
  FiCornerUpLeft,
  FiCornerUpRight,
  FiChevronsLeft,
  FiChevronsRight,
  FiChevronLeft,
  FiChevronRight,
  FiUpload,
  FiDatabase,
} from 'react-icons/fi';
import { API_BASE, getAuthHeaders } from '../config/api';
import { useToast } from '../contexts/ToastContext';
import useConfirm from '../hooks/useConfirm';
import './Database/Database.css';
import { MAX_UNDO_HISTORY, PAGE_SIZE_OPTIONS } from './DataTable/constants';
import AddFieldModal from './DataTable/AddFieldModal';
import CellEditor from './DataTable/CellEditor';
import ColumnMenu from './DataTable/ColumnMenu';
import CellContextMenu from './DataTable/CellContextMenu';

/**
 * DataTableEditor - Main editor component
 */
function DataTableEditor({ tableSlug, tableName, onClose, onSave }) {
  const toast = useToast();
  const { confirm: showConfirm, ConfirmDialog } = useConfirm();
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
      const params = new URLSearchParams({
        page,
        limit: pageSize,
        sort: sortField,
        order: sortOrder,
      });
      const [tableData, rowsData] = await Promise.all([
        fetch(`${API_BASE}/v1/datentabellen/tables/${tableSlug}`, {
          headers: getAuthHeaders(),
        }).then(r => r.json()),
        fetch(`${API_BASE}/v1/datentabellen/tables/${tableSlug}/rows?${params}`, {
          headers: getAuthHeaders(),
        }).then(r => r.json()),
      ]);

      setTable(tableData.data);
      setFields(tableData.data.fields || []);
      setRows(rowsData.data || []);
      setTotalPages(rowsData.meta?.pages || 1);
      setTotalRows(rowsData.meta?.total || 0);
      setError(null);
    } catch (err) {
      setError(err.message || 'Fehler beim Laden');
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
      const exportParams = new URLSearchParams({
        page: 1,
        limit: 10000,
        sort: sortField,
        order: sortOrder,
      });
      const response = await fetch(
        `${API_BASE}/v1/datentabellen/tables/${tableSlug}/rows?${exportParams}`,
        { headers: getAuthHeaders() }
      );
      const data = await response.json();
      const allRows = data.data || [];

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
              await fetch(`${API_BASE}/v1/datentabellen/tables/${tableSlug}/rows`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify(rowData),
              });
              importedCount++;
            }
          }

          await loadTable();
          setSaveStatus('success');
          setError(null);
          toast.success(`${importedCount} Zeilen importiert`);
        } catch (err) {
          setError('Import fehlgeschlagen: ' + err.message);
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
        const response = await fetch(
          `${API_BASE}/v1/datentabellen/tables/${tableSlug}/index/status`,
          { headers: getAuthHeaders() }
        );
        const data = await response.json();
        setIndexStatus(data.data);
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
      const response = await fetch(`${API_BASE}/v1/datentabellen/tables/${tableSlug}/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      });
      const data = await response.json();
      setIndexStatus({
        indexed_rows: data.indexed,
        total_rows: totalRows,
        is_indexed: true,
        is_complete: true,
      });
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      setError('Indexierung fehlgeschlagen: ' + err.message);
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
      await fetch(`${API_BASE}/v1/datentabellen/tables/${tableSlug}/rows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({}),
      });
      await loadTable();
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      setSaveStatus('error');
      setError(err.message || 'Fehler beim Hinzufügen');
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
      const response = await fetch(
        `${API_BASE}/v1/datentabellen/tables/${tableSlug}/rows/${rowId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            [fieldSlug]: value,
            _expected_updated_at: expectedUpdatedAt,
          }),
        }
      );
      const responseData = await response.json();

      // Handle conflict error (409)
      if (!response.ok) {
        if (response.status === 409) {
          setError(
            'Konflikt: Ein anderer Benutzer hat diesen Datensatz geändert. Daten werden neu geladen.'
          );
          setSaveStatus('error');
          setUndoStack([]);
          setRedoStack([]);
          await loadTable();
          return;
        }
        throw new Error(responseData.error || 'Fehler beim Speichern');
      }

      // Update local state with new _updated_at from server
      const updatedRow = responseData.data;
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
      setSaveStatus('error');
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
      await fetch(`${API_BASE}/v1/datentabellen/tables/${tableSlug}/rows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({}),
      });
      await loadTable();
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      setSaveStatus('error');
      setError(err.message || 'Fehler beim Hinzufügen');
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
    if (!(await showConfirm({ message: `${selectedRows.size} Zeile(n) wirklich löschen?` })))
      return;

    try {
      setSaving(true);
      await fetch(`${API_BASE}/v1/datentabellen/tables/${tableSlug}/rows/bulk`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ ids: Array.from(selectedRows) }),
      });
      setSelectedRows(new Set());
      await loadTable();
      setSaveStatus('success');
    } catch (err) {
      setSaveStatus('error');
      setError(err.message || 'Fehler beim Löschen');
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
                      <button
                        className="yaml-th-name"
                        onClick={() => handleSort(field.slug)}
                        aria-label={`Sortiere nach ${field.name}${sortField === field.slug ? (sortOrder === 'asc' ? ', aufsteigend' : ', absteigend') : ''}`}
                      >
                        {field.name}
                        {sortField === field.slug &&
                          (sortOrder === 'asc' ? (
                            <FiChevronUp aria-hidden="true" />
                          ) : (
                            <FiChevronDown aria-hidden="true" />
                          ))}
                      </button>
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
