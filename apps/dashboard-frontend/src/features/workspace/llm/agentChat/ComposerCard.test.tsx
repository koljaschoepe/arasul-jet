/**
 * ComposerCard Tests (Plan 004, Schritt 4 · Slash-Menü Plan 011, Schritt 13)
 *
 * Fokus: sichtbares Anhang-Feedback, native Formulierung UND das Skill-Menü,
 * das die alte Flow-Agenten-Palette ablöst — Filtern, Pfeiltasten, Enter
 * übernimmt, Stift bearbeitet, feste Befehle /skills und /neuer-skill.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ComposerCard, { type ComposerModel } from './ComposerCard';
import type { Skill } from '@/types/skills';

// Ordner-Scope kommt aus dem workspaceStore — hier ohne aktiven Scope mocken.
vi.mock('@/stores/workspaceStore', () => ({
  useWorkspaceStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ chatScope: null, setChatScope: vi.fn() }),
}));

const models: ComposerModel[] = [{ id: 'qwen3:7b', name: 'Qwen3 7B' }];

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    value: '',
    onChange: vi.fn(),
    onSend: vi.fn(),
    onCancel: vi.fn(),
    isLoading: false,
    attachedFile: null as File | null,
    onRemoveFile: vi.fn(),
    attachedImages: [] as { file: File; base64: string }[],
    onRemoveImage: vi.fn(),
    onPickFile: vi.fn(),
    models,
    selectedModel: '',
    onSelectModel: vi.fn(),
    ...overrides,
  };
}

describe('ComposerCard', () => {
  test('nutzt einen nativen Platzhalter', () => {
    render(<ComposerCard {...makeProps()} />);
    expect(screen.getByPlaceholderText('Nachricht schreiben …')).toBeInTheDocument();
  });

  test('ohne Anhänge erscheint keine Chip-Leiste', () => {
    render(<ComposerCard {...makeProps()} />);
    expect(screen.queryByTestId('composer-chips')).not.toBeInTheDocument();
  });

  test('angehängte Datei erscheint als entfernbarer Chip über dem Eingabefeld', async () => {
    const user = userEvent.setup();
    const onRemoveFile = vi.fn();
    const file = new File(['x'], 'quartalsbericht.pdf', { type: 'application/pdf' });

    render(<ComposerCard {...makeProps({ attachedFile: file, onRemoveFile })} />);

    expect(screen.getByTestId('composer-chips')).toBeInTheDocument();
    expect(screen.getByText('quartalsbericht.pdf')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Anhang entfernen'));
    expect(onRemoveFile).toHaveBeenCalledTimes(1);
  });

  const skills: Skill[] = [
    { name: 'recherche', beschreibung: 'Recherchiert im Web', argumente: [] },
    { name: 'zusammenfassen', beschreibung: 'Fasst Dokumente zusammen', argumente: [] },
  ];

  test('/ öffnet das Skill-Menü samt festen Befehlen', () => {
    render(<ComposerCard {...makeProps({ value: '/', skills })} />);
    expect(screen.getByTestId('skill-menu')).toBeInTheDocument();
    expect(screen.getByText('/recherche')).toBeInTheDocument();
    expect(screen.getByText('/zusammenfassen')).toBeInTheDocument();
    // Feste Befehle sind immer dabei.
    expect(screen.getByText('/skills')).toBeInTheDocument();
    expect(screen.getByText('/neuer-skill')).toBeInTheDocument();
  });

  test('/rech filtert auf den passenden Skill', () => {
    render(<ComposerCard {...makeProps({ value: '/rech', skills })} />);
    expect(screen.getByText('/recherche')).toBeInTheDocument();
    expect(screen.queryByText('/zusammenfassen')).not.toBeInTheDocument();
    // Kein fester Befehl beginnt mit „rech".
    expect(screen.queryByText('/neuer-skill')).not.toBeInTheDocument();
  });

  test('Auswahl setzt /<name> und schließt das Menü', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ComposerCard {...makeProps({ value: '/rech', skills, onChange })} />);
    await user.click(screen.getByText('/recherche'));
    expect(onChange).toHaveBeenCalledWith('/recherche ');
  });

  test('keine Menü ohne / und keine bei Leerzeichen (Eingabe-Modus)', () => {
    const { rerender } = render(<ComposerCard {...makeProps({ value: 'hallo', skills })} />);
    expect(screen.queryByTestId('skill-menu')).not.toBeInTheDocument();
    rerender(<ComposerCard {...makeProps({ value: '/recherche finde', skills })} />);
    expect(screen.queryByTestId('skill-menu')).not.toBeInTheDocument();
  });

  test('Enter bei offenem Menü übernimmt den aktiven Eintrag (statt zu senden)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onSend = vi.fn();
    render(<ComposerCard {...makeProps({ value: '/rech', skills, onChange, onSend })} />);
    await user.click(screen.getByLabelText('Nachricht an die KI'));
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('/recherche ');
    expect(onSend).not.toHaveBeenCalled();
  });

  test('Pfeil-runter wählt den nächsten Eintrag, Enter übernimmt ihn', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ComposerCard {...makeProps({ value: '/', skills, onChange })} />);
    await user.click(screen.getByLabelText('Nachricht an die KI'));
    await user.keyboard('{ArrowDown}{Enter}');
    // Erster ist recherche, ein Schritt runter → zusammenfassen.
    expect(onChange).toHaveBeenCalledWith('/zusammenfassen ');
  });

  test('/skills löst die Übersicht aus', async () => {
    const user = userEvent.setup();
    const onOpenSkillOverview = vi.fn();
    render(<ComposerCard {...makeProps({ value: '/skills', skills, onOpenSkillOverview })} />);
    // Innerhalb des Menüs klicken — der Textarea-Wert „/skills" trägt denselben
    // Text und würde sonst mitmatchen.
    await user.click(within(screen.getByTestId('skill-menu')).getByText('/skills'));
    expect(onOpenSkillOverview).toHaveBeenCalledTimes(1);
  });

  test('/neuer-skill löst den Anlege-Weg aus', async () => {
    const user = userEvent.setup();
    const onCreateSkill = vi.fn();
    render(<ComposerCard {...makeProps({ value: '/neuer-skill', skills, onCreateSkill })} />);
    await user.click(within(screen.getByTestId('skill-menu')).getByText('/neuer-skill'));
    expect(onCreateSkill).toHaveBeenCalledTimes(1);
  });

  test('nach einem festen Befehl öffnet / das Menü wieder (Regression)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <ComposerCard
        {...makeProps({ value: '/skills', skills, onChange, onOpenSkillOverview: vi.fn() })}
      />
    );
    await user.click(within(screen.getByTestId('skill-menu')).getByText('/skills'));
    // Der Befehl leert das Feld (onChange('')). Danach tippt der Nutzer wieder „/":
    rerender(<ComposerCard {...makeProps({ value: '/', skills, onChange })} />);
    expect(screen.getByTestId('skill-menu')).toBeInTheDocument();
  });

  test('Stift-Symbol bearbeitet den Skill, ohne ihn zu übernehmen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onEditSkill = vi.fn();
    render(<ComposerCard {...makeProps({ value: '/rech', skills, onChange, onEditSkill })} />);
    await user.click(screen.getByLabelText(/bearbeiten/i));
    expect(onEditSkill).toHaveBeenCalledWith('recherche');
    // Bearbeiten ist NICHT dasselbe wie Übernehmen.
    expect(onChange).not.toHaveBeenCalledWith('/recherche ');
  });

  test('keine Menü bei angehängter Datei', () => {
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    render(<ComposerCard {...makeProps({ value: '/', skills, attachedFile: file })} />);
    expect(screen.queryByTestId('skill-menu')).not.toBeInTheDocument();
  });

  test('angehängte Bilder erscheinen je als eigener Chip', async () => {
    const user = userEvent.setup();
    const onRemoveImage = vi.fn();
    const images = [
      { file: new File(['a'], 'foto-a.png', { type: 'image/png' }), base64: 'data:a' },
      { file: new File(['b'], 'foto-b.png', { type: 'image/png' }), base64: 'data:b' },
    ];

    render(<ComposerCard {...makeProps({ attachedImages: images, onRemoveImage })} />);

    expect(screen.getByText('foto-a.png')).toBeInTheDocument();
    expect(screen.getByText('foto-b.png')).toBeInTheDocument();
    expect(screen.getAllByTestId('composer-chip')).toHaveLength(2);

    await user.click(screen.getAllByLabelText('Bild entfernen')[1]!);
    expect(onRemoveImage).toHaveBeenCalledWith(1);
  });
});
