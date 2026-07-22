/**
 * SkillMenu Tests (Plan 011, Schritt 13).
 *
 * Fokus: die reine Filter-Logik (buildMenuItems) und dass die Darstellung
 * Auswahl/Bearbeiten sauber trennt.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SkillMenu, { buildMenuItems } from './SkillMenu';
import type { Skill } from '@/types/skills';

const skills: Skill[] = [
  { name: 'recherche', beschreibung: 'Web-Recherche', argumente: [] },
  { name: 'zusammenfassen', beschreibung: 'Fasst zusammen', argumente: [] },
];

describe('buildMenuItems', () => {
  test('leerer Filter zeigt alle Skills plus die zwei festen Befehle', () => {
    const items = buildMenuItems('', skills);
    expect(items.map(i => i.name)).toEqual([
      'recherche',
      'zusammenfassen',
      'skills',
      'neuer-skill',
    ]);
  });

  test('filtert Skills nach Namens-Anfang', () => {
    const items = buildMenuItems('rech', skills);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'skill', name: 'recherche' });
  });

  test('feste Befehle sind selbst filterbar', () => {
    const items = buildMenuItems('neu', skills);
    expect(items.map(i => i.name)).toEqual(['neuer-skill']);
  });

  test('Skills kommen vor den festen Befehlen', () => {
    // „s" passt auf zusammenfassen (nein, beginnt mit z) — nur der Befehl skills.
    const items = buildMenuItems('s', skills);
    expect(items.map(i => i.name)).toEqual(['skills']);
  });

  test('Filter ist unabhängig von Groß-/Kleinschreibung', () => {
    expect(buildMenuItems('RECH', skills).map(i => i.name)).toEqual(['recherche']);
  });
});

describe('SkillMenu (Darstellung)', () => {
  const items = buildMenuItems('', skills);

  test('Klick auf einen Eintrag übernimmt ihn, nicht das Bearbeiten', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const onEdit = vi.fn();
    render(
      <SkillMenu items={items} activeIndex={0} onPick={onPick} onEdit={onEdit} onHover={vi.fn()} />
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
      <SkillMenu items={items} activeIndex={0} onPick={onPick} onEdit={onEdit} onHover={vi.fn()} />
    );
    await user.click(screen.getByLabelText(/„recherche".*bearbeiten|recherche.*bearbeiten/i));
    expect(onEdit).toHaveBeenCalledWith('recherche');
    expect(onPick).not.toHaveBeenCalled();
  });

  test('feste Befehle tragen kein Stift-Symbol', () => {
    render(
      <SkillMenu
        items={items}
        activeIndex={0}
        onPick={vi.fn()}
        onEdit={vi.fn()}
        onHover={vi.fn()}
      />
    );
    // Zwei Skills → zwei Stifte; die Befehle haben keinen.
    expect(screen.getAllByLabelText(/bearbeiten/i)).toHaveLength(2);
  });
});
