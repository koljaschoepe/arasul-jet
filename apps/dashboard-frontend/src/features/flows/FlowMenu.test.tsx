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

/**
 * Plan 023 E7: die Liste muss bei 30 Flows bedienbar bleiben, und drei
 * Buchstaben aus der Mitte eines Namens sollen treffen.
 */
describe('buildMenuItems, Suche in der Mitte (Plan 023 E7)', () => {
  const viele = Array.from({ length: 30 }, (_, i) => ({
    name: `flow-${String(i).padStart(2, '0')}-bericht`,
    beschreibung: `Nummer ${i}`,
    argumente: [],
  })) as unknown as Parameters<typeof buildMenuItems>[1];

  it('findet drei Buchstaben aus der Mitte', () => {
    const items = buildMenuItems('ber', viele);
    expect(items).toHaveLength(30);
    expect(items[0]).toMatchObject({ kind: 'flow' });
  });

  it('sucht bei ein und zwei Buchstaben NUR am Anfang', () => {
    // Sonst waere die Liste nach dem ersten Tastendruck laenger als ohne
    // Filter, und die Auswahl spraenge bei jedem weiteren Buchstaben.
    expect(buildMenuItems('b', viele)).toHaveLength(0);
    expect(buildMenuItems('be', viele)).toHaveLength(0);
    // Ab drei Buchstaben greift die Mitte: 30 Flows beginnen mit "flo", dazu
    // der Befehl /flows (Anfang) und /neuer-flow (Mitte).
    expect(buildMenuItems('flo', viele)).toHaveLength(32);
    expect(buildMenuItems('flo', viele).map(i => i.name)).toContain('neuer-flow');
  });

  it('stellt Anfangstreffer vor Mitte-Treffer', () => {
    const gemischt = [
      { name: 'zusammenfassen-bericht', beschreibung: '', argumente: [] },
      { name: 'bericht-lang', beschreibung: '', argumente: [] },
    ] as unknown as Parameters<typeof buildMenuItems>[1];
    expect(buildMenuItems('ber', gemischt).map(i => i.name)).toEqual([
      'bericht-lang',
      'zusammenfassen-bericht',
    ]);
  });
});
