/**
 * ExtensionAppTab — die zweite Hälfte des Schalters (19.08.2026).
 *
 * Das Backend liefert eine deaktivierte Erweiterung seit dem Fix nicht mehr aus
 * (403). Der Tab darf in dem Fall keinen iframe bauen, sondern muss sagen, wo
 * man sie wieder einschaltet. Und solange die Liste noch lädt, darf ebenfalls
 * kein iframe entstehen — sonst blitzt die rohe Fehlerantwort auf.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExtensionAppTab from '../ExtensionAppTab';

const useExtensionsMock = vi.fn();
vi.mock('@/hooks/useExtensions', () => ({
  useExtensions: () => useExtensionsMock(),
}));
vi.mock('@/hooks/useApi', () => ({ useApi: () => ({ post: vi.fn() }) }));

const APP = {
  id: 'beispiel-app',
  name: 'Beispiel-App',
  description: '',
  type: 'app',
  accessTier: 'internet',
  version: '0.1.0',
  source: 'built',
  enabled: true,
  installedAt: '2026-08-01T00:00:00.000Z',
  manifest: {},
};

beforeEach(() => {
  useExtensionsMock.mockReset();
});

describe('ExtensionAppTab', () => {
  it('baut den iframe für eine aktive Erweiterung', () => {
    useExtensionsMock.mockReturnValue({ extensions: [APP], isLoading: false });
    render(<ExtensionAppTab extensionId="beispiel-app" title="Beispiel-App" />);
    expect(screen.getByTestId('extension-frame')).toBeInTheDocument();
  });

  it('zeigt bei einer deaktivierten Erweiterung den Weg zurück statt des iframes', () => {
    useExtensionsMock.mockReturnValue({
      extensions: [{ ...APP, enabled: false }],
      isLoading: false,
    });
    render(<ExtensionAppTab extensionId="beispiel-app" title="Beispiel-App" />);
    expect(screen.queryByTestId('extension-frame')).not.toBeInTheDocument();
    expect(screen.getByText(/ist deaktiviert/i)).toBeInTheDocument();
    expect(screen.getByText(/wieder einschalten/i)).toBeInTheDocument();
  });

  it('baut noch keinen iframe, solange die Liste lädt', () => {
    useExtensionsMock.mockReturnValue({ extensions: [], isLoading: true });
    render(<ExtensionAppTab extensionId="beispiel-app" title="Beispiel-App" />);
    expect(screen.queryByTestId('extension-frame')).not.toBeInTheDocument();
  });
});
