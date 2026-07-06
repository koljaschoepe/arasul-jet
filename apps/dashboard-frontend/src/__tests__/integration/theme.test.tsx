/**
 * Integration tests for the theme system.
 *
 * Tests theme behavior as users experience it:
 *   - Default dark theme
 *   - Theme toggle
 *   - Theme persistence in localStorage
 *   - CSS class application on <html>
 *   - System preference fallback
 */

import { renderHook, act } from '@testing-library/react';
import { useTheme } from '../../hooks/useTheme';

// ---- Tests ----

describe('Theme integration', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset DOM classes
    document.documentElement.classList.remove('dark', 'light');
  });

  it('dark theme is the default when no saved preference', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');
  });

  it('applies dark CSS class to html element', () => {
    renderHook(() => useTheme());

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('does not apply the light class in dark mode', () => {
    renderHook(() => useTheme());

    expect(document.documentElement.classList.contains('light')).toBe(false);
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
    expect(document.documentElement.classList.contains('light')).toBe(true);
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
    expect(document.documentElement.classList.contains('light')).toBe(false);
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
