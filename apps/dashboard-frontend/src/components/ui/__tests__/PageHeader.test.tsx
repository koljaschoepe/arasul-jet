/**
 * Der Seitenkopf hat genau eine Aufgabe: dieselbe Kopfzeile überall.
 * Geprüft wird deshalb nicht das Aussehen, sondern was die zwanzig
 * abgelösten Kopfstellen unterschiedlich gemacht haben.
 */

import { render, screen } from '@testing-library/react';
import { PageHeader } from '../PageHeader';

describe('PageHeader', () => {
  it('setzt den Titel als h1, nicht als beliebige Überschrift', () => {
    render(<PageHeader title="Datenschutz" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Datenschutz' })).toBeInTheDocument();
  });

  it('zeigt die Beschreibung, wenn eine da ist', () => {
    render(<PageHeader title="Allgemein" description="Systeminformationen und Konfiguration" />);
    expect(screen.getByText('Systeminformationen und Konfiguration')).toBeInTheDocument();
  });

  it('lässt ohne Beschreibung keinen Absatz stehen', () => {
    // Der Vorläufer hing den Abstand an den Titel (mb-2). Ohne Beschreibung
    // zeigte er ins Leere. Hier darf schlicht kein Absatz entstehen.
    const { container } = render(<PageHeader title="Services" />);
    expect(container.querySelector('p')).toBeNull();
  });

  it('nimmt eine Aktion rechts auf', () => {
    render(<PageHeader title="Services" action={<button type="button">Neu laden</button>} />);
    expect(screen.getByRole('button', { name: 'Neu laden' })).toBeInTheDocument();
  });

  it('bringt ohne Aktion keinen leeren Behälter mit', () => {
    const { container } = render(<PageHeader title="Services" />);
    expect(container.querySelectorAll('.shrink-0')).toHaveLength(0);
  });
});
