/**
 * AuthContext - Centralized Authentication State Management
 *
 * PHASE 3: Extracts authentication logic from App.js for better separation of concerns.
 * Handles login, logout, session verification, and 401 interceptor.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import { API_BASE } from '../config/api';

// Context
const AuthContext = createContext(null);

// Provider Component
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // ML-004 FIX: Use ref instead of global variable for 401 handling
  const isHandling401Ref = useRef(false);

  // Setup 401 interceptor
  useEffect(() => {
    const interceptorId = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        // Don't trigger logout for auth/me endpoint (that's expected when not logged in)
        const isAuthMeRequest = error.config?.url?.includes('/auth/me');

        if (error.response?.status === 401 && !isAuthMeRequest && !isHandling401Ref.current) {
          // Token expired or invalid for a protected endpoint
          isHandling401Ref.current = true;
          console.log('[Auth] 401 received, clearing token and redirecting to login');
          localStorage.removeItem('arasul_token');
          localStorage.removeItem('arasul_user');

          // Use a short delay to allow current request cycle to complete
          setTimeout(() => {
            setIsAuthenticated(false);
            setUser(null);
            // Only reload if we're not already on the login page
            if (window.location.pathname !== '/') {
              window.location.href = '/';
            }
            isHandling401Ref.current = false;
          }, 100);
        }
        return Promise.reject(error);
      }
    );

    // Cleanup: eject interceptor on unmount
    return () => {
      axios.interceptors.response.eject(interceptorId);
    };
  }, []);

  // Check for existing session on mount
  const checkAuth = useCallback(async () => {
    try {
      // Try to verify with backend (works with both cookie and localStorage token)
      const response = await axios.get(`${API_BASE}/auth/me`);
      if (response.data.user) {
        setIsAuthenticated(true);
        setUser(response.data.user);
        // Sync localStorage for consistency
        localStorage.setItem('arasul_user', JSON.stringify(response.data.user));
        return true;
      } else {
        setLoading(false);
        return false;
      }
    } catch (err) {
      // Cookie/token invalid - check localStorage fallback
      const token = localStorage.getItem('arasul_token');
      const storedUser = localStorage.getItem('arasul_user');

      if (token && storedUser) {
        // Try with localStorage token (will be added by interceptor)
        try {
          const retryResponse = await axios.get(`${API_BASE}/auth/me`);
          if (retryResponse.data.user) {
            setIsAuthenticated(true);
            setUser(retryResponse.data.user);
            return true;
          } else {
            localStorage.removeItem('arasul_token');
            localStorage.removeItem('arasul_user');
            setLoading(false);
            return false;
          }
        } catch {
          localStorage.removeItem('arasul_token');
          localStorage.removeItem('arasul_user');
          setLoading(false);
          return false;
        }
      } else {
        setLoading(false);
        return false;
      }
    }
  }, []);

  // Verify auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Handle login success
  const login = useCallback((data) => {
    setIsAuthenticated(true);
    setUser(data.user);
    setLoading(true); // Trigger data loading in App.js
  }, []);

  // Handle logout
  const logout = useCallback(async () => {
    try {
      await axios.post(`${API_BASE}/auth/logout`);
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

  const value = {
    user,
    isAuthenticated,
    loading,
    login,
    logout,
    checkAuth,
    setLoadingComplete
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
