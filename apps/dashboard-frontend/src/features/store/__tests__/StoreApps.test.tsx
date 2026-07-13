/**
 * StoreApps — kompakte Extensions-Liste
 * Zeilen mit Icon/Name/Beschreibung/Status, Detail per Zeilen-Klick,
 * Aktionen rechts (Install/Start/Stop) ohne Zeilen-Klick auszulösen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StoreApps from '../StoreApps';
import { ToastProvider } from '@/contexts/ToastContext';

// PlatformAppsSection hat eigene Tests (React Query) — hier stubben
vi.mock('../PlatformAppsSection', () => ({
  default: () => <div data-testid="platform-apps-stub" />,
}));

// Detailansicht stubben: wir testen nur, dass der Zeilen-Klick sie öffnet
vi.mock('../StoreDetailModal', () => ({
  default: ({ item, onClose }: { item: { name: string }; onClose: () => void }) => (
    <div data-testid="detail-modal">
      {item.name}
      <button onClick={onClose}>Schließen</button>
    </div>
  ),
}));

const APPS = [
  {
    id: 'n8n',
    name: 'n8n',
    description: 'Workflow-Automatisierung mit visuellen Flows',
    version: '1.0.0',
    category: 'productivity',
    status: 'running',
    appType: 'official',
    hasCustomPage: true,
    customPageRoute: '/automationen',
  },
  {
    id: 'gitea',
    name: 'Gitea',
    description: 'Leichtgewichtiger Git-Server',
    version: '1.21.0',
    category: 'development',
    status: 'available',
  },
  {
    id: 'grafana',
    name: 'Grafana',
    description: 'Metriken und Dashboards',
    version: '10.0.0',
    category: 'monitoring',
    status: 'installed',
  },
];

const apiMock = {
  get: vi.fn().mockResolvedValue({ apps: APPS }),
  post: vi.fn().mockResolvedValue({}),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  request: vi.fn(),
};
vi.mock('@/hooks/useApi', () => ({ useApi: () => apiMock }));

function renderStoreApps() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <StoreApps />
      </ToastProvider>
    </MemoryRouter>
  );
}

function sseResponse(lines: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(`data: ${line}\n`));
      controller.close();
    },
  });
  return { ok: true, status: 200, body };
}

describe('StoreApps — kompakte Liste', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockResolvedValue({ apps: APPS });
  });

  it('rendert alle Apps als Zeilen mit Name und Kurzbeschreibung', async () => {
    renderStoreApps();
    await waitFor(() => expect(screen.getByTestId('app-row-n8n')).toBeInTheDocument());

    expect(screen.getByTestId('app-row-gitea')).toBeInTheDocument();
    expect(screen.getByTestId('app-row-grafana')).toBeInTheDocument();
    expect(screen.getByText('Workflow-Automatisierung mit visuellen Flows')).toBeInTheDocument();
    // Liste statt Karten-Grid
    expect(screen.getByRole('list', { name: 'Verfügbare Extensions' })).toBeInTheDocument();
  });

  it('zeigt Statusbadge und passende Aktion pro Zeile', async () => {
    renderStoreApps();
    await waitFor(() => expect(screen.getByTestId('app-row-n8n')).toBeInTheDocument());

    // running → Aktiv + Öffnen + Stoppen
    expect(screen.getByText('Aktiv')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Öffnen/ })).toHaveAttribute('href', '/automationen');
    expect(screen.getByLabelText('Stoppen')).toBeInTheDocument();
    // available → Installieren
    expect(screen.getByRole('button', { name: 'Installieren' })).toBeInTheDocument();
    // installed → Starten + Deinstallieren
    expect(screen.getByRole('button', { name: 'Starten' })).toBeInTheDocument();
    expect(screen.getByLabelText('Deinstallieren')).toBeInTheDocument();
  });

  it('Zeilen-Klick öffnet die Detailansicht', async () => {
    renderStoreApps();
    await waitFor(() => expect(screen.getByTestId('app-row-gitea')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('app-row-gitea'));
    expect(screen.getByTestId('detail-modal')).toHaveTextContent('Gitea');
  });

  it('Aktions-Klick löst keinen Zeilen-Klick aus (kein Detail-Modal)', async () => {
    renderStoreApps();
    await waitFor(() => expect(screen.getByTestId('app-row-grafana')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Starten' }));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/apps/grafana/start', {}, { showError: false })
    );
    expect(screen.queryByTestId('detail-modal')).not.toBeInTheDocument();
  });

  it('Installieren startet SSE-Install über api.request', async () => {
    apiMock.request.mockResolvedValue(
      sseResponse([
        '{"phase":"pull","percent":50,"message":"Lade..."}',
        '{"done":true,"message":"Fertig"}',
      ])
    );
    renderStoreApps();
    await waitFor(() => expect(screen.getByTestId('app-row-gitea')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Installieren' }));
    await waitFor(() =>
      expect(apiMock.request).toHaveBeenCalledWith(
        '/apps/gitea/install?stream=true',
        expect.objectContaining({ method: 'POST', raw: true })
      )
    );
    // Nach done → Apps neu geladen
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledTimes(2));
  });

  it('zeigt Empty-State ohne Apps', async () => {
    apiMock.get.mockResolvedValue({ apps: [] });
    renderStoreApps();
    await waitFor(() => expect(screen.getByText('Keine Apps gefunden')).toBeInTheDocument());
    expect(screen.queryByRole('list', { name: 'Verfügbare Extensions' })).not.toBeInTheDocument();
  });
});
