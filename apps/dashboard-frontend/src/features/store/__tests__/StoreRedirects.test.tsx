/**
 * Store — Full-Width-Layout + Deep-Link-Redirects.
 * Der alte Unter-Tab-Link /store/models (auch mit ?highlight=…) leitet auf
 * /store um und setzt dabei die Auswahl im Extension-Store (öffnet die
 * Detailseite). /store/apps gibt es seit Phase B3 nicht mehr; der Pfad landet
 * wie jeder unbekannte auf /store.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useExtensionStore } from '@/stores/extensionStore';
import Store from '../Store';

// Raster + Detail stubben — hier interessiert der Redirect.
vi.mock('../StoreDetailPage', () => ({
  StoreDetailPage: () => <div data-testid="detail" />,
}));
vi.mock('../StoreModelsGrid', () => ({
  StoreModelsGrid: () => <div data-testid="models-grid" />,
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

describe('Store, Full-Width + Redirects', () => {
  beforeEach(() => {
    useExtensionStore.setState({ selected: null });
  });

  it('/store/models?highlight=llama3 → Auswahl Modell + Redirect auf /store', async () => {
    renderAt('/store/models?highlight=llama3');
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/store'));
    expect(useExtensionStore.getState().selected).toEqual({ kind: 'model', id: 'llama3' });
  });

  it('/store/apps?highlight=irgendeine-app (gefallener Reiter) leitet ohne Auswahl auf /store um', async () => {
    renderAt('/store/apps?highlight=irgendeine-app');
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/store'));
    expect(useExtensionStore.getState().selected).toBeNull();
  });

  it('unbekannter Unterpfad leitet auf /store um', async () => {
    renderAt('/store/irgendwas');
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/store'));
  });

  it('ohne Auswahl steht das Modell-Raster, nicht die Detailseite', () => {
    renderAt('/store');
    expect(screen.getByTestId('models-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
  });

  it('mit Auswahl steht die Detailseite', () => {
    useExtensionStore.setState({ selected: { kind: 'model', id: 'llama3' } });
    renderAt('/store');
    expect(screen.getByTestId('detail')).toBeInTheDocument();
    expect(screen.queryByTestId('models-grid')).not.toBeInTheDocument();
  });
});
