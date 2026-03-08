import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useMinLoadingTime - Prevents "flash of loading content"
 *
 * Ensures loading state is shown for a minimum duration to prevent
 * jarring quick flashes when data loads very fast.
 */
export function useMinLoadingTime(isLoading: boolean, minTime: number = 300): boolean {
  const [showLoading, setShowLoading] = useState(isLoading);
  const loadStartRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isLoading) {
      loadStartRef.current = Date.now();
      setShowLoading(true);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    } else if (loadStartRef.current !== null) {
      const elapsed = Date.now() - loadStartRef.current;
      const remaining = Math.max(0, minTime - elapsed);

      if (remaining > 0) {
        timeoutRef.current = setTimeout(() => {
          setShowLoading(false);
          timeoutRef.current = null;
        }, remaining);
      } else {
        setShowLoading(false);
      }

      loadStartRef.current = null;
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isLoading, minTime]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return showLoading;
}

/**
 * useLoadingState - Combined loading state management
 */
export function useLoadingState(initialLoading: boolean = true, minTime: number = 300) {
  const [isLoading, setIsLoading] = useState(initialLoading);
  const showLoading = useMinLoadingTime(isLoading, minTime);

  const setLoading = useCallback((value: boolean) => {
    setIsLoading(value);
  }, []);

  return {
    isLoading,
    showLoading,
    setLoading,
  };
}

export default useMinLoadingTime;
