/**
 * Die Apps, die dem Angemeldeten freigegeben sind (Phase D1).
 *
 * Eine Quelle für alle drei Stellen, an denen sie vorkommen: die linke Spalte
 * (AppsPanel), die Übersicht in der Mitte (Uebersicht) und der App-Tab, der
 * prüft, ob er noch etwas anzeigen darf (AppRahmen). React Query dedupliziert
 * über den gemeinsamen Schlüssel — kein zweiter Abruf, wenn drei Bausteine
 * dieselbe Liste brauchen.
 *
 * DIE ROLLE STEHT HIER NICHT DRIN, und das ist der Kern der Sache: `/api/apps/meine`
 * antwortet für Administrator und Mitarbeiter gleich und siebt über
 * `app_members` (Phase C2). Ein Administrator sieht hier also NICHT alle Apps
 * des Geräts, sondern die, die auch ihm freigegeben sind. Wer alle sehen will,
 * fragt `/api/apps` — ein Verwaltungsweg, der 403 antwortet, wenn ein
 * Mitarbeiter ihn probiert.
 */
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import type { AppStand } from '@/stores/workspaceStore';

/** Ein Stand einer App, so wie ihn `GET /api/apps/meine` liefert. */
interface MeinAppStand {
  version: string;
  /** Der Weg im Browser, z. B. `/apps/urlaub/` — vom Backend gesetzt. */
  pfad: string;
}

export interface MeineApp {
  id: string;
  name: string;
  beschreibung: string | null;
  live: MeinAppStand | null;
  test: MeinAppStand | null;
}

/** Ein Eintrag der linken Spalte: eine App in genau einem Stand. */
export interface AppEintrag {
  id: string;
  name: string;
  beschreibung: string | null;
  stand: AppStand;
  version: string;
  pfad: string;
}

const MEINE_APPS_KEY = ['apps', 'meine'] as const;

/**
 * Die Liste flach machen: eine App mit Live- **und** Teststand ergibt zwei
 * Einträge, keinen mit einem Umschalter.
 *
 * Ein Umschalter wäre die kleinere Liste und die größere Falle: der Stand
 * entscheidet, welche Fassung der App jemand gerade bedient, und ein Zustand,
 * den man nur sieht, wenn man hinschaut, ist bei einer Fassung, die noch nicht
 * live ist, genau der falsche. Zwei Zeilen sagen es, ohne dass jemand klicken
 * muss.
 *
 * Der Livestand steht zuerst: er ist die Fassung, die gilt.
 */
export function zuEintraegen(apps: MeineApp[]): AppEintrag[] {
  return apps.flatMap(app =>
    (['live', 'test'] as const).flatMap(stand => {
      const s = app[stand];
      if (!s) return [];
      return [
        {
          id: app.id,
          name: app.name,
          beschreibung: app.beschreibung,
          stand,
          version: s.version,
          pfad: s.pfad,
        },
      ];
    })
  );
}

/**
 * Die Liste der eigenen Apps.
 *
 * `staleTime` von einer halben Minute: eine Freigabe wird von einem Menschen
 * erteilt, nicht von einer Maschine im Sekundentakt. Häufiger zu fragen hieße,
 * das Gerät für einen Fall zu belasten, den es ein paarmal im Jahr gibt.
 */
export function useMeineApps() {
  const api = useApi();
  return useQuery({
    queryKey: MEINE_APPS_KEY,
    queryFn: async () => {
      const res = await api.get<{ data?: MeineApp[] }>('/apps/meine');
      return res.data ?? [];
    },
    staleTime: 30_000,
  });
}
