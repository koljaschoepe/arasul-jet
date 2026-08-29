/**
 * Das Theme gehoert dem Menschen (Phase H1).
 *
 * Eine Datei fuer den Hook, nicht zwei: bis H1 stand dasselbe noch einmal
 * unter `__tests__/integration/theme.test.tsx` — dieselben Faelle, dieselben
 * Erwartungen, zwei Stellen zum Vergessen. Der Hook IST der Gegenstand; ein
 * „Integrationstest", der auch nur `renderHook(useTheme)` aufrief, war keiner.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const benutzerAktualisieren = vi.fn();
const put = vi.fn();
let angemeldeterBenutzer: { theme?: 'light' | 'dark' } | null = null;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: angemeldeterBenutzer,
    isAuthenticated: angemeldeterBenutzer !== null,
    benutzerAktualisieren,
  }),
}));

vi.mock('../../hooks/useApi', () => ({
  useApi: () => ({ put }),
}));

import { useTheme } from '../../hooks/useTheme';

const wurzel = () => document.documentElement;

describe('useTheme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    wurzel().classList.remove('dark');
    wurzel().removeAttribute('data-theme');
    angemeldeterBenutzer = null;
    put.mockResolvedValue({ data: { theme: 'dark' } });
  });

  it('ohne Sitzung steht die Vorgabe da: hell, und hell braucht kein Attribut', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('light');
    expect(wurzel().getAttribute('data-theme')).toBeNull();
    expect(wurzel().classList.contains('dark')).toBe(false);
  });

  it('der Wert des Angemeldeten steht am Dokument', () => {
    angemeldeterBenutzer = { theme: 'dark' };
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');
    expect(wurzel().getAttribute('data-theme')).toBe('dark');
    // Die Klasse haelt die Tailwind-Utilities `dark:` am Leben.
    expect(wurzel().classList.contains('dark')).toBe(true);
  });

  it('ein Benutzer ohne Spaltenwert bekommt die Vorgabe, keinen leeren Zustand', () => {
    angemeldeterBenutzer = {};
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('light');
  });

  it('setTheme schreibt gegen das Geraet und zieht den Benutzer nach', async () => {
    angemeldeterBenutzer = { theme: 'light' };
    const { result } = renderHook(() => useTheme());

    await act(async () => {
      await result.current.setTheme('dark');
    });

    expect(put).toHaveBeenCalledWith('/darstellung', { theme: 'dark' });
    expect(benutzerAktualisieren).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('angezeigt wird, was das Geraet bestaetigt hat, nicht was geschickt wurde', async () => {
    angemeldeterBenutzer = { theme: 'light' };
    put.mockResolvedValue({ data: { theme: 'light' } });
    const { result } = renderHook(() => useTheme());

    await act(async () => {
      await result.current.setTheme('dark');
    });

    expect(benutzerAktualisieren).toHaveBeenCalledWith({ theme: 'light' });
  });

  it('ein Fehler beim Setzen laesst den Bildschirm, wie er war', async () => {
    angemeldeterBenutzer = { theme: 'light' };
    put.mockRejectedValue(new Error('HTTP 500'));
    const { result } = renderHook(() => useTheme());

    await expect(result.current.setTheme('dark')).rejects.toThrow();
    expect(benutzerAktualisieren).not.toHaveBeenCalled();
    expect(wurzel().getAttribute('data-theme')).toBeNull();
  });

  describe('Uebernahme des alten Browser-Werts', () => {
    it('»black« aus dem localStorage wird einmal zu »dark« und der Schluessel faellt', async () => {
      localStorage.setItem('arasul_theme', 'black');
      angemeldeterBenutzer = { theme: 'light' };
      renderHook(() => useTheme());

      await waitFor(() => expect(put).toHaveBeenCalledWith('/darstellung', { theme: 'dark' }));
      await waitFor(() => expect(localStorage.getItem('arasul_theme')).toBeNull());
    });

    it('deckt sich der alte Wert mit dem neuen, wird nur aufgeraeumt', async () => {
      localStorage.setItem('arasul_theme', 'light');
      angemeldeterBenutzer = { theme: 'light' };
      renderHook(() => useTheme());

      await waitFor(() => expect(localStorage.getItem('arasul_theme')).toBeNull());
      expect(put).not.toHaveBeenCalled();
    });

    it('ohne Sitzung wird nichts uebernommen, der Wert haette keinen Besitzer', () => {
      localStorage.setItem('arasul_theme', 'dark');
      renderHook(() => useTheme());

      expect(put).not.toHaveBeenCalled();
      expect(localStorage.getItem('arasul_theme')).toBe('dark');
    });

    it('misslingt die Uebernahme, bleibt der Schluessel liegen', async () => {
      localStorage.setItem('arasul_theme', 'black');
      angemeldeterBenutzer = { theme: 'light' };
      put.mockRejectedValue(new Error('HTTP 500'));
      renderHook(() => useTheme());

      await waitFor(() => expect(put).toHaveBeenCalled());
      expect(localStorage.getItem('arasul_theme')).toBe('black');
    });

    it('ein unbekannter alter Wert ist keine Entscheidung und wird nicht uebernommen', () => {
      localStorage.setItem('arasul_theme', 'sepia');
      angemeldeterBenutzer = { theme: 'light' };
      renderHook(() => useTheme());

      expect(put).not.toHaveBeenCalled();
    });
  });
});
