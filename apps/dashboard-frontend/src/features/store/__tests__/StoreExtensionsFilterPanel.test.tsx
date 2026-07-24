/**
 * StoreExtensionsFilterPanel — die Sidebar-Ansicht »Erweiterungen«.
 * Seit der Neuausrichtung eine reine Freitext-Suche (keine Facetten mehr);
 * geprüft wird das Schreiben/Leeren des `extQuery` im storeFilterStore.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useStoreFilterStore } from '@/stores/storeFilterStore';
import { StoreExtensionsFilterPanel } from '../StoreExtensionsFilterPanel';

describe('StoreExtensionsFilterPanel', () => {
  beforeEach(() => {
    useStoreFilterStore.setState({ extQuery: '' });
  });

  it('zeigt ein Suchfeld', () => {
    render(<StoreExtensionsFilterPanel />);
    expect(screen.getByLabelText('Erweiterungen durchsuchen')).toBeInTheDocument();
  });

  it('Tippen schreibt die Suche in den storeFilterStore', () => {
    render(<StoreExtensionsFilterPanel />);
    fireEvent.change(screen.getByLabelText('Erweiterungen durchsuchen'), {
      target: { value: 'Datenbank' },
    });
    expect(useStoreFilterStore.getState().extQuery).toBe('Datenbank');
  });

  it('der Leeren-Knopf setzt die Suche zurück', () => {
    useStoreFilterStore.setState({ extQuery: 'n8n' });
    render(<StoreExtensionsFilterPanel />);
    fireEvent.click(screen.getByLabelText('Suche leeren'));
    expect(useStoreFilterStore.getState().extQuery).toBe('');
  });
});
