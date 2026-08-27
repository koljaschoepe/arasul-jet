/**
 * Ein Ersatz für den AuthContext in Tests der Shell (Phase D1).
 *
 * Seit D1 fragt die Shell an vier Stellen nach der Rolle — Aktivitätsleiste,
 * Sidebar, Menüleiste, Tab-Inhalt. Ohne Provider wirft `useAuth`, und jeder
 * dieser Tests trüge sonst denselben fünfzeiligen Mock. Er steht deshalb
 * einmal hier.
 *
 * Benutzung im Test:
 *
 *   vi.mock('@/contexts/AuthContext', () => import('@/__tests__/helpers/authMock'));
 *   import { angemeldet } from '@/__tests__/helpers/authMock';
 *   angemeldet({ role: 'mitarbeiter' });
 *
 * Der Zustand ist absichtlich ein Modul-Objekt und kein React-State: `vi.mock`
 * wird gehoisted, eine Fabrik kann also nichts aus dem Testkörper einfangen.
 */
import type { ReactNode } from 'react';

interface Angemeldeter {
  id: number;
  username: string;
  role: 'admin' | 'mitarbeiter';
  passwortWechselNoetig?: boolean;
}

const VORGABE: Angemeldeter = { id: 1, username: 'admin', role: 'admin' };

let aktuell: Angemeldeter | null = { ...VORGABE };

/** Wer ist angemeldet? Ohne Angabe der voreingestellte Administrator. */
export function angemeldet(teil: Partial<Angemeldeter> = {}): void {
  aktuell = { ...VORGABE, ...teil };
}

/** Niemand ist angemeldet. */
export function abgemeldet(): void {
  aktuell = null;
}

export function useAuth() {
  return {
    user: aktuell,
    isAuthenticated: aktuell !== null,
    loading: false,
    login: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    checkAuth: vi.fn().mockResolvedValue(aktuell !== null),
    setLoadingComplete: vi.fn(),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
