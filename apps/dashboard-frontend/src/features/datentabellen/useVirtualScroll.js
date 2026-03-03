import { useState, useCallback, useRef, useEffect } from 'react';

const DEFAULT_ROW_HEIGHT = 32;
const DEFAULT_OVERSCAN = 10;

/**
 * useVirtualScroll - Virtualization hook for large row sets.
 *
 * Only renders visible rows + overscan buffer.
 * Fixed row height for O(1) offset calculation.
 *
 * @param {number} totalItems - Total number of rows
 * @param {object} containerRef - React ref to the scrollable container
 * @param {number} [itemHeight=32] - Fixed row height in px
 * @param {number} [overscan=10] - Extra rows rendered above/below viewport
 */
export default function useVirtualScroll(
  totalItems,
  containerRef,
  itemHeight = DEFAULT_ROW_HEIGHT,
  overscan = DEFAULT_OVERSCAN
) {
  const [scrollTop, setScrollTop] = useState(0);
  const rafRef = useRef(null);

  // Compute visible range
  const containerHeight = containerRef.current?.clientHeight || 600;
  const totalHeight = totalItems * itemHeight;

  const rawStart = Math.floor(scrollTop / itemHeight);
  const visibleCount = Math.ceil(containerHeight / itemHeight);

  const startIndex = Math.max(0, rawStart - overscan);
  const endIndex = Math.min(totalItems - 1, rawStart + visibleCount + overscan);

  const offsetTop = startIndex * itemHeight;

  // RAF-throttled scroll handler
  const onScroll = useCallback(e => {
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
    index => {
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
