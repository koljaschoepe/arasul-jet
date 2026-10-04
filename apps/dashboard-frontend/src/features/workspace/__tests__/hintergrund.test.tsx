/**
 * Die letzten drei Apps bleiben im Hintergrund am Leben (M5, Karte
 * apps-im-hintergrund): ein Rahmen wird beim Wechsel weder neu gebaut noch
 * entfernt, die vierte fällt heraus.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AnsichtInhalt } from '../AnsichtInhalt';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { angemeldet } from '@/__tests__/helpers/authMock';

vi.mock('@/contexts/AuthContext', () => import('@/__tests__/helpers/authMock'));

const eingehaengt = vi.fn();
vi.mock('@/features/apps/AppRahmen', async () => {
  const React = await import('react');
  return {
    AppRahmen: ({ appId }: { appId: string }) => {
      React.useEffect(() => {
        eingehaengt(appId);
      }, [appId]);
      return <iframe title={appId} data-testid={`rahmen-${appId}`} />;
    },
  };
});
vi.mock('@/features/apps/Uebersicht', () => ({ Uebersicht: () => <p>Startseite</p> }));
vi.mock('@/features/freigaben/OffeneFreigaben', () => ({ OffeneFreigaben: () => null }));
vi.mock('@/hooks/useOffeneFreigaben', () => ({ useOffeneFreigaben: () => ({ data: [] }) }));

const oeffne = (appId: string) =>
  act(() => useWorkspaceStore.getState().oeffne({ type: 'app', appId, stand: 'live' }));
const sichtbar = (appId: string) =>
  screen.getByTestId(`app-stapel-${appId}-live`).getAttribute('data-sichtbar');

describe('Apps im Hintergrund', () => {
  beforeEach(() => {
    eingehaengt.mockClear();
    useWorkspaceStore.setState({ ansicht: { type: 'dashboard' } });
    angemeldet({ role: 'admin' });
  });

  it('behält drei Apps, ohne sie neu zu bauen; die vierte fällt heraus', () => {
    render(<AnsichtInhalt />);
    for (const id of ['a', 'b', 'c', 'd']) oeffne(id);
    expect(sichtbar('d')).toBe('true');
    expect(sichtbar('c')).toBe('false');
    expect(sichtbar('b')).toBe('false');
    expect(sichtbar('a')).toBe('false');

    // Zurück zu a: alle vier bisher gebaut, keiner neu.
    oeffne('a');
    expect(sichtbar('a')).toBe('true');
    expect(eingehaengt).toHaveBeenCalledTimes(4);

    // Auf der Startseite zählen nur drei im Hintergrund: a, d, c — b ist weg.
    act(() => useWorkspaceStore.getState().oeffne({ type: 'dashboard' }));
    expect(screen.queryByTestId('app-stapel-b-live')).toBeNull();
    expect(screen.getByTestId('app-stapel-a-live')).toBeInTheDocument();
    expect(screen.getByTestId('app-stapel-c-live')).toBeInTheDocument();
    expect(screen.getByTestId('app-stapel-d-live')).toBeInTheDocument();
    expect(sichtbar('a')).toBe('false');

    // b fängt von vorn an.
    oeffne('b');
    expect(eingehaengt).toHaveBeenCalledTimes(5);
  });
});
