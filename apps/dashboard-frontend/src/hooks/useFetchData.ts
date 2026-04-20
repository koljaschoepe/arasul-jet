/**
 * useFetchData - Reusable hook for async data fetching with AbortController
 *
 * Replaces the common pattern of:
 *   const [data, setData] = useState(initial);
 *   const [loading, setLoading] = useState(true);
 *   const [error, setError] = useState(null);
 *   const loadData = useCallback(async (signal) => { ... }, [api]);
 *   useEffect(() => { const c = new AbortController(); loadData(c.signal); return () => c.abort(); }, [loadData]);
 *
 * Supports parallel fetches via the fetcher callback pattern:
 *   const { data, loading } = useFetchData(
 *     async (signal) => {
 *       const [a, b] = await Promise.all([
 *         api.get('/a', { signal, showError: false }),
 *         api.get('/b', { signal, showError: false }),
 *       ]);
 *       return { a, b };
 *     },
 *     { initialData: { a: [], b: [] } }
 *   );
 */

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseFetchDataOptions<T> {
  initialData: T;
  errorMessage?: string;
}

interface UseFetchDataReturn<T> {
  data: T;
  setData: React.Dispatch<React.SetStateAction<T>>;
  loading: boolean;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  refetch: () => void;
}

export function useFetchData<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: UseFetchDataOptions<T>
): UseFetchDataReturn<T> {
  const { initialData, errorMessage = 'Fehler beim Laden' } = options;

  const [data, setData] = useState<T>(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track whether initial load has completed — subsequent refetches are silent
  // (no loading=true) to prevent re-render cascades during background polling.
  const hasLoadedRef = useRef(false);

  // Keep a ref to the fetcher so the useEffect doesn't re-run on every render
  // when the consumer forgets to memoize. The caller controls re-fetching via
  // deps on their useCallback around `fetcher`.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(
    async (signal: AbortSignal) => {
      try {
        // Only show loading spinner on initial fetch, not background refetches
        if (!hasLoadedRef.current) {
          setLoading(true);
        }
        const result = await fetcherRef.current(signal);
        if (!signal.aborted) {
          setData(result);
          setError(null);
          hasLoadedRef.current = true;
        }
      } catch (err: unknown) {
        if (signal.aborted) return;
        // Check for abort-like errors (some fetch implementations throw these)
        const e = err as {
          name?: string;
          code?: string;
          message?: string;
        };
        if (e.name === 'AbortError' || e.name === 'CanceledError' || e.code === 'ERR_CANCELED')
          return;
        console.error(errorMessage, err);
        setError(e.message || errorMessage);
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },
    [errorMessage]
  );

  // Track the current AbortController so refetch can abort the previous one
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    load(controller.signal);
    return () => {
      controller.abort();
    };
  }, [load]); // fetcherRef handles fetcher identity — no need to re-run on fetcher change

  const refetch = useCallback(() => {
    // Abort any in-flight request
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    load(controller.signal);
  }, [load]);

  return { data, setData, loading, error, setError, refetch };
}

export default useFetchData;
