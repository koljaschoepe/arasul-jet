/**
 * Sichern im Browser (Phase D5 des Umbaus vom 26.08.2026).
 *
 * Die Wege stehen seit C9 (`routes/admin/backup.js`); was fehlte, ist der
 * Mensch davor. Abfragen und Mutationen stehen hier zusammen, wie in
 * `mitarbeiter/useMitarbeiter.ts` (D3) und `apps/useAppVerwaltung.ts` (D4):
 * nach JEDEM Ausgang wird die Liste entwertet, auch nach einem Fehler — eine
 * abgebrochene Sicherung kann trotzdem Dateien hinterlassen haben.
 *
 * DIE ZEITGRENZE IST DER GANZE PUNKT DIESER DATEI. `useApi` bricht ohne
 * eigenes Signal nach 30 Sekunden ab; `POST /api/backup/sicherung` antwortet
 * erst, wenn `backup.sh` im Sicherungs-Container durch ist, und das sind am
 * Jetson Minuten (das Backend selbst wartet bis zu 30). Ohne das lange Signal
 * hier sähe jede erfolgreiche Sicherung im Browser wie ein Fehlschlag aus.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';

/** Was `GET /api/backup/status` sagt (C9). */
export interface SicherungStatus {
  /** Hat dieses Gerät wirklich gesichert — nicht „könnte es“. */
  sichertWirklich: boolean;
  letzteSicherung: {
    status: string;
    zeitpunkt: string | null;
    alterStunden: number | null;
    veraltet: boolean;
    verschluesselt?: boolean;
    groesse?: string | null;
    apps?: string | null;
    flows?: string | null;
    konfiguration?: string | null;
    /** Was sich im Firmenordner während der Sicherung bewegt hat (J35). */
    firmenordnerGeaendert?: { anzahl: number; dateien: string[] } | null;
  };
  /** Die letzte Kopie AUSSERHALB des Geräts. Leer, wenn es nie eine gab. */
  ausserhalb: {
    vorhanden: boolean;
    zeitpunkt: string | null;
    bytes: number | null;
    dateien: number | null;
    ziel: string | null;
    letzterVersuch: string | null;
    /** Der angesteckte Datenträger (J37). */
    datentraeger?: Datentraeger;
    /** Unverschlüsselte Dateien auf dem Datenträger; soll 0 sein, `null` = unbekannt. */
    klartextDateien?: number | null;
    inhalt?: { apps: string[] } | null;
  };
  /** Passt der Schlüssel dieses Geräts zur letzten Sicherung? (J37) */
  schluessel?: Schluesselstand;
  wiederherstellungstest: {
    status: string;
    zeitpunkt: string | null;
    tabellen: number | null;
  };
  letzteWiederherstellung: { status: string; zeitpunkt: string | null; grund?: string } | null;
  /** `sicherung`, `wiederherstellung`, `wiederherstellungstest` — oder null. */
  laeuftGerade: string | null;
}

/** Was das Gerät über den angesteckten Datenträger weiß (J37). */
export interface Datentraeger {
  angesteckt: boolean;
  name: string | null;
  dateisystem: string | null;
  /** Bytes; `null`, wenn kein Datenträger steckt oder der Platz unbekannt ist. */
  frei: number | null;
  gesamt: number | null;
}

interface Pruefteil {
  neueste: string | null;
  passt: boolean | null;
  lesbar: number;
  unlesbar: number;
}

/** Ergebnis der Schlüsselprüfung. `passt: null` heißt: nichts zu prüfen. */
export interface Schluesselstand {
  passt: boolean | null;
  geprueft: string | null;
  grund: string | null;
  aelterUnlesbar: number;
  lokal: Pruefteil | null;
  extern: Pruefteil | null;
}

/** `GET /api/backup/extern/inhalt` (J37). */
export interface ExternInhalt {
  angesteckt: boolean;
  name: string | null;
  neuesteSicherung: {
    /** `JJJJMMTT` */
    datum: string;
    zeitpunkt: string | null;
    bytes: number | null;
    apps: { id: string; staende: string[] }[];
    dateien: number;
  } | null;
  tage: string[];
}

export type Quelle = 'lokal' | 'extern';

/** Ein Satz des Berichts, den das Gerät nach dem Zurückholen einer App schreibt. */
export interface BerichtSatz {
  schritt: 'datenbank' | 'paket' | 'neu_gestartet';
  stand?: 'test' | 'live';
  erfolg: boolean;
  text: string;
}

export interface AppZurueckErgebnis {
  erfolg: boolean;
  app: string;
  quelle: Quelle;
  bericht: BerichtSatz[];
}

/** Antwort von `POST /api/backup/wiederherstellung` (das ganze Gerät). */
export interface GeraetZurueckErgebnis {
  erfolg: boolean;
  bericht?: {
    status?: string;
    tabellen?: number | null;
    apps?: string | null;
    flows?: string | null;
    grund?: string;
  } | null;
  apps: { app_id: string; stand: string; version: string; erfolg: boolean; grund: string | null }[];
  ausgabe?: string;
}

/** Eine Datei im Sicherungsordner (`GET /api/backup/sicherungen`). */
export interface Sicherungsdatei {
  art: 'postgres' | 'app-datenbanken' | 'apps' | 'flows' | 'config' | 'firmenordner';
  zweck: string;
  name: string;
  /** Bei `app-datenbanken`: welche Datenbank (`arasul_app_<kennung>_<stand>`). */
  datenbank?: string;
  bytes: number;
  zeitpunkt: string;
}

interface Sicherungsliste {
  dateien: Sicherungsdatei[];
  anzahl: number;
  bytes: number;
  ordner: string;
}

/** Was ein angestoßener Lauf zurückmeldet. */
export interface LaufErgebnis {
  erfolg: boolean;
  bericht?: { status?: string; timestamp?: string; total_size?: string | null } | null;
  ausgabe?: string;
}

const SICHERUNG_STATUS_KEY = ['backup', 'status'] as const;
const SICHERUNG_LISTE_KEY = ['backup', 'sicherungen'] as const;
const EXTERN_INHALT_KEY = ['backup', 'extern-inhalt'] as const;

/**
 * So lange darf ein Lauf im Sicherungs-Container brauchen: dieselben 30
 * Minuten, mit denen das Backend auf `backup.sh` wartet
 * (`services/betrieb/sicherungsdienst.js`). Eine kürzere Grenze hier hieße,
 * dass der Browser aufgibt, während das Gerät weiterarbeitet — und die
 * nächste Frage wäre, ob nun gesichert wurde oder nicht.
 */
const LAUF_ZEITGRENZE_MS = 30 * 60_000;

export function useSicherungStatus() {
  const api = useApi();
  return useQuery({
    queryKey: SICHERUNG_STATUS_KEY,
    queryFn: async () => {
      const res = await api.get<{ data: SicherungStatus }>('/backup/status', { showError: false });
      return res.data;
    },
    staleTime: 30_000,
  });
}

export function useSicherungen() {
  const api = useApi();
  return useQuery({
    queryKey: SICHERUNG_LISTE_KEY,
    queryFn: async () => {
      const res = await api.get<{
        data: Sicherungsdatei[];
        anzahl: number;
        bytes: number;
        ordner: string;
      }>('/backup/sicherungen', { showError: false });
      return {
        dateien: res.data ?? [],
        anzahl: res.anzahl ?? 0,
        bytes: res.bytes ?? 0,
        ordner: res.ordner ?? '',
      } satisfies Sicherungsliste;
    },
    staleTime: 30_000,
  });
}

/** Beide Abfragen entwerten — nach jedem Lauf, auch nach einem gescheiterten. */
function useEntwerten() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: SICHERUNG_STATUS_KEY });
    qc.invalidateQueries({ queryKey: SICHERUNG_LISTE_KEY });
    qc.invalidateQueries({ queryKey: EXTERN_INHALT_KEY });
  };
}

export function useJetztSichern() {
  const api = useApi();
  const entwerten = useEntwerten();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<{ data: LaufErgebnis }>('/backup/sicherung', null, {
        showError: false,
        signal: AbortSignal.timeout(LAUF_ZEITGRENZE_MS),
      });
      return res.data;
    },
    onSettled: entwerten,
  });
}

export function useWiederherstellungstest() {
  const api = useApi();
  const entwerten = useEntwerten();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<{ data: LaufErgebnis }>('/backup/test', null, {
        showError: false,
        signal: AbortSignal.timeout(LAUF_ZEITGRENZE_MS),
      });
      return res.data;
    },
    onSettled: entwerten,
  });
}

/** Was auf dem angesteckten Datenträger liegt (J37). */
export function useExternInhalt() {
  const api = useApi();
  return useQuery({
    queryKey: EXTERN_INHALT_KEY,
    queryFn: async () => {
      const res = await api.get<{ data: ExternInhalt }>('/backup/extern/inhalt', {
        showError: false,
      });
      return res.data;
    },
    staleTime: 30_000,
  });
}

/**
 * Bei einem Fehlschlag antwortet das Gerät mit 500 UND mit dem Ergebnis im
 * Rumpf (`data`). `useApi` wirft dann; das Ergebnis steckt in `fehler.data`.
 * Ohne diesen Griff sähe der Mensch „HTTP 500“ statt der Sätze, die sagen,
 * welcher Schritt scheiterte.
 */
function ergebnisAusFehler<T>(fehler: unknown, hatBericht: (d: unknown) => boolean): T | null {
  const rumpf = (fehler as { data?: { data?: unknown } })?.data?.data;
  return rumpf && hatBericht(rumpf) ? (rumpf as T) : null;
}

export interface AppZurueckholen {
  app: string;
  bestaetigung: string;
  quelle: Quelle;
  paket: boolean;
  wiederherstellungscode?: string;
}

/** Eine App zurückholen: Daten und, wenn verlangt, ihr Paket (J37). */
export function useAppZurueckholen() {
  const api = useApi();
  const entwerten = useEntwerten();
  return useMutation({
    mutationFn: async ({ app, wiederherstellungscode, ...rest }: AppZurueckholen) => {
      const body = {
        ...rest,
        ...(wiederherstellungscode?.trim()
          ? { wiederherstellungscode: wiederherstellungscode.trim() }
          : {}),
      };
      try {
        const res = await api.post<{ data: AppZurueckErgebnis }>(
          `/backup/wiederherstellung/app/${encodeURIComponent(app)}`,
          body,
          { showError: false, signal: AbortSignal.timeout(LAUF_ZEITGRENZE_MS) }
        );
        return res.data;
      } catch (fehler) {
        const ergebnis = ergebnisAusFehler<AppZurueckErgebnis>(fehler, d =>
          Array.isArray((d as AppZurueckErgebnis).bericht)
        );
        if (ergebnis) return ergebnis;
        throw fehler;
      }
    },
    onSettled: entwerten,
  });
}

/** Das ganze Gerät zurückholen (J37). Ersetzt ALLE Daten. */
export function useGeraetZurueckholen() {
  const api = useApi();
  const entwerten = useEntwerten();
  return useMutation({
    mutationFn: async ({
      quelle,
      wiederherstellungscode,
    }: {
      quelle: Quelle;
      wiederherstellungscode?: string;
    }) => {
      const body = {
        bestaetigung: 'wiederherstellen',
        quelle,
        ...(wiederherstellungscode?.trim()
          ? { wiederherstellungscode: wiederherstellungscode.trim() }
          : {}),
      };
      try {
        const res = await api.post<{ data: GeraetZurueckErgebnis }>(
          '/backup/wiederherstellung',
          body,
          { showError: false, signal: AbortSignal.timeout(60 * 60_000) }
        );
        return res.data;
      } catch (fehler) {
        const ergebnis = ergebnisAusFehler<GeraetZurueckErgebnis>(fehler, d =>
          Array.isArray((d as GeraetZurueckErgebnis).apps)
        );
        if (ergebnis) return ergebnis;
        throw fehler;
      }
    },
    onSettled: entwerten,
  });
}
