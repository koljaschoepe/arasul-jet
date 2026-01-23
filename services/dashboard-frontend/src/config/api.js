/**
 * API Configuration
 * Central configuration for API endpoints and base URL
 *
 * LOW-PRIORITY-FIX 4.5: Updated to use consistent token key and validation
 */

import { getValidToken } from '../utils/token';

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
// LOW-PRIORITY-FIX 4.5: Use getValidToken for validated token retrieval
export const getAuthHeaders = () => {
  const token = getValidToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Combined headers with auth
export const getHeaders = () => ({
  ...defaultFetchOptions.headers,
  ...getAuthHeaders(),
});
