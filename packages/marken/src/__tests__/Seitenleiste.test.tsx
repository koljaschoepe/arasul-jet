/**
 * Die eine Seitenleiste (5.5.0, Karte jet-rahmen-einheitlich): Verwaltung,
 * Einstellungen und jede App zeichnen ihre Navigation damit. Gemessen wird die
 * Form aus `company/frontend.md`: Titel oben, Zeilen 32 px, Symbol 16 px, 2 px
 * Abstand, Auswahl als getönte Fläche, Gruppen mit Überschrift.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Seitenleiste } from '../muster/Seitenleiste';
import { SidebarProvider } from '../primitive/sidebar';

function zeige(aufKlick = vi.fn()) {
  render(
    <SidebarProvider eingebettet>
      <Seitenleiste
        titel="Belege"
        kennzeichen="leiste"
        gruppen={[
          {
            titel: 'Arbeit',
            eintraege: [
              {
                kennung: 'offen',
                name: 'Offen',
                symbol: <svg />,
                aktiv: true,
                kennzeichen: 'e-offen',
              },
              { kennung: 'neu', name: 'Neu', symbol: <svg />, kennzeichen: 'e-neu', aufKlick },
            ],
          },
        ]}
      />
    </SidebarProvider>
  );
  return aufKlick;
}

describe('Seitenleiste', () => {
  it('trägt den Titel oben und benennt die Navigation danach', () => {
    zeige();
    expect(document.querySelector('[data-slot="sidebar-titel"]')).toHaveTextContent('Belege');
    expect(screen.getByRole('navigation', { name: 'Belege' })).toHaveAttribute(
      'data-testid',
      'leiste'
    );
  });

  it('Gruppen haben eine kleine Überschrift', () => {
    zeige();
    expect(document.querySelector('[data-sidebar="group-label"]')).toHaveTextContent('Arbeit');
  });

  it('Zeilen 32 px, Symbol 16 px, 2 px Abstand, Auswahl getönt', () => {
    zeige();
    const offen = screen.getByTestId('e-offen');
    expect(offen.className).toContain('h-8');
    expect(offen.className).toContain('[&>svg]:size-4');
    expect(offen.className).toContain('data-[active=true]:bg-primary/12');
    expect(offen).toHaveAttribute('aria-current', 'page');
    expect(document.querySelector('[data-sidebar="menu"]')?.className).toContain('gap-0.5');
  });

  it('ein Klick ruft den Eintrag', async () => {
    const user = userEvent.setup();
    const aufKlick = zeige();
    await user.click(screen.getByTestId('e-neu'));
    expect(aufKlick).toHaveBeenCalledTimes(1);
  });
});
