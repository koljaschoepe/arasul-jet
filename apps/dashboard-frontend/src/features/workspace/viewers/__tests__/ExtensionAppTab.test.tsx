/**
 * ExtensionAppTab — die zweite Hälfte des Schalters (19.08.2026) und der
 * Lese-Token im Pfad (23.08.2026).
 *
 * Das Backend liefert eine deaktivierte Erweiterung seit dem Fix nicht mehr aus
 * (403). Der Tab darf in dem Fall keinen iframe bauen, sondern muss sagen, wo
 * man sie wieder einschaltet. Und solange die Liste noch lädt, darf ebenfalls
 * kein iframe entstehen — sonst blitzt die rohe Fehlerantwort auf.
 *
 * Der Token gehört in den PFAD, nicht in einen Kopf: der Rahmen hat einen
 * opaken Origin, seine Unterdateien laufen damit cross-site, und
 * `arasul_session` ist `SameSite=Strict`. Nur so erben relative Verweise im
 * App-HTML die Berechtigung. Deshalb prüft der erste Test die Adresse und
 * nicht bloß, dass ein iframe da ist.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExtensionAppTab from '../ExtensionAppTab';

const useExtensionsMock = vi.fn();
vi.mock('@/hooks/useExtensions', () => ({
  useExtensions: () => useExtensionsMock(),
}));

const postMock = vi.fn();
// Stabile Identität wie beim echten `useApi` (dort ein `useMemo`) — ein neues
// Objekt je Render würde den Token-Abruf in eine Schleife schicken.
const apiMock = { post: postMock };
vi.mock('@/hooks/useApi', () => ({ useApi: () => apiMock }));

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
  postMock.mockReset();
  postMock.mockResolvedValue({ token: 'geheim123', expiresInMs: 900000 });
});

describe('ExtensionAppTab', () => {
  it('baut den iframe mit dem Lese-Token im Pfad', async () => {
    useExtensionsMock.mockReturnValue({ extensions: [APP], isLoading: false });
    render(<ExtensionAppTab extensionId="beispiel-app" title="Beispiel-App" />);
    const frame = await screen.findByTestId('extension-frame');
    expect(frame.getAttribute('src')).toContain('/extensions/beispiel-app/app/t/geheim123/');
    expect(postMock).toHaveBeenCalledWith(
      '/extensions/beispiel-app/app-token',
      {},
      expect.anything()
    );
  });

  it('holt den Token nur einmal', async () => {
    useExtensionsMock.mockReturnValue({ extensions: [APP], isLoading: false });
    render(<ExtensionAppTab extensionId="beispiel-app" title="Beispiel-App" />);
    await screen.findByTestId('extension-frame');
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it('sagt es, wenn kein Token kommt, statt einen leeren Rahmen zu zeigen', async () => {
    useExtensionsMock.mockReturnValue({ extensions: [APP], isLoading: false });
    postMock.mockRejectedValue(new Error('kaputt'));
    render(<ExtensionAppTab extensionId="beispiel-app" title="Beispiel-App" />);
    await waitFor(() => expect(screen.getByText(/nicht geladen/i)).toBeInTheDocument());
    expect(screen.queryByTestId('extension-frame')).not.toBeInTheDocument();
  });

  it('zeigt bei einer deaktivierten Erweiterung den Weg zurück statt des iframes', async () => {
    useExtensionsMock.mockReturnValue({
      extensions: [{ ...APP, enabled: false }],
      isLoading: false,
    });
    render(<ExtensionAppTab extensionId="beispiel-app" title="Beispiel-App" />);
    expect(screen.queryByTestId('extension-frame')).not.toBeInTheDocument();
    expect(screen.getByText(/ist deaktiviert/i)).toBeInTheDocument();
    expect(screen.getByText(/wieder einschalten/i)).toBeInTheDocument();
  });

  it('baut noch keinen iframe, solange die Liste lädt', async () => {
    useExtensionsMock.mockReturnValue({ extensions: [], isLoading: true });
    render(<ExtensionAppTab extensionId="beispiel-app" title="Beispiel-App" />);
    // Der Token-Abruf laeuft trotzdem los; ohne dieses Warten liefe er in eine
    // act()-Warnung nach Testende statt in die Zusicherung.
    await waitFor(() => expect(postMock).toHaveBeenCalled());
    expect(screen.queryByTestId('extension-frame')).not.toBeInTheDocument();
  });
});
