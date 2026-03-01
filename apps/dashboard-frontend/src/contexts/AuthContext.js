/**
 * AuthContext - Centralized Authentication State Management
 *
 * PHASE 3: Extracts authentication logic from App.js for better separation of concerns.
 * Handles login, logout, session verification, and 401 interceptor.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { API_BASE, getAuthHeaders } from '../config/api';

// Context
const AuthContext = createContext(null);

// Provider Component
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
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
      setLoading(false);
      return false;
    } catch (err) {
      // Network error - clean up
      localStorage.removeItem('arasul_token');
      localStorage.removeItem('arasul_user');
      setLoading(false);
      return false;
    }
  }, []);

  // Verify auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Handle login success
  const login = useCallback(data => {
    // Token is already stored by Login component
    // Sync user data and mark as authenticated
    setIsAuthenticated(true);
    setUser(data.user);
    // Note: Loading state is managed by App.js dataLoading, not here
  }, []);

  // Handle logout
  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: getAuthHeaders(),
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

  const value = {
    user,
    isAuthenticated,
    loading,
    login,
    logout,
    checkAuth,
    setLoadingComplete,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
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
