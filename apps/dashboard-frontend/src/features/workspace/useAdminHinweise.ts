/**
 * Was beim Administrator Aufmerksamkeit braucht (M5, `frontend.md`, Startseite):
 * Sicherung fehlgeschlagen oder älter als ein Tag, Update bereit, App gestört,
 * Fassung wartet auf Live, Lizenz knapp. Ist alles gut, ist die Liste leer —
 * es gibt keine grüne Erfolgsmeldung.
 *
 * Die Abfragen sind die der Verwaltung, mit denselben Schlüsseln: der Cache
 * fragt einmal, und die Hinweise können nicht anders lauten als der Bereich,
 * auf den sie zeigen. Nur für den Administrator gerufen (`AdminHinweise` steht
 * nur in seinem Baum) — die Wege dahinter tragen `requireRole('admin')`.
 */
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import { useSicherungStatus, type SicherungStatus } from '@/features/system/sicherung/useSicherung';
import { useAlleApps, type AppZeile } from '@/features/settings/personen/useAppFreigaben';
import { useLizenz, type LizenzInfo } from '@/features/settings/lizenz/useLizenz';

export interface Hinweis {
  /** Stabil, für `data-testid` und den Schlüssel. */
  art: 'sicherung' | 'update' | 'app-gestoert' | 'fassung-wartet' | 'lizenz';
  text: string;
  /** Wohin der Klick führt: ein Bereich der Verwaltung, mit Abschnitt. */
  ziel: { bereich: string; abschnitt?: string };
}

/** Älter als ein Tag ist eine Sicherung, die in der Nacht hätte laufen sollen. */
const SICHERUNG_ALTER_STUNDEN = 24;
/** Ab so vielen Tagen Restlaufzeit oder ab dieser Belegung ist die Lizenz knapp. */
const LIZENZ_TAGE = 30;
const LIZENZ_BELEGUNG = 0.9;

export function sicherungHinweis(s: SicherungStatus | undefined): Hinweis | null {
  if (!s) return null;
  const l = s.letzteSicherung;
  const ziel = { bereich: 'system', abschnitt: 'sicherung' };
  if (l.status === 'fehlt') {
    return { art: 'sicherung', text: 'Dieses Gerät hat noch nie gesichert.', ziel };
  }
  if (l.status !== 'completed') {
    return { art: 'sicherung', text: 'Die letzte Sicherung ist fehlgeschlagen.', ziel };
  }
  if (l.alterStunden !== null && l.alterStunden > SICHERUNG_ALTER_STUNDEN) {
    return { art: 'sicherung', text: 'Die letzte Sicherung ist älter als ein Tag.', ziel };
  }
  return null;
}

export function appHinweise(apps: AppZeile[] | undefined): Hinweis[] {
  const aus: Hinweis[] = [];
  for (const app of apps ?? []) {
    const { live, test } = app.staende;
    const ziel = { bereich: 'apps', abschnitt: app.id };
    const gestoert = [live, test].some(s => s && s.lieferbar === false);
    if (gestoert) {
      aus.push({ art: 'app-gestoert', text: `${app.name} ist gestört.`, ziel });
    }
    if (test && test.version !== live?.version) {
      aus.push({
        art: 'fassung-wartet',
        text: live
          ? `Fassung ${test.version} von ${app.name} wartet auf Live.`
          : `${app.name} steht im Test und ist noch nicht live.`,
        ziel,
      });
    }
  }
  return aus;
}

export function lizenzHinweis(l: LizenzInfo | undefined): Hinweis | null {
  if (!l) return null;
  const ziel = { bereich: 'lizenz' };
  if (!l.valid && l.tier !== 'community') {
    return { art: 'lizenz', text: 'Die Lizenz ist abgelaufen.', ziel };
  }
  if (typeof l.daysRemaining === 'number' && l.daysRemaining <= LIZENZ_TAGE) {
    return {
      art: 'lizenz',
      text:
        l.daysRemaining <= 0
          ? 'Die Lizenz ist abgelaufen.'
          : `Die Lizenz läuft in ${l.daysRemaining === 1 ? '1 Tag' : `${l.daysRemaining} Tagen`} ab.`,
      ziel,
    };
  }
  const voll = [l.nutzung?.konten, l.nutzung?.apps].some(
    b => b && b.grenze > 0 && b.belegt / b.grenze >= LIZENZ_BELEGUNG
  );
  return voll ? { art: 'lizenz', text: 'Die Lizenz ist fast ausgeschöpft.', ziel } : null;
}

/** `X.Y.Z` gegen `X.Y.Z`; größer als null heißt: das erste ist neuer. */
function neuer(a: string, b: string): boolean {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}

export function useAdminHinweise(): Hinweis[] {
  const api = useApi();
  const sicherung = useSicherungStatus();
  const apps = useAlleApps();
  const lizenz = useLizenz();
  const fassung = useQuery({
    queryKey: ['update', 'fassung'],
    queryFn: () =>
      api.get<{ data: { fassung: { nummer: string | null }; einspielenMoeglich: boolean } }>(
        '/update/fassung',
        { showError: false }
      ),
    select: a => a.data,
    staleTime: 60_000,
    retry: false,
  });
  const neueste = useQuery({
    queryKey: ['update', 'fassung', 'neueste'],
    queryFn: () =>
      api.get<{ data: { fassung: string } | null }>('/update/fassung/neueste', {
        showError: false,
      }),
    select: a => a.data,
    enabled: fassung.data?.einspielenMoeglich === true,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const aktuell = fassung.data?.fassung.nummer;
  const update: Hinweis | null =
    neueste.data && aktuell && neuer(neueste.data.fassung, aktuell)
      ? {
          art: 'update',
          text: `Eine neue Fassung ${neueste.data.fassung} liegt bereit.`,
          ziel: { bereich: 'system', abschnitt: 'updates' },
        }
      : null;

  return [
    sicherungHinweis(sicherung.data),
    update,
    ...appHinweise(apps.data),
    lizenzHinweis(lizenz.data),
  ].filter((h): h is Hinweis => h !== null);
}
