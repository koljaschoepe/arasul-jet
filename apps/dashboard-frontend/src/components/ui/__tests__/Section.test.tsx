/**
 * Der Abschnitt trennt Feldgruppen. Die beiden Dinge, die in den
 * Einstellungen auseinanderliefen: die Überschriftenebene und die Trennlinie
 * unter der letzten Gruppe.
 */

import { render, screen } from '@testing-library/react';
import { Section, SectionList } from '../Section';

describe('Section', () => {
  it('setzt den Titel als h2, damit unter dem einen h1 keine Ebene fehlt', () => {
    render(
      <Section title="Firmenprofil">
        <p>Inhalt</p>
      </Section>
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Firmenprofil' })).toBeInTheDocument();
  });

  it('trägt seine Trennlinie immer selbst', () => {
    // Der erste Entwurf hatte eine Eigenschaft `divider`, die der letzte
    // Abschnitt abschalten musste. Wer einen Abschnitt anhängte, musste daran
    // denken, sie am alten letzten wieder einzuschalten. Genau so entsteht die
    // doppelte Linie, die dieser Plan beseitigt hat.
    const { container } = render(
      <Section title="Kontext">
        <p>Inhalt</p>
      </Section>
    );
    expect(container.querySelector('section')?.className).toContain('border-b');
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

describe('SectionList', () => {
  it('nimmt dem letzten Abschnitt die Trennlinie ab', () => {
    // Die Linie gehört zwischen die Abschnitte, nicht an sie. Die Spalte sieht
    // die Reihenfolge, der einzelne Abschnitt nicht.
    const { container } = render(
      <SectionList>
        <Section title="Erster">
          <p>A</p>
        </Section>
        <Section title="Letzter">
          <p>B</p>
        </Section>
      </SectionList>
    );
    const klassen = container.firstElementChild?.className ?? '';
    expect(klassen).toContain('[&>section:last-child]:border-b-0');
    expect(klassen).toContain('[&>section:last-child]:pb-0');
  });

  it('greift auf das letzte Kind, nicht auf den letzten Abschnitt', () => {
    // Folgt nach dem letzten Abschnitt noch etwas, das kein Abschnitt ist
    // (bis B5 war das die n8n-Anleitung in „Allgemein"), trennt genau diese
    // Linie; sie muss also stehen bleiben. Mit last-of-type wäre sie weg.
    const { container } = render(
      <SectionList>
        <Section title="Erster">
          <p>A</p>
        </Section>
        <div>kein Abschnitt</div>
      </SectionList>
    );
    const klassen = container.firstElementChild?.className ?? '';
    expect(klassen).toContain('section:last-child');
    expect(klassen).not.toContain('last-of-type');
  });

  it('setzt die Abstandsspalte, damit jede Seite dasselbe Raster hat', () => {
    const { container } = render(
      <SectionList>
        <Section title="Erster">
          <p>A</p>
        </Section>
      </SectionList>
    );
    const klassen = container.firstElementChild?.className ?? '';
    expect(klassen).toContain('flex');
    expect(klassen).toContain('flex-col');
    expect(klassen).toContain('gap-8');
  });
});
