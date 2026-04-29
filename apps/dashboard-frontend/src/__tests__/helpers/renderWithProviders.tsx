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

export function createMockAuth(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 1, username: 'admin' },
    isAuthenticated: true,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    checkAuth: vi.fn().mockResolvedValue(true),
    setLoadingComplete: vi.fn(),
    ...overrides,
  };
}

export function createMockDownloads(overrides: Record<string, unknown> = {}) {
  return {
    activeDownloads: {},
    activeDownloadCount: 0,
    activeDownloadsList: [],
    startDownload: vi.fn(),
    cancelDownload: vi.fn(),
    purgeDownload: vi.fn().mockResolvedValue(undefined),
    resumeDownload: vi.fn().mockResolvedValue(undefined),
    isDownloading: vi.fn().mockReturnValue(false),
    getDownloadState: vi.fn().mockReturnValue(null),
    onDownloadComplete: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  };
}

export function createMockChatContext(overrides: Record<string, unknown> = {}) {
  return {
    activeJobIds: {},
    globalQueue: { pending_count: 0, processing: null, queue: [] },
    installedModels: [],
    defaultModel: '',
    loadedModel: null,
    selectedModel: '',
    setSelectedModel: vi.fn(),
    favoriteModels: [],
    spaces: [],
    sendMessage: vi.fn(),
    reconnectToJob: vi.fn(),
    cancelJob: vi.fn(),
    abortExistingStream: vi.fn(),
    checkActiveJobs: vi.fn().mockResolvedValue(null),
    loadModels: vi.fn(),
    loadSpaces: vi.fn(),
    loadMessages: vi.fn().mockResolvedValue({ messages: [], hasMore: false }),
    setModelAsDefault: vi.fn(),
    toggleFavorite: vi.fn(),
    getActiveJobForChat: vi.fn().mockReturnValue(null),
    registerMessageCallback: vi.fn(),
    unregisterMessageCallback: vi.fn(),
    getBackgroundMessages: vi.fn().mockReturnValue(null),
    getBackgroundLoading: vi.fn().mockReturnValue(false),
    clearBackgroundState: vi.fn(),
    hasActiveStream: vi.fn().mockReturnValue(false),
    ...overrides,
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
