import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useContextEstimate, __internals } from '../../hooks/useContextEstimate';
import type { ChatMessage, InstalledModel } from '../../types';

function msg(role: ChatMessage['role'], content: string, thinking?: string): ChatMessage {
  return { role, content, ...(thinking ? { thinking, hasThinking: true } : {}) } as ChatMessage;
}

const FALLBACK = __internals.FALLBACK_CONTEXT_WINDOW;

describe('useContextEstimate', () => {
  it('returns 0 tokens for an empty conversation', () => {
    const { result } = renderHook(() =>
      useContextEstimate([], 'gemma3', [{ id: 'gemma3', name: 'gemma3' } as InstalledModel])
    );
    expect(result.current.estimatedTokens).toBe(0);
    expect(result.current.utilization).toBe(0);
    expect(result.current.exceedsThreshold).toBe(false);
  });

  it('uses the model max_context_window when known', () => {
    const installed: InstalledModel[] = [
      { id: 'gemma3', name: 'gemma3', max_context_window: 32_000 },
    ];
    const { result } = renderHook(() =>
      useContextEstimate([msg('user', 'hi')], 'gemma3', installed)
    );
    expect(result.current.contextWindow).toBe(32_000);
    expect(result.current.hasModelInfo).toBe(true);
  });

  it('falls back to default context window when model is unknown', () => {
    const { result } = renderHook(() =>
      useContextEstimate([msg('user', 'hi')], 'unknown-model', [])
    );
    expect(result.current.contextWindow).toBe(FALLBACK);
    expect(result.current.hasModelInfo).toBe(false);
  });

  it('estimates roughly chars/4 + 4 overhead per message', () => {
    // 40 chars of content → 10 base tokens, +4 overhead = 14
    const { result } = renderHook(() =>
      useContextEstimate([msg('user', 'a'.repeat(40))], 'm', [
        { id: 'm', name: 'm', max_context_window: 1000 } as InstalledModel,
      ])
    );
    expect(result.current.estimatedTokens).toBe(14);
  });

  it('counts thinking content too', () => {
    // content: 20 chars (5 tokens) + thinking: 40 chars (10 tokens) + 4 overhead = 19
    const { result } = renderHook(() =>
      useContextEstimate([msg('assistant', 'a'.repeat(20), 'b'.repeat(40))], 'm', [
        { id: 'm', name: 'm', max_context_window: 1000 } as InstalledModel,
      ])
    );
    expect(result.current.estimatedTokens).toBe(19);
  });

  it('skips system compaction banners (backend strips them too)', () => {
    const messages = [
      msg('user', 'hi'),
      { role: 'system', type: 'compaction', content: 'banner' } as unknown as ChatMessage,
    ];
    const { result } = renderHook(() =>
      useContextEstimate(messages, 'm', [
        { id: 'm', name: 'm', max_context_window: 1000 } as InstalledModel,
      ])
    );
    // hi (1 token) + 4 overhead, banner ignored
    expect(result.current.estimatedTokens).toBe(5);
  });

  it('signals exceedsThreshold when utilization > 0.8', () => {
    // contextWindow 100, content of 360 chars = 90 tokens + 4 = 94 → 94%
    const { result } = renderHook(() =>
      useContextEstimate([msg('user', 'a'.repeat(360))], 'm', [
        { id: 'm', name: 'm', max_context_window: 100 } as InstalledModel,
      ])
    );
    expect(result.current.exceedsThreshold).toBe(true);
    expect(result.current.utilization).toBeCloseTo(0.94, 2);
  });

  it('does NOT signal exceedsThreshold at exactly 0.8 (>, not ≥)', () => {
    // contextWindow 1000, total = 800 tokens
    // Build with one message: 796 chars → 199 tokens + 4 overhead = 203, not 800.
    // Use 3184 chars instead → 796 tokens + 4 = 800
    const { result } = renderHook(() =>
      useContextEstimate([msg('user', 'a'.repeat(3184))], 'm', [
        { id: 'm', name: 'm', max_context_window: 1000 } as InstalledModel,
      ])
    );
    expect(result.current.utilization).toBe(0.8);
    expect(result.current.exceedsThreshold).toBe(false);
  });
});
