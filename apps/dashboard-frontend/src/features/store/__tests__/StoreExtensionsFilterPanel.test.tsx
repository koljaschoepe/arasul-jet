/**
 * StoreExtensionsFilterPanel — Erweiterungs-Filter in der Sidebar (Plan 012
 * Phase C Schritt 9). Prüft Facetten aus den Apps + Schreiben in den
 * storeFilterStore.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStoreFilterStore } from '@/stores/storeFilterStore';
import { EMPTY_EXTENSION_FILTERS } from '../storeExtensionFilters';
import { StoreExtensionsFilterPanel } from '../StoreExtensionsFilterPanel';

vi.mock('@/hooks/useExtensions', () => ({
  useExtensions: () => ({ extensions: [], isLoading: false, setExtensionEnabled: vi.fn() }),
}));

vi.mock('@/hooks/useWorkspaceApps', () => ({
  useWorkspaceApps: () => ({
    apps: [
      { id: 'n8n', name: 'n8n', description: '', tab: 'automationen', enabled: true },
      { id: 'db', name: 'Datenbank', description: '', tab: 'database', enabled: false },
    ],
    setAppEnabled: vi.fn(),
    isLoading: false,
  }),
}));

describe('StoreExtensionsFilterPanel', () => {
  beforeEach(() => {
    useStoreFilterStore.setState({ extFilters: EMPTY_EXTENSION_FILTERS });
  });

  it('zeigt Bereichs- und Status-Facetten mit klaren Labels', () => {
    render(<StoreExtensionsFilterPanel />);
    expect(screen.getByText('Automation')).toBeInTheDocument();
    expect(screen.getByText('Datenbank')).toBeInTheDocument();
    expect(screen.getByText('Aktiv')).toBeInTheDocument();
    expect(screen.getByText('Verfügbar')).toBeInTheDocument();
  });

  it('eine Facette anhaken schreibt in den storeFilterStore', () => {
    render(<StoreExtensionsFilterPanel />);
    fireEvent.click(screen.getByText('Datenbank'));
    expect(useStoreFilterStore.getState().extFilters.areas).toEqual(['database']);
  });

  it('„Zurücksetzen" leert die Filter', () => {
    useStoreFilterStore.setState({
      extFilters: { ...EMPTY_EXTENSION_FILTERS, status: ['active'] },
    });
    render(<StoreExtensionsFilterPanel />);
    fireEvent.click(screen.getByText(/Filter zurücksetzen/));
    expect(useStoreFilterStore.getState().extFilters.status).toEqual([]);
  });
});
