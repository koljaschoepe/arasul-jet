/**
 * API Configuration
 * Central configuration for API endpoints and base URL
 */

// Base URL for all API calls
export const API_BASE = process.env.REACT_APP_API_URL || '/api';

// Common fetch options
export const defaultFetchOptions = {
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
};

// Helper to get auth header
export const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Combined headers with auth
export const getHeaders = () => ({
  ...defaultFetchOptions.headers,
  ...getAuthHeaders(),
});
