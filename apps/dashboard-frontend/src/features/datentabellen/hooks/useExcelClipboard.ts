import { useState, useCallback } from 'react';
import type { CellPosition, CellValue, Field, Row } from '../types';

interface ClipboardEntry {
  value: unknown;
  fieldType: string;
  isCut?: boolean;
}

interface UseExcelClipboardParams {
  activeCell: CellPosition;
  displayRows: Row[];
  fields: Field[];
  handleCellSave: (rowId: string, fieldSlug: string, value: CellValue) => void;
  setSaveStatus: (status: 'success' | 'error' | null) => void;
}

interface UseExcelClipboardReturn {
  clipboard: ClipboardEntry | null;
  handleCopy: () => void;
  handleCut: () => void;
  handlePaste: () => Promise<void>;
}

/**
 * useExcelClipboard - Clipboard operations (copy, cut, paste) for ExcelEditor
 */
export default function useExcelClipboard({
  activeCell,
  displayRows,
  fields,
  handleCellSave,
  setSaveStatus,
}: UseExcelClipboardParams): UseExcelClipboardReturn {
  const [clipboard, setClipboard] = useState<ClipboardEntry | null>(null);

  const handleCopy = useCallback(() => {
    const { row, col } = activeCell;
    if (displayRows[row] && fields[col]) {
      const value = displayRows[row][fields[col].slug];
      setClipboard({ value, fieldType: fields[col].field_type });
      navigator.clipboard?.writeText(String(value ?? ''));
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 1000);
    }
  }, [activeCell, displayRows, fields, setSaveStatus]);

  const handleCut = useCallback(() => {
    const { row, col } = activeCell;
    if (displayRows[row] && fields[col] && displayRows[row]._id !== '__ghost__') {
      const value = displayRows[row][fields[col].slug];
      setClipboard({ value, fieldType: fields[col].field_type, isCut: true });
      navigator.clipboard?.writeText(String(value ?? ''));
      handleCellSave(displayRows[row]._id, fields[col].slug, null);
    }
  }, [activeCell, displayRows, fields, handleCellSave]);

  const handlePaste = useCallback(async () => {
    const { row, col } = activeCell;
    if (!displayRows[row] || !fields[col]) return;

    let value: unknown = clipboard?.value;
    if (value === undefined) {
      try {
        value = await navigator.clipboard?.readText();
      } catch {
        // Clipboard read may fail due to permissions
      }
    }

    if (value !== undefined) {
      handleCellSave(displayRows[row]._id, fields[col].slug, value as CellValue);
    }
  }, [activeCell, displayRows, fields, clipboard, handleCellSave]);

  return { clipboard, handleCopy, handleCut, handlePaste };
}
