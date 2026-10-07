import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { StatusBar } from '../StatusBar';

vi.mock('@/contexts/AuthContext', () => import('@/__tests__/helpers/authMock'));
import { angemeldet } from '@/__tests__/helpers/authMock';

/**
 * Die Statusleiste (M5): links Bild, Name und Rolle mit dem Menü „Abmelden",
 * rechts Datum und Uhrzeit, für jeden gleich. Nie Modell, Speicher,
 * Verbindung oder Stand; keine Abfrage ans Gerät.
 */
describe('StatusBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 4, 14, 32, 20));
  });
  afterEach(() => vi.useRealTimers());

  it('zeigt Name, Datum und Uhrzeit minutengenau', () => {
    angemeldet({ role: 'mitarbeiter', username: 'clara', anzeigeName: 'Clara Weber' });
    render(<StatusBar onLogout={vi.fn()} />);
    expect(screen.getByTestId('statusbar-name')).toHaveTextContent('Clara Weber');
    expect(screen.getByTestId('statusbar-zeit')).toHaveTextContent('Sonntag, 4. Oktober 2026');
    expect(screen.getByTestId('statusbar-zeit')).toHaveTextContent('14:32');
  });

  it('springt mit der Wanduhr zur nächsten Minute, nicht früher', () => {
    angemeldet({ role: 'mitarbeiter', username: 'clara' });
    render(<StatusBar onLogout={vi.fn()} />);
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
    render(<StatusBar onLogout={vi.fn()} />);
    expect(screen.getByTestId('statusbar-name')).toHaveTextContent('clara');
  });

  it('zeigt auch dem Administrator keine Technik', () => {
    angemeldet({ role: 'admin', username: 'probe-admin' });
    render(<StatusBar onLogout={vi.fn()} />);
    const leiste = screen.getByTestId('statusbar');
    expect(leiste.textContent).not.toMatch(/Modell|Speicher|Verbindung|Fassung|Freigabe/i);
    // Der einzige Knopf ist die Person selbst (Bild, Name, Rolle).
    expect(leiste.querySelectorAll('button')).toHaveLength(1);
    expect(screen.getByTestId('statusbar-rolle')).toHaveTextContent('Administrator');
  });

  it('nennt beim Mitarbeiter die Rolle Mitarbeiter', () => {
    angemeldet({ role: 'mitarbeiter', username: 'clara' });
    render(<StatusBar onLogout={vi.fn()} />);
    expect(screen.getByTestId('statusbar-rolle')).toHaveTextContent('Mitarbeiter');
  });

  it('ein Klick auf die Person öffnet ein Menü mit nur „Abmelden"', async () => {
    vi.useRealTimers();
    angemeldet({ role: 'mitarbeiter', username: 'clara', anzeigeName: 'Clara Weber' });
    const onLogout = vi.fn();
    render(<StatusBar onLogout={onLogout} />);
    fireEvent.keyDown(screen.getByTestId('workspace-benutzermenue'), { key: 'Enter' });
    const menue = await screen.findByRole('menu');
    const eintraege = within(menue).getAllByRole('menuitem');
    expect(eintraege).toHaveLength(1);
    expect(eintraege[0]).toHaveTextContent('Abmelden');
    fireEvent.click(eintraege[0]!);
    expect(onLogout).toHaveBeenCalledOnce();
  });
});
