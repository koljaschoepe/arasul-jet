/**
 * Abfragen und Mutationen des Bereichs Daten (M5): die Auskunft über eine
 * Person (`GET /api/gdpr/categories?benutzer=`), die angesteckten Datenträger
 * als Ziel des Exports (`GET /api/gdpr/ziele`) und der Export selbst
 * (`GET /api/gdpr/export?benutzer=`, in den Browser oder auf einen Datenträger).
 * Löschen und Werksreset haben ihre eigenen Wege (`useBenutzerLoeschen`,
 * `Werksreset.tsx`).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import type { BenutzerId } from '../personen/usePersonen';

/** Eine Kategorie der Auskunft, wie `GET /api/gdpr/categories` sie nennt. */
export interface Kategorie {
  name: string;
  description: string;
  count?: number;
}

/** Ein angesteckter Datenträger. */
interface Datentraeger {
  name: string;
  freiBytes: number | null;
  beschreibbar: boolean;
}

interface ZieleAntwort {
  medien: Datentraeger[];
  hinweis: string | null;
}

const ZIELE_KEY = ['gdpr', 'ziele'] as const;

/** Was über diese Person gespeichert ist, nach Kategorie gezählt. */
export function useAuskunft(benutzerId: BenutzerId | null) {
  const api = useApi();
  return useQuery({
    queryKey: ['gdpr', 'categories', String(benutzerId)],
    enabled: benutzerId !== null,
    queryFn: async () => {
      const res = await api.get<{ categories?: Kategorie[] }>(
        `/gdpr/categories?benutzer=${encodeURIComponent(String(benutzerId))}`,
        { showError: false }
      );
      return res.categories ?? [];
    },
  });
}

/**
 * Die angesteckten Datenträger, alle zehn Sekunden: die Abnahme verlangt, dass
 * eine angesteckte Platte „innerhalb von zehn Sekunden" erscheint. `hinweis`
 * unterscheidet „keine Platte angesteckt" von „der Ordner ist nicht eingebunden".
 */
export function useDatentraeger() {
  const api = useApi();
  return useQuery({
    queryKey: ZIELE_KEY,
    refetchInterval: 10_000,
    queryFn: async (): Promise<ZieleAntwort> => {
      try {
        const res = await api.get<{ data: ZieleAntwort }>('/gdpr/ziele', { showError: false });
        return { medien: res.data.medien ?? [], hinweis: res.data.hinweis ?? null };
      } catch {
        return { medien: [], hinweis: 'Die Datenträger lassen sich gerade nicht abfragen.' };
      }
    },
  });
}

/** Die Auskunft als Datei im Browser. */
export function useAuskunftHerunterladen() {
  const api = useApi();
  return useMutation({
    mutationFn: async ({ id, name }: { id: BenutzerId; name: string }) => {
      const res = await api.get<Response>(
        `/gdpr/export?benutzer=${encodeURIComponent(String(id))}`,
        { raw: true, showError: false }
      );
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `arasul-auskunft-${name}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    },
  });
}

/** Die Auskunft auf einen angesteckten Datenträger. */
export function useAuskunftAufDatentraeger() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ziel }: { id: BenutzerId; ziel: string }) =>
      api.get<{ datei: string; bytes: number }>(
        `/gdpr/export?benutzer=${encodeURIComponent(String(id))}&ziel=${encodeURIComponent(ziel)}`,
        { showError: false }
      ),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ZIELE_KEY });
    },
  });
}
