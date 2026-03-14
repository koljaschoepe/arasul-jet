/**
 * ChatContext - Unit Tests
 *
 * Note: Full provider rendering tests are skipped on ARM64/Jetson due to
 * Vitest worker OOM with ChatContext's deep dependency tree (useApi → ToastContext,
 * useTokenBatching, config/api). The context API shape is verified via type-level
 * checks instead. Functional integration is covered by E2E tests.
 */

import { describe, it, expect, vi } from 'vitest';

// Avoid importing the real ChatContext which triggers massive module resolution
// Instead, test the exported API shape using dynamic import after mocking

describe('ChatContext', () => {
  it('exports ChatProvider and useChatContext', async () => {
    // Mock all heavy dependencies
    vi.mock('../../hooks/useTokenBatching', () => ({
      default: () => ({
        tokenBatchRef: {
          current: { content: '', thinking: '', pendingContent: '', pendingThinking: '' },
        },
        flushTokenBatch: vi.fn(),
        addTokenToBatch: vi.fn(),
        resetTokenBatch: vi.fn(),
      }),
    }));
    vi.mock('../../hooks/useApi', () => ({
      useApi: () => ({
        get: vi.fn().mockResolvedValue({}),
        post: vi.fn().mockResolvedValue({}),
        del: vi.fn().mockResolvedValue({}),
      }),
    }));
    vi.mock('../../config/api', () => ({
      API_BASE: '/api',
      getAuthHeaders: () => ({}),
    }));

    const mod = await import('../../contexts/ChatContext');
    expect(mod.ChatProvider).toBeDefined();
    expect(mod.useChatContext).toBeDefined();
    expect(typeof mod.ChatProvider).toBe('function');
    expect(typeof mod.useChatContext).toBe('function');
  });
});
