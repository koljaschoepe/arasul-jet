/**
 * Shared test utilities — provides context wrappers and mock factories.
 *
 * Usage:
 *   import { renderWithProviders, createMockApi } from '../../test-utils';
 *   const mockApi = createMockApi();
 *   vi.mock('../../hooks/useApi', () => ({ useApi: () => mockApi }));
 *   renderWithProviders(<MyComponent />);
 */

import React, { type ReactElement, type ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { ToastProvider } from './contexts/ToastContext';
import { MemoryRouter } from 'react-router-dom';

/**
 * Create a mock API object matching the useApi() return shape.
 * All methods are vi.fn() that resolve to {} by default.
 */
export function createMockApi() {
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
 * Render a component wrapped in all required providers.
 * Accepts the same options as @testing-library/react render(),
 * plus `route` (default '/') for MemoryRouter initialEntries.
 */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', ...options }: RenderOptions & { route?: string } = {}
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[route]}>
        <ToastProvider>{children}</ToastProvider>
      </MemoryRouter>
    );
  }
  return render(ui, { wrapper: Wrapper, ...options });
}

/**
 * Re-export everything from @testing-library/react so tests
 * can import { screen, waitFor, … } from the same place.
 */
export * from '@testing-library/react';
