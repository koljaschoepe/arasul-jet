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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  /** Aus `app.json` (Kontrakt 8): Lucide-Name oder 1 bis 3 Großbuchstaben. */
  symbol?: string | null;
  live: MeinAppStand | null;
  test: MeinAppStand | null;
}

/** Ein Eintrag der linken Spalte: eine App in genau einem Stand. */
export interface AppEintrag {
  id: string;
  name: string;
  beschreibung: string | null;
  symbol: string | null;
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
          symbol: app.symbol ?? null,
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

/**
 * Eine App in der Leiste: genau ein Eintrag je App, mit den Fassungen, die
 * dieser Mensch sehen darf (`live` zuerst). Welche davon ein Klick öffnet,
 * entscheidet die Shell (die zuletzt benutzte); umgeschaltet wird in der
 * Kapsel über der App.
 */
export interface LeistenApp {
  id: string;
  name: string;
  symbol: string | null;
  staende: AppStand[];
}

/** Die Apps für die Leiste: eine je App, ohne Stand nichts. */
export function zuLeiste(apps: MeineApp[]): LeistenApp[] {
  return apps.flatMap(app => {
    const staende = (['live', 'test'] as const).filter(stand => app[stand]);
    return staende.length
      ? [{ id: app.id, name: app.name, symbol: app.symbol ?? null, staende: [...staende] }]
      : [];
  });
}

/**
 * Der Schlüssel einer App in der gespeicherten Reihenfolge: `<kennung>:<stand>`
 * mit ihrer ersten Fassung. Die Form stammt aus der Zeit, als jede Fassung
 * einen eigenen Eintrag hatte; gespeicherte Listen bleiben so gültig.
 */
export function reihenfolgeSchluessel(a: Pick<LeistenApp, 'id' | 'staende'>): string {
  return `${a.id}:${a.staende[0] ?? 'live'}`;
}

/**
 * Die Apps in der Reihenfolge dieses Menschen. Eine App zählt an der
 * vordersten Stelle, an der eine ihrer Fassungen steht (eine alte Liste nennt
 * Live und Test getrennt). Was nicht darin steht (neu freigegeben), kommt
 * dahinter, in der Ordnung des Geräts; was darin steht und nicht mehr da ist,
 * wird übergangen.
 */
export function ordneLeiste(apps: LeistenApp[], reihenfolge: string[]): LeistenApp[] {
  const rang = new Map<string, number>();
  reihenfolge.forEach((k, i) => {
    const id = k.split(':')[0] ?? k;
    if (!rang.has(id)) rang.set(id, i);
  });
  const unbekannt = reihenfolge.length;
  return apps
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (rang.get(x.a.id) ?? unbekannt) - (rang.get(y.a.id) ?? unbekannt) || x.i - y.i)
    .map(x => x.a);
}

const REIHENFOLGE_KEY = ['apps', 'reihenfolge'] as const;

/**
 * Die gespeicherte Reihenfolge der Leiste (am Gerät, je Person) und das
 * Speichern. Das Speichern ändert die Anzeige sofort und stellt sie zurück,
 * wenn das Gerät ablehnt.
 */
export function useAppReihenfolge() {
  const api = useApi();
  const client = useQueryClient();
  const abfrage = useQuery({
    queryKey: REIHENFOLGE_KEY,
    queryFn: async () => {
      const res = await api.get<{ data?: string[] }>('/apps/reihenfolge');
      return res.data ?? [];
    },
    staleTime: 5 * 60_000,
  });
  const speichern = useMutation({
    mutationFn: async (liste: string[]) => {
      await api.put('/apps/reihenfolge', { reihenfolge: liste });
    },
    onMutate: async liste => {
      await client.cancelQueries({ queryKey: REIHENFOLGE_KEY });
      const vorher = client.getQueryData<string[]>(REIHENFOLGE_KEY);
      client.setQueryData(REIHENFOLGE_KEY, liste);
      return { vorher };
    },
    onError: (_f, _l, kontext) => client.setQueryData(REIHENFOLGE_KEY, kontext?.vorher ?? []),
  });
  return { reihenfolge: abfrage.data ?? [], speichere: speichern.mutate };
}

/**
 * Die Fassung, die ein Klick auf eine App in der Leiste oder auf ihre Kachel
 * der Startseite öffnet: die, in der man sie zuletzt offen hatte, sonst die
 * erste (Live, wo es Live gibt). Jede App steht genau einmal da; umgeschaltet
 * wird in der Kapsel.
 */
export function standFuerKlick(app: LeistenApp, zuletzt: AppStand | undefined): AppStand {
  return zuletzt && app.staende.includes(zuletzt) ? zuletzt : (app.staende[0] ?? 'live');
}
