/**
 * Was das Cockpit rechnet, ohne React: Filter, Zahlen, Wörter. Hier steht es
 * getrennt, damit die Tests es ohne Oberfläche prüfen.
 */
import type { Ansicht, AppStand, Meldung, StandMeldung } from './typen';

/** Wie ein Stand einer Meldung heißt, wo ein Mensch ihn liest. */
export const STAND_WORT: Record<StandMeldung, string> = {
  neu: 'Neu',
  angenommen: 'Angenommen',
  umgesetzt: 'Umgesetzt',
  abgelehnt: 'Abgelehnt',
};

/** Offen ist, was noch Arbeit ist: neu und angenommen. */
export const istOffen = (m: Pick<Meldung, 'stand_meldung'>) =>
  m.stand_meldung === 'neu' || m.stand_meldung === 'angenommen';

/** Der Filter des Eingangs: App (oder alle) und Stand (oder „offen"/alle). */
export interface EingangFilter {
  app: string;
  stand: StandMeldung | 'offen' | 'alle';
}

export const FILTER_VORGABE: EingangFilter = { app: 'alle', stand: 'offen' };

export function filtere(meldungen: readonly Meldung[], f: EingangFilter): Meldung[] {
  return meldungen.filter(
    m =>
      (f.app === 'alle' || m.app_id === f.app) &&
      (f.stand === 'alle' || (f.stand === 'offen' ? istOffen(m) : m.stand_meldung === f.stand))
  );
}

/** Die Apps, zu denen es Meldungen gibt, mit Namen, für den Filter. */
export function appsAusMeldungen(
  meldungen: readonly Meldung[],
  apps: readonly AppStand[] = []
): { id: string; name: string }[] {
  const namen = new Map<string, string>();
  for (const a of apps) namen.set(a.id, a.name);
  for (const m of meldungen) {
    if (!namen.has(m.app_id)) namen.set(m.app_id, m.app_name ?? m.app_id);
  }
  return [...namen.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Ein Grund ist Pflicht, wer ablehnt; sonst darf er fehlen. */
export function grundFehlt(stand: StandMeldung, grund: string): boolean {
  return stand === 'abgelehnt' && grund.trim().length === 0;
}

/** Was im Test neuer ist als live, die zuletzt eingespielte zuerst. */
export function wartetAufLive(apps: readonly AppStand[]): AppStand[] {
  return apps
    .filter(a => a.test_neuer && !a.mitgeliefert)
    .sort(
      (a, b) =>
        new Date(b.test?.eingespielt_am ?? 0).getTime() -
        new Date(a.test?.eingespielt_am ?? 0).getTime()
    );
}

/**
 * Apps, die zuletzt live geschaltet wurden und eine Fassung davor haben: für
 * „zurück“. Der Rückweg ist ein Tausch (`{"ziel":"zurueck"}`), wie in der
 * Verwaltung.
 */
export function zurueckMoeglich(apps: readonly AppStand[]): AppStand[] {
  return apps.filter(
    a =>
      !a.mitgeliefert &&
      a.letzte_schaltung?.ergebnis === 'live' &&
      a.live?.version === a.letzte_schaltung.nach_version &&
      Boolean(a.live?.vorige_version)
  );
}

export const zeit = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export const anzahl = (n: number, eins: string, viele: string) => `${n} ${n === 1 ? eins : viele}`;

/** Die Ansicht aus dem Fragment der Adresse (`#apps`), sonst der Eingang. */
export function ansichtAusAdresse(hash: string): Ansicht {
  const wort = hash.replace(/^#/, '').split('?')[0];
  return wort === 'apps' || wort === 'live' ? wort : 'eingang';
}
