/**
 * ExcelEditor - Responsive table editor orchestrator.
 * Desktop (>=768px): full grid with virtualization, keyboard nav, clipboard.
 * Mobile (<768px): record card list with bottom-sheet detail view.
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import useConfirm from '../../hooks/useConfirm';
import useMediaQuery from '../../hooks/useMediaQuery';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import useExcelKeyboard from './useExcelKeyboard';
import useVirtualScroll from './useVirtualScroll';
import useExcelClipboard from './useExcelClipboard';
import useTableData from './hooks/useTableData';
import useColumnResize from './hooks/useColumnResize';
import useSorting from './hooks/useSorting';
import usePagination from './hooks/usePagination';
import EditorHeader from './components/EditorHeader';
import TableToolbar from './components/TableToolbar';
import MobileToolbar from './components/MobileToolbar';
import TableHeader from './components/TableHeader';
import TableRow from './components/TableRow';
import Pagination from './components/Pagination';
import MobileRecordList from './components/MobileRecordList';
import ColumnMenu from './components/ColumnMenu';
import CellContextMenu from './components/CellContextMenu';
import type {
  ExcelEditorProps,
  CellPosition,
  ColumnMenuState,
  ContextMenuState,
  Field,
  Row,
} from './types';
import { ROW_HEIGHT } from './utils';
import './datentabellen.css';

const TABLET_ROW_HEIGHT = 44;

function ExcelEditor({ tableSlug, tableName, onClose }: ExcelEditorProps) {
  const { confirm: showConfirm, ConfirmDialog } = useConfirm();
  const api = useApi();
  const toast = useToast();

  // Auto-index on close: trigger re-index then call parent onClose
  const handleClose = useCallback(() => {
    // Fire-and-forget: index in background, don't block close
    api.post(`/v1/datentabellen/tables/${tableSlug}/index`).catch(() => {});
    onClose?.();
  }, [api, tableSlug, onClose]);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
  const effectiveRowHeight = isTablet ? TABLET_ROW_HEIGHT : ROW_HEIGHT;

  // --- Pagination ---
  const pagination = usePagination(50);

  // --- Search ---
  const [search, setSearch] = useState('');
  const handleSearch = useCallback(
    (query: string) => {
      setSearch(query);
      pagination.setPage(1);
    },
    [pagination]
  );

  // Navigation state
  const [activeCell, setActiveCell] = useState<CellPosition>({ row: 0, col: 0 });

  // --- Sorting (server-side: state only, no client sort) ---
  const { sortField, sortOrder, handleSort: rawHandleSort } = useSorting([], setActiveCell);

  // Wrap handleSort to also reset page to 1
  const handleSort = useCallback(
    (fieldSlug: string) => {
      rawHandleSort(fieldSlug);
      pagination.setPage(1);
    },
    [rawHandleSort, pagination]
  );

  // --- Core data hook (server-side pagination/sort/search) ---
  const {
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
    undoStack,
    redoStack,
    handleUndo,
    handleRedo,
    loadTable,
    handleCellSave,
    handleAddRow,
    handleDeleteSelected,
    handleDeleteRow,
    handleExportCSV,
    handleImportCSV,
    toggleRowSelection,
    toggleSelectAll,
    fileInputRef,
  } = useTableData({
    tableSlug,
    page: pagination.page,
    pageSize: pagination.pageSize,
    sortField,
    sortOrder,
    search,
    onRowCreated: () => pagination.setPage(1),
  });

  // Sync totalRows from useTableData into usePagination
  useEffect(() => {
    pagination.setTotalRows(totalRows);
  }, [totalRows, pagination]);

  // Clear undo stack on page change (warn if non-empty)
  const prevPageRef = useRef(pagination.page);
  useEffect(() => {
    if (prevPageRef.current !== pagination.page && undoStack.length > 0) {
      toast.info('Undo-Verlauf wurde beim Seitenwechsel zurückgesetzt');
    }
    prevPageRef.current = pagination.page;
  }, [pagination.page, undoStack.length, toast]);

  // Menus
  const [columnMenu, setColumnMenu] = useState<ColumnMenuState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Refs
  const tableRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);

  // Rows come pre-sorted from server, just pass through
  const sortedRows = rows;

  // --- Display rows (server-sorted + ghost) ---
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
    effectiveRowHeight
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

  // --- Column resize ---
  const { columnWidths, resizingColumn, handleResizeStart } = useColumnResize(tableSlug);

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

  // --- Clipboard ---
  const { clipboard, handleCopy, handleCut, handlePaste } = useExcelClipboard({
    activeCell,
    displayRows,
    fields,
    handleCellSave,
    setSaveStatus,
  });

  // --- Keyboard navigation (desktop only) ---
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

  // --- Body scroll lock for overlay ---
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // --- Load data on mount and when params change ---
  useEffect(() => {
    loadTable();
  }, [loadTable]);

  // --- Context menu ---
  const handleContextMenu = useCallback((e: React.MouseEvent, rowIdx: number, colIdx: number) => {
    e.preventDefault();
    setActiveCell({ row: rowIdx, col: colIdx });
    setContextMenu({ position: { x: e.clientX, y: e.clientY }, rowIdx, colIdx });
  }, []);

  // --- Cell click handler ---
  const handleCellClick = useCallback(
    (rowIdx: number, colIdx: number, rowId: string, fieldSlug: string) => {
      setActiveCell({ row: rowIdx, col: colIdx });
      if (!(editingCell?.rowId === rowId && editingCell?.fieldSlug === fieldSlug)) {
        setEditingCell({ rowId, fieldSlug });
      }
    },
    [editingCell, setEditingCell]
  );

  // --- Column menu open handler ---
  const handleColumnMenuOpen = useCallback((field: Field, rect: DOMRect) => {
    setColumnMenu({
      field,
      position: { top: rect.bottom + 4, left: rect.left },
    });
  }, []);

  // --- Delete single row (for mobile) ---
  const handleDeleteRowConfirm = useCallback(
    async (rowId: string) => {
      if (!(await showConfirm({ message: 'Zeile wirklich löschen?' }))) return;
      handleDeleteRow(rowId);
    },
    [showConfirm, handleDeleteRow]
  );

  // Toolbar props shared between mobile and desktop
  const toolbarProps = {
    onAddRow: handleAddRow,
    onDeleteSelected: () => handleDeleteSelected(showConfirm),
    selectedCount: selectedRows.size,
    onUndo: handleUndo,
    onRedo: handleRedo,
    undoCount: undoStack.length,
    redoCount: redoStack.length,
    onImportClick: () => fileInputRef.current?.click(),
    onExportCSV: handleExportCSV,
    onRefresh: loadTable,
    saving,
    loading,
    fieldsCount: fields.length,
    rowsCount: rows.length,
    totalRows,
    fileInputRef,
    onImportCSV: handleImportCSV,
    onSearch: handleSearch,
  };

  // --- Render ---

  if (loading && !table) {
    return (
      <div className="excel-editor-overlay" onClick={handleClose}>
        <div className="excel-editor-container" onClick={e => e.stopPropagation()}>
          <LoadingSpinner message="Tabelle wird geladen..." />
        </div>
      </div>
    );
  }

  return (
    <div className="excel-editor-overlay" onClick={handleClose}>
      <div className="excel-editor-container" onClick={e => e.stopPropagation()}>
        <EditorHeader
          table={table}
          tableName={tableName}
          saving={saving}
          saveStatus={saveStatus}
          rows={rows.length}
          fields={fields.length}
          onClose={handleClose}
        />

        {/* Error bar */}
        {error && (
          <div className="flex items-center gap-3 py-3 px-4 md:px-6 bg-destructive/10 border-b border-destructive/30 text-destructive text-sm shrink-0">
            <AlertCircle className="size-4 shrink-0" /> <span className="flex-1">{error}</span>
            <button
              type="button"
              className="bg-transparent border-none text-inherit cursor-pointer p-1 shrink-0"
              onClick={() => setError(null)}
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* Toolbar: Mobile vs Desktop */}
        {isMobile ? <MobileToolbar {...toolbarProps} /> : <TableToolbar {...toolbarProps} />}

        {/* Content: Mobile card list vs Desktop grid */}
        {isMobile ? (
          <MobileRecordList
            rows={displayRows}
            fields={fields}
            selectedRows={selectedRows}
            onCellSave={handleCellSave}
            onToggleSelection={toggleRowSelection}
            onDeleteRow={handleDeleteRowConfirm}
          />
        ) : (
          <>
            {/* Grid */}
            <div
              className="flex-1 flex flex-col min-h-0 outline-none relative focus-visible:outline-2 focus-visible:outline focus-visible:outline-primary focus-visible:outline-offset-[-2px]"
              ref={tableRef}
              tabIndex={0}
            >
              <TableHeader
                fields={fields}
                columnWidths={columnWidths}
                sortField={sortField}
                sortOrder={sortOrder}
                resizingColumn={resizingColumn}
                headerScrollRef={headerScrollRef}
                tableSlug={tableSlug}
                onSort={handleSort}
                onResizeStart={handleResizeStart}
                onColumnMenuOpen={handleColumnMenuOpen}
                onColumnAdded={loadTable}
                onToggleSelectAll={toggleSelectAll}
              />

              {/* Virtualized body */}
              <div
                className="flex-1 overflow-auto min-h-0"
                ref={bodyRef}
                onScroll={handleBodyScroll}
              >
                <div className="relative min-w-max" style={{ height: totalHeight }}>
                  <div
                    className="will-change-transform"
                    style={{ transform: `translateY(${offsetTop}px)` }}
                  >
                    {visibleRows.map((row, i) => {
                      const rowIdx = startIndex + i;
                      return (
                        <TableRow
                          key={row._id}
                          row={row}
                          rowIdx={rowIdx}
                          fields={fields}
                          columnWidths={columnWidths}
                          isSelected={selectedRows.has(row._id)}
                          activeRow={activeCell.row}
                          activeCol={activeCell.col}
                          editingCell={editingCell}
                          onCellClick={handleCellClick}
                          onContextMenu={handleContextMenu}
                          onCellSave={handleCellSave}
                          onCancelEdit={() => setEditingCell(null)}
                          onToggleSelection={toggleRowSelection}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              pageSize={pagination.pageSize}
              totalRows={totalRows}
              onPrevPage={pagination.prevPage}
              onNextPage={pagination.nextPage}
              onPageSizeChange={pagination.setPageSize}
            />
          </>
        )}

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

        {/* Context Menu (desktop only) */}
        {contextMenu && !isMobile && (
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
        {ConfirmDialog}
      </div>
    </div>
  );
}

export default ExcelEditor;
