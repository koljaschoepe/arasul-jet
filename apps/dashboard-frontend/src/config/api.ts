/**
 * API Configuration
 * Central configuration for API endpoints and base URL
 *
 * LOW-PRIORITY-FIX 4.5: Updated to use consistent token key and validation
 */

import { getValidToken } from '../utils/token';
import { getCsrfToken } from '../utils/csrf';

// Base URL for all API calls
export const API_BASE: string = import.meta.env.VITE_API_URL || '/api';

// Helper to get auth + CSRF headers
// LOW-PRIORITY-FIX 4.5: Use getValidToken for validated token retrieval
export const getAuthHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {};
  const token = getValidToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const csrfToken = getCsrfToken();
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }
  return headers;
};
