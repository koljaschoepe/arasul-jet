import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';

// Mock dependencies before importing useApi
const mockToast = { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() };
const mockLogout = vi.fn();

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => mockToast,
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ logout: mockLogout, isAuthenticated: true, loading: false, login: vi.fn() }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../config/api', () => ({
  API_BASE: '/api',
  getAuthHeaders: () => ({ Authorization: 'Bearer test-token' }),
}));

import { useApi, type ApiError } from '../../hooks/useApi';

describe('useApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('makes GET request with auth headers', async () => {
    const mockResponse = { data: 'test' };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });

    const { result } = renderHook(() => useApi());

    let data: unknown;
    await act(async () => {
      data = await result.current.get('/test');
    });

    expect(data).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
  });

  it('makes POST request with JSON body', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 1 }),
    });

    const { result } = renderHook(() => useApi());

    await act(async () => {
      await result.current.post('/items', { name: 'test' });
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/items',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'test' }),
      })
    );
  });

  it('calls logout on 401 response', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: 'Unauthorized' }),
    });

    const { result } = renderHook(() => useApi());

    await act(async () => {
      try {
        await result.current.get('/protected');
      } catch (e) {
        // Expected
      }
    });

    expect(mockLogout).toHaveBeenCalled();
  });

  it('shows toast error on failure when showError is true', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'Server Error' }),
    });

    const { result } = renderHook(() => useApi());

    await act(async () => {
      try {
        await result.current.get('/failing');
      } catch {
        // Expected
      }
    });

    expect(mockToast.error).toHaveBeenCalledWith('Server Error');
  });

  it('does not show toast when showError is false', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'Server Error' }),
    });

    const { result } = renderHook(() => useApi());

    await act(async () => {
      try {
        await result.current.get('/failing', { showError: false });
      } catch {
        // Expected
      }
    });

    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('handles 204 No Content', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: () => Promise.reject(new Error('no body')),
    });

    const { result } = renderHook(() => useApi());

    let data: unknown;
    await act(async () => {
      data = await result.current.del('/items/1');
    });

    expect(data).toBeNull();
  });

  it('uses default AbortSignal.timeout when no signal provided', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    const { result } = renderHook(() => useApi());

    await act(async () => {
      await result.current.get('/test');
    });

    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall?.[1].signal).toBeDefined();
  });

  it('strips Content-Type for FormData body', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ uploaded: true }),
    });

    const { result } = renderHook(() => useApi());
    const formData = new FormData();
    formData.append('file', new Blob(['test']), 'test.txt');

    await act(async () => {
      await result.current.post('/upload', formData as unknown as Record<string, unknown>);
    });

    const headers = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1].headers;
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('makes DELETE request', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 204,
    });

    const { result } = renderHook(() => useApi());

    await act(async () => {
      await result.current.del('/items/42');
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/items/42',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('makes PUT request', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ updated: true }),
    });

    const { result } = renderHook(() => useApi());

    await act(async () => {
      await result.current.put('/items/1', { name: 'updated' });
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/items/1',
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('makes PATCH request', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ patched: true }),
    });

    const { result } = renderHook(() => useApi());

    await act(async () => {
      await result.current.patch('/items/1', { name: 'patched' });
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/items/1',
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('handles network errors gracefully', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new TypeError('Failed to fetch')
    );

    const { result } = renderHook(() => useApi());

    await act(async () => {
      await expect(result.current.get('/unreachable')).rejects.toThrow('Failed to fetch');
    });
  });

  it('supports custom headers', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true }),
    });

    const { result } = renderHook(() => useApi());

    await act(async () => {
      await result.current.get('/custom', { headers: { 'X-Custom': 'value' } });
    });

    const headers = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1].headers;
    expect(headers['X-Custom']).toBe('value');
    // Auth header should still be present
    expect(headers['Authorization']).toBe('Bearer test-token');
  });

  it('handles JSON parse errors on error responses', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    });

    const { result } = renderHook(() => useApi());

    await act(async () => {
      try {
        await result.current.get('/bad-json');
      } catch (err) {
        // Should fall back to default message when JSON parsing fails
        const apiErr = err as ApiError;
        expect(apiErr.message).toBe(
          'Es ist ein unerwarteter Fehler aufgetreten. Bitte versuchen Sie es erneut.'
        );
        expect(apiErr.status).toBe(500);
      }
    });
  });

  it('uses provided abort signal instead of default timeout', async () => {
    const controller = new AbortController();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'ok' }),
    });

    const { result } = renderHook(() => useApi());

    await act(async () => {
      await result.current.get('/test', { signal: controller.signal });
    });

    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall?.[1].signal).toBe(controller.signal);
  });

  it('returns raw response when raw option is true', async () => {
    const rawResponse = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'test' }),
      blob: () => Promise.resolve(new Blob(['binary data'])),
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(rawResponse);

    const { result } = renderHook(() => useApi());

    let response: unknown;
    await act(async () => {
      response = await result.current.get('/download', { raw: true });
    });

    // Should return the raw response object, not parsed JSON
    expect(response).toBe(rawResponse);
  });

  it('does not call logout on 401 for auth endpoints', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: 'Invalid credentials' }),
    });

    const { result } = renderHook(() => useApi());

    await act(async () => {
      try {
        await result.current.post('/auth/login', { username: 'bad', password: 'bad' });
      } catch {
        // Expected
      }
    });

    // Should NOT call logout for /auth/ endpoints
    expect(mockLogout).not.toHaveBeenCalled();
  });

  // --- CSRF token recovery (Plan 003, Schritt 1) -------------------------
  // Build a fetch-Response-like mock whose clone() yields an independent copy
  // (useApi peeks the 403 body via res.clone().json()).
  const mockRes = (status: number, body: unknown) => {
    const make = (): unknown => ({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      clone: () => make(),
    });
    return make();
  };
  const callsTo = (url: string) =>
    (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(c => c[0] === url);

  it('refreshes the CSRF token and retries once on 403 CSRF_INVALID', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    let putAttempts = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/auth/csrf') {
        return Promise.resolve(mockRes(200, { csrfToken: 'fresh-token' }));
      }
      if (url === '/api/workspace-apps/n8n') {
        putAttempts += 1;
        return Promise.resolve(
          putAttempts === 1
            ? mockRes(403, { error: { code: 'CSRF_INVALID', message: 'CSRF token missing' } })
            : mockRes(200, { ok: true })
        );
      }
      return Promise.resolve(mockRes(404, {}));
    });

    const { result } = renderHook(() => useApi());
    let data: unknown;
    await act(async () => {
      data = await result.current.put('/workspace-apps/n8n', { enabled: false });
    });

    expect(data).toEqual({ ok: true });
    // Token re-minted exactly once, request retried exactly once (2 PUTs total).
    expect(callsTo('/api/auth/csrf').length).toBe(1);
    expect(callsTo('/api/workspace-apps/n8n').length).toBe(2);
    // Retry carried the freshly-minted token.
    expect(callsTo('/api/workspace-apps/n8n')[1]?.[1].headers['X-CSRF-Token']).toBe('fresh-token');
    // No error toast for a recovered request.
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('never refreshes/retries on 401 (real auth failure → logout)', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/workspace-apps/n8n') {
        return Promise.resolve(mockRes(401, { message: 'Sitzung abgelaufen' }));
      }
      return Promise.resolve(mockRes(500, {}));
    });

    const { result } = renderHook(() => useApi());
    await act(async () => {
      await expect(result.current.put('/workspace-apps/n8n', { enabled: false })).rejects.toThrow();
    });

    expect(callsTo('/api/auth/csrf').length).toBe(0);
    expect(callsTo('/api/workspace-apps/n8n').length).toBe(1);
    expect(mockLogout).toHaveBeenCalled();
  });

  it('does not retry on a genuine (non-CSRF) 403 FORBIDDEN', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/workspace-apps/n8n') {
        return Promise.resolve(
          mockRes(403, { error: { code: 'FORBIDDEN', message: 'Access denied' } })
        );
      }
      return Promise.resolve(mockRes(500, {}));
    });

    const { result } = renderHook(() => useApi());
    await act(async () => {
      await expect(result.current.put('/workspace-apps/n8n', { enabled: false })).rejects.toThrow(
        'Access denied'
      );
    });

    expect(callsTo('/api/auth/csrf').length).toBe(0);
    expect(callsTo('/api/workspace-apps/n8n').length).toBe(1);
  });

  it('dedupes the CSRF refresh across a concurrent double-toggle race', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const attempts: Record<string, number> = {};
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/auth/csrf') {
        return Promise.resolve(mockRes(200, { csrfToken: 'race-token' }));
      }
      if (url === '/api/workspace-apps/n8n' || url === '/api/workspace-apps/telegram') {
        attempts[url] = (attempts[url] ?? 0) + 1;
        return Promise.resolve(
          attempts[url] === 1
            ? mockRes(403, { error: { code: 'CSRF_INVALID' } })
            : mockRes(200, { ok: true })
        );
      }
      return Promise.resolve(mockRes(404, {}));
    });

    const { result } = renderHook(() => useApi());
    let results: unknown[] = [];
    await act(async () => {
      results = await Promise.all([
        result.current.put('/workspace-apps/n8n', { enabled: false }),
        result.current.put('/workspace-apps/telegram', { enabled: false }),
      ]);
    });

    expect(results).toEqual([{ ok: true }, { ok: true }]);
    // Both mutations 403'd concurrently but the token was re-minted only ONCE.
    expect(callsTo('/api/auth/csrf').length).toBe(1);
    expect(callsTo('/api/workspace-apps/n8n').length).toBe(2);
    expect(callsTo('/api/workspace-apps/telegram').length).toBe(2);
  });

  it('sets error status and data on thrown error', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ message: 'Validation failed', errors: { name: 'required' } }),
    });

    const { result } = renderHook(() => useApi());

    await act(async () => {
      try {
        await result.current.post('/items', { name: '' });
      } catch (err) {
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(422);
        expect(apiErr.data).toEqual({ message: 'Validation failed', errors: { name: 'required' } });
        expect(apiErr.message).toBe('Validation failed');
      }
    });
  });
});
