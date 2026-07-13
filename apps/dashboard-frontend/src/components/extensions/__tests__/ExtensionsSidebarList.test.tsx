/**
 * ExtensionsSidebarList — Suche/Filter + Auswahl (Plan 003 · Schritt 7).
 * Eine Liste aus Plattform-Apps (Toggles), Container-Apps und Modellen; das
 * Suchfeld filtert Apps + Modelle lokal, ein Klick setzt die Auswahl im
 * Extension-Store.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToastProvider } from '@/contexts/ToastContext';
import { useExtensionStore } from '@/stores/extensionStore';
import { ExtensionsSidebarList } from '../ExtensionsSidebarList';

const MODELS = [
  { id: 'llama3', name: 'Llama 3', description: 'Allrounder-LLM', install_status: 'available' },
  { id: 'bge-m3', name: 'BGE-M3', description: 'Embedding-Modell', install_status: 'missing' },
];
const APPS = [
  { id: 'gitea', name: 'Gitea', description: 'Git-Server', status: 'available' },
  { id: 'n8n', name: 'n8n', description: 'Workflow-Automatisierung', status: 'running' },
];

vi.mock('@/hooks/useStoreCatalog', () => ({
  useStoreCatalog: () => ({
    models: MODELS,
    apps: APPS,
    loadedModel: null,
    defaultModel: null,
    isLoading: false,
    invalidateModels: vi.fn(),
    invalidateApps: vi.fn(),
  }),
}));

const setAppEnabled = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useWorkspaceApps', () => ({
  useWorkspaceApps: () => ({
    apps: [
      { id: 'telegram', name: 'Telegram', description: 'Bot', tab: 'telegram', enabled: true },
    ],
    isLoading: false,
    isAppEnabled: () => true,
    isTabTypeEnabled: () => true,
    setAppEnabled,
  }),
}));

function renderList() {
  return render(
    <ToastProvider>
      <ExtensionsSidebarList />
    </ToastProvider>
  );
}

describe('ExtensionsSidebarList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useExtensionStore.getState().clearSelection();
  });

  it('rendert Plattform-Apps, Container-Apps und Modelle', () => {
    renderList();
    expect(screen.getByTestId('platform-row-telegram')).toBeInTheDocument();
    expect(screen.getByTestId('ext-app-gitea')).toBeInTheDocument();
    expect(screen.getByTestId('ext-app-n8n')).toBeInTheDocument();
    expect(screen.getByTestId('ext-model-llama3')).toBeInTheDocument();
    expect(screen.getByTestId('ext-model-bge-m3')).toBeInTheDocument();
  });

  it('das Suchfeld filtert Apps und Modelle', () => {
    renderList();
    fireEvent.change(screen.getByLabelText('Extensions durchsuchen'), {
      target: { value: 'embed' },
    });
    // BGE-M3 (Beschreibung "Embedding-Modell") bleibt, alles andere verschwindet
    expect(screen.getByTestId('ext-model-bge-m3')).toBeInTheDocument();
    expect(screen.queryByTestId('ext-model-llama3')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ext-app-gitea')).not.toBeInTheDocument();
  });

  it('Klick auf eine Zeile setzt die Auswahl im Extension-Store', () => {
    renderList();
    fireEvent.click(screen.getByTestId('ext-app-gitea'));
    expect(useExtensionStore.getState().selected).toEqual({ kind: 'app', id: 'gitea' });

    fireEvent.click(screen.getByTestId('ext-model-llama3'));
    expect(useExtensionStore.getState().selected).toEqual({ kind: 'model', id: 'llama3' });
  });

  it('Plattform-Toggle ruft setAppEnabled', () => {
    renderList();
    fireEvent.click(screen.getByRole('switch', { name: /Telegram/ }));
    expect(setAppEnabled).toHaveBeenCalledWith('telegram', false);
  });
});
