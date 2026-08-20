/**
 * Die Filterleiste löst zwei Leisten ab, die sich unterschiedlich verhielten.
 * Geprüft wird das Verhalten, nicht das Aussehen: die Tab-Semantik, die
 * Verbindung zwischen Reiter und Inhalt, und die Tastatur.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBar, type FilterBarItem } from '../FilterBar';

const EINTRAEGE: FilterBarItem<'status' | 'dienste' | 'update'>[] = [
  { id: 'status', label: 'Status' },
  { id: 'dienste', label: 'Dienste' },
  { id: 'update', label: 'Update' },
];

function zeichne(
  active: 'status' | 'dienste' | 'update' = 'status',
  onChange: (id: 'status' | 'dienste' | 'update') => void = vi.fn()
) {
  return render(
    <FilterBar items={EINTRAEGE} active={active} onChange={onChange} label="Unterbereiche">
      <p>Inhalt</p>
    </FilterBar>
  );
}

describe('FilterBar', () => {
  it('ist eine Tab-Leiste, keine Seitennavigation', () => {
    // Der erste Entwurf war eine nav mit aria-current="page". Keine der beiden
    // abgelösten Leisten wechselt eine Seite, beide tauschen Inhalt aus.
    zeichne();
    expect(screen.getByRole('tablist', { name: 'Unterbereiche' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('meldet genau einen Reiter als ausgewählt', () => {
    zeichne('dienste');
    expect(screen.getByRole('tab', { name: 'Dienste' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Status' })).toHaveAttribute('aria-selected', 'false');
  });

  it('verbindet den ausgewählten Reiter mit der Inhaltsfläche', () => {
    zeichne('dienste');
    const panel = screen.getByRole('tabpanel');
    const reiter = screen.getByRole('tab', { name: 'Dienste' });
    expect(reiter).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', reiter.id);
  });

  it('zeigt den übergebenen Inhalt in der Fläche', () => {
    zeichne();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Inhalt');
  });

  it('legt nur den ausgewählten Reiter in den Tabulator-Lauf', () => {
    zeichne('dienste');
    expect(screen.getByRole('tab', { name: 'Dienste' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Status' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tab', { name: 'Update' })).toHaveAttribute('tabindex', '-1');
  });

  it('gibt beim Klick die Kennung weiter', async () => {
    const wechsel = vi.fn();
    zeichne('status', wechsel);
    await userEvent.click(screen.getByRole('tab', { name: 'Update' }));
    expect(wechsel).toHaveBeenCalledWith('update');
  });

  it('wechselt mit der rechten Pfeiltaste zum nächsten Reiter', async () => {
    const wechsel = vi.fn();
    zeichne('status', wechsel);
    screen.getByRole('tab', { name: 'Status' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(wechsel).toHaveBeenCalledWith('dienste');
  });

  it('läuft am linken Ende um, statt in einer Sackgasse zu enden', async () => {
    const wechsel = vi.fn();
    zeichne('status', wechsel);
    screen.getByRole('tab', { name: 'Status' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(wechsel).toHaveBeenCalledWith('update');
  });

  it('springt mit Ende an den letzten und mit Pos1 an den ersten Reiter', async () => {
    const wechsel = vi.fn();
    zeichne('dienste', wechsel);
    screen.getByRole('tab', { name: 'Dienste' }).focus();
    await userEvent.keyboard('{End}');
    expect(wechsel).toHaveBeenCalledWith('update');
    await userEvent.keyboard('{Home}');
    expect(wechsel).toHaveBeenCalledWith('status');
  });

  it('zeigt ein Icon nur dort, wo der Eintrag eines mitbringt', () => {
    const MitIcon = ({ className }: { className?: string }) => (
      <svg className={className} data-testid="eintrag-icon" />
    );
    const { container } = render(
      <FilterBar
        items={[
          { id: 'a', label: 'Mit', icon: MitIcon },
          { id: 'b', label: 'Ohne' },
        ]}
        active="a"
        onChange={vi.fn()}
        label="Unterbereiche"
      />
    );
    expect(container.querySelectorAll('[data-testid="eintrag-icon"]')).toHaveLength(1);
  });
});
