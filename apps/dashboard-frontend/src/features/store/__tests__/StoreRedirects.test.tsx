/**
 * Store — Full-Width-Layout + Deep-Link-Redirects.
 * Zwei Reiter (Modelle/Erweiterungen) über dem Kartenraster; alte Unter-Tab-
 * Links /store/models und /store/apps (auch mit ?highlight=…) leiten auf /store
 * um und setzen dabei die Auswahl im Extension-Store (öffnet die Detailseite).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useExtensionStore } from '@/stores/extensionStore';
import Store from '../Store';

// Raster + Detail stubben — hier interessieren Redirect + Reiter-Umschaltung.
vi.mock('../StoreDetailPage', () => ({
  StoreDetailPage: () => <div data-testid="detail" />,
}));
vi.mock('../StoreModelsGrid', () => ({
  StoreModelsGrid: () => <div data-testid="models-grid" />,
}));
vi.mock('../StoreExtensionsGrid', () => ({
  StoreExtensionsGrid: () => <div data-testid="extensions-grid" />,
}));

function Probe() {
  const location = useLocation();
  return <div data-testid="loc">{location.pathname}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/store/*" element={<Store />} />
      </Routes>
      <Probe />
    </MemoryRouter>
  );
}

describe('Store — Full-Width + Redirects', () => {
  beforeEach(() => {
    // storeTab lebt jetzt global im extensionStore (Plan 012 Phase B) — pro Test
    // auf den Default-Reiter zurücksetzen, sonst leckt er zwischen Tests.
    useExtensionStore.setState({ selected: null, storeTab: 'models' });
  });

  it('/store/models?highlight=llama3 → Auswahl Modell + Redirect auf /store', async () => {
    renderAt('/store/models?highlight=llama3');
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/store'));
    expect(useExtensionStore.getState().selected).toEqual({ kind: 'model', id: 'llama3' });
  });

  it('/store/apps?highlight=n8n → Auswahl App + Redirect auf /store', async () => {
    renderAt('/store/apps?highlight=n8n');
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/store'));
    expect(useExtensionStore.getState().selected).toEqual({ kind: 'app', id: 'n8n' });
  });

  it('unbekannter Unterpfad leitet auf /store um', async () => {
    renderAt('/store/irgendwas');
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/store'));
  });

  it('/store: zwei Reiter — Modelle (default) zeigt das Raster', () => {
    renderAt('/store');
    expect(screen.getByTestId('store-tab-models')).toBeInTheDocument();
    expect(screen.getByTestId('store-tab-extensions')).toBeInTheDocument();
    // Default-Reiter „Modelle" zeigt das Modell-Raster, keine Detailseite.
    expect(screen.getByTestId('models-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('extensions-grid')).not.toBeInTheDocument();
    expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
  });

  it('/store: Reiter-Wechsel schaltet das Raster um', () => {
    renderAt('/store');
    fireEvent.click(screen.getByTestId('store-tab-extensions'));
    expect(screen.getByTestId('extensions-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('models-grid')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('store-tab-models'));
    expect(screen.getByTestId('models-grid')).toBeInTheDocument();
  });
});
