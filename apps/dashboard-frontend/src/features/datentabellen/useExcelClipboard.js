import { useState, useCallback } from 'react';

/**
 * useExcelClipboard - Clipboard operations (copy, cut, paste) for ExcelEditor
 */
export default function useExcelClipboard({
  activeCell,
  displayRows,
  fields,
  handleCellSave,
  setSaveStatus,
}) {
  const [clipboard, setClipboard] = useState(null);

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

    let value = clipboard?.value;
    if (value === undefined) {
      try {
        value = await navigator.clipboard?.readText();
      } catch {}
    }

    if (value !== undefined) {
      handleCellSave(displayRows[row]._id, fields[col].slug, value);
    }
  }, [activeCell, displayRows, fields, clipboard, handleCellSave]);

  return { clipboard, handleCopy, handleCut, handlePaste };
}
