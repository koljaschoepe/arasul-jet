/**
 * Eine Rückmeldung absenden (J42, M7): `POST /api/rueckmeldungen`.
 *
 * Keine Abfrage daneben, mit Absicht: der Melder sieht nach dem Absenden nur
 * die Bestätigung und nie wieder seine Meldung (schleife.md, Regel 2). Die
 * Liste für Entwickler steht in der Verwaltung (`features/settings/rueckmeldungen/`).
 */
import { useMutation } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import type { AppStand } from '@/stores/workspaceStore';
import type { Markierung } from './bildschirmfoto';

export interface NeueRueckmeldung {
  app_id: string;
  stand: AppStand;
  seite: string;
  text: string;
  bild: string | null;
  markierung: Markierung | null;
}

export function useRueckmeldungSenden() {
  const api = useApi();
  return useMutation({
    mutationFn: (neu: NeueRueckmeldung) =>
      api.post<{ data: { id: number; erstellt_am: string } }>(
        '/rueckmeldungen',
        neu as unknown as Record<string, unknown>
      ),
  });
}
