import { useState, useCallback, useRef, type MutableRefObject } from 'react';
import { useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import useExcelHistory from '../useExcelHistory';
import type { CellValue, Field, Row, TableData } from '../types';

type CellSaveFn = (
  rowId: string,
  fieldSlug: string,
  value: unknown,
  extra: null,
  skipUndo: boolean
) => Promise<void>;

interface TableApiResponse {
  data: TableData & { fields: Field[] };
}

interface RowsApiResponse {
  data: Row[];
  meta?: { total?: number };
}

interface RowPatchResponse {
  data: Row;
}

interface BulkInsertResponse {
  data?: { inserted?: number };
}

interface UseTableDataParams {
  tableSlug: string;
  page?: number;
  pageSize?: number;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  onRowCreated?: () => void;
}

export default function useTableData({
  tableSlug,
  page = 1,
  pageSize = 50,
  sortField = '_created_at',
  sortOrder = 'desc',
  search = '',
  onRowCreated,
}: UseTableDataParams) {
  const api = useApi();
  const toast = useToast();

  // Table state
  const [table, setTable] = useState<TableData | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'success' | 'error' | null>(null);

  // Editing state
  const [editingCell, setEditingCell] = useState<{ rowId: string; fieldSlug: string } | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleCellSaveRef = useRef<CellSaveFn>(null) as MutableRefObject<CellSaveFn>;

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

  // --- Data loading (server-side pagination/sort/search) ---

  const loadTable = useCallback(async () => {
    try {
      setLoading(true);
      const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
      const [tableData, rowsData] = await Promise.all([
        api.get<TableApiResponse>(`/v1/datentabellen/tables/${tableSlug}`, { showError: false }),
        api.get<RowsApiResponse>(
          `/v1/datentabellen/tables/${tableSlug}/rows?limit=${pageSize}&page=${page}&sort=${sortField}&order=${sortOrder}${searchParam}`,
          { showError: false }
        ),
      ]);
      setTable(tableData.data);
      setFields(tableData.data.fields || []);
      setRows(rowsData.data || []);
      setTotalRows(rowsData.meta?.total ?? rowsData.data?.length ?? 0);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [tableSlug, page, pageSize, sortField, sortOrder, search]);

  // --- Load table schema only (for re-fetching fields after column changes) ---

  const loadTableSchema = useCallback(async () => {
    try {
      const tableData = await api.get<TableApiResponse>(`/v1/datentabellen/tables/${tableSlug}`, {
        showError: false,
      });
      setTable(tableData.data);
      setFields(tableData.data.fields || []);
    } catch {
      // Ignore; loadTable will handle errors
    }
  }, [tableSlug]);

  // --- Ghost row handling ---

  const handleGhostRowEdit = useCallback(
    async (fieldSlug: string, value: CellValue) => {
      if (!value && value !== false) return;
      try {
        setSaving(true);
        await api.post<RowPatchResponse>(
          `/v1/datentabellen/tables/${tableSlug}/rows`,
          { [fieldSlug]: value },
          { showError: false }
        );
        // Navigate to page 1 (where new row appears with default desc sort)
        if (onRowCreated) onRowCreated();
        await loadTable();
        setSaveStatus('success');
        setTimeout(() => setSaveStatus(null), 2000);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
        setSaveStatus('error');
      } finally {
        setSaving(false);
      }
    },
    [tableSlug, loadTable, onRowCreated]
  );

  // --- Cell save ---

  const handleCellSave = useCallback(
    async (
      rowId: string,
      fieldSlug: string,
      value: CellValue,
      direction?: string,
      skipUndo = false
    ) => {
      setEditingCell(null);

      if (rowId === '__ghost__') {
        await handleGhostRowEdit(fieldSlug, value);
        return;
      }

      const oldRow = rows.find(r => r._id === rowId);
      const oldValue = oldRow?.[fieldSlug];
      if (oldValue === value) {
        return;
      }

      try {
        setSaving(true);
        const data = await api
          .patch<RowPatchResponse>(
            `/v1/datentabellen/tables/${tableSlug}/rows/${rowId}`,
            { [fieldSlug]: value, _expected_updated_at: oldRow?._updated_at },
            { showError: false }
          )
          .catch((err: { status?: number; message?: string }) => {
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
      } catch {
        await loadTable();
        setSaveStatus('error');
      } finally {
        setSaving(false);
      }
    },
    [rows, tableSlug, loadTable, handleGhostRowEdit, pushUndo, clearStacks]
  );

  handleCellSaveRef.current = handleCellSave as unknown as CellSaveFn;

  // --- Add row ---

  const handleAddRow = useCallback(async () => {
    try {
      setSaving(true);
      await api.post<RowPatchResponse>(
        `/v1/datentabellen/tables/${tableSlug}/rows`,
        {},
        { showError: false }
      );
      await loadTable();
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  }, [tableSlug, loadTable]);

  // --- Delete selected rows ---

  const handleDeleteSelected = useCallback(
    async (showConfirm: (opts: { message: string }) => Promise<boolean>) => {
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
      } catch (err: unknown) {
        const e = err as { message?: string };
        setError(e.message || String(err));
        setSaveStatus('error');
      } finally {
        setSaving(false);
      }
    },
    [selectedRows, tableSlug, loadTable]
  );

  // --- Delete single row ---

  const handleDeleteRow = useCallback(
    async (rowId: string) => {
      try {
        setSaving(true);
        await api.request(`/v1/datentabellen/tables/${tableSlug}/rows/bulk`, {
          method: 'DELETE',
          body: { ids: [rowId] },
          showError: false,
        });
        await loadTable();
        setSaveStatus('success');
      } catch (err: unknown) {
        const e = err as { message?: string };
        setError(e.message || String(err));
        setSaveStatus('error');
      } finally {
        setSaving(false);
      }
    },
    [tableSlug, loadTable]
  );

  // --- Export CSV ---

  const handleExportCSV = useCallback(
    async (exportAll = false) => {
      try {
        let exportRows = rows;

        if (exportAll && totalRows > rows.length) {
          // Warn for very large exports that may slow down the browser
          if (totalRows > 5000) {
            const confirmed = window.confirm(
              `Diese Tabelle hat ${totalRows.toLocaleString('de-DE')} Zeilen. ` +
                'Der Export kann einige Sekunden dauern und viel Arbeitsspeicher benötigen. Fortfahren?'
            );
            if (!confirmed) return;
          }
          // Fetch all rows for full export (cap at 10000)
          const allData = await api.get<RowsApiResponse>(
            `/v1/datentabellen/tables/${tableSlug}/rows?limit=10000&sort=${sortField}&order=${sortOrder}`,
            { showError: false }
          );
          exportRows = allData.data || [];
        }

        if (exportRows.length === 0) return;

        const headers = fields.map(f => `"${f.name.replace(/"/g, '""')}"`).join(';');
        const csvRows = exportRows.map(row =>
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
      } catch (err: unknown) {
        toast.error(`Export fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [rows, fields, table, toast, totalRows, tableSlug, sortField, sortOrder]
  );

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

        // Auto-detect delimiter
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

        // Type coercion for CSV values
        const coerceValue = (val: string, fieldType: string): CellValue => {
          switch (fieldType) {
            case 'number':
            case 'currency': {
              const n = Number(val.replace(',', '.'));
              return isNaN(n) ? null : n;
            }
            case 'boolean':
              return ['true', '1', 'ja', 'yes'].includes(val.toLowerCase());
            default:
              return val;
          }
        };

        // Parse data rows
        const importRows: Record<string, CellValue>[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          const rowData: Record<string, CellValue> = {};
          let hasData = false;
          values.forEach((val, idx) => {
            const field = fieldMap[idx];
            if (field && val !== '') {
              rowData[field.slug] = coerceValue(val, field.field_type);
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
          const result = await api.post<BulkInsertResponse>(
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
      } catch (err: unknown) {
        toast.error(`Import fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
        setSaveStatus('error');
      } finally {
        setSaving(false);
      }
    },
    [fields, tableSlug, loadTable, toast]
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

  return {
    // State
    table,
    fields,
    rows,
    totalRows,
    loading,
    error,
    setError,
    saving,
    saveStatus,
    setSaveStatus,
    editingCell,
    setEditingCell,
    selectedRows,
    // History
    undoStack,
    redoStack,
    handleUndo,
    handleRedo,
    // Data operations
    loadTable,
    loadTableSchema,
    handleCellSave,
    handleAddRow,
    handleDeleteSelected,
    handleDeleteRow,
    handleExportCSV,
    handleImportCSV,
    // Row selection
    toggleRowSelection,
    toggleSelectAll,
    // Refs
    fileInputRef,
    handleCellSaveRef,
  };
}
