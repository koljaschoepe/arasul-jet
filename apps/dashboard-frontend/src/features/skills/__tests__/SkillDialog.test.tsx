/**
 * SkillDialog Tests (Plan 011, Schritt 17).
 * EIN Dialog fürs Anlegen und Bearbeiten: Formular + Live-Vorschau, Speichern
 * (POST/PUT) macht die Skill-Liste frisch, Bearbeiten lädt den Skill und bietet
 * Löschen (mit Rückfrage).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SkillDialog from '../SkillDialog';
import type { SkillDefinition } from '@/types/skills';

const apiGet = vi.fn();
const apiPost = vi.fn();
const apiPut = vi.fn();
const apiDel = vi.fn();
vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({ get: apiGet, post: apiPost, put: apiPut, del: apiDel }),
}));

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => toast }));

const WERKZEUGE = [
  { name: 'rag_suche', verfuegbar: true },
  { name: 'dateien_schreiben', verfuegbar: true },
  { name: 'subagent', verfuegbar: true },
];

const RECHERCHE: SkillDefinition = {
  name: 'recherche',
  beschreibung: 'sucht im Netz',
  argumente: [{ name: 'thema', typ: 'freitext', beschreibung: 'Das Thema', pflicht: true }],
  ordner: [],
  werkzeuge: ['rag_suche'],
  rollen: [],
  grenzen: { max_aufrufe: 20, zeitlimit_s: 900, werkzeug_runden: 10 },
  prompt: '# Recherche\n{{thema}}',
};

function renderDialog(editName: string | null, onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SkillDialog open editName={editName} onClose={onClose} />
    </QueryClientProvider>
  );
  return onClose;
}

beforeEach(() => {
  vi.clearAllMocks();
  apiGet.mockImplementation((url: string) => {
    if (url === '/skills/werkzeuge') return Promise.resolve({ data: WERKZEUGE });
    if (url === '/skills/recherche') return Promise.resolve({ data: RECHERCHE });
    return Promise.resolve({ data: {} });
  });
  apiPost.mockResolvedValue({ data: { datei: '---\n---\n# x' } });
  apiPut.mockResolvedValue({ data: {} });
  apiDel.mockResolvedValue({ deleted: true });
});

describe('Anlegen', () => {
  it('zeigt den Anlege-Titel, Formular und Vorschau', async () => {
    renderDialog(null);
    expect(await screen.findByText('Neuer Skill')).toBeInTheDocument();
    expect(screen.getByTestId('skill-form')).toBeInTheDocument();
    expect(screen.getByTestId('markdown-preview')).toBeInTheDocument();
    // Kein Löschen-Knopf beim Anlegen.
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument();
  });

  it('Speichern schickt POST /skills mit den Eingaben und schließt', async () => {
    const user = userEvent.setup();
    const onClose = renderDialog(null);
    await screen.findByText('Neuer Skill');

    await user.type(screen.getByLabelText('Name'), 'notiz');
    await user.type(screen.getByLabelText('Prompt (Anweisung an das Modell)'), 'Schreibe etwas.');
    await user.click(screen.getByRole('button', { name: /Speichern/ }));

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith(
        '/skills',
        expect.objectContaining({
          name: 'notiz',
          prompt: 'Schreibe etwas.',
        }),
        { showError: false }
      )
    );
    expect(onClose).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
  });

  it('zeigt die Fehlermeldung des Servers, wenn Speichern scheitert', async () => {
    const user = userEvent.setup();
    apiPost.mockImplementation((url: string) => {
      if (url === '/skills')
        return Promise.reject(
          Object.assign(new Error('Skill „notiz" existiert bereits'), { status: 409 })
        );
      return Promise.resolve({ data: { datei: 'x' } });
    });
    renderDialog(null);
    await screen.findByText('Neuer Skill');
    await user.type(screen.getByLabelText('Name'), 'notiz');
    await user.type(screen.getByLabelText('Prompt (Anweisung an das Modell)'), 'x');
    await user.click(screen.getByRole('button', { name: /Speichern/ }));
    expect(await screen.findByText('Skill „notiz" existiert bereits')).toBeInTheDocument();
  });
});

describe('Bearbeiten', () => {
  it('lädt den Skill, sperrt den Namen und bietet Löschen', async () => {
    renderDialog('recherche');
    expect(await screen.findByText('Skill bearbeiten: /recherche')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('recherche'));
    expect(screen.getByLabelText('Name')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Löschen/ })).toBeInTheDocument();
  });

  it('Speichern schickt PUT /skills/:name', async () => {
    const user = userEvent.setup();
    const onClose = renderDialog('recherche');
    await screen.findByText('Skill bearbeiten: /recherche');
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('recherche'));
    await user.click(screen.getByRole('button', { name: /Speichern/ }));
    await waitFor(() => expect(apiPut).toHaveBeenCalled());
    // Der Name gehört in die URL, NICHT in den Body — `SaveSkillBody` ist strict.
    const [url, body] = apiPut.mock.calls[0]!;
    expect(url).toBe('/skills/recherche');
    expect(body).not.toHaveProperty('name');
    expect(body).toMatchObject({ prompt: '# Recherche\n{{thema}}' });
    expect(onClose).toHaveBeenCalled();
  });

  it('Löschen fragt nach und schickt dann DELETE', async () => {
    const user = userEvent.setup();
    const onClose = renderDialog('recherche');
    await screen.findByText('Skill bearbeiten: /recherche');
    await user.click(screen.getByRole('button', { name: /Löschen/ }));
    // Rückfrage-Dialog erscheint; darin der bestätigende Löschen-Knopf.
    const dialog = await screen.findByText('Skill löschen');
    const confirmScope = dialog.closest('[role="dialog"]') as HTMLElement;
    await user.click(within(confirmScope).getByRole('button', { name: 'Löschen' }));
    await waitFor(() =>
      expect(apiDel).toHaveBeenCalledWith('/skills/recherche', { showError: false })
    );
    expect(onClose).toHaveBeenCalled();
  });
});
