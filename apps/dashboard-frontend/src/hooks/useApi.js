/**
 * useApi - Central API hook for all data fetching
 *
 * Replaces manual fetch + error handling patterns throughout the app.
 * Provides get, post, put, patch, del methods with:
 * - Automatic auth headers
 * - JSON parsing
 * - Toast error notifications (configurable)
 * - Consistent error format
 *
 * Usage:
 *   const api = useApi();
 *   const data = await api.get('/documents');
 *   await api.post('/documents', { title: 'Neu' });
 *   await api.del('/documents/123');
 */

import { useCallback } from 'react';
import { API_BASE, getAuthHeaders } from '../config/api';
import { useToast } from '../contexts/ToastContext';

export function useApi() {
  const toast = useToast();

  const request = useCallback(
    async (path, options = {}) => {
      const {
        method = 'GET',
        body,
        showError = true,
        headers: extraHeaders,
        raw = false,
      } = options;

      const headers = {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
        ...extraHeaders,
      };

      // Remove Content-Type for FormData (browser sets it with boundary)
      if (body instanceof FormData) {
        delete headers['Content-Type'];
      }

      const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Unbekannter Fehler' }));
        if (showError && toast) {
          toast.error(error.message || `Fehler ${res.status}`);
        }
        const err = new Error(error.message || `HTTP ${res.status}`);
        err.status = res.status;
        err.data = error;
        throw err;
      }

      // Return raw response for non-JSON endpoints (downloads, etc.)
      if (raw) return res;

      // Handle empty responses (204 No Content)
      if (res.status === 204) return null;

      return res.json();
    },
    [toast]
  );

  return {
    get: useCallback((path, opts) => request(path, { ...opts, method: 'GET' }), [request]),
    post: useCallback(
      (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
      [request]
    ),
    put: useCallback(
      (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
      [request]
    ),
    patch: useCallback(
      (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
      [request]
    ),
    del: useCallback((path, opts) => request(path, { ...opts, method: 'DELETE' }), [request]),
    request,
  };
}

export default useApi;
