/**
 * Mein Firmenordner: wo er liegt und welche Ordner ich habe (Auftrag
 * firmenordner-rechte-im-frontend, 22.09.2026, J33).
 *
 * `GET /api/firmenordner` — dieselbe Antwort, die das CLI der Wurzel am
 * Rechner eines Menschen liest. Sie nennt keinen fremden Ordner, auch seinen
 * Namen nicht, und keinen Ordner am Gerät; die Wurzel steht zuerst.
 *
 * `503` heißt „auf diesem Gerät läuft kein Firmenordner" und ist eine
 * Auskunft, kein Fehler: der Dialog sagt es so.
 */
import { useQuery } from '@tanstack/react-query';
import { useApi, type ApiError } from '@/hooks/useApi';

export interface MeinOrdner {
  kennung: string;
  name: string;
  ebene: 0 | 1 | 2;
  art: 'wurzel' | 'geteilt';
  eltern: string | null;
  pfad: string;
  recht: 'lesen' | 'schreiben';
}

export interface MeinFirmenordner {
  adresse: string | null;
  erreichbar: boolean;
  benutzer: string;
  ordner: MeinOrdner[];
}

export function useMeinFirmenordner(aktiv: boolean) {
  const api = useApi();
  return useQuery<MeinFirmenordner | null, ApiError>({
    queryKey: ['firmenordner', 'meiner'],
    enabled: aktiv,
    staleTime: 30_000,
    // Ein 503 ist eine Antwort („hier gibt es keinen"), kein Wackler: nicht
    // wiederholen, und der Dialog liest den Status selbst.
    retry: false,
    queryFn: async () => {
      const res = await api.get<{ data?: MeinFirmenordner }>('/firmenordner', {
        showError: false,
      });
      return res.data ?? null;
    },
  });
}

/** Heißt dieser Fehler „auf diesem Gerät läuft kein Firmenordner"? */
export function keinFirmenordner(error: ApiError | null): boolean {
  return error?.status === 503;
}
