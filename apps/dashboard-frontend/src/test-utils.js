/**
 * Shared test utilities — provides context wrappers and mock factories.
 *
 * Usage:
 *   import { renderWithProviders, createMockApi } from '../../test-utils';
 *   const mockApi = createMockApi();
 *   jest.mock('../../hooks/useApi', () => ({ useApi: () => mockApi }));
 *   renderWithProviders(<MyComponent />);
 */

import React from 'react';
import { render } from '@testing-library/react';
import { ToastProvider } from './contexts/ToastContext';
import { MemoryRouter } from 'react-router-dom';

/**
 * Create a mock API object matching the useApi() return shape.
 * All methods are jest.fn() that resolve to {} by default.
 */
export function createMockApi() {
  return {
    get: jest.fn().mockResolvedValue({}),
    post: jest.fn().mockResolvedValue({}),
    put: jest.fn().mockResolvedValue({}),
    patch: jest.fn().mockResolvedValue({}),
    del: jest.fn().mockResolvedValue({}),
    request: jest.fn().mockResolvedValue({}),
  };
}

/**
 * Render a component wrapped in all required providers.
 * Accepts the same options as @testing-library/react render(),
 * plus `route` (default '/') for MemoryRouter initialEntries.
 */
export function renderWithProviders(ui, { route = '/', ...options } = {}) {
  function Wrapper({ children }) {
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
