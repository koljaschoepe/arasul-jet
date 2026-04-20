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
import { getCsrfToken } from '../utils/csrf';

export interface ApiError extends Error {
  status: number;
  /** Stable machine-readable error code (e.g. 'VALIDATION_ERROR'). */
  code?: string;
  /** Optional structured error details (e.g. validation field errors). */
  details?: unknown;
  /** Raw response body for debugging; prefer message/code/details on the error itself. */
  data?: Record<string, unknown>;
}

/**
 * Normalize a backend error body into a flat { message, code, details } triple.
 * Supports the canonical nested envelope { error: { code, message, details } }
 * and falls back to legacy flat shapes { error: 'msg', code, details } or
 * { message: 'msg' } so tests/edge cases keep working.
 */
function normalizeErrorBody(
  body: unknown,
  statusCode: number
): {
  message: string;
  code?: string;
  details?: unknown;
} {
  if (body === null || body === undefined) {
    return { message: 'Unbekannter Fehler' };
  }
  if (body && typeof body === 'object') {
    const payload = body as Record<string, unknown>;
    const nested = payload.error;
    if (nested && typeof nested === 'object') {
      const n = nested as Record<string, unknown>;
      return {
        message:
          typeof n.message === 'string'
            ? n.message
            : typeof payload.message === 'string'
              ? payload.message
              : `HTTP ${statusCode}`,
        code: typeof n.code === 'string' ? n.code : undefined,
        details: n.details,
      };
    }
    if (typeof nested === 'string') {
      return {
        message: nested,
        code: typeof payload.code === 'string' ? payload.code : undefined,
        details: payload.details,
      };
    }
    if (typeof payload.message === 'string') {
      return {
        message: payload.message,
        code: typeof payload.code === 'string' ? payload.code : undefined,
        details: payload.details,
      };
    }
  }
  return { message: `HTTP ${statusCode}` };
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

      // Add CSRF token for state-changing requests
      if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
        const csrfToken = getCsrfToken();
        if (csrfToken) {
          headers['X-CSRF-Token'] = csrfToken;
        }
      }

      // Remove Content-Type for FormData (browser sets it with boundary)
      if (body instanceof FormData) {
        delete headers['Content-Type'];
      }

      // LEAK-002: Default 30s timeout if no signal provided (prevents hanging requests)
      const effectiveSignal = signal || AbortSignal.timeout(30000);

      const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
        signal: effectiveSignal,
      });

      if (!res.ok) {
        // 401 interceptor: auto-logout on expired/invalid token
        if (res.status === 401 && !path.startsWith('/auth/')) {
          logoutRef.current();
          const err = new Error('Sitzung abgelaufen') as ApiError;
          err.status = 401;
          throw err;
        }

        const rawBody = await res.json().catch(() => null);
        const { message, code, details } = normalizeErrorBody(rawBody, res.status);
        if (showError && toast) {
          toast.error(message);
        }
        const err = new Error(message) as ApiError;
        err.status = res.status;
        err.code = code;
        err.details = details;
        err.data = (rawBody as Record<string, unknown>) ?? undefined;
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
