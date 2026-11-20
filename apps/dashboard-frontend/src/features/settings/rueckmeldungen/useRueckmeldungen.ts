/**
 * Die Rückmeldungen für Entwickler (J42, M7): `GET /api/rueckmeldungen`,
 * `DELETE /api/rueckmeldungen/:id`. Lesen darf nur, wer das Kennzeichen
 * Entwickler trägt; das Backend fragt es bei jedem Aufruf frisch ab.
 *
 * Das Bild kommt nicht über `useApi`, sondern als Adresse für ein `<img>`
 * (`bildAdresse`), mit demselben Sitzungscookie wie jedes Bild der Shell.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import { API_BASE } from '@/config/api';

export interface Rueckmeldung {
  id: number;
  app_id: string;
  app_name: string | null;
  stand: 'test' | 'live';
  seite: string;
  text: string;
  hat_bild: boolean;
  markierung: { x: number; y: number; breite: number; hoehe: number } | null;
  person: { id: number; anzeigeName: string } | null;
  stand_meldung: 'neu' | 'angenommen' | 'umgesetzt' | 'abgelehnt';
  erstellt_am: string;
}

const RUECKMELDUNGEN_KEY = ['rueckmeldungen'] as const;

export function useRueckmeldungen(aktiv: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: RUECKMELDUNGEN_KEY,
    queryFn: () =>
      api.get<{ data: Rueckmeldung[] }>('/rueckmeldungen', { showError: false }).then(r => r.data),
    enabled: aktiv,
  });
}

export function useRueckmeldungEntfernen() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/rueckmeldungen/${id}`),
    // Nach JEDEM Ausgang neu laden, auch nach Fehler: ein 404 heißt gerade,
    // dass die Liste veraltet ist.
    onSettled: () => client.invalidateQueries({ queryKey: RUECKMELDUNGEN_KEY }),
  });
}

export function bildAdresse(id: number): string {
  return `${API_BASE}/rueckmeldungen/${id}/bild`;
}
