/**
 * FlowMenu Tests (Plan 011, Schritt 13).
 *
 * Fokus: die reine Filter-Logik (buildMenuItems) und dass die Darstellung
 * Auswahl/Bearbeiten sauber trennt.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FlowMenu, { buildMenuItems } from './FlowMenu';
import type { Flow } from '@/types/flows';

const flows: Flow[] = [
  { name: 'recherche', beschreibung: 'Web-Recherche', argumente: [] },
  { name: 'zusammenfassen', beschreibung: 'Fasst zusammen', argumente: [] },
];

describe('buildMenuItems', () => {
  test('leerer Filter zeigt alle Flows plus die zwei festen Befehle', () => {
    const items = buildMenuItems('', flows);
    expect(items.map(i => i.name)).toEqual(['recherche', 'zusammenfassen', 'flows', 'neuer-flow']);
  });

  test('filtert Flows nach Namens-Anfang', () => {
    const items = buildMenuItems('rech', flows);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'flow', name: 'recherche' });
  });

  test('feste Befehle sind selbst filterbar', () => {
    const items = buildMenuItems('neu', flows);
    expect(items.map(i => i.name)).toEqual(['neuer-flow']);
  });

  test('feste Befehle sind per Anfang filterbar (flows)', () => {
    // „f" trifft nur den festen Befehl /flows (kein Flow-Name beginnt mit f).
    const items = buildMenuItems('f', flows);
    expect(items.map(i => i.name)).toEqual(['flows']);
  });

  test('Filter ist unabhängig von Groß-/Kleinschreibung', () => {
    expect(buildMenuItems('RECH', flows).map(i => i.name)).toEqual(['recherche']);
  });
});

describe('FlowMenu (Darstellung)', () => {
  const items = buildMenuItems('', flows);

  test('Klick auf einen Eintrag übernimmt ihn, nicht das Bearbeiten', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const onEdit = vi.fn();
    render(
      <FlowMenu items={items} activeIndex={0} onPick={onPick} onEdit={onEdit} onHover={vi.fn()} />
    );
    await user.click(screen.getByText('/recherche'));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });

  test('Klick auf das Stift-Symbol bearbeitet, ohne zu übernehmen', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const onEdit = vi.fn();
    render(
      <FlowMenu items={items} activeIndex={0} onPick={onPick} onEdit={onEdit} onHover={vi.fn()} />
    );
    await user.click(screen.getByLabelText(/„recherche".*bearbeiten|recherche.*bearbeiten/i));
    expect(onEdit).toHaveBeenCalledWith('recherche');
    expect(onPick).not.toHaveBeenCalled();
  });

  test('feste Befehle tragen kein Stift-Symbol', () => {
    render(
      <FlowMenu items={items} activeIndex={0} onPick={vi.fn()} onEdit={vi.fn()} onHover={vi.fn()} />
    );
    // Zwei Flows → zwei Stifte; die Befehle haben keinen.
    expect(screen.getAllByLabelText(/bearbeiten/i)).toHaveLength(2);
  });
});
