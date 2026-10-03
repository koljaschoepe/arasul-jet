/**
 * Die Menschen am Gerät, für den Administrator (Phase D3 des Umbaus vom
 * 26.08.2026).
 *
 * Die Wege stehen seit C1 und C2 und sind hier nicht neu: `GET/POST
 * /api/benutzer`, `PUT /api/benutzer/:id/passwort`, `PUT /api/benutzer/:id/aktiv`
 * und `DELETE /api/benutzer/:id`. Was fehlte, war die Oberfläche davor: bis D3
 * legte ein Administrator einen Mitarbeiter mit `curl` an.
 *
 * Abfrage und Mutationen stehen zusammen, wie bei den offenen Freigaben aus D2
 * und aus demselben Grund: sie gehören zu derselben Adresse, und nach jedem
 * Ausgang ist die Liste veraltet. Wer beides trennt, hat die Regel „danach neu
 * laden" an einer Stelle und die Liste an einer anderen.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import { API_BASE } from '@/config/api';
// Nur der Schlüssel, nicht der Haken: die Gegenrichtung (`BenutzerId`) ist ein
// reiner Typ und beim Übersetzen weg, der Modulgraph bleibt also gerichtet.
import { FREIGABEN_KEY } from './useAppFreigaben';

/**
 * Die Kennung eines Benutzers, so wie sie ankommt: als ZEICHENKETTE.
 *
 * `admin_users.id` ist `BIGSERIAL`, also `int8`, und `node-postgres` gibt
 * `int8` als String zurück, weil eine 64-Bit-Zahl nicht in eine JS-Zahl passt.
 * Im Backend hat genau das zwei Schutzwälle still ausgehebelt (nachzulesen in
 * `routes/admin/benutzer.js`, `istEigenesKonto`). Hier steht deshalb beides im
 * Typ, und verglichen wird über `String(...)` — nie mit `===` auf den Rohwert.
 */
export type BenutzerId = number | string;

/** Ein Benutzer, so wie `GET /api/benutzer` ihn liefert. */
export interface Benutzer {
  id: BenutzerId;
  username: string;
  email: string | null;
  role: 'admin' | 'mitarbeiter';
  is_active: boolean;
  /** Trägt er noch das Startpasswort, das ein Administrator gesetzt hat? */
  passwort_vom_admin: boolean;
  created_at: string;
  last_login: string | null;
  vorname: string | null;
  nachname: string | null;
  funktion: string | null;
  kuerzel: string | null;
  hat_bild: boolean;
}

/** „Vorname Nachname", sonst der Benutzername (Konten aus der Zeit vor den Profilfeldern). */
export function anzeigeName(b: Pick<Benutzer, 'vorname' | 'nachname' | 'username'>): string {
  const name = [b.vorname, b.nachname]
    .filter(t => t && t.trim())
    .join(' ')
    .trim();
  return name || b.username;
}

/** Die Adresse des Bildes; `v` entwertet den Zwischenspeicher des Browsers nach einem Wechsel. */
export function bildAdresse(id: BenutzerId, v?: string | number): string {
  return `${API_BASE}/benutzer/${id}/bild${v ? `?v=${encodeURIComponent(String(v))}` : ''}`;
}

const BENUTZER_KEY = ['benutzer'] as const;

export function useBenutzer() {
  const api = useApi();
  return useQuery({
    queryKey: BENUTZER_KEY,
    queryFn: async () => {
      const res = await api.get<{ data?: Benutzer[] }>('/benutzer');
      return res.data ?? [];
    },
    staleTime: 30_000,
  });
}

/**
 * Eine neue Person: Vorname, Nachname, E-Mail, und ob sie die Verwaltung
 * bekommt. Das Startpasswort erzeugt das Gerät.
 *
 * Als `type` und nicht als `interface`: `useApi.post` nimmt einen
 * `Record<string, unknown>`, und nur ein Typalias bekommt von TypeScript die
 * dafür nötige stillschweigende Index-Signatur.
 */
export type NeuePerson = {
  vorname: string;
  nachname: string;
  email: string;
  verwaltung?: boolean;
};

/** Eine Person samt dem Startpasswort, das das Gerät ihr gegeben hat. */
export interface MitStartpasswort {
  person: Benutzer;
  startpasswort: string;
}

/**
 * Anlegen.
 *
 * Das Passwort in der Antwort ist ein STARTPASSWORT und steht dort genau
 * einmal: der Server setzt `passwort_vom_admin = true` (Migration 178), die
 * Anmeldung meldet danach `passwortWechselNoetig`, und die Oberfläche zeigt
 * der Person den Wechsel, bevor sie ihr die Shell zeigt (`App.tsx`, Phase D1).
 */
export function usePersonAnlegen() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (neu: NeuePerson): Promise<MitStartpasswort> => {
      const res = await api.post<{ data: Benutzer; startpasswort: string }>('/benutzer', neu);
      return { person: res.data, startpasswort: res.startpasswort };
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: BENUTZER_KEY });
    },
  });
}

/**
 * Ein neues Startpasswort erzeugen lassen, ohne das alte zu kennen.
 *
 * Der Server beendet danach alle Sitzungen der Person und setzt das
 * Startpasswort-Kennzeichen wieder — genau der Fall, in dem jemand ausgesperrt
 * werden SOLL. Das neue steht in der Antwort, einmal.
 */
export function useNeuesStartpasswort() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: BenutzerId): Promise<string> => {
      const res = await api.put<{ startpasswort: string }>(`/benutzer/${id}/passwort`, {});
      return res.startpasswort;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: BENUTZER_KEY });
    },
  });
}

/** Der Schalter „Verwaltung": `true` macht zum Administrator, `false` nimmt es. */
export function useVerwaltungSetzen() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, verwaltung }: { id: BenutzerId; verwaltung: boolean }) => {
      const res = await api.put<{ data: Benutzer }>(`/benutzer/${id}/verwaltung`, { verwaltung });
      return res.data;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: BENUTZER_KEY });
    },
  });
}

/** Sperren (`false`) oder wieder zulassen (`true`). Ein Wert, zwei Richtungen. */
export function useAktivSetzen() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, aktiv }: { id: BenutzerId; aktiv: boolean }) => {
      const res = await api.put<{ data: Benutzer }>(`/benutzer/${id}/aktiv`, { aktiv });
      return res.data;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: BENUTZER_KEY });
    },
  });
}

/**
 * Löschen.
 *
 * Entwertet auch die Freigaben-Abfrage: `app_members` hängt am Benutzer, und
 * eine Matrix mit einer Zeile für einen gelöschten Menschen wäre ein Zustand,
 * den es am Gerät nicht mehr gibt.
 */
export function useBenutzerLoeschen() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: BenutzerId) => {
      return api.del<{ deleted: boolean; zugangBleibt: boolean }>(`/benutzer/${id}`);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: BENUTZER_KEY });
      void qc.invalidateQueries({ queryKey: FREIGABEN_KEY });
    },
  });
}
