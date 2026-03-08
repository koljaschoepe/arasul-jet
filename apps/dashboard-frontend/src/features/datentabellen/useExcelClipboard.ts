import { useState, useCallback } from 'react';

interface Field {
  slug: string;
  field_type: string;
  [key: string]: unknown;
}

interface DataRow {
  _id: string;
  [key: string]: unknown;
}

interface CellPosition {
  row: number;
  col: number;
}

interface ClipboardEntry {
  value: unknown;
  fieldType: string;
  isCut?: boolean;
}

interface UseExcelClipboardParams {
  activeCell: CellPosition;
  displayRows: DataRow[];
  fields: Field[];
  handleCellSave: (rowId: string, fieldSlug: string, value: unknown) => void;
  setSaveStatus: (status: string | null) => void;
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
      handleCellSave(displayRows[row]._id, fields[col].slug, value);
    }
  }, [activeCell, displayRows, fields, clipboard, handleCellSave]);

  return { clipboard, handleCopy, handleCut, handlePaste };
}
