/**
 * MarkdownPreview Tests (Plan 011 Schritt 17 · Plan 012 Phase D Schritt 11).
 * Zwei Ansichten: „Datei" (erzeugte Markdown-Datei, POST /flows/vorschau) und
 * „Laufzeit-Prompt" (aufgelöster Prompt, POST /flows/vorschau-laufzeit).
 * Entprellter, rennt-sicherer Aufruf; die Prüf-Meldung bei ungültigen Eingaben.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { it, expect, beforeEach, vi } from 'vitest';
import MarkdownPreview from './MarkdownPreview';

const apiPost = vi.fn();
vi.mock('@/hooks/useApi', () => ({ useApi: () => ({ post: apiPost }) }));

beforeEach(() => vi.clearAllMocks());

it('zeigt in der Datei-Ansicht die erzeugte Datei bei Erfolg', async () => {
  apiPost.mockResolvedValue({ data: { datei: '---\nname: test\n---\n# Prompt' } });
  render(<MarkdownPreview body={{ name: 'test', prompt: '# Prompt' }} />);
  await waitFor(() => expect(screen.getByTestId('preview-datei')).toHaveTextContent('name: test'));
  expect(apiPost).toHaveBeenCalledWith(
    '/flows/vorschau',
    { name: 'test', prompt: '# Prompt' },
    { showError: false }
  );
});

it('zeigt die Prüf-Meldung bei ungültigen Eingaben', async () => {
  apiPost.mockRejectedValue(
    Object.assign(new Error('Ein Flow braucht einen Prompt'), { status: 400 })
  );
  render(<MarkdownPreview body={{ name: 'test', prompt: '' }} />);
  await waitFor(() =>
    expect(screen.getByTestId('preview-error')).toHaveTextContent('Ein Flow braucht einen Prompt')
  );
});

it('wechselt auf Laufzeit-Prompt und zeigt den aufgelösten Prompt', async () => {
  apiPost.mockImplementation((url: string) => {
    if (url === '/flows/vorschau') return Promise.resolve({ data: { datei: 'DATEI' } });
    return Promise.resolve({
      data: {
        systemPrompt: 'Fasse Quartalszahlen zusammen.',
        userInput: 'Angaben:\nThema: Quartalszahlen',
        werkzeuge: ['rag_suche'],
        ordner: [],
        rollen: [],
        beispielWerte: { thema: 'Quartalszahlen' },
      },
    });
  });
  render(<MarkdownPreview body={{ name: 'test', prompt: 'Fasse {{thema}} zusammen.' }} />);
  await waitFor(() => expect(screen.getByTestId('preview-datei')).toBeInTheDocument());

  fireEvent.click(screen.getByTestId('preview-view-laufzeit'));

  await waitFor(() =>
    expect(screen.getByTestId('preview-laufzeit')).toHaveTextContent(
      'Fasse Quartalszahlen zusammen.'
    )
  );
  expect(screen.getByTestId('preview-laufzeit')).toHaveTextContent('rag_suche');
  expect(apiPost).toHaveBeenCalledWith(
    '/flows/vorschau-laufzeit',
    { name: 'test', prompt: 'Fasse {{thema}} zusammen.' },
    { showError: false }
  );
});
