import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useTokenBatching from '../../hooks/useTokenBatching';

describe('useTokenBatching', () => {
  let setMessagesMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setMessagesMock = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns batch ref and functions', () => {
    const { result } = renderHook(() => useTokenBatching(setMessagesMock));

    expect(result.current.tokenBatchRef).toBeDefined();
    expect(result.current.flushTokenBatch).toBeInstanceOf(Function);
    expect(result.current.addTokenToBatch).toBeInstanceOf(Function);
    expect(result.current.resetTokenBatch).toBeInstanceOf(Function);
  });

  it('initializes with empty batch', () => {
    const { result } = renderHook(() => useTokenBatching(setMessagesMock));

    expect(result.current.tokenBatchRef.current).toEqual({
      content: '',
      thinking: '',
      pendingContent: '',
      pendingThinking: '',
    });
  });

  it('accumulates content tokens in pending', () => {
    const { result } = renderHook(() => useTokenBatching(setMessagesMock));

    act(() => {
      result.current.addTokenToBatch('content', 'Hello', 0);
      result.current.addTokenToBatch('content', ' World', 0);
    });

    expect(result.current.tokenBatchRef.current.pendingContent).toBe('Hello World');
  });

  it('accumulates thinking tokens in pending', () => {
    const { result } = renderHook(() => useTokenBatching(setMessagesMock));

    act(() => {
      result.current.addTokenToBatch('thinking', 'Let me ', 0);
      result.current.addTokenToBatch('thinking', 'think...', 0);
    });

    expect(result.current.tokenBatchRef.current.pendingThinking).toBe('Let me think...');
  });

  it('flushes pending content to accumulated on flush', () => {
    const { result } = renderHook(() => useTokenBatching(setMessagesMock));

    act(() => {
      result.current.addTokenToBatch('content', 'Hello', 0);
    });

    act(() => {
      result.current.flushTokenBatch(0, true);
    });

    expect(result.current.tokenBatchRef.current.content).toBe('Hello');
    expect(result.current.tokenBatchRef.current.pendingContent).toBe('');
    expect(setMessagesMock).toHaveBeenCalled();
  });

  it('does not call setMessages if nothing pending and not force', () => {
    const { result } = renderHook(() => useTokenBatching(setMessagesMock));

    act(() => {
      result.current.flushTokenBatch(0);
    });

    expect(setMessagesMock).not.toHaveBeenCalled();
  });

  it('validates index bounds in setMessages updater', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mockSetMessages = vi.fn((updater: (prev: any[]) => any[]) => {
      // Simulate empty messages array
      return updater([]);
    });

    const { result } = renderHook(() => useTokenBatching(mockSetMessages));

    act(() => {
      result.current.addTokenToBatch('content', 'test', 5);
    });

    act(() => {
      result.current.flushTokenBatch(5, true);
    });

    // Should have warned about invalid index
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid index'));

    consoleWarnSpy.mockRestore();
  });

  it('resets batch state completely', () => {
    const { result } = renderHook(() => useTokenBatching(setMessagesMock));

    act(() => {
      result.current.addTokenToBatch('content', 'Hello', 0);
      result.current.addTokenToBatch('thinking', 'Hmm', 0);
    });

    act(() => {
      result.current.resetTokenBatch();
    });

    expect(result.current.tokenBatchRef.current).toEqual({
      content: '',
      thinking: '',
      pendingContent: '',
      pendingThinking: '',
    });
  });

  it('schedules auto-flush after batch interval', () => {
    const { result } = renderHook(() => useTokenBatching(setMessagesMock, 100));

    act(() => {
      result.current.addTokenToBatch('content', 'Hello', 0);
    });

    // Before timer fires, setMessages not called
    expect(setMessagesMock).not.toHaveBeenCalled();

    // Advance timer past batch interval
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(setMessagesMock).toHaveBeenCalled();
  });
});
