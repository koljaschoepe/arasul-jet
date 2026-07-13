/**
 * Store — Deep-Link-Redirects (Plan 003 · Schritt 7).
 * Alte Unter-Tab-Links /store/models und /store/apps (auch mit ?highlight=…)
 * leiten auf die neue Liste+Detail-Struktur um: Highlight → Auswahl im
 * Extension-Store, Navigation zurück auf /store.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useExtensionStore } from '@/stores/extensionStore';
import Store from '../Store';

// Detailseite + Liste stubben — hier interessiert nur der Redirect
vi.mock('../StoreDetailPage', () => ({
  StoreDetailPage: () => <div data-testid="detail" />,
}));
vi.mock('@/components/extensions/ExtensionsSidebarList', () => ({
  ExtensionsSidebarList: () => <div data-testid="list" />,
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

describe('Store — Redirects', () => {
  beforeEach(() => {
    useExtensionStore.getState().clearSelection();
  });

  it('/store/models?highlight=llama3 → Auswahl Modell + Redirect auf /store', async () => {
    renderAt('/store/models?highlight=llama3');
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/store'));
    expect(useExtensionStore.getState().selected).toEqual({ kind: 'model', id: 'llama3' });
  });

  it('/store/apps?highlight=gitea → Auswahl App + Redirect auf /store', async () => {
    renderAt('/store/apps?highlight=gitea');
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/store'));
    expect(useExtensionStore.getState().selected).toEqual({ kind: 'app', id: 'gitea' });
  });

  it('unbekannter Unterpfad leitet auf /store um', async () => {
    renderAt('/store/irgendwas');
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/store'));
  });

  it('eigenständig (/store) zeigt Liste + Detail', async () => {
    renderAt('/store');
    expect(screen.getByTestId('list')).toBeInTheDocument();
    expect(screen.getByTestId('detail')).toBeInTheDocument();
  });
});
