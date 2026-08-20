/**
 * Der Abschnitt trennt Feldgruppen. Die beiden Dinge, die in den
 * Einstellungen auseinanderliefen: die Überschriftenebene und die Trennlinie
 * unter der letzten Gruppe.
 */

import { render, screen } from '@testing-library/react';
import { Section } from '../Section';

describe('Section', () => {
  it('setzt den Titel als h2, damit unter dem einen h1 keine Ebene fehlt', () => {
    render(
      <Section title="Firmenprofil">
        <p>Inhalt</p>
      </Section>
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Firmenprofil' })).toBeInTheDocument();
  });

  it('trennt voreingestellt mit einer Linie', () => {
    const { container } = render(
      <Section title="Kontext">
        <p>Inhalt</p>
      </Section>
    );
    expect(container.querySelector('section')?.className).toContain('border-b');
  });

  it('lässt die Linie weg, wenn der Abschnitt der letzte ist', () => {
    const { container } = render(
      <Section title="Kontext" divider={false}>
        <p>Inhalt</p>
      </Section>
    );
    expect(container.querySelector('section')?.className).not.toContain('border-b');
  });

  it('zeigt Beschreibung, Aktion und Inhalt zusammen', () => {
    render(
      <Section
        title="Sprachmodell"
        description="Welches Modell antwortet"
        action={<button type="button">Ändern</button>}
      >
        <p>Inhalt</p>
      </Section>
    );
    expect(screen.getByText('Welches Modell antwortet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ändern' })).toBeInTheDocument();
    expect(screen.getByText('Inhalt')).toBeInTheDocument();
  });
});
