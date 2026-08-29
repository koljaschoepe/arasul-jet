/**
 * Plan 023 F5: unter 900 Pixeln gibt es keine drei Spalten.
 *
 * Die Zahl ist gemessen, nicht gewählt: bei 400 px Fenster bleiben dem rechten
 * Panel 142 px, davon 118 px für das Terminal, also rund dreizehn Spalten.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSchmalesFenster, SCHMAL_AB_PX } from '../useSchmalesFenster';

/** Ein matchMedia-Doppel, dessen Ergebnis sich umschalten lässt. */
function medienAbfrage(passt: boolean) {
  const horcher = new Set<() => void>();
  const abfrage = {
    matches: passt,
    media: '',
    addEventListener: (_: string, f: () => void) => horcher.add(f),
    removeEventListener: (_: string, f: () => void) => horcher.delete(f),
  };
  const original = window.matchMedia;
  window.matchMedia = vi.fn().mockReturnValue(abfrage) as unknown as typeof window.matchMedia;
  return {
    abfrage,
    umschalten(neu: boolean) {
      abfrage.matches = neu;
      for (const f of horcher) f();
    },
    zurueck() {
      window.matchMedia = original;
    },
    horcherZahl: () => horcher.size,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSchmalesFenster (Plan 023 F5)', () => {
  it('meldet ein schmales Fenster', () => {
    const m = medienAbfrage(true);
    const { result } = renderHook(() => useSchmalesFenster());
    expect(result.current).toBe(true);
    m.zurueck();
  });

  it('meldet ein breites Fenster', () => {
    const m = medienAbfrage(false);
    const { result } = renderHook(() => useSchmalesFenster());
    expect(result.current).toBe(false);
    m.zurueck();
  });

  it('folgt einer Änderung, ohne dass die Seite neu geladen wird', () => {
    // Der Nutzer zieht das Fenster kleiner; die Aufteilung muss mitgehen.
    const m = medienAbfrage(false);
    const { result } = renderHook(() => useSchmalesFenster());
    expect(result.current).toBe(false);
    act(() => m.umschalten(true));
    expect(result.current).toBe(true);
    m.zurueck();
  });

  it('meldet sich beim Abbau wieder ab', () => {
    const m = medienAbfrage(false);
    const { unmount } = renderHook(() => useSchmalesFenster());
    expect(m.horcherZahl()).toBe(1);
    unmount();
    expect(m.horcherZahl()).toBe(0);
    m.zurueck();
  });

  it('fragt genau unterhalb der Grenze', () => {
    const m = medienAbfrage(false);
    renderHook(() => useSchmalesFenster());
    expect(window.matchMedia).toHaveBeenCalledWith(`(max-width: ${SCHMAL_AB_PX - 1}px)`);
    m.zurueck();
  });

  it('gibt false zurück, wenn der Browser keine Medienabfrage kennt', () => {
    // Ohne matchMedia lieber drei Spalten als gar kein Layout.
    const original = window.matchMedia;
    // @ts-expect-error absichtlich entfernt
    window.matchMedia = undefined;
    const { result } = renderHook(() => useSchmalesFenster());
    expect(result.current).toBe(false);
    window.matchMedia = original;
  });
});
