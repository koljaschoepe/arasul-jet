import { useState, useEffect, useRef, useCallback } from 'react';
import { useApi } from './useApi';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const DISMISS_COOLDOWN_MS = 30 * 60 * 1000;

interface UseUpdateCheckerResult {
  updateAvailable: boolean;
  dismissUpdate: () => void;
}

/**
 * Polls /api/health every 5 minutes for build_hash changes. When a new hash
 * is observed (different from the one captured on first check), surfaces an
 * update banner. Dismiss has a 30-minute cooldown before re-surfacing.
 */
export function useUpdateChecker(isAuthenticated: boolean): UseUpdateCheckerResult {
  const api = useApi();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const initialBuildHashRef = useRef<string | null>(null);
  const updateDismissedRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated) return;

    const checkVersion = async () => {
      if (
        updateDismissedRef.current &&
        Date.now() - updateDismissedRef.current < DISMISS_COOLDOWN_MS
      ) {
        return;
      }
      try {
        const data = await api.get<{ build_hash?: string }>('/health', { showError: false });
        const hash = data.build_hash;
        if (!hash || hash === 'dev') return;
        if (!initialBuildHashRef.current) {
          initialBuildHashRef.current = hash;
        } else if (hash !== initialBuildHashRef.current) {
          setUpdateAvailable(true);
        }
      } catch {
        /* ignore */
      }
    };

    checkVersion();
    const id = setInterval(checkVersion, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isAuthenticated, api]);

  const dismissUpdate = useCallback(() => {
    setUpdateAvailable(false);
    updateDismissedRef.current = Date.now();
  }, []);

  return { updateAvailable, dismissUpdate };
}
