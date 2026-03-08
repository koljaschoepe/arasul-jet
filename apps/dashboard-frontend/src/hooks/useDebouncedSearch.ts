import { useState, useEffect, useRef } from 'react';

interface UseDebouncedSearchOptions<T> {
  initialResults: T;
  delay?: number;
  minLength?: number;
  /** Additional values that trigger a re-search when changed (e.g. filter state) */
  deps?: unknown[];
}

interface UseDebouncedSearchReturn<T> {
  results: T;
  searching: boolean;
}

/**
 * useDebouncedSearch - Debounced API search with AbortController
 *
 * Replaces the common pattern of useEffect + setTimeout + AbortController
 * for search-as-you-type. Handles:
 * - Debouncing by `delay` ms (default 300)
 * - AbortController cancellation on new query or unmount
 * - Resetting to `initialResults` when query is empty or below `minLength`
 * - Silent AbortError handling
 *
 * @param query - The search query string (from an input's state)
 * @param searcher - Async function that performs the search. Receives the trimmed
 *                   query and an AbortSignal. Return the results of type T.
 * @param options - Configuration: initialResults, delay, minLength, deps
 */
export function useDebouncedSearch<T>(
  query: string,
  searcher: (query: string, signal: AbortSignal) => Promise<T>,
  options: UseDebouncedSearchOptions<T>
): UseDebouncedSearchReturn<T> {
  const { initialResults, delay = 300, minLength = 1, deps } = options;
  const [results, setResults] = useState<T>(initialResults);
  const [searching, setSearching] = useState(false);
  const searcherRef = useRef(searcher);
  searcherRef.current = searcher;

  // Serialize extra deps to use as a single stable dependency
  const depsKey = deps ? JSON.stringify(deps) : '';

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < minLength) {
      setResults(initialResults);
      setSearching(false);
      return;
    }

    setSearching(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      try {
        const data = await searcherRef.current(trimmed, controller.signal);
        setResults(data);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        // Non-abort errors: stop searching indicator but don't update results
      } finally {
        if (!controller.signal.aborted) {
          setSearching(false);
        }
      }
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, delay, minLength, initialResults, depsKey]);

  return { results, searching };
}

export default useDebouncedSearch;
