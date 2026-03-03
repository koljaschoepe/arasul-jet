/**
 * ExcelEditor - Fullscreen Excel-like editor for Datentabellen (PostgreSQL)
 * Features: Virtualized rows (10k+), 3-line column headers (letter/name/type+unit),
 * row numbers, ghost row, keyboard navigation, clipboard, undo/redo, column resize
 */

import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import {
  FiX,
  FiPlus,
  FiTrash2,
  FiDownload,
  FiUpload,
  FiRefreshCw,
  FiCheck,
  FiAlertCircle,
  FiChevronUp,
  FiChevronDown,
  FiMoreVertical,
  FiEdit2,
  FiType,
  FiHash,
  FiCopy,
  FiClipboard,
  FiScissors,
  FiCornerUpLeft,
  FiCornerUpRight,
  FiArrowLeft,
} from 'react-icons/fi';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import useConfirm from '../../hooks/useConfirm';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import GridCellEditor from '../../components/editor/GridEditor/CellEditor';
import { FIELD_TYPES, formatValue } from '../../components/editor/GridEditor/FieldTypes';
import useExcelClipboard from './useExcelClipboard';
import useExcelHistory from './useExcelHistory';
import useExcelKeyboard from './useExcelKeyboard';
import useVirtualScroll from './useVirtualScroll';
import '../database/Database.css';

// --- Constants ---

const ROW_HEIGHT = 32;

const FIELD_LABELS = Object.fromEntries(FIELD_TYPES.map(t => [t.value, t.label]));

/** Convert 0-based index to column letter: 0→A, 1→B, ..., 25→Z, 26→AA */
function getColumnLetter(index) {
  let result = '';
  let i = index;
  while (i >= 0) {
    result = String.fromCharCode(65 + (i % 26)) + result;
    i = Math.floor(i / 26) - 1;
  }
  return result;
}

/** Format cell value for display (delegates to FieldTypes.formatValue, but returns '' for empty) */
function formatCellValue(value, fieldType) {
  if (value === null || value === undefined || value === '') return '';
  return formatValue(value, fieldType);
}

// --- InlineColumnCreator ---

const InlineColumnCreator = memo(function InlineColumnCreator({ tableSlug, onColumnAdded }) {
  const api = useApi();
  const [mode, setMode] = useState('button'); // 'button' | 'name' | 'type' | 'unit'
  const [name, setName] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [unit, setUnit] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const typeRef = useRef(null);
  const unitRef = useRef(null);

  useEffect(() => {
    if (mode === 'name' && inputRef.current) inputRef.current.focus();
    if (mode === 'type' && typeRef.current) typeRef.current.focus();
    if (mode === 'unit' && unitRef.current) unitRef.current.focus();
  }, [mode]);

  const resetState = () => {
    setMode('button');
    setName('');
    setSelectedType('');
    setUnit('');
    setError(null);
  };

  const handleNameSubmit = e => {
    e?.preventDefault();
    if (!name.trim()) {
      resetState();
      return;
    }
    setMode('type');
  };

  const handleTypeSelect = type => {
    setSelectedType(type);
    setMode('unit');
  };

  const handleCreateColumn = async unitValue => {
    setLoading(true);
    setError(null);
    try {
      await api.post(
        `/v1/datentabellen/tables/${tableSlug}/fields`,
        {
          name: name.trim(),
          field_type: selectedType,
          unit: unitValue || undefined,
          is_required: false,
          is_unique: false,
        },
        { showError: false }
      );
      onColumnAdded();
      resetState();
    } catch (err) {
      setError(err.data?.error || err.message);
      setMode('name');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = e => {
    if (e.key === 'Escape') resetState();
    else if (e.key === 'Enter' && mode === 'name') handleNameSubmit();
    else if (e.key === 'Enter' && mode === 'unit') handleCreateColumn(unit.trim());
  };

  if (mode === 'button') {
    return (
      <div className="excel-col-add">
        <button
          type="button"
          className="excel-add-column-btn"
          onClick={() => setMode('name')}
          title="Neue Spalte hinzufügen"
        >
          <FiPlus />
        </button>
      </div>
    );
  }

  if (mode === 'name') {
    return (
      <div className="excel-col-add excel-col-add-input">
        <div className="excel-inline-input">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (!name.trim()) resetState();
            }}
            placeholder="Spaltenname..."
            className="excel-column-name-input"
          />
          {error && <span className="excel-inline-error">{error}</span>}
        </div>
      </div>
    );
  }

  if (mode === 'type') {
    return (
      <div className="excel-col-add excel-col-add-input">
        <div className="excel-type-selector">
          <span className="excel-type-label">{name}</span>
          <select
            ref={typeRef}
            onChange={e => e.target.value && handleTypeSelect(e.target.value)}
            onBlur={resetState}
            onKeyDown={e => {
              if (e.key === 'Escape') resetState();
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
      </div>
    );
  }

  // mode === 'unit'
  return (
    <div className="excel-col-add excel-col-add-input">
      <div className="excel-unit-input">
        <span className="excel-type-label">
          {name} ({FIELD_LABELS[selectedType]})
        </span>
        <input
          ref={unitRef}
          type="text"
          value={unit}
          onChange={e => setUnit(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Einheit (z.B. kg, €, m)"
          className="excel-column-name-input"
        />
        <div className="excel-unit-actions">
          <button
            type="button"
            className="excel-btn excel-btn-small"
            onClick={() => handleCreateColumn(null)}
            disabled={loading}
          >
            Überspringen
          </button>
          <button
            type="button"
            className="excel-btn excel-btn-small excel-btn-primary"
            onClick={() => handleCreateColumn(unit.trim())}
            disabled={loading}
          >
            {loading ? '...' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
});

// --- ColumnMenu ---

const ColumnMenu = memo(function ColumnMenu({
  field,
  tableSlug,
  onClose,
  onFieldUpdated,
  position,
}) {
  const api = useApi();
  const { confirm: showConfirm, ConfirmDialog: ColumnConfirmDialog } = useConfirm();
  const [mode, setMode] = useState('menu'); // 'menu' | 'rename' | 'type' | 'unit'
  const [newName, setNewName] = useState(field.name);
  const [newType, setNewType] = useState(field.field_type);
  const [newUnit, setNewUnit] = useState(field.unit || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if ((mode === 'rename' || mode === 'unit') && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [mode]);

  useEffect(() => {
    const handleClickOutside = e => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handlePatch = async body => {
    setLoading(true);
    try {
      await api.patch(`/v1/datentabellen/tables/${tableSlug}/fields/${field.slug}`, body, {
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

  const handleRename = () => {
    if (!newName.trim() || newName === field.name) {
      onClose();
      return;
    }
    handlePatch({ name: newName.trim() });
  };

  const handleTypeChange = () => {
    if (newType === field.field_type) {
      onClose();
      return;
    }
    handlePatch({ field_type: newType });
  };

  const handleUnitChange = () => {
    const trimmed = newUnit.trim();
    if (trimmed === (field.unit || '')) {
      onClose();
      return;
    }
    handlePatch({ unit: trimmed || null });
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
          <button type="button" className="excel-menu-item" onClick={() => setMode('unit')}>
            <FiHash /> Einheit ändern
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

      {mode === 'unit' && (
        <div className="excel-menu-form">
          <input
            ref={inputRef}
            type="text"
            value={newUnit}
            onChange={e => setNewUnit(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleUnitChange()}
            placeholder="Einheit (z.B. kg, €, m)"
          />
          <div className="excel-menu-actions">
            <button type="button" onClick={() => setMode('menu')}>
              Zurück
            </button>
            <button type="button" className="primary" onClick={handleUnitChange} disabled={loading}>
              {loading ? '...' : 'Speichern'}
            </button>
          </div>
        </div>
      )}
      <ColumnConfirmDialog />
    </div>
  );
});

// --- CellContextMenu ---

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

// --- ExcelEditor ---

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

  // Editing state
  const [editingCell, setEditingCell] = useState(null);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [activeCell, setActiveCell] = useState({ row: 0, col: 0 });

  // Sorting (client-side)
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
  const bodyRef = useRef(null);
  const headerScrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const handleCellSaveRef = useRef(null);

  // History (undo/redo)
  const { undoStack, redoStack, pushUndo, clearStacks, handleUndo, handleRedo } =
    useExcelHistory(handleCellSaveRef);

  // --- Data loading (single fetch, no pagination) ---

  const loadTable = useCallback(async () => {
    try {
      setLoading(true);
      const [tableData, rowsData] = await Promise.all([
        api.get(`/v1/datentabellen/tables/${tableSlug}`, { showError: false }),
        api.get(
          `/v1/datentabellen/tables/${tableSlug}/rows?limit=10000&sort=_created_at&order=desc`,
          { showError: false }
        ),
      ]);
      setTable(tableData.data);
      setFields(tableData.data.fields || []);
      setRows(rowsData.data || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tableSlug]);

  useEffect(() => {
    loadTable();
  }, [loadTable]);

  // --- Client-side sorting ---

  const sortedRows = useMemo(() => {
    if (!rows.length) return rows;
    return [...rows].sort((a, b) => {
      const va = a[sortField];
      const vb = b[sortField];
      if (va == null) return 1;
      if (vb == null) return -1;
      let cmp;
      if (typeof va === 'string' && typeof vb === 'string') {
        cmp = va.localeCompare(vb, 'de');
      } else {
        cmp = Number(va) - Number(vb);
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortField, sortOrder]);

  // Display rows = sorted data + ghost row
  const displayRows = useMemo(() => {
    const ghostRow = {
      _id: '__ghost__',
      _isGhost: true,
      ...fields.reduce((acc, f) => ({ ...acc, [f.slug]: '' }), {}),
    };
    return [...sortedRows, ghostRow];
  }, [sortedRows, fields]);

  // --- Virtualization ---

  const { startIndex, endIndex, totalHeight, offsetTop, onScroll, scrollToRow } = useVirtualScroll(
    displayRows.length,
    bodyRef,
    ROW_HEIGHT
  );

  const visibleRows = displayRows.slice(startIndex, endIndex + 1);

  // Sync horizontal scroll between header and body
  const handleBodyScroll = useCallback(
    e => {
      if (headerScrollRef.current) {
        headerScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
      }
      onScroll(e);
    },
    [onScroll]
  );

  // --- Cell navigation ---

  const moveToCell = useCallback(
    direction => {
      const { row, col } = activeCell;
      const numCols = fields.length;
      const numRows = displayRows.length;
      let newRow = row,
        newCol = col;

      if (direction === 'next') {
        if (col < numCols - 1) newCol = col + 1;
        else if (row < numRows - 1) {
          newRow = row + 1;
          newCol = 0;
        }
      } else if (direction === 'prev') {
        if (col > 0) newCol = col - 1;
        else if (row > 0) {
          newRow = row - 1;
          newCol = numCols - 1;
        }
      }

      if (newRow !== row || newCol !== col) {
        setActiveCell({ row: newRow, col: newCol });
        scrollToRow(newRow);
      }
    },
    [activeCell, fields.length, displayRows.length, scrollToRow]
  );

  // --- Ghost row handling ---

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
        setRows(prev => [...prev, data.data]);
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

  // --- Cell save ---

  const handleCellSave = useCallback(
    async (rowId, fieldSlug, value, direction, skipUndo = false) => {
      setEditingCell(null);

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
            { [fieldSlug]: value, _expected_updated_at: oldRow?._updated_at },
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
      } catch {
        await loadTable();
        setSaveStatus('error');
      } finally {
        setSaving(false);
      }
    },
    [rows, tableSlug, loadTable, handleGhostRowEdit, moveToCell, pushUndo, clearStacks]
  );

  handleCellSaveRef.current = handleCellSave;

  // --- Clipboard ---

  const { clipboard, handleCopy, handleCut, handlePaste } = useExcelClipboard({
    activeCell,
    displayRows,
    fields,
    handleCellSave,
    setSaveStatus,
  });

  // --- Add row ---

  const handleAddRow = async () => {
    try {
      setSaving(true);
      const data = await api.post(
        `/v1/datentabellen/tables/${tableSlug}/rows`,
        {},
        { showError: false }
      );
      setRows(prev => [...prev, data.data]);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      setError(err.message);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  // --- Delete selected rows ---

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

  // --- Export CSV (uses in-memory rows) ---

  const handleExportCSV = useCallback(() => {
    if (rows.length === 0) return;

    const headers = fields.map(f => `"${f.name.replace(/"/g, '""')}"`).join(';');
    const csvRows = rows.map(row =>
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

    toast.success('CSV exportiert');
  }, [rows, fields, table, toast]);

  // --- Import CSV ---

  const handleImportCSV = useCallback(
    async e => {
      const file = e.target.files?.[0];
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (!file) return;

      try {
        const text = await file.text();
        const lines = text
          .replace(/^\uFEFF/, '')
          .split(/\r?\n/)
          .filter(l => l.trim());
        if (lines.length < 2) {
          toast.error('CSV-Datei muss mindestens eine Kopfzeile und eine Datenzeile enthalten');
          return;
        }

        // Auto-detect delimiter (semicolon vs comma)
        const delimiter = lines[0].includes(';') ? ';' : ',';

        const parseCSVLine = line => {
          const values = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQuotes) {
              if (ch === '"' && line[i + 1] === '"') {
                current += '"';
                i++;
              } else if (ch === '"') {
                inQuotes = false;
              } else {
                current += ch;
              }
            } else if (ch === '"') {
              inQuotes = true;
            } else if (ch === delimiter) {
              values.push(current.trim());
              current = '';
            } else {
              current += ch;
            }
          }
          values.push(current.trim());
          return values;
        };

        const csvHeaders = parseCSVLine(lines[0]);

        // Map CSV headers to field slugs
        const fieldMap = csvHeaders.map(header => {
          const normalized = header.toLowerCase().trim();
          return fields.find(f => f.name.toLowerCase() === normalized || f.slug === normalized);
        });

        const mappedCount = fieldMap.filter(Boolean).length;
        if (mappedCount === 0) {
          toast.error(
            'Keine passenden Spalten gefunden. Header müssen Spalten-Namen oder -Slugs entsprechen.'
          );
          return;
        }

        // Parse data rows
        const importRows = [];
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          const rowData = {};
          let hasData = false;
          values.forEach((val, idx) => {
            const field = fieldMap[idx];
            if (field && val !== '') {
              rowData[field.slug] = val;
              hasData = true;
            }
          });
          if (hasData) importRows.push(rowData);
        }

        if (importRows.length === 0) {
          toast.error('Keine importierbaren Daten gefunden');
          return;
        }

        // Bulk import in batches of 1000
        setSaving(true);
        let totalInserted = 0;
        for (let i = 0; i < importRows.length; i += 1000) {
          const batch = importRows.slice(i, i + 1000);
          const result = await api.post(
            `/v1/datentabellen/tables/${tableSlug}/rows/bulk`,
            { rows: batch },
            { showError: false }
          );
          totalInserted += result.data?.inserted || 0;
        }

        await loadTable();
        toast.success(`${totalInserted} Zeile(n) importiert`);
        setSaveStatus('success');
        setTimeout(() => setSaveStatus(null), 2000);
      } catch (err) {
        toast.error(`Import fehlgeschlagen: ${err.message}`);
        setSaveStatus('error');
      } finally {
        setSaving(false);
      }
    },
    [fields, tableSlug, loadTable, toast]
  );

  // --- Sorting ---

  const handleSort = useCallback(
    fieldSlug => {
      if (sortField === fieldSlug) {
        setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(fieldSlug);
        setSortOrder('asc');
      }
      setActiveCell({ row: 0, col: 0 });
    },
    [sortField]
  );

  // --- Row selection ---

  const toggleRowSelection = useCallback(rowId => {
    if (rowId === '__ghost__') return;
    setSelectedRows(prev => {
      const next = new Set(prev);
      next.has(rowId) ? next.delete(rowId) : next.add(rowId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedRows(prev => {
      if (prev.size === rows.length && rows.length > 0) return new Set();
      return new Set(rows.map(r => r._id));
    });
  }, [rows]);

  // --- Keyboard navigation ---

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
    scrollToRow,
  });

  // --- Column resize ---

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

  // --- Context menu ---

  const handleContextMenu = useCallback((e, rowIdx, colIdx) => {
    e.preventDefault();
    setActiveCell({ row: rowIdx, col: colIdx });
    setContextMenu({ position: { x: e.clientX, y: e.clientY }, rowIdx, colIdx });
  }, []);

  // --- Render ---

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
              {rows.length} Zeilen, {fields.length} Spalten
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
            onClick={() => fileInputRef.current?.click()}
            disabled={saving || fields.length === 0}
          >
            <FiUpload /> Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            style={{ display: 'none' }}
            onChange={handleImportCSV}
          />
          <button
            type="button"
            className="excel-btn"
            onClick={handleExportCSV}
            disabled={saving || rows.length === 0}
          >
            <FiDownload /> Export
          </button>

          <div className="excel-toolbar-spacer" />

          <button type="button" className="excel-btn" onClick={loadTable} disabled={loading}>
            <FiRefreshCw className={loading ? 'spin' : ''} /> Aktualisieren
          </button>
        </div>

        {/* Grid */}
        <div className="excel-grid-wrapper" ref={tableRef} tabIndex={0}>
          {/* Fixed header (synced horizontal scroll) */}
          <div className="excel-header-scroll" ref={headerScrollRef}>
            <div className="excel-header-row">
              <div
                className="excel-row-number-header"
                onClick={toggleSelectAll}
                title="Alle auswählen"
              >
                #
              </div>
              {fields.map((field, idx) => (
                <div
                  key={field.slug}
                  className={`excel-col-header ${resizingColumn?.fieldSlug === field.slug ? 'excel-col-resizing' : ''}`}
                  style={{ width: columnWidths[field.slug] || 150 }}
                >
                  <div className="excel-col-letter">{getColumnLetter(idx)}</div>
                  <div className="excel-col-name" onClick={() => handleSort(field.slug)}>
                    {field.name}
                    {sortField === field.slug &&
                      (sortOrder === 'asc' ? <FiChevronUp /> : <FiChevronDown />)}
                  </div>
                  <div className="excel-col-meta">
                    {FIELD_LABELS[field.field_type] || field.field_type}
                    {field.unit ? ` | ${field.unit}` : ''}
                  </div>
                  <button
                    type="button"
                    className="excel-col-menu-btn"
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
                  <div
                    className="excel-col-resize"
                    onMouseDown={e =>
                      handleResizeStart(e, field.slug, columnWidths[field.slug] || 150)
                    }
                  />
                </div>
              ))}
              <InlineColumnCreator tableSlug={tableSlug} onColumnAdded={loadTable} />
            </div>
          </div>

          {/* Virtualized body */}
          <div className="excel-body" ref={bodyRef} onScroll={handleBodyScroll}>
            <div className="excel-grid-body" style={{ height: totalHeight }}>
              <div
                className="excel-rows-container"
                style={{ transform: `translateY(${offsetTop}px)` }}
              >
                {visibleRows.map((row, i) => {
                  const rowIdx = startIndex + i;
                  const isGhost = row._isGhost;
                  const isRowSelected = selectedRows.has(row._id);

                  return (
                    <div
                      key={row._id}
                      className={`excel-row ${isRowSelected ? 'excel-row-selected' : ''} ${isGhost ? 'excel-row-ghost' : ''}`}
                      style={{ height: ROW_HEIGHT }}
                    >
                      <div
                        className={`excel-row-number ${isRowSelected ? 'selected' : ''}`}
                        onClick={() => toggleRowSelection(row._id)}
                      >
                        {isGhost ? <FiPlus /> : rowIdx + 1}
                      </div>
                      {fields.map((field, colIdx) => {
                        const isEditing =
                          editingCell?.rowId === row._id && editingCell?.fieldSlug === field.slug;
                        const isActive = activeCell.row === rowIdx && activeCell.col === colIdx;

                        return (
                          <div
                            key={field.slug}
                            className={`excel-cell ${isActive ? 'excel-cell-active' : ''} ${isGhost ? 'excel-cell-ghost' : ''}`}
                            style={{ width: columnWidths[field.slug] || 150 }}
                            onClick={() => {
                              setActiveCell({ row: rowIdx, col: colIdx });
                              if (!isEditing) {
                                setEditingCell({ rowId: row._id, fieldSlug: field.slug });
                              }
                            }}
                            onContextMenu={e => !isGhost && handleContextMenu(e, rowIdx, colIdx)}
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
                                {isGhost ? '' : formatCellValue(row[field.slug], field.field_type)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                      <div className="excel-cell excel-cell-empty" />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Statusbar */}
        <div className="excel-statusbar">
          <span>{rows.length} Zeilen</span>
          <span>{fields.length} Spalten</span>
          {selectedRows.size > 0 && <span>{selectedRows.size} ausgewählt</span>}
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
      </div>
      {ConfirmDialog}
    </div>
  );
}

export default ExcelEditor;
