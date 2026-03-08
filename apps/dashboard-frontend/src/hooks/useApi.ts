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

import { useCallback, useMemo, useRef } from 'react';
import { API_BASE, getAuthHeaders } from '../config/api';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';

interface ApiError extends Error {
  status: number;
  data?: Record<string, unknown>;
}

interface RequestOptions {
  method?: string;
  body?: Record<string, unknown> | FormData | unknown[] | null;
  showError?: boolean;
  headers?: Record<string, string>;
  raw?: boolean;
  signal?: AbortSignal;
}

type GetOptions = Omit<RequestOptions, 'method' | 'body'>;
type MutationOptions = Omit<RequestOptions, 'method' | 'body'>;

export interface ApiMethods {
  get: <T = unknown>(path: string, opts?: GetOptions) => Promise<T>;
  post: <T = unknown>(
    path: string,
    body?: RequestOptions['body'],
    opts?: MutationOptions
  ) => Promise<T>;
  put: <T = unknown>(
    path: string,
    body?: RequestOptions['body'],
    opts?: MutationOptions
  ) => Promise<T>;
  patch: <T = unknown>(
    path: string,
    body?: RequestOptions['body'],
    opts?: MutationOptions
  ) => Promise<T>;
  del: <T = unknown>(path: string, opts?: GetOptions) => Promise<T>;
  request: <T = unknown>(path: string, options?: RequestOptions) => Promise<T>;
}

export function useApi(): ApiMethods {
  const toast = useToast();
  const { logout } = useAuth();

  // Use ref for logout to prevent request callback recreation on auth state changes.
  // This breaks the useApi→AuthContext dependency chain that causes render loops.
  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  const request = useCallback(
    async <T = unknown>(path: string, options: RequestOptions = {}): Promise<T> => {
      const {
        method = 'GET',
        body,
        showError = true,
        headers: extraHeaders,
        raw = false,
        signal,
      } = options;

      const headers: Record<string, string> = {
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
        signal,
      });

      if (!res.ok) {
        // 401 interceptor: auto-logout on expired/invalid token
        if (res.status === 401 && !path.startsWith('/auth/')) {
          logoutRef.current();
          const err = new Error('Sitzung abgelaufen') as ApiError;
          err.status = 401;
          throw err;
        }

        const error = await res.json().catch(() => ({ message: 'Unbekannter Fehler' }));
        if (showError && toast) {
          toast.error(error.message || `Fehler ${res.status}`);
        }
        const err = new Error(error.message || `HTTP ${res.status}`) as ApiError;
        err.status = res.status;
        err.data = error;
        throw err;
      }

      // Return raw response for non-JSON endpoints (downloads, etc.)
      if (raw) return res as unknown as T;

      // Handle empty responses (204 No Content)
      if (res.status === 204) return null as T;

      return res.json() as Promise<T>;
    },
    [toast]
  );

  const get = useCallback(
    <T = unknown>(path: string, opts?: GetOptions): Promise<T> =>
      request<T>(path, { ...opts, method: 'GET' }),
    [request]
  );
  const post = useCallback(
    <T = unknown>(
      path: string,
      body?: RequestOptions['body'],
      opts?: MutationOptions
    ): Promise<T> => request<T>(path, { ...opts, method: 'POST', body }),
    [request]
  );
  const put = useCallback(
    <T = unknown>(
      path: string,
      body?: RequestOptions['body'],
      opts?: MutationOptions
    ): Promise<T> => request<T>(path, { ...opts, method: 'PUT', body }),
    [request]
  );
  const patch = useCallback(
    <T = unknown>(
      path: string,
      body?: RequestOptions['body'],
      opts?: MutationOptions
    ): Promise<T> => request<T>(path, { ...opts, method: 'PATCH', body }),
    [request]
  );
  const del = useCallback(
    <T = unknown>(path: string, opts?: GetOptions): Promise<T> =>
      request<T>(path, { ...opts, method: 'DELETE' }),
    [request]
  );

  return useMemo(
    () => ({ get, post, put, patch, del, request }),
    [get, post, put, patch, del, request]
  );
}

export default useApi;
