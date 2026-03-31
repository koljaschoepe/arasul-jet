import { useState, useCallback, useEffect } from 'react';

interface ResizingColumn {
  fieldSlug: string;
  startX: number;
  startWidth: number;
}

const STORAGE_PREFIX = 'arasul_col_widths_';

export default function useColumnResize(tableSlug?: string) {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    if (!tableSlug) return {};
    try {
      const stored = localStorage.getItem(STORAGE_PREFIX + tableSlug);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const [resizingColumn, setResizingColumn] = useState<ResizingColumn | null>(null);

  // Reset widths when table changes
  useEffect(() => {
    if (!tableSlug) return;
    try {
      const stored = localStorage.getItem(STORAGE_PREFIX + tableSlug);
      setColumnWidths(stored ? JSON.parse(stored) : {});
    } catch {
      setColumnWidths({});
    }
  }, [tableSlug]);

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
    const handleMouseUp = () => {
      setResizingColumn(null);
      // Persist to localStorage on mouse up
      if (tableSlug) {
        setColumnWidths(current => {
          try {
            localStorage.setItem(STORAGE_PREFIX + tableSlug, JSON.stringify(current));
          } catch {
            // Ignore storage errors
          }
          return current;
        });
      }
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn, tableSlug]);

  return { columnWidths, resizingColumn, handleResizeStart };
}
