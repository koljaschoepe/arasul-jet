/**
 * Shared test utilities for the diamond test strategy
 *
 * Provides common wrappers and mocks used across unit and integration tests:
 * - renderWithProviders(): wraps components in AuthContext, ToastContext, BrowserRouter
 * - createMockApi(): creates a typed mock of the useApi hook
 * - mockApiResponse(): helper for creating mock fetch responses
 * - waitForLoadingToFinish(): waits for loading spinners to disappear
 */

import React, { type ReactNode } from 'react';
import { render, screen, waitFor, type RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ToastProvider } from '../../contexts/ToastContext';
import { AuthProvider } from '../../contexts/AuthContext';
import type { ApiMethods } from '../../hooks/useApi';

// ---------------------------------------------------------------------------
// Provider wrapper
// ---------------------------------------------------------------------------

interface ProvidersProps {
  children: ReactNode;
}

/**
 * Wraps the component tree in all providers needed for most tests:
 * AuthProvider → ToastProvider → BrowserRouter
 */
function AllProviders({ children }: ProvidersProps) {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>{children}</BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

/**
 * Render a component wrapped in the full provider stack.
 * Accepts all options from RTL's `render`, plus custom overrides.
 */
export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllProviders, ...options });
}

// ---------------------------------------------------------------------------
// API mock helpers
// ---------------------------------------------------------------------------

/**
 * Creates a fully-typed mock of the ApiMethods interface returned by useApi().
 * Every method is a vi.fn() that resolves to `{}` by default.
 */
export function createMockApi(): { [K in keyof ApiMethods]: ReturnType<typeof vi.fn> } {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
    del: vi.fn().mockResolvedValue({}),
    request: vi.fn().mockResolvedValue({}),
  };
}

/**
 * Creates a mock Response-like object for use with fetch mocks.
 *
 * @param status - HTTP status code
 * @param data   - JSON body to return from `.json()`
 * @param ok     - Override `ok` flag (defaults to status < 400)
 */
export function mockApiResponse(status: number, data: unknown = {}, ok?: boolean) {
  return {
    ok: ok ?? status < 400,
    status,
    json: () => Promise.resolve(data),
    headers: new Headers({ 'content-type': 'application/json' }),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

// ---------------------------------------------------------------------------
// Waiting helpers
// ---------------------------------------------------------------------------

/**
 * Waits until all loading spinners / skeleton screens have disappeared.
 * Useful when a component fetches data on mount.
 */
export async function waitForLoadingToFinish() {
  await waitFor(() => {
    const spinners = screen.queryAllByRole('status');
    const skeletons = document.querySelectorAll('.skeleton, [data-loading="true"]');
    expect([...spinners, ...skeletons]).toHaveLength(0);
  });
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

/**
 * Sets up localStorage with a valid auth token and user, simulating a logged-in session.
 */
export function seedAuthLocalStorage(
  token = 'test-token-123',
  user = { id: 1, username: 'admin', role: 'admin' }
) {
  localStorage.setItem('arasul_token', token);
  localStorage.setItem('arasul_user', JSON.stringify(user));
}

/**
 * Clears all auth-related localStorage keys.
 */
export function clearAuthLocalStorage() {
  localStorage.removeItem('arasul_token');
  localStorage.removeItem('arasul_user');
}
