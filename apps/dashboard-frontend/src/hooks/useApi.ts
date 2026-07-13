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
    return {
      message: 'Es ist ein unerwarteter Fehler aufgetreten. Bitte versuchen Sie es erneut.',
    };
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

/**
 * Fetch a fresh CSRF token from the backend and let the browser store the
 * rotated `arasul_csrf` cookie. Used to recover from `403 CSRF_INVALID` when the
 * cookie expired/was cleared while the session is still valid — no re-login.
 *
 * Concurrent callers (e.g. a fast double-toggle where several mutations 403 at
 * once) share a single in-flight request, so we hit the endpoint only once and
 * every retry uses the same freshly-minted token. Never throws: on failure it
 * falls back to whatever token the cookie currently holds so the caller can
 * proceed and surface the real error.
 */
let csrfRefreshInFlight: Promise<string | null> | null = null;

function fetchFreshCsrfToken(): Promise<string | null> {
  if (!csrfRefreshInFlight) {
    csrfRefreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/csrf`, {
          method: 'GET',
          headers: { ...getAuthHeaders() },
          signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) return getCsrfToken();
        const data = (await res.json().catch(() => null)) as { csrfToken?: string } | null;
        return typeof data?.csrfToken === 'string' ? data.csrfToken : getCsrfToken();
      } catch {
        return getCsrfToken();
      } finally {
        csrfRefreshInFlight = null;
      }
    })();
  }
  return csrfRefreshInFlight;
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
  // P2.1.2: in-flight latch so parallel 401s do not all call logout simultaneously.
  const logoutInFlightRef = useRef(false);
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

      const isStateChanging = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';

      // LEAK-002: Default 30s timeout if no signal provided (prevents hanging requests)
      const effectiveSignal = signal || AbortSignal.timeout(30000);

      // `csrfOverride === undefined` → read the token fresh from the cookie (so
      // each request/retry always sends whatever the last rotation left behind,
      // which sidesteps the rotation race). A string override forces a specific
      // freshly-minted token on the retry after a CSRF refresh.
      const doFetch = (csrfOverride?: string | null): Promise<Response> => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
          ...extraHeaders,
        };

        // Add CSRF token for state-changing requests
        if (isStateChanging) {
          const csrfToken = csrfOverride !== undefined ? csrfOverride : getCsrfToken();
          if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
          }
        }

        // Remove Content-Type for FormData (browser sets it with boundary)
        if (body instanceof FormData) {
          delete headers['Content-Type'];
        }

        return fetch(`${API_BASE}${path}`, {
          method,
          headers,
          body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
          signal: effectiveSignal,
        });
      };

      let res = await doFetch();

      // CSRF recovery: the cookie is only minted at login and rotated on
      // mutations, so it can expire/vanish while the session is still valid —
      // every mutation then 403s with code CSRF_INVALID. Fetch a fresh token and
      // retry EXACTLY ONCE. Scoped to state-changing calls, skips /auth/* (the
      // token endpoint itself), and only fires on the distinct CSRF_INVALID code
      // — never on a 401 (handled below → logout) nor a genuine FORBIDDEN.
      if (isStateChanging && res.status === 403 && !path.startsWith('/auth/')) {
        const csrfBody = await res
          .clone()
          .json()
          .catch(() => null);
        if (normalizeErrorBody(csrfBody, 403).code === 'CSRF_INVALID') {
          const freshToken = await fetchFreshCsrfToken();
          res = await doFetch(freshToken);
        }
      }

      if (!res.ok) {
        // 401 interceptor: auto-logout on expired/invalid token.
        // P2.1.2: in-flight guard. Initial dashboard load fires multiple
        // parallel API calls; if the token is expired, every one of them
        // 401s and used to call logout() → multiple parallel /auth/logout
        // POSTs against an already-blacklisted token, racing to mutate
        // localStorage and tripping the auth rate limiter.
        if (res.status === 401 && !path.startsWith('/auth/')) {
          if (!logoutInFlightRef.current) {
            logoutInFlightRef.current = true;
            // Reset the latch as soon as the logout settles, so future
            // session-expiry events still fire correctly.
            Promise.resolve(logoutRef.current()).finally(() => {
              logoutInFlightRef.current = false;
            });
          }
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
