/**
 * Der Leerzustand ist der einzige Baustein, den es vorher schon gab. Geprüft
 * ist deshalb genau das, was in C1 daran geschärft wurde.
 */

import { render, screen } from '@testing-library/react';
import { Leerzustand } from '../muster/Leerzustand';

describe('Leerzustand', () => {
  it('meldet sich als Statusmeldung', () => {
    render(<Leerzustand titel="Noch keine Projekte" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('zeigt Titel und Beschreibung', () => {
    render(
      <Leerzustand titel="Noch keine Kunden" beschreibung="Lege im Chat den ersten Kunden an." />
    );
    expect(screen.getByText('Noch keine Kunden')).toBeInTheDocument();
    expect(screen.getByText('Lege im Chat den ersten Kunden an.')).toBeInTheDocument();
  });

  it('führt den Einstieg mit, der die Liste füllt', () => {
    render(
      <Leerzustand titel="Noch keine Projekte" aktion={<button type="button">Anlegen</button>} />
    );
    expect(screen.getByRole('button', { name: 'Anlegen' })).toBeInTheDocument();
  });

  it('setzt die Symbolgröße selbst, statt sie dem Aufrufer zu überlassen', () => {
    // Vorher stand text-5xl auf der Umhüllung. Auf ein SVG wirkt das nicht,
    // und das voreingestellte size-12 fiel doppelt so groß aus wie die size-6
    // der fünf Aufrufer.
    const { container } = render(<Leerzustand titel="Keine Ereignisse" />);
    const huelle = container.querySelector('[aria-hidden="true"]');
    expect(huelle?.className).toContain('[&>svg]:size-6');
    expect(huelle?.className).not.toContain('text-5xl');
    expect(huelle?.className).not.toContain('opacity-50');
  });

  it('hält das Symbol von Vorlesewerkzeugen fern', () => {
    const { container } = render(<Leerzustand titel="Keine Ereignisse" />);
    expect(container.querySelector('svg')?.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
