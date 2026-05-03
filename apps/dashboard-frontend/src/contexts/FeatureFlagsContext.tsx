/**
 * Feature-Flags Context — Compliance-Gates für UI (Phase 1.4 + 1.6).
 *
 * Lädt einmal beim App-Mount die public feature-flags vom Backend.
 * Werte werden alle 60s revalidiert. Default = restriktiv:
 * Telegram OFF, AI-Transparenz ON.
 */

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { API_BASE } from '../config/api';

export interface FeatureFlags {
  telegram_enabled: boolean;
  ai_transparency_enabled: boolean;
}

interface FeatureFlagsContextValue {
  flags: FeatureFlags;
  loading: boolean;
  refresh: () => Promise<void>;
}

const DEFAULT_FLAGS: FeatureFlags = {
  telegram_enabled: false,
  ai_transparency_enabled: true,
};

const FeatureFlagsContext = createContext<FeatureFlagsContextValue>({
  flags: DEFAULT_FLAGS,
  loading: true,
  refresh: async () => {},
});

const REFRESH_INTERVAL_MS = 60_000;

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/system/feature-flags`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFlags({
        telegram_enabled: !!data.telegram_enabled,
        ai_transparency_enabled: data.ai_transparency_enabled ?? true,
      });
    } catch {
      setFlags(DEFAULT_FLAGS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const value = useMemo(() => ({ flags, loading, refresh }), [flags, loading, refresh]);
  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>;
}

export function useFeatureFlags(): FeatureFlagsContextValue {
  return useContext(FeatureFlagsContext);
}
