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
  };
  /** Die letzte Kopie AUSSERHALB des Geräts. Leer, wenn es nie eine gab. */
  ausserhalb: {
    vorhanden: boolean;
    zeitpunkt: string | null;
    bytes: number | null;
    dateien: number | null;
    ziel: string | null;
    letzterVersuch: string | null;
  };
  wiederherstellungstest: {
    status: string;
    zeitpunkt: string | null;
    tabellen: number | null;
  };
  letzteWiederherstellung: { status: string; zeitpunkt: string | null; grund?: string } | null;
  /** `sicherung`, `wiederherstellung`, `wiederherstellungstest` — oder null. */
  laeuftGerade: string | null;
}

/** Eine Datei im Sicherungsordner (`GET /api/backup/sicherungen`). */
export interface Sicherungsdatei {
  art: 'postgres' | 'apps' | 'flows' | 'config';
  zweck: string;
  name: string;
  bytes: number;
  zeitpunkt: string;
}

export interface Sicherungsliste {
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

export const SICHERUNG_STATUS_KEY = ['backup', 'status'] as const;
export const SICHERUNG_LISTE_KEY = ['backup', 'sicherungen'] as const;

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
