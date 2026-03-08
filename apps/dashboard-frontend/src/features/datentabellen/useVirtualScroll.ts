import { useState, useCallback, useRef, useEffect, type RefObject } from 'react';

const DEFAULT_ROW_HEIGHT = 32;
const DEFAULT_OVERSCAN = 10;

interface UseVirtualScrollReturn {
  startIndex: number;
  endIndex: number;
  totalHeight: number;
  offsetTop: number;
  onScroll: (e: React.UIEvent<HTMLElement>) => void;
  scrollToRow: (index: number) => void;
}

/**
 * useVirtualScroll - Virtualization hook for large row sets.
 *
 * Only renders visible rows + overscan buffer.
 * Fixed row height for O(1) offset calculation.
 *
 * @param totalItems - Total number of rows
 * @param containerRef - React ref to the scrollable container
 * @param itemHeight - Fixed row height in px
 * @param overscan - Extra rows rendered above/below viewport
 */
export default function useVirtualScroll(
  totalItems: number,
  containerRef: RefObject<HTMLElement>,
  itemHeight: number = DEFAULT_ROW_HEIGHT,
  overscan: number = DEFAULT_OVERSCAN
): UseVirtualScrollReturn {
  const [scrollTop, setScrollTop] = useState(0);
  const rafRef = useRef<number | null>(null);

  // Compute visible range
  const containerHeight = containerRef.current?.clientHeight || 600;
  const totalHeight = totalItems * itemHeight;

  const rawStart = Math.floor(scrollTop / itemHeight);
  const visibleCount = Math.ceil(containerHeight / itemHeight);

  const startIndex = Math.max(0, rawStart - overscan);
  const endIndex = Math.min(totalItems - 1, rawStart + visibleCount + overscan);

  const offsetTop = startIndex * itemHeight;

  // RAF-throttled scroll handler
  const onScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    const target = e.currentTarget;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setScrollTop(target.scrollTop);
    });
  }, []);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Scroll to a specific row (for keyboard navigation)
  const scrollToRow = useCallback(
    (index: number) => {
      const container = containerRef.current;
      if (!container) return;

      const rowTop = index * itemHeight;
      const rowBottom = rowTop + itemHeight;
      const viewTop = container.scrollTop;
      const viewBottom = viewTop + container.clientHeight;

      if (rowTop < viewTop) {
        container.scrollTop = rowTop;
      } else if (rowBottom > viewBottom) {
        container.scrollTop = rowBottom - container.clientHeight;
      }
    },
    [containerRef, itemHeight]
  );

  return {
    startIndex,
    endIndex,
    totalHeight,
    offsetTop,
    onScroll,
    scrollToRow,
  };
}
