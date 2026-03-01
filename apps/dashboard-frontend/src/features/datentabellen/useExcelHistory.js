import { useState, useCallback } from 'react';

const MAX_UNDO_HISTORY = 50;

/**
 * useExcelHistory - Undo/redo stack for ExcelEditor cell edits
 *
 * Accepts a ref to handleCellSave to break the circular dependency:
 * handleCellSave uses pushUndo, and handleUndo/handleRedo use handleCellSave.
 */
export default function useExcelHistory(cellSaveRef) {
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  const pushUndo = useCallback(entry => {
    setUndoStack(prev => [...prev.slice(-MAX_UNDO_HISTORY + 1), entry]);
    setRedoStack([]);
  }, []);

  const clearStacks = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, last]);
    await cellSaveRef.current(last.rowId, last.fieldSlug, last.oldValue, null, true);
  }, [undoStack, cellSaveRef]);

  const handleRedo = useCallback(async () => {
    if (redoStack.length === 0) return;
    const last = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, last]);
    await cellSaveRef.current(last.rowId, last.fieldSlug, last.newValue, null, true);
  }, [redoStack, cellSaveRef]);

  return { undoStack, redoStack, pushUndo, clearStacks, handleUndo, handleRedo };
}
