import { useEffect, useRef } from 'react';

/**
 * useFocusRestore — Save the currently focused element on mount and
 * restore focus to it on unmount. Use in custom modals/overlays where
 * shadcn Dialog isn't appropriate (e.g. TipTapEditor, ExcelEditor).
 *
 * Note: shadcn Dialog (Radix UI) does this automatically, so only use
 * this hook for hand-rolled overlay components.
 */
export function useFocusRestore(active = true) {
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    // Capture the element that had focus when the modal opened
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    return () => {
      // Restore focus on unmount — but only if the element is still in the
      // document (it may have been removed by a parent re-render)
      const el = previouslyFocusedRef.current;
      if (el && document.contains(el) && typeof el.focus === 'function') {
        try {
          el.focus({ preventScroll: true });
        } catch {
          // Some elements (e.g. detached) throw on focus — ignore
        }
      }
    };
  }, [active]);
}
