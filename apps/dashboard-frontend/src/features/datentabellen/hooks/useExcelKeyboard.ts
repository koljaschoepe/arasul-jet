import { useCallback, useEffect, type RefObject } from 'react';
import type { CellPosition, CellValue, Field, Row } from '../types';

interface EditingCell {
  rowId: string;
  fieldSlug: string;
}

interface UseExcelKeyboardParams {
  tableRef: RefObject<HTMLElement | null>;
  activeCell: CellPosition;
  setActiveCell: (cell: CellPosition) => void;
  editingCell: EditingCell | null;
  setEditingCell: (cell: EditingCell | null) => void;
  displayRows: Row[];
  fields: Field[];
  moveToCell: (direction: 'prev' | 'next') => void;
  handleCopy: () => void;
  handleCut: () => void;
  handlePaste: () => void;
  handleUndo: () => void;
  handleRedo: () => void;
  handleCellSave: (rowId: string, fieldSlug: string, value: CellValue) => void;
  scrollToRow?: (index: number) => void;
}

/**
 * useExcelKeyboard - Keyboard navigation and shortcuts for ExcelEditor
 *
 * Supports: Arrow keys, Tab, Enter/F2, Delete, Ctrl+Z/Y, Ctrl+C/X/V,
 * Home/End, Ctrl+Home/End
 */
export default function useExcelKeyboard({
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
}: UseExcelKeyboardParams): void {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ctrl/Cmd shortcuts (work even while editing for undo/redo)
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
          if (row > 0) {
            setActiveCell({ row: row - 1, col });
            scrollToRow?.(row - 1);
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (row < numRows - 1) {
            setActiveCell({ row: row + 1, col });
            scrollToRow?.(row + 1);
          }
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
        case 'Home':
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) {
            setActiveCell({ row: 0, col: 0 });
            scrollToRow?.(0);
          } else {
            setActiveCell({ row, col: 0 });
          }
          break;
        case 'End':
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) {
            const lastRow = numRows - 1;
            setActiveCell({ row: lastRow, col: numCols - 1 });
            scrollToRow?.(lastRow);
          } else {
            setActiveCell({ row, col: numCols - 1 });
          }
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
      setActiveCell,
      setEditingCell,
      handleCopy,
      handleCut,
      handlePaste,
      handleUndo,
      handleRedo,
      moveToCell,
      handleCellSave,
      scrollToRow,
    ]
  );

  useEffect(() => {
    const el = tableRef.current;
    if (el) {
      el.addEventListener('keydown', handleKeyDown);
      return () => el.removeEventListener('keydown', handleKeyDown);
    }
  }, [handleKeyDown, tableRef]);
}
