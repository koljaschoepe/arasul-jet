/**
 * Die Lizenz des Geräts, für den Administrator (Auftrag J35, 25.09.2026).
 *
 * Zwei Wege aus `routes/admin/license.js`: `GET /api/license/info` (Stufe,
 * Fingerabdruck und seit J35 `nutzung` — Konten und Apps je belegt und
 * Grenze, dieselben Zahlen wie `lizenz-geraet.sh status`) und
 * `POST /api/license/activate`. Nach dem Einspielen wird die Abfrage
 * entwertet, auch nach einem Fehler — wie überall in den Einstellungen.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';

const LIZENZ_KEY = ['lizenz', 'info'] as const;

/** Die Stufen, die das Gerät kennt. `community` ist das Gerät ohne Lizenz. */
export type Stufe = 'community' | 'professional' | 'enterprise';

/** Belegt und Grenze; `grenze` -1 heißt unbegrenzt. */
export interface Belegung {
  belegt: number;
  grenze: number;
}

export interface LizenzInfo {
  valid: boolean;
  tier: Stufe;
  graceMode?: boolean;
  error?: string;
  warning?: string;
  customer?: string;
  expiresAt?: string;
  daysRemaining?: number;
  hardwareFingerprint: string;
  nutzung: { stufe: Stufe; konten: Belegung; apps: Belegung };
}

export function useLizenz() {
  const api = useApi();
  return useQuery({
    queryKey: LIZENZ_KEY,
    queryFn: () => api.get<LizenzInfo>('/license/info', { showError: false }),
  });
}

export function useLizenzEinspielen() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (licenseKey: string) =>
      api.post<{ success: boolean; license: { tier: Stufe } }>(
        '/license/activate',
        { licenseKey },
        // Die Meldung steht unter dem Feld, dort, wo sie jemand liest, der
        // gerade eine Zeile eingefügt hat — nicht als Toast, der verschwindet.
        { showError: false }
      ),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: LIZENZ_KEY });
    },
  });
}
