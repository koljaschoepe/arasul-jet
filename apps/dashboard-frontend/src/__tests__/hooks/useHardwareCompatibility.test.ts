/**
 * Phase 2.1 — useHardwareCompatibility decision matrix.
 *
 * Validates the fit/canLoadNow/wouldEvict logic against the budget shape
 * the backend actually returns. Network is mocked via the global fetch.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useHardwareCompatibility, formatMb } from '../../hooks/queries/useHardwareCompatibility';
import { ToastProvider } from '../../contexts/ToastContext';
import { AuthProvider } from '../../contexts/AuthContext';
import { MemoryRouter } from 'react-router-dom';
import type { MemoryBudget } from '../../types';

function makeBudget(over: Partial<MemoryBudget> = {}): MemoryBudget {
  return {
    totalBudgetMb: 32 * 1024,
    usedMb: 0,
    availableMb: 32 * 1024,
    safetyBufferMb: 2 * 1024,
    loadedModels: [],
    canLoadMore: true,
    ...over,
  };
}

function wrapper(qc: QueryClient) {
  // useApi() (transitively via the hook) requires ToastProvider + AuthProvider.
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(
        AuthProvider,
        null,
        React.createElement(
          ToastProvider,
          null,
          React.createElement(QueryClientProvider, { client: qc }, children)
        )
      )
    );
}

const realFetch = global.fetch;

function mockBudget(budget: MemoryBudget) {
  global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/models/memory-budget')) {
      return new Response(JSON.stringify(budget), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
}

describe('useHardwareCompatibility', () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    qc.clear();
    global.fetch = realFetch;
  });

  it('returns "unknown" when budget has not loaded yet', () => {
    mockBudget(makeBudget());
    const { result } = renderHook(() => useHardwareCompatibility({ ram_required_gb: 8 }), {
      wrapper: wrapper(qc),
    });
    // Right after mount, the query hasn't resolved → no budget yet
    expect(result.current.fit).toBe('unknown');
    expect(result.current.canLoadNow).toBe(true); // permissive default
  });

  it('returns "fits" when required ≤ 80% of total', async () => {
    // 32GB total → 80% = 25.6GB. A 10GB model fits comfortably.
    mockBudget(makeBudget({ totalBudgetMb: 32 * 1024, availableMb: 32 * 1024 }));
    const { result } = renderHook(() => useHardwareCompatibility({ ram_required_gb: 10 }), {
      wrapper: wrapper(qc),
    });
    await waitFor(() => expect(result.current.fit).toBe('fits'));
    expect(result.current.canLoadNow).toBe(true);
    expect(result.current.wouldEvict).toBe(false);
  });

  it('returns "tight" when required is in the 80-100% band', async () => {
    // 32GB total → 80% = 25.6GB. 28GB model is tight.
    mockBudget(makeBudget({ totalBudgetMb: 32 * 1024, availableMb: 32 * 1024 }));
    const { result } = renderHook(() => useHardwareCompatibility({ ram_required_gb: 28 }), {
      wrapper: wrapper(qc),
    });
    await waitFor(() => expect(result.current.fit).toBe('tight'));
  });

  it('returns "too_big" when required > total budget', async () => {
    // 32GB total, 70B model wants ~50GB → too_big.
    mockBudget(makeBudget({ totalBudgetMb: 32 * 1024 }));
    const { result } = renderHook(() => useHardwareCompatibility({ ram_required_gb: 50 }), {
      wrapper: wrapper(qc),
    });
    await waitFor(() => expect(result.current.fit).toBe('too_big'));
  });

  it('signals wouldEvict when fits statically but not enough free RAM right now', async () => {
    // 32GB total but 24GB already used by other models. Required 10GB:
    // statically fits, but availableMb = 8GB < required → eviction needed.
    mockBudget(makeBudget({ totalBudgetMb: 32 * 1024, usedMb: 24 * 1024, availableMb: 8 * 1024 }));
    const { result } = renderHook(() => useHardwareCompatibility({ ram_required_gb: 10 }), {
      wrapper: wrapper(qc),
    });
    await waitFor(() => expect(result.current.fit).toBe('fits'));
    expect(result.current.canLoadNow).toBe(false);
    expect(result.current.wouldEvict).toBe(true);
  });
});

describe('formatMb', () => {
  it('renders 0 / negative as "0 GB"', () => {
    expect(formatMb(0)).toBe('0 GB');
    expect(formatMb(-5)).toBe('0 GB');
  });
  it('keeps sub-1024 values in MB', () => {
    expect(formatMb(512)).toBe('512 MB');
  });
  it('uses one decimal under 10 GB', () => {
    expect(formatMb(2 * 1024)).toBe('2.0 GB');
    expect(formatMb(2.5 * 1024)).toBe('2.5 GB');
  });
  it('rounds at or above 10 GB', () => {
    expect(formatMb(32 * 1024)).toBe('32 GB');
    expect(formatMb(45.4 * 1024)).toBe('45 GB');
  });
});
