/**
 * Die Karte mit Symbol (5.6.0): das Symbol steht links auf einem blau
 * getönten Quadrat, Titel und Inhalt rechts daneben untereinander. So sieht
 * eine App auf der Startseite aus. Ohne Symbol bleibt die Karte, wie sie war.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Karte } from '../Karte';

describe('Karte', () => {
  it('stellt das Symbol auf ein Quadrat neben Titel und Inhalt', () => {
    render(
      <Karte titel="Belege" symbol={<svg data-testid="bild" />} kennzeichen="karte">
        Keine offene Freigabe
      </Karte>
    );
    const karte = screen.getByTestId('karte');
    expect(karte).toHaveAttribute('data-symbol');
    const quadrat = karte.querySelector('.ara-karte__symbol');
    expect(quadrat).toContainElement(screen.getByTestId('bild'));
    const rumpf = karte.querySelector('.ara-karte__rumpf');
    expect(rumpf).toHaveTextContent('Belege');
    expect(rumpf).toHaveTextContent('Keine offene Freigabe');
  });

  it('bleibt ohne Symbol eine Spalte ohne Quadrat', () => {
    render(
      <Karte titel="Neuer Mandant" kennzeichen="karte">
        Inhalt
      </Karte>
    );
    const karte = screen.getByTestId('karte');
    expect(karte).not.toHaveAttribute('data-symbol');
    expect(karte.querySelector('.ara-karte__symbol')).toBeNull();
    expect(karte.querySelector('.ara-karte__rumpf')).toBeNull();
  });

  it('ist mit onKlick ein Knopf', async () => {
    const klick = vi.fn();
    render(<Karte titel="Belege" symbol={<svg />} onKlick={klick} kennzeichen="karte" />);
    const karte = screen.getByTestId('karte');
    expect(karte.tagName).toBe('BUTTON');
    await userEvent.click(karte);
    expect(klick).toHaveBeenCalledTimes(1);
  });
});
