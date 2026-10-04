/**
 * Sichern im Browser (Phase D5 des Umbaus vom 26.08.2026).
 *
 * Die Wege stehen seit C9 (`routes/admin/backup.js`); was fehlte, ist der
 * Mensch davor. Abfragen und Mutationen stehen hier zusammen, wie in
 * `personen/usePersonen.ts` (D3) und `apps/useAppVerwaltung.ts` (D4):
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
  /** Die Stände der Sicherung (M5); `null`, solange es keinen gibt. */
  staende?: Staende | null;
}

/** Was `backup.sh` über die Stände hinterlegt (M5). */
interface Staende {
  anzahl: number;
  /** Größe des Repos auf diesem Gerät, Bytes. */
  bytes: number | null;
  neuester: { id: string; zeitpunkt: string | null; geschrieben: number | null } | null;
  aeltester: string | null;
  aufbewahrung: { tage: number; wochen: number; monate: number } | null;
  /** Gesetzt, wenn das Ziel voll war und der älteste Stand dafür gefallen ist. */
  hinweis: string | null;
  entfallenWegenPlatz: string[];
}

/** Was das Gerät über den angesteckten Datenträger weiß (J37). */
interface Datentraeger {
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
interface Schluesselstand {
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

/**
 * Ein Stand zum Zurückholen (`GET /api/backup/staende`, Auftrag
 * sicherung-zurueckholen, M5). Gezeigt wird er nach seinem Zeitpunkt in
 * Worten (`standInWorten`); die Kennung nur unter „Technische Angaben“.
 */
export interface Stand {
  id: string;
  zeitpunkt: string;
  /** Entstand vor einem Zurückholen: der Weg, es rückgängig zu machen. */
  vorher: boolean;
  fuer: { art: 'app' | 'bereich' | 'geraet' | 'live' | 'update'; id: string | null } | null;
  /** Bytes, die dieser Stand neu geschrieben hat; `null` = nicht gemessen. */
  geschrieben: number | null;
  inhaltBekannt: boolean;
  apps: { id: string; name: string | null }[];
  appDatenbanken: string[];
  bereiche: { kennung: string; name: string | null; vorhanden: boolean }[];
}

/** Ein Satz des Berichts, den das Gerät nach dem Zurückholen einer App schreibt. */
interface BerichtSatz {
  schritt: 'vorher' | 'datenbank' | 'paket' | 'neu_gestartet' | 'bereich';
  stand?: 'test' | 'live';
  erfolg: boolean;
  text: string;
}

/** Der Stand davor (M5), wie ihn jedes Zurückholen zurückmeldet. */
export interface VorherStand {
  erfolg: boolean;
  id: string | null;
  zeitpunkt: string | null;
}

export interface AppZurueckErgebnis {
  erfolg: boolean;
  app: string;
  quelle: Quelle;
  stand?: { id: string; zeitpunkt: string } | null;
  vorher?: VorherStand | null;
  bericht: BerichtSatz[];
}

/** Antwort von `POST /api/backup/wiederherstellung/bereich/:kennung` (M5). */
export interface BereichZurueckErgebnis {
  erfolg: boolean;
  bereich: { kennung: string; name: string };
  stand: { id: string; zeitpunkt: string } | null;
  vorher?: VorherStand | null;
  zahlen: { geschrieben: number; entfernt: number; ordnerNeu: number } | null;
  bericht: BerichtSatz[];
  ausgabe?: string;
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
  vorher?: VorherStand | null;
  ausgabe?: string;
}

/** Eine Datei im Sicherungsordner (`GET /api/backup/sicherungen`). */
export interface Sicherungsdatei {
  art: 'postgres' | 'app-datenbanken' | 'apps' | 'flows' | 'config' | 'firmenordner' | 'stand';
  /** Bei `stand`: die Kennung, mit der er sich zurückholen lässt. */
  id?: string;
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
const STAENDE_KEY = ['backup', 'staende'] as const;

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
    qc.invalidateQueries({ queryKey: STAENDE_KEY });
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

/** Die Stände einer Quelle, neueste zuerst (M5). */
export function useStaende(quelle: Quelle) {
  const api = useApi();
  return useQuery({
    queryKey: [...STAENDE_KEY, quelle],
    queryFn: async () => {
      const res = await api.get<{ data: Stand[] }>(`/backup/staende?quelle=${quelle}`, {
        showError: false,
      });
      return res.data ?? [];
    },
    staleTime: 30_000,
  });
}

/** Was jedes Zurückholen mitschickt: das Passwort, den Stand, die Quelle. */
interface ZurueckBasis {
  passwort: string;
  standId: string;
  quelle: Quelle;
  wiederherstellungscode?: string;
}

function basisRumpf({ passwort, standId, quelle, wiederherstellungscode }: ZurueckBasis) {
  return {
    passwort,
    stand_id: standId,
    quelle,
    ...(wiederherstellungscode?.trim()
      ? { wiederherstellungscode: wiederherstellungscode.trim() }
      : {}),
  };
}

export interface AppZurueckholen extends ZurueckBasis {
  app: string;
}

/** Eine App zurückholen: ihre Daten und ihr Paket, aus dem gewählten Stand (M5). */
export function useAppZurueckholen() {
  const api = useApi();
  const entwerten = useEntwerten();
  return useMutation({
    mutationFn: async ({ app, ...basis }: AppZurueckholen) => {
      const body = { ...basisRumpf(basis), paket: true };
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

export interface BereichZurueckholen extends ZurueckBasis {
  kennung: string;
}

/** Einen Bereich des Firmenordners zurückholen (M5). */
export function useBereichZurueckholen() {
  const api = useApi();
  const entwerten = useEntwerten();
  return useMutation({
    mutationFn: async ({ kennung, ...basis }: BereichZurueckholen) => {
      try {
        const res = await api.post<{ data: BereichZurueckErgebnis }>(
          `/backup/wiederherstellung/bereich/${encodeURIComponent(kennung)}`,
          basisRumpf(basis),
          { showError: false, signal: AbortSignal.timeout(LAUF_ZEITGRENZE_MS * 2) }
        );
        return res.data;
      } catch (fehler) {
        const ergebnis = ergebnisAusFehler<BereichZurueckErgebnis>(fehler, d =>
          Array.isArray((d as BereichZurueckErgebnis).bericht)
        );
        if (ergebnis) return ergebnis;
        throw fehler;
      }
    },
    onSettled: entwerten,
  });
}

/** Das ganze Gerät zurückholen (J37, M5). Ersetzt ALLE Daten. */
export function useGeraetZurueckholen() {
  const api = useApi();
  const entwerten = useEntwerten();
  return useMutation({
    mutationFn: async (basis: ZurueckBasis) => {
      const { stand_id: stand, ...rest } = basisRumpf(basis);
      const body = { bestaetigung: 'wiederherstellen', stand, ...rest };
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
