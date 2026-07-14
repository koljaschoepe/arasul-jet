/**
 * ComposerCard Tests (Plan 004, Schritt 4)
 *
 * Fokus: sichtbares Anhang-Feedback + native Formulierung.
 * - Platzhalter ist nativ ("Nachricht schreiben …")
 * - Hineingezogene/angehängte Dateien erscheinen als entfernbare Chips
 *   ÜBER dem Eingabefeld (Dateiname + Entfernen-X).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ComposerCard, { type ComposerModel } from './ComposerCard';

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
