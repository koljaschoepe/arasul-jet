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
  // Prädikate spiegeln die echte Implementierung (reine Funktionen).
  isModelInstalled: (m: { install_status?: string }) => m.install_status === 'available',
  isModelActive: (m: { id: string; effective_ollama_name?: string }, loadedId: string | null) =>
    loadedId != null && (loadedId === m.id || loadedId === m.effective_ollama_name),
  isAppInstalled: (a: { status?: string }) =>
    a.status === 'running' || a.status === 'installed' || a.status === 'error',
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

  it('zeigt NUR installierte/aktive Einträge (Plattform, laufende App, geladenes Modell)', () => {
    renderList();
    // Installiert/aktiv → sichtbar
    expect(screen.getByTestId('platform-row-telegram')).toBeInTheDocument();
    expect(screen.getByTestId('ext-app-n8n')).toBeInTheDocument(); // status running
    expect(screen.getByTestId('ext-model-llama3')).toBeInTheDocument(); // install_status available
    // Nicht installiert → in der Verwaltung ausgeblendet (nur im Katalog rechts)
    expect(screen.queryByTestId('ext-app-gitea')).not.toBeInTheDocument(); // status available
    expect(screen.queryByTestId('ext-model-bge-m3')).not.toBeInTheDocument(); // install_status missing
  });

  it('das Suchfeld filtert die installierten Einträge', () => {
    renderList();
    fireEvent.change(screen.getByLabelText('Extensions durchsuchen'), {
      target: { value: 'workflow' },
    });
    // n8n (Beschreibung "Workflow-Automatisierung") bleibt, alles andere verschwindet
    expect(screen.getByTestId('ext-app-n8n')).toBeInTheDocument();
    expect(screen.queryByTestId('ext-model-llama3')).not.toBeInTheDocument();
    expect(screen.queryByTestId('platform-row-telegram')).not.toBeInTheDocument();
  });

  it('der Kategorie-Filter grenzt auf Sprachmodelle bzw. Apps ein', () => {
    renderList();
    // Sprachmodelle → nur Modelle, keine Apps/Plattform
    fireEvent.click(screen.getByTestId('ext-filter-models'));
    expect(screen.getByTestId('ext-model-llama3')).toBeInTheDocument();
    expect(screen.queryByTestId('ext-app-n8n')).not.toBeInTheDocument();
    expect(screen.queryByTestId('platform-row-telegram')).not.toBeInTheDocument();
    // Apps → Plattform + Container-Apps, keine Modelle
    fireEvent.click(screen.getByTestId('ext-filter-apps'));
    expect(screen.getByTestId('platform-row-telegram')).toBeInTheDocument();
    expect(screen.getByTestId('ext-app-n8n')).toBeInTheDocument();
    expect(screen.queryByTestId('ext-model-llama3')).not.toBeInTheDocument();
    // Alle → wieder alles Installierte
    fireEvent.click(screen.getByTestId('ext-filter-all'));
    expect(screen.getByTestId('ext-model-llama3')).toBeInTheDocument();
    expect(screen.getByTestId('ext-app-n8n')).toBeInTheDocument();
  });

  it('das Suchfeld filtert auch die Plattform-Apps', () => {
    renderList();
    // Query, die nur die Plattform-App (Telegram) trifft
    fireEvent.change(screen.getByLabelText('Extensions durchsuchen'), {
      target: { value: 'telegram' },
    });
    expect(screen.getByTestId('platform-row-telegram')).toBeInTheDocument();
    expect(screen.queryByTestId('ext-app-gitea')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ext-model-llama3')).not.toBeInTheDocument();
  });

  it('ohne Treffer verschwinden auch die Plattform-Apps und der Leerzustand erscheint', () => {
    renderList();
    fireEvent.change(screen.getByLabelText('Extensions durchsuchen'), {
      target: { value: 'zzz-kein-treffer' },
    });
    expect(screen.queryByTestId('platform-row-telegram')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ext-app-gitea')).not.toBeInTheDocument();
    expect(screen.getByText(/Keine Treffer/)).toBeInTheDocument();
  });

  it('Klick auf eine Zeile setzt die Auswahl im Extension-Store', () => {
    renderList();
    fireEvent.click(screen.getByTestId('ext-app-n8n'));
    expect(useExtensionStore.getState().selected).toEqual({ kind: 'app', id: 'n8n' });

    fireEvent.click(screen.getByTestId('ext-model-llama3'));
    expect(useExtensionStore.getState().selected).toEqual({ kind: 'model', id: 'llama3' });
  });

  it('Plattform-Toggle ruft setAppEnabled', () => {
    renderList();
    fireEvent.click(screen.getByRole('switch', { name: /Telegram/ }));
    expect(setAppEnabled).toHaveBeenCalledWith('telegram', false);
  });
});
