import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTheme } from '../../hooks/useTheme';

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset DOM to a known state
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns black as default theme when no localStorage value', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('black');
  });

  it('reads light theme from localStorage', () => {
    localStorage.setItem('arasul_theme', 'light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
  });

  it('migration: stored dark stays dark', () => {
    localStorage.setItem('arasul_theme', 'dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('reads black theme from localStorage', () => {
    localStorage.setItem('arasul_theme', 'black');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('black');
  });

  it('migration: unknown stored values fall back to black', () => {
    localStorage.setItem('arasul_theme', 'invalid-value');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('black');
  });

  it('toggleTheme cycles black → dark → light → black', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('black');

    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe('dark');
    expect(localStorage.getItem('arasul_theme')).toBe('dark');

    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe('light');
    expect(localStorage.getItem('arasul_theme')).toBe('light');

    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe('black');
    expect(localStorage.getItem('arasul_theme')).toBe('black');
  });

  it('setTheme updates localStorage', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('light');
    });

    expect(result.current.theme).toBe('light');
    expect(localStorage.getItem('arasul_theme')).toBe('light');
  });

  it('black theme sets dark class and data-theme="black"', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('black');
    });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('black');
  });

  it('dark theme sets dark class and data-theme="dark"', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('dark');
    });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('light theme sets light class and data-theme="light"', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('light');
    });

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('keeps multiple hook instances in sync', () => {
    const first = renderHook(() => useTheme());
    const second = renderHook(() => useTheme());

    act(() => {
      first.result.current.setTheme('light');
    });

    expect(second.result.current.theme).toBe('light');

    act(() => {
      second.result.current.setTheme('dark');
    });

    expect(first.result.current.theme).toBe('dark');
  });
});
