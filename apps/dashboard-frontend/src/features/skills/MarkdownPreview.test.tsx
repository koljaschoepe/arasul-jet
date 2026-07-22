/**
 * MarkdownPreview Tests (Plan 011, Schritt 17).
 * Entprellter Vorschau-Aufruf: zeigt die erzeugte Datei bei Erfolg, die
 * Prüf-Meldung bei ungültigen Eingaben.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { it, expect, beforeEach, vi } from 'vitest';
import MarkdownPreview from './MarkdownPreview';

const apiPost = vi.fn();
vi.mock('@/hooks/useApi', () => ({ useApi: () => ({ post: apiPost }) }));

beforeEach(() => vi.clearAllMocks());

it('zeigt die erzeugte Datei bei Erfolg', async () => {
  apiPost.mockResolvedValue({ data: { datei: '---\nname: test\n---\n# Prompt' } });
  render(<MarkdownPreview body={{ name: 'test', prompt: '# Prompt' }} />);
  await waitFor(() => expect(screen.getByTestId('preview-datei')).toHaveTextContent('name: test'));
  expect(apiPost).toHaveBeenCalledWith(
    '/skills/vorschau',
    { name: 'test', prompt: '# Prompt' },
    {
      showError: false,
    }
  );
});

it('zeigt die Prüf-Meldung bei ungültigen Eingaben', async () => {
  apiPost.mockRejectedValue(
    Object.assign(new Error('Ein Skill braucht einen Prompt'), { status: 400 })
  );
  render(<MarkdownPreview body={{ name: 'test', prompt: '' }} />);
  await waitFor(() =>
    expect(screen.getByTestId('preview-error')).toHaveTextContent('Ein Skill braucht einen Prompt')
  );
});
