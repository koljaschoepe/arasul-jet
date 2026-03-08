/**
 * API Configuration
 * Central configuration for API endpoints and base URL
 *
 * LOW-PRIORITY-FIX 4.5: Updated to use consistent token key and validation
 */

import { getValidToken } from '../utils/token';

// Base URL for all API calls
export const API_BASE: string = import.meta.env.VITE_API_URL || '/api';

// Helper to get auth header
// LOW-PRIORITY-FIX 4.5: Use getValidToken for validated token retrieval
export const getAuthHeaders = (): Record<string, string> => {
  const token = getValidToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};
