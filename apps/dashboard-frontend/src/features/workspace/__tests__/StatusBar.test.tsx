import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { StatusBar } from '../StatusBar';

vi.mock('@/contexts/AuthContext', () => import('@/__tests__/helpers/authMock'));
import { angemeldet } from '@/__tests__/helpers/authMock';

/**
 * Die Statusleiste (M5): dauerhaft Name, Datum und Uhrzeit, für jeden gleich.
 * Nie Modell, Speicher, Verbindung oder Stand; keine Abfrage ans Gerät.
 */
describe('StatusBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 4, 14, 32, 20));
  });
  afterEach(() => vi.useRealTimers());

  it('zeigt Name, Datum und Uhrzeit minutengenau', () => {
    angemeldet({ role: 'mitarbeiter', username: 'clara', anzeigeName: 'Clara Weber' });
    render(<StatusBar />);
    expect(screen.getByTestId('statusbar-name')).toHaveTextContent('Clara Weber');
    expect(screen.getByTestId('statusbar-zeit')).toHaveTextContent('Sonntag, 4. Oktober 2026');
    expect(screen.getByTestId('statusbar-zeit')).toHaveTextContent('14:32');
  });

  it('springt mit der Wanduhr zur nächsten Minute, nicht früher', () => {
    angemeldet({ role: 'mitarbeiter', username: 'clara' });
    render(<StatusBar />);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByTestId('statusbar-zeit')).toHaveTextContent('14:32');
    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    expect(screen.getByTestId('statusbar-zeit')).toHaveTextContent('14:33');
  });

  it('fällt ohne Anzeigenamen auf den Benutzernamen zurück', () => {
    angemeldet({ role: 'mitarbeiter', username: 'clara', anzeigeName: undefined });
    render(<StatusBar />);
    expect(screen.getByTestId('statusbar-name')).toHaveTextContent('clara');
  });

  it('zeigt auch dem Administrator keine Technik', () => {
    angemeldet({ role: 'admin', username: 'probe-admin' });
    render(<StatusBar />);
    const leiste = screen.getByTestId('statusbar');
    expect(leiste.textContent).not.toMatch(/Modell|Speicher|Verbindung|Fassung|Freigabe/i);
    expect(leiste.querySelectorAll('button')).toHaveLength(0);
  });
});
