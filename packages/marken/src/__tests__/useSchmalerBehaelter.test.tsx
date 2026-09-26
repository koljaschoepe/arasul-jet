/**
 * Auftrag marken-misst-den-behaelter (J35): der Behaelter zaehlt, nicht das
 * Fenster. Am Orin war der Rahmen einer App 1052 px breit, ihre Liste stand
 * neben der Seitenleiste in knapp 800 px -- und rechnete mit dem Fenster.
 *
 * jsdom legt nichts: `getBoundingClientRect` ist null breit, und einen
 * `ResizeObserver` gibt es nicht. Beides wird hier gestellt; ohne die beiden
 * gilt das Fenster, und das prueft der letzte Fall.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useSchmalerBehaelter } from '../useSchmalerBehaelter';

let beobachtet: Array<() => void> = [];
let breite = 0;

class BeobachterDoppel {
  private rufen: () => void;
  constructor(rufen: () => void) {
    this.rufen = rufen;
  }
  observe() {
    beobachtet.push(this.rufen);
  }
  disconnect() {
    beobachtet = beobachtet.filter(f => f !== this.rufen);
  }
  unobserve() {}
}

function fensterSchmal(schmal: boolean) {
  window.matchMedia = ((query: string) =>
    ({
      matches: schmal,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

function Probe() {
  const [ref, schmal] = useSchmalerBehaelter<HTMLDivElement>(640);
  return (
    <div ref={ref} data-testid="kasten">
      {schmal ? 'schmal' : 'breit'}
    </div>
  );
}

const originalRO = globalThis.ResizeObserver;
const originalRect = HTMLElement.prototype.getBoundingClientRect;

beforeEach(() => {
  beobachtet = [];
  breite = 0;
  fensterSchmal(false);
  globalThis.ResizeObserver = BeobachterDoppel as unknown as typeof ResizeObserver;
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { width: breite, height: 10 } as DOMRect;
  };
});

afterEach(() => {
  globalThis.ResizeObserver = originalRO;
  HTMLElement.prototype.getBoundingClientRect = originalRect;
});

describe('useSchmalerBehaelter', () => {
  it('meldet einen schmalen Kasten in einem breiten Fenster', () => {
    breite = 500;
    render(<Probe />);
    expect(screen.getByTestId('kasten')).toHaveTextContent('schmal');
  });

  it('meldet einen breiten Kasten in einem schmalen Fenster', () => {
    fensterSchmal(true);
    breite = 800;
    render(<Probe />);
    expect(screen.getByTestId('kasten')).toHaveTextContent('breit');
  });

  it('folgt dem Kasten, wenn er sich aendert', () => {
    breite = 800;
    render(<Probe />);
    expect(screen.getByTestId('kasten')).toHaveTextContent('breit');
    breite = 600;
    act(() => beobachtet.forEach(f => f()));
    expect(screen.getByTestId('kasten')).toHaveTextContent('schmal');
  });

  it('meldet sich beim Abbau ab', () => {
    breite = 800;
    const { unmount } = render(<Probe />);
    expect(beobachtet).toHaveLength(1);
    unmount();
    expect(beobachtet).toHaveLength(0);
  });

  it('nimmt das Fenster, solange der Kasten kein Mass hat', () => {
    // Null Pixel sind keine Auskunft: ein Kasten, der nicht gelegt ist.
    breite = 0;
    fensterSchmal(true);
    render(<Probe />);
    expect(screen.getByTestId('kasten')).toHaveTextContent('schmal');
  });

  it('kommt ohne ResizeObserver aus', () => {
    // @ts-expect-error absichtlich entfernt
    globalThis.ResizeObserver = undefined;
    breite = 500;
    render(<Probe />);
    expect(screen.getByTestId('kasten')).toHaveTextContent('schmal');
  });
});
