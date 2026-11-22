/**
 * Das Blatt hat drei Zusagen: am Rechner steht es daneben, unter 900 px kommt
 * es von unten mit Griff, und es geht mit Escape und dem Kreuz wieder zu.
 * Die Form liest `useSchmalesFenster`, also stellt der Test `matchMedia`
 * ausdrücklich ein.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Blatt } from '../muster/Blatt';

function schmalStellen(schmal: boolean) {
  window.matchMedia = ((query: string) =>
    ({
      matches: schmal,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

function zeige(schliessen = vi.fn()) {
  render(
    <Blatt
      offen
      beiSchliessen={schliessen}
      titel="Geländer Haus B"
      beschreibung="Angebot vom 14.11."
      fuss={<button type="button">Freigeben</button>}
    >
      <p>Inhalt</p>
    </Blatt>
  );
  return schliessen;
}

describe('Blatt', () => {
  it('steht am Rechner als Fläche daneben, ohne Griff', () => {
    schmalStellen(false);
    zeige();
    const blatt = screen.getByRole('dialog', { name: 'Geländer Haus B' });
    expect(blatt.getAttribute('data-blatt')).toBe('seite');
    expect(blatt.querySelector('[data-blatt-griff]')).toBeNull();
    expect(screen.getByText('Angebot vom 14.11.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Freigeben' })).toBeTruthy();
  });

  it('kommt unter 900 px von unten, mit Griff', () => {
    schmalStellen(true);
    zeige();
    const blatt = screen.getByRole('dialog', { name: 'Geländer Haus B' });
    expect(blatt.getAttribute('data-blatt')).toBe('unten');
    expect(blatt.querySelector('[data-blatt-griff]')).not.toBeNull();
  });

  it('geht mit Escape und mit dem Kreuz zu', async () => {
    schmalStellen(false);
    const user = userEvent.setup();
    const schliessen = zeige();
    await user.keyboard('{Escape}');
    expect(schliessen).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(schliessen).toHaveBeenCalledTimes(2);
  });
});
