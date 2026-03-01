import { useCallback, useEffect } from 'react';

/**
 * useExcelKeyboard - Keyboard navigation and shortcuts for ExcelEditor
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
}) {
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
      setActiveCell,
      setEditingCell,
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
  }, [handleKeyDown, tableRef]);
}
