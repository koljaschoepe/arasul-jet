/**
 * ArgumentPicker Tests (Plan 011, Schritt 14).
 * Auswahlliste aus dem Skill, Wissensbasis aus der API; Label ≠ Wert.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ArgumentPicker from './ArgumentPicker';
import type { SkillArgument } from '@/types/skills';

const apiMock = { get: vi.fn() };
vi.mock('@/hooks/useApi', () => ({ useApi: () => apiMock }));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => vi.clearAllMocks());

describe('ArgumentPicker · Auswahlliste', () => {
  const arg: SkillArgument = {
    name: 'ton',
    typ: 'auswahl',
    beschreibung: '',
    pflicht: true,
    optionen: ['kurz', 'ausführlich'],
  };

  test('zeigt die Optionen des Skills und übernimmt Wert=Label', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    wrap(<ArgumentPicker arg={arg} onPick={onPick} onClose={vi.fn()} />);
    expect(screen.getByText('kurz')).toBeInTheDocument();
    await user.click(screen.getByText('ausführlich'));
    expect(onPick).toHaveBeenCalledWith('ausführlich', 'ausführlich');
  });

  test('hat ein fokussiertes Suchfeld — Enter wählt, statt zu senden', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    wrap(<ArgumentPicker arg={arg} onPick={onPick} onClose={vi.fn()} />);
    // Das Suchfeld ist auch bei fester Auswahl da und trägt Fokus + Tastatur.
    expect(screen.getByLabelText('Auswahl durchsuchen')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onPick).toHaveBeenCalledWith('kurz', 'kurz'); // erster (hervorgehobener) Wert
  });
});

describe('ArgumentPicker · Wissensbasis', () => {
  const arg: SkillArgument = { name: 'raum', typ: 'wissensbasis', beschreibung: '', pflicht: true };

  test('lädt Sammlungen und übernimmt ID als Wert, Name als Label', async () => {
    apiMock.get.mockResolvedValue({
      data: [{ id: 'sp-42', name: 'Marketing', slug: 'marketing', description: 'Alles Marketing' }],
    });
    const user = userEvent.setup();
    const onPick = vi.fn();
    wrap(<ArgumentPicker arg={arg} onPick={onPick} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Marketing')).toBeInTheDocument());
    await user.click(screen.getByText('Marketing'));
    // Wert = ID (für den Lauf), Label = Name (fürs Feld).
    expect(onPick).toHaveBeenCalledWith('sp-42', 'Marketing');
    expect(apiMock.get).toHaveBeenCalledWith('/skills/sammlungen', expect.anything());
  });

  test('Escape schließt die Auswahl', async () => {
    apiMock.get.mockResolvedValue({ data: [] });
    const user = userEvent.setup();
    const onClose = vi.fn();
    wrap(<ArgumentPicker arg={arg} onPick={vi.fn()} onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
