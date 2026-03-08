/**
 * ExcelEditor - Fullscreen Excel-like editor for Datentabellen (PostgreSQL)
 * Features: Virtualized rows (10k+), 3-line column headers (letter/name/type+unit),
 * row numbers, ghost row, keyboard navigation, clipboard, undo/redo, column resize
 */

import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  Download,
  Upload,
  RefreshCw,
  Check,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  MoreVertical,
  Pencil,
  Type,
  Hash,
  Copy,
  ClipboardPaste,
  Scissors,
  Undo2,
  Redo2,
  ArrowLeft,
} from 'lucide-react';
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
import { cn } from '@/lib/utils';
import './datentabellen.css';

// --- Types ---

interface Field {
  slug: string;
  name: string;
  field_type: string;
  unit?: string;
  options?: any;
}

interface TableData {
  name: string;
  description?: string;
  fields: Field[];
}

interface Row {
  _id: string;
  _isGhost?: boolean;
  _created_at?: string;
  _updated_at?: string;
  [key: string]: any;
}

interface CellPosition {
  row: number;
  col: number;
}

interface ColumnMenuState {
  field: Field;
  position: { top: number; left: number };
}

interface ContextMenuState {
  position: { x: number; y: number };
  rowIdx: number;
  colIdx: number;
}

interface ExcelEditorProps {
  tableSlug: string;
  tableName?: string;
  onClose: () => void;
}

// --- Constants ---

const ROW_HEIGHT = 32;

const FIELD_LABELS = Object.fromEntries(
  (FIELD_TYPES as Array<{ value: string; label: string }>).map(t => [t.value, t.label])
);

// Reusable button class strings
const btnBase =
  'inline-flex items-center gap-1.5 py-2 px-3 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-md text-[var(--text-secondary)] text-sm cursor-pointer transition-all hover:border-[var(--primary-color)] hover:text-[var(--primary-color)] disabled:opacity-40 disabled:cursor-not-allowed';

const btnPrimary =
  'inline-flex items-center gap-1.5 py-2 px-3 bg-[var(--primary-color)] border border-[var(--primary-color)] rounded-md text-[var(--text-on-primary)] text-sm cursor-pointer transition-all hover:bg-[var(--primary-hover)] hover:border-[var(--primary-hover)] disabled:opacity-40 disabled:cursor-not-allowed';

const btnDanger =
  'inline-flex items-center gap-1.5 py-2 px-3 bg-[var(--danger-alpha-10)] border border-[var(--danger-alpha-30)] rounded-md text-[var(--status-error)] text-sm cursor-pointer transition-all hover:bg-[var(--danger-alpha-20)] hover:border-[var(--status-error)] disabled:opacity-40 disabled:cursor-not-allowed';

const btnIconOnly =
  'inline-flex items-center gap-1.5 p-2 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-md text-[var(--text-secondary)] text-sm cursor-pointer transition-all hover:border-[var(--primary-color)] hover:text-[var(--primary-color)] disabled:opacity-40 disabled:cursor-not-allowed';

const menuItem =
  'flex items-center gap-2 w-full py-2 px-3 bg-transparent border-none rounded-md text-[var(--text-secondary)] text-sm cursor-pointer text-left transition-all hover:bg-[var(--primary-alpha-10)] hover:text-[var(--text-primary)]';

const menuFormInputCls =
  'w-full p-2 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-md text-[var(--text-primary)] text-sm mb-2 outline-none focus:border-[var(--primary-color)]';

const columnNameInputCls =
  'w-[120px] py-1.5 px-2 bg-[var(--bg-dark)] border border-[var(--primary-color)] rounded text-[var(--text-primary)] text-xs outline-none';

// --- Helpers ---

/** Convert 0-based index to column letter: 0→A, 1→B, ..., 25→Z, 26→AA */
function getColumnLetter(index: number): string {
  let result = '';
  let i = index;
  while (i >= 0) {
    result = String.fromCharCode(65 + (i % 26)) + result;
    i = Math.floor(i / 26) - 1;
  }
  return result;
}

/** Format cell value for display */
function formatCellValue(value: any, fieldType: string): string {
  if (value === null || value === undefined || value === '') return '';
  return formatValue(value, fieldType);
}

// --- InlineColumnCreator ---

const InlineColumnCreator = memo(function InlineColumnCreator({
  tableSlug,
  onColumnAdded,
}: {
  tableSlug: string;
  onColumnAdded: () => void;
}) {
  const api = useApi();
  const [mode, setMode] = useState<'button' | 'name' | 'type' | 'unit'>('button');
  const [name, setName] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [unit, setUnit] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef<HTMLSelectElement>(null);
  const unitRef = useRef<HTMLInputElement>(null);

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

  const handleNameSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) {
      resetState();
      return;
    }
    setMode('type');
  };

  const handleTypeSelect = (type: string) => {
    setSelectedType(type);
    setMode('unit');
  };

  const handleCreateColumn = async (unitValue: string | null) => {
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
    } catch (err: any) {
      setError(err.data?.error || err.message);
      setMode('name');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') resetState();
    else if (e.key === 'Enter' && mode === 'name') handleNameSubmit();
    else if (e.key === 'Enter' && mode === 'unit') handleCreateColumn(unit.trim());
  };

  if (mode === 'button') {
    return (
      <div className="w-10 min-w-10 flex items-center justify-center shrink-0">
        <button
          type="button"
          className="flex items-center justify-center w-full h-full bg-transparent border-none text-[var(--text-disabled)] cursor-pointer transition-all hover:text-[var(--primary-color)] hover:bg-[var(--primary-alpha-10)]"
          onClick={() => setMode('name')}
          title="Neue Spalte hinzufügen"
        >
          <Plus className="size-4" />
        </button>
      </div>
    );
  }

  if (mode === 'name') {
    return (
      <div className="w-auto min-w-[140px] flex items-center justify-center shrink-0 py-1 px-2">
        <div className="flex flex-col gap-1">
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
            className={columnNameInputCls}
          />
          {error && <span className="text-[0.625rem] text-[var(--status-error)]">{error}</span>}
        </div>
      </div>
    );
  }

  if (mode === 'type') {
    return (
      <div className="w-auto min-w-[140px] flex items-center justify-center shrink-0 py-1 px-2">
        <div className="flex flex-col gap-1">
          <span className="text-[0.625rem] text-[var(--text-muted)] whitespace-nowrap overflow-hidden text-ellipsis">
            {name}
          </span>
          <select
            ref={typeRef}
            onChange={e => e.target.value && handleTypeSelect(e.target.value)}
            onBlur={resetState}
            onKeyDown={e => {
              if (e.key === 'Escape') resetState();
            }}
            disabled={loading}
            className="w-[120px] py-1.5 px-2 bg-[var(--bg-dark)] border border-[var(--primary-color)] rounded text-[var(--text-primary)] text-xs cursor-pointer"
          >
            <option value="">Typ wählen...</option>
            {(FIELD_TYPES as Array<{ value: string; label: string; icon?: string }>).map(t => (
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
    <div className="w-auto min-w-[140px] flex items-center justify-center shrink-0 py-1 px-2">
      <div className="flex flex-col gap-1">
        <span className="text-[0.625rem] text-[var(--text-muted)] whitespace-nowrap overflow-hidden text-ellipsis">
          {name} ({FIELD_LABELS[selectedType]})
        </span>
        <input
          ref={unitRef}
          type="text"
          value={unit}
          onChange={e => setUnit(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Einheit (z.B. kg, €, m)"
          className={columnNameInputCls}
        />
        <div className="flex gap-1">
          <button
            type="button"
            className="inline-flex items-center gap-1 py-1 px-2 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded text-[var(--text-secondary)] text-[0.6875rem] cursor-pointer"
            onClick={() => handleCreateColumn(null)}
            disabled={loading}
          >
            Überspringen
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 py-1 px-2 bg-[var(--primary-color)] border border-[var(--primary-color)] rounded text-[var(--text-on-primary)] text-[0.6875rem] cursor-pointer"
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
}: {
  field: Field;
  tableSlug: string;
  onClose: () => void;
  onFieldUpdated: () => void;
  position: { top: number; left: number };
}) {
  const api = useApi();
  const { confirm: showConfirm, ConfirmDialog: ColumnConfirmDialog } = useConfirm();
  const [mode, setMode] = useState<'menu' | 'rename' | 'type' | 'unit'>('menu');
  const [newName, setNewName] = useState(field.name);
  const [newType, setNewType] = useState(field.field_type);
  const [newUnit, setNewUnit] = useState(field.unit || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if ((mode === 'rename' || mode === 'unit') && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [mode]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handlePatch = async (body: Record<string, any>) => {
    setLoading(true);
    try {
      await api.patch(`/v1/datentabellen/tables/${tableSlug}/fields/${field.slug}`, body, {
        showError: false,
      });
      onFieldUpdated();
      onClose();
    } catch (err: any) {
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
    } catch (err: any) {
      setError(err.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg shadow-lg z-[var(--z-dropdown)] min-w-40 p-1.5"
      ref={menuRef}
      style={{ top: position.top, left: position.left }}
    >
      {error && (
        <div className="py-2 px-3 bg-[var(--danger-alpha-10)] rounded-md text-[var(--status-error)] text-xs mb-1.5">
          {error}
        </div>
      )}

      {mode === 'menu' && (
        <>
          <button type="button" className={menuItem} onClick={() => setMode('rename')}>
            <Pencil className="size-3.5" /> Umbenennen
          </button>
          <button type="button" className={menuItem} onClick={() => setMode('type')}>
            <Type className="size-3.5" /> Typ ändern
          </button>
          <button type="button" className={menuItem} onClick={() => setMode('unit')}>
            <Hash className="size-3.5" /> Einheit ändern
          </button>
          <div className="h-px bg-[var(--border-color)] my-1.5" />
          <button
            type="button"
            className={cn(
              menuItem,
              'text-[var(--status-error)] hover:bg-[var(--danger-alpha-10)] hover:text-[var(--status-error)]'
            )}
            onClick={handleDelete}
          >
            <Trash2 className="size-3.5" /> Löschen
          </button>
        </>
      )}

      {mode === 'rename' && (
        <div className="py-2 px-3">
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRename()}
            placeholder="Neuer Name"
            className={menuFormInputCls}
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="py-1.5 px-3 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-md text-[var(--text-secondary)] text-xs cursor-pointer hover:opacity-80"
              onClick={() => setMode('menu')}
            >
              Zurück
            </button>
            <button
              type="button"
              className="py-1.5 px-3 bg-[var(--primary-color)] border border-[var(--primary-color)] rounded-md text-[var(--text-on-primary)] text-xs cursor-pointer hover:opacity-80"
              onClick={handleRename}
              disabled={loading}
            >
              {loading ? '...' : 'Speichern'}
            </button>
          </div>
        </div>
      )}

      {mode === 'type' && (
        <div className="py-2 px-3">
          <select
            value={newType}
            onChange={e => setNewType(e.target.value)}
            className={menuFormInputCls}
          >
            {(FIELD_TYPES as Array<{ value: string; label: string }>).map(t => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="py-1.5 px-3 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-md text-[var(--text-secondary)] text-xs cursor-pointer hover:opacity-80"
              onClick={() => setMode('menu')}
            >
              Zurück
            </button>
            <button
              type="button"
              className="py-1.5 px-3 bg-[var(--primary-color)] border border-[var(--primary-color)] rounded-md text-[var(--text-on-primary)] text-xs cursor-pointer hover:opacity-80"
              onClick={handleTypeChange}
              disabled={loading}
            >
              {loading ? '...' : 'Ändern'}
            </button>
          </div>
        </div>
      )}

      {mode === 'unit' && (
        <div className="py-2 px-3">
          <input
            ref={inputRef}
            type="text"
            value={newUnit}
            onChange={e => setNewUnit(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleUnitChange()}
            placeholder="Einheit (z.B. kg, €, m)"
            className={menuFormInputCls}
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="py-1.5 px-3 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-md text-[var(--text-secondary)] text-xs cursor-pointer hover:opacity-80"
              onClick={() => setMode('menu')}
            >
              Zurück
            </button>
            <button
              type="button"
              className="py-1.5 px-3 bg-[var(--primary-color)] border border-[var(--primary-color)] rounded-md text-[var(--text-on-primary)] text-xs cursor-pointer hover:opacity-80"
              onClick={handleUnitChange}
              disabled={loading}
            >
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
}: {
  position: { x: number; y: number };
  onClose: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onCut: () => void;
  onDelete: () => void;
  hasClipboard: boolean;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const ctxBtn =
    'flex items-center gap-2 w-full py-2 px-3 bg-transparent border-none rounded-md text-[var(--text-secondary)] text-sm cursor-pointer text-left transition-all hover:bg-[var(--primary-alpha-10)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div
      className="fixed bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg shadow-lg z-[var(--z-dropdown)] min-w-[180px] p-1.5"
      ref={menuRef}
      style={{ top: position.y, left: position.x }}
    >
      <button type="button" className={ctxBtn} onClick={onCopy}>
        <Copy className="size-3.5" /> Kopieren{' '}
        <span className="ml-auto text-[0.6875rem] text-[var(--text-disabled)]">Strg+C</span>
      </button>
      <button type="button" className={ctxBtn} onClick={onCut}>
        <Scissors className="size-3.5" /> Ausschneiden{' '}
        <span className="ml-auto text-[0.6875rem] text-[var(--text-disabled)]">Strg+X</span>
      </button>
      <button type="button" className={ctxBtn} onClick={onPaste} disabled={!hasClipboard}>
        <ClipboardPaste className="size-3.5" /> Einfügen{' '}
        <span className="ml-auto text-[0.6875rem] text-[var(--text-disabled)]">Strg+V</span>
      </button>
      <div className="h-px bg-[var(--border-color)] my-1.5" />
      <button type="button" className={ctxBtn} onClick={onDelete}>
        <Trash2 className="size-3.5" /> Löschen{' '}
        <span className="ml-auto text-[0.6875rem] text-[var(--text-disabled)]">Entf</span>
      </button>
    </div>
  );
});

// --- ExcelEditor ---

function ExcelEditor({ tableSlug, tableName, onClose }: ExcelEditorProps) {
  const api = useApi();
  const toast = useToast();
  const { confirm: showConfirm, ConfirmDialog } = useConfirm();

  // Table state
  const [table, setTable] = useState<TableData | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'success' | 'error' | null>(null);

  // Editing state
  const [editingCell, setEditingCell] = useState<{ rowId: string; fieldSlug: string } | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [activeCell, setActiveCell] = useState<CellPosition>({ row: 0, col: 0 });

  // Sorting (client-side)
  const [sortField, setSortField] = useState('_created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Column menu & context menu
  const [columnMenu, setColumnMenu] = useState<ColumnMenuState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Column widths
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [resizingColumn, setResizingColumn] = useState<{
    fieldSlug: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  // Refs
  const tableRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleCellSaveRef = useRef<any>(null);

  // History (undo/redo)
  const {
    undoStack,
    redoStack,
    pushUndo,
    clearStacks,
    handleUndo: rawUndo,
    handleRedo: rawRedo,
  } = useExcelHistory(handleCellSaveRef);

  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    await rawUndo();
    toast.info('Rückgängig gemacht');
  }, [rawUndo, undoStack.length, toast]);

  const handleRedo = useCallback(async () => {
    if (redoStack.length === 0) return;
    await rawRedo();
    toast.info('Wiederhergestellt');
  }, [rawRedo, redoStack.length, toast]);

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
    } catch (err: any) {
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
      let cmp: number;
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
    const ghostRow: Row = {
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
    (e: React.UIEvent<HTMLDivElement>) => {
      if (headerScrollRef.current) {
        headerScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
      }
      onScroll(e);
    },
    [onScroll]
  );

  // --- Cell navigation ---

  const moveToCell = useCallback(
    (direction: 'next' | 'prev') => {
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
    async (fieldSlug: string, value: any) => {
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
      } catch (err: any) {
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
    async (rowId: string, fieldSlug: string, value: any, direction?: string, skipUndo = false) => {
      setEditingCell(null);

      if (rowId === '__ghost__') {
        await handleGhostRowEdit(fieldSlug, value);
        return;
      }

      const oldRow = rows.find(r => r._id === rowId);
      const oldValue = oldRow?.[fieldSlug];
      if (oldValue === value) {
        if (direction) moveToCell(direction as 'next' | 'prev');
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
          .catch((err: any) => {
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
        if (direction) moveToCell(direction as 'next' | 'prev');
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
    } catch (err: any) {
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
    } catch (err: any) {
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
    async (e: React.ChangeEvent<HTMLInputElement>) => {
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

        const parseCSVLine = (line: string): string[] => {
          const values: string[] = [];
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
        const importRows: Record<string, any>[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          const rowData: Record<string, any> = {};
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
      } catch (err: any) {
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
    (fieldSlug: string) => {
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

  const toggleRowSelection = useCallback((rowId: string) => {
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

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, fieldSlug: string, currentWidth: number) => {
      e.preventDefault();
      setResizingColumn({ fieldSlug, startX: e.clientX, startWidth: currentWidth || 150 });
    },
    []
  );

  useEffect(() => {
    if (!resizingColumn) return;
    const handleMouseMove = (e: MouseEvent) => {
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

  const handleContextMenu = useCallback((e: React.MouseEvent, rowIdx: number, colIdx: number) => {
    e.preventDefault();
    setActiveCell({ row: rowIdx, col: colIdx });
    setContextMenu({ position: { x: e.clientX, y: e.clientY }, rowIdx, colIdx });
  }, []);

  // --- Render ---

  if (loading && !table) {
    return (
      <div className="excel-overlay fixed top-0 right-0 bottom-0 bg-black/70 flex items-center justify-center z-[var(--z-modal-backdrop)] p-8 pl-12">
        <div className="bg-[var(--bg-dark)] rounded-lg w-full max-w-[min(1600px,calc(100%-32px))] h-[90vh] flex flex-col overflow-hidden shadow-xl">
          <LoadingSpinner message="Tabelle wird geladen..." />
        </div>
      </div>
    );
  }

  return (
    <div className="excel-overlay fixed top-0 right-0 bottom-0 bg-black/70 flex items-center justify-center z-[var(--z-modal-backdrop)] p-8 pl-12">
      <div className="bg-[var(--bg-dark)] rounded-lg w-full max-w-[min(1600px,calc(100%-32px))] h-[90vh] flex flex-col overflow-hidden shadow-xl">
        {/* Header */}
        <header className="flex items-center justify-between py-3 px-6 bg-[var(--bg-card)] border-b border-[var(--border-color)] shrink-0">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="flex items-center justify-center w-9 h-9 bg-transparent border border-[var(--border-color)] rounded-lg text-[var(--text-muted)] cursor-pointer transition-all hover:text-[var(--primary-color)] hover:border-[var(--primary-color)]"
              onClick={onClose}
              title="Zurück"
            >
              <ArrowLeft className="size-4" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-[var(--text-primary)] m-0">
                {tableName || table?.name}
              </h1>
              {table?.description && (
                <span className="text-xs text-[var(--text-muted)]">{table.description}</span>
              )}
            </div>
          </div>

          <div className="flex-1 flex justify-center">
            <div
              className={cn(
                'flex items-center gap-1.5 text-xs py-1.5 px-3 rounded-full',
                saveStatus === 'success' &&
                  'text-[var(--status-success)] bg-[var(--success-alpha-10)]',
                saveStatus === 'error' && 'text-[var(--status-error)] bg-[var(--danger-alpha-10)]',
                !saveStatus && 'text-[var(--text-muted)] bg-[var(--neutral-alpha-10)]'
              )}
            >
              {saving && (
                <>
                  <RefreshCw className="size-3 animate-spin" /> Speichere...
                </>
              )}
              {saveStatus === 'success' && (
                <>
                  <Check className="size-3" /> Gespeichert
                </>
              )}
              {saveStatus === 'error' && (
                <>
                  <AlertCircle className="size-3" /> Fehler
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs text-[var(--text-muted)]">
              {rows.length} Zeilen, {fields.length} Spalten
            </span>
          </div>
        </header>

        {/* Error bar */}
        {error && (
          <div className="flex items-center gap-3 py-3 px-6 bg-[var(--danger-alpha-10)] border-b border-[var(--danger-alpha-30)] text-[var(--status-error)] text-sm shrink-0">
            <AlertCircle className="size-4" /> {error}
            <button
              type="button"
              className="ml-auto bg-transparent border-none text-inherit cursor-pointer p-1"
              onClick={() => setError(null)}
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-2 py-3 px-6 bg-[var(--bg-card)] border-b border-[var(--border-color)] shrink-0">
          <button type="button" className={btnPrimary} onClick={handleAddRow}>
            <Plus className="size-4" /> Neue Zeile
          </button>

          {selectedRows.size > 0 && (
            <button type="button" className={btnDanger} onClick={handleDeleteSelected}>
              <Trash2 className="size-4" /> {selectedRows.size} löschen
            </button>
          )}

          <div className="w-px h-6 bg-[var(--border-color)] mx-1" />

          <button
            type="button"
            className={btnIconOnly}
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title="Rückgängig (Strg+Z)"
          >
            <Undo2 className="size-4" />
          </button>
          <button
            type="button"
            className={btnIconOnly}
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            title="Wiederholen (Strg+Y)"
          >
            <Redo2 className="size-4" />
          </button>

          <div className="w-px h-6 bg-[var(--border-color)] mx-1" />

          <button
            type="button"
            className={btnBase}
            onClick={() => fileInputRef.current?.click()}
            disabled={saving || fields.length === 0}
          >
            <Upload className="size-4" /> Import
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
            className={btnBase}
            onClick={handleExportCSV}
            disabled={saving || rows.length === 0}
          >
            <Download className="size-4" /> Export
          </button>

          <div className="flex-1" />

          <button type="button" className={btnBase} onClick={loadTable} disabled={loading}>
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} /> Aktualisieren
          </button>
        </div>

        {/* Grid */}
        <div
          className="flex-1 flex flex-col min-h-0 outline-none relative focus-visible:outline-2 focus-visible:outline focus-visible:outline-[var(--primary-color)] focus-visible:outline-offset-[-2px]"
          ref={tableRef}
          tabIndex={0}
        >
          {/* Fixed header (synced horizontal scroll) */}
          <div
            className="overflow-hidden shrink-0 border-b border-[var(--border-color)] bg-[var(--bg-card)]"
            ref={headerScrollRef}
          >
            <div className="flex min-w-max">
              <div
                className="w-12 min-w-12 flex items-center justify-center bg-[var(--bg-card)] border-r border-[var(--border-color)] text-[0.6875rem] font-semibold text-[var(--text-muted)] cursor-pointer select-none hover:text-[var(--primary-color)] hover:bg-[var(--primary-alpha-10)]"
                onClick={toggleSelectAll}
                title="Alle auswählen"
              >
                #
              </div>
              {fields.map((field, idx) => (
                <div
                  key={field.slug}
                  className={cn(
                    'group/col relative flex flex-col justify-center py-1 px-2 border-r border-[var(--border-color)] shrink-0 select-none',
                    resizingColumn?.fieldSlug === field.slug && 'border-r-[var(--primary-color)]'
                  )}
                  style={{ width: columnWidths[field.slug] || 150 }}
                >
                  <div className="text-[0.5625rem] font-bold text-[var(--text-disabled)] uppercase tracking-wide leading-none">
                    {getColumnLetter(idx)}
                  </div>
                  <div
                    className="flex items-center gap-1 text-xs font-semibold text-[var(--text-primary)] cursor-pointer leading-tight hover:text-[var(--primary-color)]"
                    onClick={() => handleSort(field.slug)}
                  >
                    {field.name}
                    {sortField === field.slug &&
                      (sortOrder === 'asc' ? (
                        <ChevronUp className="size-3" />
                      ) : (
                        <ChevronDown className="size-3" />
                      ))}
                  </div>
                  <div className="text-[0.5625rem] text-[var(--text-muted)] leading-none whitespace-nowrap overflow-hidden text-ellipsis">
                    {FIELD_LABELS[field.field_type] || field.field_type}
                    {field.unit ? ` | ${field.unit}` : ''}
                  </div>
                  <button
                    type="button"
                    className="absolute top-1 right-1 flex items-center justify-center w-5 h-5 bg-transparent border-none rounded text-[var(--text-disabled)] cursor-pointer opacity-0 transition-all group-hover/col:opacity-100 hover:bg-[var(--bg-dark)] hover:text-[var(--text-primary)]"
                    onClick={e => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setColumnMenu({
                        field,
                        position: { top: rect.bottom + 4, left: rect.left },
                      });
                    }}
                  >
                    <MoreVertical className="size-3" />
                  </button>
                  <div
                    className={cn(
                      'absolute right-0 top-0 bottom-0 w-1 cursor-col-resize bg-transparent hover:bg-[var(--primary-color)]',
                      resizingColumn?.fieldSlug === field.slug && 'bg-[var(--primary-color)]'
                    )}
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
          <div className="flex-1 overflow-auto min-h-0" ref={bodyRef} onScroll={handleBodyScroll}>
            <div className="relative min-w-max" style={{ height: totalHeight }}>
              <div
                className="will-change-transform"
                style={{ transform: `translateY(${offsetTop}px)` }}
              >
                {visibleRows.map((row, i) => {
                  const rowIdx = startIndex + i;
                  const isGhost = row._isGhost;
                  const isRowSelected = selectedRows.has(row._id);

                  return (
                    <div
                      key={row._id}
                      className={cn(
                        'flex border-b border-[var(--border-color)]',
                        isRowSelected && 'bg-[var(--primary-alpha-8)]',
                        isGhost && 'opacity-50 hover:opacity-80'
                      )}
                      style={{ height: ROW_HEIGHT }}
                    >
                      <div
                        className={cn(
                          'w-12 min-w-12 flex items-center justify-center bg-[var(--bg-card)] border-r border-[var(--border-color)] text-[0.6875rem] text-[var(--text-muted)] cursor-pointer select-none shrink-0 hover:text-[var(--primary-color)] hover:bg-[var(--primary-alpha-10)]',
                          isRowSelected &&
                            'bg-[var(--primary-alpha-15)] text-[var(--primary-color)] font-semibold'
                        )}
                        onClick={() => toggleRowSelection(row._id)}
                      >
                        {isGhost ? <Plus className="size-3" /> : rowIdx + 1}
                      </div>
                      {fields.map((field, colIdx) => {
                        const isEditing =
                          editingCell?.rowId === row._id && editingCell?.fieldSlug === field.slug;
                        const isActive = activeCell.row === rowIdx && activeCell.col === colIdx;

                        return (
                          <div
                            key={field.slug}
                            className={cn(
                              'h-8 border-r border-[var(--border-color)] cursor-pointer relative shrink-0 overflow-hidden hover:bg-[rgba(69,173,255,0.03)]',
                              isRowSelected
                                ? 'bg-[var(--primary-alpha-8)]'
                                : isGhost
                                  ? 'bg-[rgba(148,163,184,0.03)]'
                                  : 'bg-[var(--bg-dark)]',
                              isActive &&
                                'outline-2 outline outline-[var(--primary-color)] -outline-offset-2 z-[5]'
                            )}
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
                                onSave={(val: any, dir: any) =>
                                  handleCellSave(row._id, field.slug, val, dir)
                                }
                                onCancel={() => setEditingCell(null)}
                                classPrefix="excel"
                                validate={false}
                              />
                            ) : (
                              <span
                                className={cn(
                                  'block px-2 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-[var(--text-secondary)] leading-8 h-8',
                                  field.field_type === 'checkbox' && 'text-[var(--status-success)]',
                                  (field.field_type === 'currency' ||
                                    field.field_type === 'number') &&
                                    'text-right tabular-nums'
                                )}
                              >
                                {isGhost ? '' : formatCellValue(row[field.slug], field.field_type)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                      <div className="h-8 w-10 min-w-10 bg-[var(--bg-card)] cursor-default border-r border-[var(--border-color)]" />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Statusbar */}
        <div className="flex items-center gap-6 py-2 px-6 bg-[var(--bg-card)] border-t border-[var(--border-color)] shrink-0 text-xs text-[var(--text-muted)]">
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
