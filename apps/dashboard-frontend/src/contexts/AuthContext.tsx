/**
 * AuthContext - Centralized Authentication State Management
 *
 * PHASE 3: Extracts authentication logic from App.js for better separation of concerns.
 * Handles login, logout, session verification, and 401 interceptor.
 */

import React, {
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

interface User {
  id: number;
  username: string;
  [key: string]: any;
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
  checkAuth: () => Promise<boolean>;
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

  // Check for existing session on mount
  const checkAuth = useCallback(async () => {
    try {
      // Try to verify with backend using stored token
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          setIsAuthenticated(true);
          setUser(data.user);
          // Sync localStorage for consistency
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
      // Network error - use cached user data instead of forcing logout
      const cachedUser = localStorage.getItem('arasul_user');
      const cachedToken = localStorage.getItem('arasul_token');
      if (cachedUser && cachedToken) {
        try {
          const userData = JSON.parse(cachedUser);
          setIsAuthenticated(true);
          setUser(userData);
          setLoading(false);
          console.warn('Auth check failed (network error), using cached credentials');
          return true;
        } catch {
          // Corrupted cache - fall through to cleanup
        }
      }
      // No cached data - clean up
      localStorage.removeItem('arasul_token');
      localStorage.removeItem('arasul_user');
      setIsAuthenticated(false);
      setUser(null);
      setLoading(false);
      return false;
    }
  }, []);

  // Verify auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Handle login success
  const login = useCallback((data: LoginData) => {
    // Token is already stored by Login component
    // Sync user data and mark as authenticated
    setIsAuthenticated(true);
    setUser(data.user);
    // Note: Loading state is managed by App.js dataLoading, not here
  }, []);

  // Handle logout
  const logout = useCallback(async () => {
    try {
      const headers: Record<string, string> = getAuthHeaders();
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers,
      });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      localStorage.removeItem('arasul_token');
      localStorage.removeItem('arasul_user');
      setIsAuthenticated(false);
      setUser(null);
    }
  }, []);

  // Mark loading as complete (called by App.js after data fetch)
  const setLoadingComplete = useCallback(() => {
    setLoading(false);
  }, []);

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

export default AuthContext;
