import { useState, useCallback, useEffect } from 'react';

interface ResizingColumn {
  fieldSlug: string;
  startX: number;
  startWidth: number;
}

export default function useColumnResize() {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [resizingColumn, setResizingColumn] = useState<ResizingColumn | null>(null);

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

  return { columnWidths, resizingColumn, handleResizeStart };
}
