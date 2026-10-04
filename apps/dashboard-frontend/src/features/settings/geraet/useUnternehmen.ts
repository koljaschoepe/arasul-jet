/**
 * Name und Logo des Unternehmens (M5, Auftrag verwaltung-geraet-und-system).
 *
 * Gelesen wird beides aus derselben Antwort wie die Anmeldeseite und die
 * Aktivitätsleiste (`useGeraetMarke`, `GET /api/auth/needs-setup`), damit an
 * allen drei Stellen derselbe Stand steht. Geschrieben wird über
 * `PUT /api/settings/firmenname`, `PUT /api/settings/logo` und
 * `DELETE /api/settings/logo`; danach wird die Antwort entwertet, auch nach
 * einem Fehler, und die Leiste zeigt das neue Logo ohne Neuladen.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import { GERAET_MARKE_KEY } from '@/hooks/useGeraetMarke';

/** So lang darf der Name sein; dieselbe Zahl wie im Schema des Backends. */
export const FIRMENNAME_MAX = 120;
/** So groß darf das Logo sein; dieselbe Zahl wie in `utils/logoBild.js`. */
const LOGO_MAX_BYTES = 256 * 1024;
/** Die Arten, die das Gerät annimmt. Kein SVG: es kann Skript tragen. */
export const LOGO_ARTEN = ['image/png', 'image/jpeg', 'image/webp'];

export interface UnternehmenAenderung {
  /** Der neue Name; undefined lässt ihn, wie er ist. */
  firmenname?: string;
  /** Das neue Logo als Daten-Adresse, null entfernt es, undefined lässt es. */
  logo?: string | null;
}

export function useUnternehmenSpeichern() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (aenderung: UnternehmenAenderung) => {
      if (aenderung.firmenname !== undefined) {
        await api.put('/settings/firmenname', { firmenname: aenderung.firmenname });
      }
      if (aenderung.logo === null) {
        await api.del('/settings/logo');
      } else if (aenderung.logo !== undefined) {
        await api.put('/settings/logo', { bild: aenderung.logo });
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: GERAET_MARKE_KEY });
    },
  });
}

/** Eine gewählte Datei als Daten-Adresse, oder ein Satz, warum nicht. */
export function logoLesen(datei: File): Promise<string> {
  if (!LOGO_ARTEN.includes(datei.type)) {
    return Promise.reject(new Error('Das Logo muss eine PNG-, JPEG- oder WebP-Datei sein.'));
  }
  if (datei.size > LOGO_MAX_BYTES) {
    return Promise.reject(new Error('Das Logo darf höchstens 256 KB groß sein.'));
  }
  return new Promise((fertig, scheitern) => {
    const leser = new FileReader();
    leser.onload = () => fertig(String(leser.result));
    leser.onerror = () => scheitern(new Error('Die Datei ließ sich nicht lesen.'));
    leser.readAsDataURL(datei);
  });
}
