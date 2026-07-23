/**
 * StoreExtensionsGrid — Erweiterungen-Reiter (Plan 012 Phase C Schritt 9).
 * Prüft: Filter aus dem storeFilterStore grenzen das Raster ein, und der
 * „Eigene Erweiterung bauen"-Einstieg öffnet die Baukasten-Detailseite.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useExtensionStore } from '@/stores/extensionStore';
import { useStoreFilterStore } from '@/stores/storeFilterStore';
import { EMPTY_EXTENSION_FILTERS } from '../storeExtensionFilters';
import { StoreExtensionsGrid } from '../StoreExtensionsGrid';

const apps = [
  { id: 'n8n', name: 'n8n', description: 'Workflows', tab: 'automationen', enabled: true },
  { id: 'db', name: 'Datenbank', description: 'SQL', tab: 'database', enabled: false },
];
const setAppEnabled = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useWorkspaceApps', () => ({
  useWorkspaceApps: () => ({ apps, setAppEnabled, isLoading: false }),
}));

// Installierte Erweiterungs-Pakete (Plan 012 Phase E): hier bewusst leer —
// dieser Test prüft die kuratierten Kern-Apps und den Baukasten-Einstieg.
const setExtensionEnabled = vi.fn();
vi.mock('@/hooks/useExtensions', () => ({
  useExtensions: () => ({ extensions: [], isLoading: false, setExtensionEnabled }),
}));

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => toast }));

describe('StoreExtensionsGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useExtensionStore.getState().clearSelection();
    useStoreFilterStore.setState({ extFilters: EMPTY_EXTENSION_FILTERS });
  });

  it('zeigt ohne Filter alle Erweiterungen + den Baukasten-Einstieg', () => {
    render(<StoreExtensionsGrid />);
    expect(screen.getByTestId('ext-card-n8n')).toBeInTheDocument();
    expect(screen.getByTestId('ext-card-db')).toBeInTheDocument();
    expect(screen.getByTestId('ext-builder-entry')).toBeInTheDocument();
  });

  it('ein Bereichs-Filter grenzt das Raster ein und blendet den Einstieg aus', () => {
    useStoreFilterStore.setState({
      extFilters: { ...EMPTY_EXTENSION_FILTERS, areas: ['database'] },
    });
    render(<StoreExtensionsGrid />);
    expect(screen.getByTestId('ext-card-db')).toBeInTheDocument();
    expect(screen.queryByTestId('ext-card-n8n')).not.toBeInTheDocument();
    // Bei aktivem Filter geht es um Erweiterungen, nicht ums Bauen.
    expect(screen.queryByTestId('ext-builder-entry')).not.toBeInTheDocument();
  });

  it('der Einstieg öffnet die Baukasten-Detailseite (kind: builder)', () => {
    render(<StoreExtensionsGrid />);
    fireEvent.click(screen.getByTestId('ext-builder-entry'));
    expect(useExtensionStore.getState().selected).toEqual({ kind: 'builder', id: 'builder' });
  });
});
