/**
 * Integration tests for the theme system (Schwarz · Dunkel · Hell).
 *
 * Tests theme behavior as users experience it:
 *   - Default black theme
 *   - Theme cycle (black → dark → light → black)
 *   - Theme persistence in localStorage (incl. migration)
 *   - CSS class + data-theme application on <html>
 */

import { renderHook, act } from '@testing-library/react';
import { useTheme } from '../../hooks/useTheme';

// ---- Tests ----

describe('Theme integration', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset DOM state
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.removeAttribute('data-theme');
  });

  it('black theme is the default when no saved preference', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('black');
  });

  it('applies dark CSS class and data-theme="black" to html element', () => {
    renderHook(() => useTheme());

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('black');
  });

  it('does not apply the light class in black mode', () => {
    renderHook(() => useTheme());

    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('toggleTheme cycles from black to dark', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('double toggle reaches light with light CSS class', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });
    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('triple toggle returns to black theme', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });
    act(() => {
      result.current.toggleTheme();
    });
    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('black');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('black');
  });

  it('theme persists to localStorage', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });

    expect(localStorage.getItem('arasul_theme')).toBe('dark');
  });

  it('loads persisted theme from localStorage', () => {
    localStorage.setItem('arasul_theme', 'light');

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('light');
  });

  it('migration: legacy dark value keeps dark theme', () => {
    localStorage.setItem('arasul_theme', 'dark');

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');
  });

  it('migration: unknown value falls back to black', () => {
    localStorage.setItem('arasul_theme', 'sepia');

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('black');
  });

  it('setTheme directly sets the theme', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('light');
    });

    expect(result.current.theme).toBe('light');
    expect(localStorage.getItem('arasul_theme')).toBe('light');
  });

  it('setTheme back to black works', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('light');
    });
    act(() => {
      result.current.setTheme('black');
    });

    expect(result.current.theme).toBe('black');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('theme persists across hook re-renders (simulating page load)', () => {
    // First render - switch to light
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
