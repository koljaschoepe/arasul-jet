import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTheme } from '../../hooks/useTheme';

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset DOM classes to a known state
    document.documentElement.classList.remove('dark');
    document.body.classList.remove('light-mode', 'dark-mode');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns dark as default theme when no localStorage value', () => {
    // matchMedia mock returns matches: false by default (prefers dark)
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('reads theme from localStorage', () => {
    localStorage.setItem('arasul_theme', 'light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
  });

  it('reads dark theme from localStorage', () => {
    localStorage.setItem('arasul_theme', 'dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('toggleTheme switches from dark to light', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('light');
    expect(localStorage.getItem('arasul_theme')).toBe('light');
  });

  it('toggleTheme switches from light to dark', () => {
    localStorage.setItem('arasul_theme', 'light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('dark');
    expect(localStorage.getItem('arasul_theme')).toBe('dark');
  });

  it('setTheme updates localStorage', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('light');
    });

    expect(result.current.theme).toBe('light');
    expect(localStorage.getItem('arasul_theme')).toBe('light');
  });

  it('adds dark class on html element for dark theme', () => {
    const { result } = renderHook(() => useTheme());

    // Force dark theme (default)
    act(() => {
      result.current.setTheme('dark');
    });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.body.classList.contains('dark-mode')).toBe(true);
    expect(document.body.classList.contains('light-mode')).toBe(false);
  });

  it('removes dark class and adds light-mode for light theme', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('light');
    });

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.body.classList.contains('light-mode')).toBe(true);
    expect(document.body.classList.contains('dark-mode')).toBe(false);
  });

  it('ignores invalid localStorage values and falls back to system preference', () => {
    localStorage.setItem('arasul_theme', 'invalid-value');
    // matchMedia mock returns matches: false → system prefers dark
    const { result } = renderHook(() => useTheme());
    // Should fall back to system preference (dark, since matchMedia.matches is false)
    expect(result.current.theme).toBe('dark');
  });
});
