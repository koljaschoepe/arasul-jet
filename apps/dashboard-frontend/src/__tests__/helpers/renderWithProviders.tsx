/**
 * Shared test wrapper providing all required context providers.
 *
 * Usage:
 *   import { renderWithProviders, createMockApi } from '../helpers/renderWithProviders';
 *   const mockApi = createMockApi();
 *   renderWithProviders(<MyComponent />, { api: mockApi, route: '/settings' });
 */

import React, { type ReactNode } from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ApiMethods } from '../../hooks/useApi';

// ---- Mock factory helpers ----

export function createMockApi(overrides: Partial<ApiMethods> = {}): ApiMethods {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
    del: vi.fn().mockResolvedValue({}),
    request: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

export function createMockToast() {
  return {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  };
}

// ---- Provider wrapper ----

interface WrapperOptions {
  route?: string;
  /** Additional wrapper placed inside MemoryRouter */
  wrapper?: React.ComponentType<{ children: ReactNode }>;
}

function createWrapper({ route = '/', wrapper: InnerWrapper }: WrapperOptions = {}) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const content = InnerWrapper ? <InnerWrapper>{children}</InnerWrapper> : children;
    return <MemoryRouter initialEntries={[route]}>{content}</MemoryRouter>;
  };
}

// ---- renderWithProviders ----

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'>, WrapperOptions {}

export function renderWithProviders(
  ui: React.ReactElement,
  options: RenderWithProvidersOptions = {}
): RenderResult {
  const { route, wrapper: InnerWrapper, ...renderOptions } = options;
  return render(ui, {
    wrapper: createWrapper({ route, wrapper: InnerWrapper }),
    ...renderOptions,
  });
}
