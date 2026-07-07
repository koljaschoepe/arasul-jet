/**
 * AuthContext - Centralized Authentication State Management
 *
 * PHASE 3: Extracts authentication logic from App.js for better separation of concerns.
 * Handles login, logout, session verification, and 401 interceptor.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { API_BASE, getAuthHeaders } from '../config/api';
import { getCsrfToken } from '../utils/csrf';
import { getTokenExpiration } from '../utils/token';
import { queryClient } from '../lib/queryClient';

interface User {
  id: number;
  username: string;
  [key: string]: unknown;
}

interface LoginData {
  user: User;
  token?: string;
}

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (data: LoginData) => void;
  logout: () => Promise<void>;
  checkAuth: (signal?: AbortSignal) => Promise<boolean>;
  setLoadingComplete: () => void;
}

// Context
const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

// Provider Component
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount.
  // P2.1.1: Do NOT revive auth from localStorage cache on network error —
  // the server may have revoked the token. Better to surface "checking…" and
  // let the user retry than to silently reanimate a revoked session.
  // P2.1.4: AbortController so that StrictMode double-invokes and rapid
  // logout-during-checkAuth do not race.
  const checkAuth = useCallback(async (signal?: AbortSignal) => {
    try {
      // useApi-exception: AuthContext is the auth *primitive* useApi builds on
      // (useApi calls useAuth().logout). Routing these calls through useApi
      // would create a circular dependency + render loops (see useApi.ts:122)
      // and a 401 here would trigger logout mid-check. Raw fetch is deliberate.
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: getAuthHeaders(),
        signal,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          setIsAuthenticated(true);
          setUser(data.user);
          localStorage.setItem('arasul_user', JSON.stringify(data.user));
          setLoading(false);
          return true;
        }
      }

      // Token invalid or no user - clean up
      localStorage.removeItem('arasul_token');
      localStorage.removeItem('arasul_user');
      setIsAuthenticated(false);
      setUser(null);
      setLoading(false);
      return false;
    } catch (err) {
      // Aborted because the component unmounted or a fresh check was queued.
      // Do not mutate state here — the next caller owns it.
      if ((err as Error)?.name === 'AbortError') {
        return false;
      }
      // Network error: do NOT restore from localStorage (would revive revoked
      // tokens). Surface the failure as "not authenticated, please re-login".
      // The user can retry by reloading; UI already handles isAuthenticated=false.
      console.warn('Auth check failed (network error)');
      setIsAuthenticated(false);
      setUser(null);
      setLoading(false);
      return false;
    }
  }, []);

  // Verify auth on mount with AbortController so StrictMode double-mount /
  // rapid unmount don't write stale auth state.
  useEffect(() => {
    const controller = new AbortController();
    checkAuth(controller.signal);
    return () => controller.abort();
  }, [checkAuth]);

  // Handle login success
  const login = useCallback((data: LoginData) => {
    // Token is already stored by Login component
    // Sync user data and mark as authenticated
    setIsAuthenticated(true);
    setUser(data.user);
    // Note: Loading state is managed by App.js dataLoading, not here
  }, []);

  // P2.1.3: Cross-user data leak — logout() must clear the React Query cache
  // BEFORE flipping isAuthenticated. Otherwise the next user's mount sees the
  // previous user's chats/projects/documents until each query refetches.
  const logout = useCallback(async () => {
    try {
      const headers: Record<string, string> = getAuthHeaders();
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }
      // useApi-exception: see checkAuth above — auth primitive, raw fetch by design.
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers,
      });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      // Wipe all client-side state that could leak across users.
      queryClient.clear();
      localStorage.removeItem('arasul_token');
      localStorage.removeItem('arasul_user');
      // arasul_csrf is a cookie, not localStorage — clear it explicitly.
      document.cookie = 'arasul_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      setIsAuthenticated(false);
      setUser(null);
    }
  }, []);

  // Mark loading as complete (called by App.js after data fetch)
  const setLoadingComplete = useCallback(() => {
    setLoading(false);
  }, []);

  // Token expiration warning — check every 60s, warn 5 min before expiry
  useEffect(() => {
    if (!isAuthenticated) return;

    let warningShown = false;
    const checkExpiration = () => {
      const exp = getTokenExpiration();
      if (!exp) return;

      const remaining = exp.getTime() - Date.now();
      const fiveMinutes = 5 * 60 * 1000;

      if (remaining <= 0) {
        logout();
      } else if (remaining < fiveMinutes && !warningShown) {
        warningShown = true;
        // Dispatch custom event — ToastContext picks it up without circular import
        window.dispatchEvent(
          new CustomEvent('arasul:token-expiring', {
            detail: { minutesLeft: Math.ceil(remaining / 60000) },
          })
        );
      }
    };

    checkExpiration();
    const interval = setInterval(checkExpiration, 60000);
    return () => clearInterval(interval);
  }, [isAuthenticated, logout]);

  // P2.1.7: Cross-tab logout sync. If another tab clears the token (logout
  // there, password change, etc.), this tab should follow immediately
  // instead of waiting for its next API call to 401.
  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key === 'arasul_token' && !event.newValue && isAuthenticated) {
        // Clear local state without an extra logout API call (the other tab
        // already invalidated server-side).
        queryClient.clear();
        localStorage.removeItem('arasul_user');
        setIsAuthenticated(false);
        setUser(null);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [isAuthenticated]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated,
      loading,
      login,
      logout,
      checkAuth,
      setLoadingComplete,
    }),
    [user, isAuthenticated, loading, login, logout, checkAuth, setLoadingComplete]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook to use auth context
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
