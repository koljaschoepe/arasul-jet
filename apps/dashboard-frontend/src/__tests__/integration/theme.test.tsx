/**
 * Integration tests for the theme system.
 *
 * Tests theme behavior as users experience it:
 *   - Default dark theme
 *   - Theme toggle
 *   - Theme persistence in localStorage
 *   - CSS class application on <html> and <body>
 *   - System preference fallback
 */

import { renderHook, act } from '@testing-library/react';
import { useTheme } from '../../hooks/useTheme';

// ---- Tests ----

describe('Theme integration', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset DOM classes
    document.documentElement.classList.remove('dark');
    document.body.classList.remove('dark-mode', 'light-mode');
  });

  it('dark theme is the default when no saved preference', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');
  });

  it('applies dark CSS class to html element', () => {
    renderHook(() => useTheme());

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('applies dark-mode class to body element', () => {
    renderHook(() => useTheme());

    expect(document.body.classList.contains('dark-mode')).toBe(true);
    expect(document.body.classList.contains('light-mode')).toBe(false);
  });

  it('toggleTheme switches from dark to light', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('light');
  });

  it('toggle applies light CSS classes', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.body.classList.contains('light-mode')).toBe(true);
    expect(document.body.classList.contains('dark-mode')).toBe(false);
  });

  it('double toggle returns to dark theme', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });
    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('theme persists to localStorage', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });

    expect(localStorage.getItem('arasul_theme')).toBe('light');
  });

  it('loads persisted theme from localStorage', () => {
    localStorage.setItem('arasul_theme', 'light');

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('light');
  });

  it('setTheme directly sets the theme', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('light');
    });

    expect(result.current.theme).toBe('light');
    expect(localStorage.getItem('arasul_theme')).toBe('light');
  });

  it('setTheme back to dark works', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('light');
    });
    act(() => {
      result.current.setTheme('dark');
    });

    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.body.classList.contains('dark-mode')).toBe(true);
  });

  it('respects system preference when no saved theme', () => {
    // The mock matchMedia in setupTests returns matches: false (prefers dark)
    // so default should be dark
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');
  });

  it('theme persists across hook re-renders (simulating page load)', () => {
    // First render - toggle to light
    const { result: first, unmount } = renderHook(() => useTheme());
    act(() => {
      first.current.setTheme('light');
    });
    unmount();

    // Second render - should read from localStorage
    const { result: second } = renderHook(() => useTheme());
    expect(second.current.theme).toBe('light');
  });
});
