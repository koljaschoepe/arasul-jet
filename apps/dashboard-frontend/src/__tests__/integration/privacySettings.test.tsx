/**
 * Phase 5.6 — Integration tests für PrivacySettings.
 *
 * Coverage:
 *   - Lädt + zeigt Datenkategorien aus /gdpr/categories
 *   - Delete-Button bleibt disabled bis das Confirmation-Wort exakt getippt ist
 *   - DELETE-Call mit korrektem Body { confirm: 'LOESCHEN-BESTAETIGT' }
 *   - Auf Erfolg → handleLogout
 *   - Fehler-Anzeige bei Backend-Fehler
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PrivacySettings } from '../../features/settings/components/PrivacySettings';
import { createMockApi } from '../helpers/renderWithProviders';

const mockApi = createMockApi();

vi.mock('../../hooks/useApi', () => ({
  useApi: () => mockApi,
  default: () => mockApi,
}));

vi.mock('../../hooks/useConfirm', () => ({
  default: () => ({
    confirm: vi.fn().mockResolvedValue(true),
    ConfirmDialog: null,
  }),
}));

// fetch-Mock für /gdpr/export — sonst würde der Real-Network-Call laufen
const originalFetch = globalThis.fetch;

function renderPrivacySettings(handleLogout = vi.fn()) {
  return {
    handleLogout,
    ...render(
      <MemoryRouter>
        <PrivacySettings handleLogout={handleLogout} />
      </MemoryRouter>
    ),
  };
}

describe('PrivacySettings (Phase 5.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockResolvedValue({
      categories: [
        { name: 'Profil', description: 'Stammdaten', count: 1 },
        { name: 'Chat-Konversationen', description: 'Gespräche', count: 17 },
      ],
      timestamp: '2026-04-28T00:00:00Z',
    });
    mockApi.request.mockResolvedValue({
      ok: true,
      message: 'gelöscht',
      summary: { chat_messages: 5 },
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['{}'], { type: 'application/json' })),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('lädt + zeigt Datenkategorien', async () => {
    renderPrivacySettings();

    await waitFor(() => {
      expect(screen.getByText('Profil')).toBeInTheDocument();
      expect(screen.getByText('Chat-Konversationen')).toBeInTheDocument();
      expect(screen.getByText('17')).toBeInTheDocument();
    });

    expect(mockApi.get).toHaveBeenCalledWith('/gdpr/categories', expect.any(Object));
  });

  it('Delete-Button bleibt disabled bis exakter Token getippt', async () => {
    const user = userEvent.setup();
    renderPrivacySettings();

    const deleteButton = await screen.findByRole('button', {
      name: /Account und Daten löschen/i,
    });
    expect(deleteButton).toBeDisabled();

    const input = screen.getByPlaceholderText('LOESCHEN-BESTAETIGT');
    await user.type(input, 'LOESCHEN-FALSCH');
    expect(deleteButton).toBeDisabled();

    await user.clear(input);
    await user.type(input, 'LOESCHEN-BESTAETIGT');
    expect(deleteButton).not.toBeDisabled();
  });

  it('schickt DELETE mit korrektem Body und ruft handleLogout', async () => {
    const user = userEvent.setup();
    const handleLogout = vi.fn();
    renderPrivacySettings(handleLogout);

    const input = await screen.findByPlaceholderText('LOESCHEN-BESTAETIGT');
    await user.type(input, 'LOESCHEN-BESTAETIGT');

    const deleteButton = screen.getByRole('button', { name: /Account und Daten löschen/i });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(mockApi.request).toHaveBeenCalledWith(
        '/gdpr/me',
        expect.objectContaining({
          method: 'DELETE',
          body: { confirm: 'LOESCHEN-BESTAETIGT' },
        })
      );
    });

    await waitFor(() => {
      expect(handleLogout).toHaveBeenCalledTimes(1);
    });
  });

  it('zeigt Fehler an, wenn Backend ablehnt', async () => {
    const user = userEvent.setup();
    mockApi.request.mockRejectedValueOnce(new Error('Du bist der letzte aktive Admin.'));
    const handleLogout = vi.fn();
    renderPrivacySettings(handleLogout);

    const input = await screen.findByPlaceholderText('LOESCHEN-BESTAETIGT');
    await user.type(input, 'LOESCHEN-BESTAETIGT');
    const deleteButton = screen.getByRole('button', { name: /Account und Daten löschen/i });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/letzte aktive Admin/i);
    });
    expect(handleLogout).not.toHaveBeenCalled();
  });

  it('triggert /gdpr/export Download', async () => {
    const user = userEvent.setup();
    renderPrivacySettings();

    const exportButton = await screen.findByRole('button', { name: /Export herunterladen/i });
    await user.click(exportButton);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/gdpr/export'),
        expect.objectContaining({ method: 'GET' })
      );
    });
  });
});
