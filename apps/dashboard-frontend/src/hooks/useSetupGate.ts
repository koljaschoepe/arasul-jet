import { useState, useEffect, useCallback } from 'react';
import { useApi } from './useApi';

interface UseSetupGateResult {
  setupComplete: boolean | null;
  showSetupWizard: boolean;
  closeSetupWizard: () => void;
}

/**
 * Checks /system/setup-status after authentication and decides whether to show
 * the setup wizard. Returns null while loading. If the endpoint doesn't exist
 * (older backend), assumes setup is complete.
 */
export function useSetupGate(isAuthenticated: boolean): UseSetupGateResult {
  const api = useApi();
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [showSetupWizard, setShowSetupWizard] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;

    const controller = new AbortController();
    const checkSetupStatus = async () => {
      try {
        const data = await api.get<{ setupComplete?: boolean }>('/system/setup-status', {
          signal: controller.signal,
          showError: false,
        });
        const isComplete = !!data.setupComplete;
        setSetupComplete(isComplete);
        if (!isComplete) setShowSetupWizard(true);
      } catch {
        if (controller.signal.aborted) return;
        setSetupComplete(true);
      }
    };

    checkSetupStatus();
    return () => controller.abort();
  }, [isAuthenticated, api]);

  const closeSetupWizard = useCallback(() => {
    setShowSetupWizard(false);
    setSetupComplete(true);
  }, []);

  return { setupComplete, showSetupWizard, closeSetupWizard };
}
