import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useMinLoadingTime - Prevents "flash of loading content"
 *
 * Ensures loading state is shown for a minimum duration to prevent
 * jarring quick flashes when data loads very fast.
 *
 * @param {boolean} isLoading - Actual loading state from data fetching
 * @param {number} minTime - Minimum time to show loading (default: 300ms)
 * @returns {boolean} - Smoothed loading state (true for at least minTime)
 *
 * @example
 * const [data, setData] = useState(null);
 * const [actualLoading, setActualLoading] = useState(true);
 * const showLoading = useMinLoadingTime(actualLoading, 300);
 *
 * // Use showLoading for UI, actualLoading for data logic
 * if (showLoading) return <Skeleton />;
 * return <Content data={data} />;
 */
export function useMinLoadingTime(isLoading, minTime = 300) {
  const [showLoading, setShowLoading] = useState(isLoading);
  const loadStartRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (isLoading) {
      // Loading started
      loadStartRef.current = Date.now();
      setShowLoading(true);

      // Clear any pending timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    } else if (loadStartRef.current !== null) {
      // Loading finished - ensure minimum display time
      const elapsed = Date.now() - loadStartRef.current;
      const remaining = Math.max(0, minTime - elapsed);

      if (remaining > 0) {
        // Keep showing loading for remaining time
        timeoutRef.current = setTimeout(() => {
          setShowLoading(false);
          timeoutRef.current = null;
        }, remaining);
      } else {
        // Minimum time already passed
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

  // Cleanup on unmount
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
 *
 * Manages both actual loading state and smoothed display state
 * in one hook for convenience.
 *
 * @param {boolean} initialLoading - Initial loading state
 * @param {number} minTime - Minimum loading display time
 * @returns {Object} - { isLoading, showLoading, setLoading }
 */
export function useLoadingState(initialLoading = true, minTime = 300) {
  const [isLoading, setIsLoading] = useState(initialLoading);
  const showLoading = useMinLoadingTime(isLoading, minTime);

  const setLoading = useCallback((value) => {
    setIsLoading(value);
  }, []);

  return {
    isLoading,       // Actual loading state (for data logic)
    showLoading,     // Smoothed state (for UI display)
    setLoading       // Setter function
  };
}

export default useMinLoadingTime;
