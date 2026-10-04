/**
 * Was das Gerät über sich und das Haus sagt, bevor jemand angemeldet ist:
 * hat es schon einen Administrator, wie heißt das Unternehmen, und gibt es ein
 * Logo (`GET /api/auth/needs-setup`).
 *
 * EINE Abfrage für zwei Leser: `App.tsx` braucht `needsSetup` und den
 * Firmennamen für die Anmeldeseite, die Aktivitätsleiste das Logo. Beide lesen
 * denselben Schlüssel, die Anfrage geht einmal je Seitenladung — eine dritte
 * wäre auf der engen Stelle des Geräts zu viel (G2). Nach dem Speichern unter
 * Verwaltung, Gerät, Unternehmen wird der Schlüssel entwertet, und die Leiste
 * zeigt das neue Logo sofort.
 */
import { useQuery } from '@tanstack/react-query';
import { useApi } from './useApi';
import { API_BASE } from '../config/api';

export const GERAET_MARKE_KEY = ['auth', 'needs-setup'] as const;

export interface GeraetMarke {
  needsSetup: boolean;
  /** Der Name des Unternehmens, oder null: dann steht der Produktname da. */
  firmenname: string | null;
  /** Der Stand des Logos des Hauses, oder null: es gibt keines. */
  logo: string | null;
}

export function useGeraetMarke() {
  const api = useApi();
  return useQuery({
    queryKey: GERAET_MARKE_KEY,
    queryFn: async (): Promise<GeraetMarke> => {
      const d = await api.get<Partial<GeraetMarke>>('/auth/needs-setup', { showError: false });
      return {
        needsSetup: d.needsSetup === true,
        firmenname: d.firmenname ?? null,
        logo: d.logo ?? null,
      };
    },
    staleTime: Infinity,
    // Ein Gerät ohne diese Antwort hat einen Administrator (altes Backend);
    // ein zweiter Versuch hielte nur die Anmeldeseite auf.
    retry: false,
  });
}

/** Die Adresse des Logos; der Stand darin lässt den Browser es lange behalten. */
export function logoAdresse(stand: string): string {
  return `${API_BASE}/darstellung/logo?stand=${encodeURIComponent(stand)}`;
}
