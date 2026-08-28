/**
 * Die Freigabe-Matrix: welche App ist für welchen Menschen freigegeben
 * (Phase D3 des Umbaus vom 26.08.2026).
 *
 * Die Wege stehen seit C2: `GET/POST /api/freigaben` und
 * `DELETE /api/freigaben/:appId/:benutzerId`. Die Apps kommen aus
 * `GET /api/apps` — dem Verwaltungsweg, der ALLE Apps des Geräts nennt, und
 * nicht aus `GET /api/apps/meine`, das nur die eigenen zeigt. Ein Administrator
 * soll auch eine App freigeben können, die er selbst nicht sieht.
 *
 * Eine Freigabe trägt seit C3 ein Wort dazu, wie weit sie reicht: `live` ist
 * der Normalfall, `test` macht aus dem Nutzer einen Tester, der zusätzlich den
 * Teststand sieht.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import type { BenutzerId } from './useMitarbeiter';

/** Der Stand, auf den eine Freigabe reicht. */
export type Stand = 'live' | 'test';

/** Eine Freigabe, so wie `GET /api/freigaben` sie liefert. */
export interface Freigabe {
  app_id: string;
  user_id: BenutzerId;
  stand: Stand;
  app_name: string;
  username: string;
  freigegeben_am: string;
}

/** Eine App am Gerät, so wie `GET /api/apps` sie liefert (nur was hier zählt). */
/** Ein Stand in der Liste: die Version, und ob er ausgeliefert werden kann. */
export interface StandKurz {
  version: string;
  lieferbar?: boolean;
  mangel?: string | null;
}

export interface AppZeile {
  id: string;
  name: string;
  beschreibung: string | null;
  staende: { test: StandKurz | null; live: StandKurz | null };
}

/**
 * Der Schlüssel der Freigaben-Abfrage. Ausgeführt, weil ihn auch
 * `useMitarbeiter.ts` entwertet: eine gelöschte Person nimmt ihre Freigaben
 * mit, und eine Matrix mit einer Zeile für jemanden, den es nicht mehr gibt,
 * zeigt einen Zustand, den das Gerät nicht kennt. Ein zweites Mal `'freigaben'`
 * dort hinzuschreiben hieße, zwei Stellen zu haben, die denselben Namen kennen
 * müssen.
 */
export const FREIGABEN_KEY = ['freigaben'] as const;
const ALLE_APPS_KEY = ['apps', 'alle'] as const;

export function useFreigaben() {
  const api = useApi();
  return useQuery({
    queryKey: FREIGABEN_KEY,
    queryFn: async () => {
      const res = await api.get<{ data?: Freigabe[] }>('/freigaben');
      return res.data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useAlleApps() {
  const api = useApi();
  return useQuery({
    queryKey: ALLE_APPS_KEY,
    queryFn: async () => {
      const res = await api.get<{ data?: AppZeile[] }>('/apps');
      return res.data ?? [];
    },
    staleTime: 30_000,
  });
}

/**
 * Eine Zelle der Matrix setzen oder räumen.
 *
 * `stand: null` heißt „nicht freigegeben" und wird zum DELETE. Alles andere ist
 * ein POST, auch wenn die Freigabe schon steht: der Server überschreibt dann
 * nur den Stand und lässt Zeitstempel und Ersteller stehen (`gibFrei`,
 * `neu: false`). Zwei Mutationen daraus zu machen hieße, die Entscheidung
 * „welcher Weg" an die Oberfläche zu geben, die sie nicht besser trifft als
 * diese Zeile.
 *
 * Entwertet wird nach JEDEM Ausgang, auch nach einem Fehler — dieselbe Regel
 * wie bei den offenen Freigaben aus D2. Ein Fehlschlag an dieser Stelle heißt
 * in der Regel, dass jemand anderes den Menschen oder die App gerade entfernt
 * hat, und dann stimmt die Matrix im Browser nicht mehr.
 */
export function useFreigabeSetzen() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      appId,
      benutzerId,
      stand,
    }: {
      appId: string;
      benutzerId: BenutzerId;
      stand: Stand | null;
    }) => {
      if (stand === null) {
        return api.del(`/freigaben/${appId}/${benutzerId}`);
      }
      return api.post('/freigaben', { app_id: appId, benutzer_id: benutzerId, stand });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: FREIGABEN_KEY });
    },
  });
}

/**
 * Die Freigabe eines Paars aus der flachen Liste, oder `undefined`.
 *
 * Über `String(...)` verglichen und nicht mit `===`: `user_id` kommt als
 * `int8` und damit als Zeichenkette aus der Datenbank, `id` des Benutzers
 * ebenso. Reine Funktion, damit die Matrix sie nicht selbst formuliert.
 */
export function freigabeVon(
  freigaben: Freigabe[],
  appId: string,
  benutzerId: BenutzerId
): Freigabe | undefined {
  return freigaben.find(f => f.app_id === appId && String(f.user_id) === String(benutzerId));
}
