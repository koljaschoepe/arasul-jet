/**
 * Ein Modell über einen Link hinzufügen (Entscheidung Kolja, 23.08.2026).
 *
 * Der Ablauf ist zweistufig, und der erste Schritt ist der Punkt: eine
 * GGUF-Ablage trägt ein Dutzend Quantisierungen zwischen 11 und 50 GB. Ohne
 * das Nachsehen müsste der Kunde raten und danach zweistellige Gigabyte laden,
 * um zu merken, dass es nicht ins Gerät passt. Diese Tests halten fest, dass
 * die Größe und das Urteil „passt nicht" VOR dem Laden dastehen.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModellHinzufuegen } from '../ModellHinzufuegen';

const post = vi.fn();
const success = vi.fn();

vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({ post: (...a: unknown[]) => post(...a) }),
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ success, error: vi.fn(), info: vi.fn() }),
}));

const hfBefund = {
  art: 'huggingface',
  repo: 'unsloth/Qwen3-30B-A3B-GGUF',
  name: 'hf.co/unsloth/Qwen3-30B-A3B-GGUF',
  frei_gb: 15.3,
  varianten: [
    {
      tag: 'Q2_K',
      datei: 'x-Q2_K.gguf',
      groesseBytes: 11.3e9,
      groesse_gb: 11.3,
      ramGb: 15,
      passt: true,
    },
    {
      tag: 'IQ4_XS',
      datei: 'x-IQ4_XS.gguf',
      groesseBytes: 16.4e9,
      groesse_gb: 16.4,
      ramGb: 22,
      passt: false,
    },
  ],
};

function oeffnen() {
  render(<ModellHinzufuegen />);
  fireEvent.click(screen.getByTestId('modell-hinzufuegen-oeffnen'));
}

describe('ModellHinzufuegen', () => {
  beforeEach(() => {
    post.mockReset();
    success.mockReset();
  });

  it('zeigt Varianten mit Groesse und sagt, was nicht ins Geraet passt', async () => {
    post.mockResolvedValueOnce(hfBefund);
    oeffnen();

    fireEvent.change(screen.getByTestId('modell-quelle'), {
      target: { value: 'https://huggingface.co/unsloth/Qwen3-30B-A3B-GGUF' },
    });
    fireEvent.click(screen.getByTestId('modell-nachsehen'));

    await waitFor(() => expect(screen.getByTestId('modell-varianten')).toBeInTheDocument());
    expect(screen.getByText('Q2_K')).toBeInTheDocument();
    expect(screen.getByText(/11.3 GB · braucht 15 GB/)).toBeInTheDocument();
    // Das Urteil steht VOR dem Laden da.
    expect(screen.getByText(/passt nicht ins Gerät/)).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/models/quelle/pruefen', {
      quelle: 'https://huggingface.co/unsloth/Qwen3-30B-A3B-GGUF',
    });
  });

  it('nimmt die gewaehlte Variante in den Katalog auf', async () => {
    post.mockResolvedValueOnce(hfBefund);
    post.mockResolvedValueOnce({
      data: { id: 'hf.co/unsloth/x:Q2_K', name: 'Qwen3-30B-A3B-GGUF' },
    });
    const onHinzugefuegt = vi.fn();
    render(<ModellHinzufuegen onHinzugefuegt={onHinzugefuegt} />);
    fireEvent.click(screen.getByTestId('modell-hinzufuegen-oeffnen'));

    fireEvent.change(screen.getByTestId('modell-quelle'), {
      target: { value: 'unsloth/Qwen3-30B-A3B-GGUF' },
    });
    fireEvent.click(screen.getByTestId('modell-nachsehen'));
    await waitFor(() => expect(screen.getByTestId('modell-variante-Q2_K')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('modell-variante-Q2_K'));

    await waitFor(() =>
      expect(post).toHaveBeenLastCalledWith('/models/katalog', {
        quelle: 'unsloth/Qwen3-30B-A3B-GGUF',
        variante: 'Q2_K',
      })
    );
    await waitFor(() => expect(onHinzugefuegt).toHaveBeenCalled());
    expect(success).toHaveBeenCalledWith(expect.stringContaining('Qwen3-30B-A3B-GGUF'));
  });

  it('uebernimmt ein Ollama-Modell ohne Variantenwahl', async () => {
    post.mockResolvedValueOnce({
      art: 'ollama',
      name: 'llama3.2:3b',
      varianten: [],
      hinweis: 'Varianten lassen sich von hier aus nicht auflisten.',
    });
    post.mockResolvedValueOnce({ data: { id: 'llama3.2:3b', name: 'llama3.2:3b' } });
    oeffnen();

    fireEvent.change(screen.getByTestId('modell-quelle'), { target: { value: 'llama3.2:3b' } });
    fireEvent.click(screen.getByTestId('modell-nachsehen'));
    await waitFor(() => expect(screen.getByTestId('modell-uebernehmen')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('modell-uebernehmen'));
    await waitFor(() =>
      expect(post).toHaveBeenLastCalledWith('/models/katalog', { quelle: 'llama3.2:3b' })
    );
  });

  it('sagt nach einem Fehlschlag nichts doppelt', async () => {
    // `useApi` zeigt die Meldung des Servers schon an. Ein zweiter Toast waere
    // derselbe Satz zweimal.
    post.mockRejectedValueOnce(new Error('kaputt'));
    oeffnen();
    fireEvent.change(screen.getByTestId('modell-quelle'), { target: { value: 'a/b' } });
    fireEvent.click(screen.getByTestId('modell-nachsehen'));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(success).not.toHaveBeenCalled();
    expect(screen.queryByTestId('modell-varianten')).not.toBeInTheDocument();
  });
});
