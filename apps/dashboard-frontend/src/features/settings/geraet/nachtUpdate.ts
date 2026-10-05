/**
 * Aktualisierung nachts (M5, update-nachts): die Antwort des Geräts
 * (`GET /api/update/fassung/nachts`) und die Sätze dazu. Ein Ort für den Text,
 * damit der Hinweis auf der Startseite und der Abschnitt im Bereich Gerät
 * dasselbe sagen.
 */
type NachtErgebnis =
  | 'laeuft'
  | 'eingespielt'
  | 'uebersprungen'
  | 'zurueckgefallen'
  | 'fehlgeschlagen'
  | 'nichts_zu_tun'
  | 'trockenlauf';

export interface NachtLauf {
  id: number;
  /** Datum des Beginns der Nacht, `JJJJ-MM-TT`. */
  fenster: string;
  trocken: boolean;
  ergebnis: NachtErgebnis;
  grund: string | null;
  von: string | null;
  nach: string | null;
  gestartet: string;
  beendet: string | null;
  gesehen_am: string | null;
}

export interface NachtStand {
  aktiv: boolean;
  fenster: {
    von: string;
    bis: string;
    zeitzone: string;
    beginn: string;
    ende: string;
    laeuftGerade: boolean;
    /** Ende des laufenden Fensters, sonst `null`. */
    laufendBis: string | null;
  };
  letzter: NachtLauf | null;
  hinweis: NachtLauf | null;
}

export const NACHT_KEY = ['update', 'fassung', 'nachts'] as const;

/** „In der Nacht zum 5. Oktober" — das Fenster beginnt am Abend davor, endet an diesem Tag. */
function nachtZum(fenster: string): string {
  const [j = 0, m = 1, t = 1] = fenster.split('-').map(Number);
  const tag = new Intl.DateTimeFormat('de-DE', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(j, m - 1, t)));
  return `In der Nacht zum ${tag}`;
}

/** Ein Satz zum Ergebnis einer Nacht, für einen Menschen. */
export function nachtSatz(l: NachtLauf): string {
  // Ein Trockenlauf gehört zu keiner Nacht; sein Satz steht im Grund.
  if (l.trocken) {
    return l.grund ?? 'Der Ablauf wurde geprüft.';
  }
  const nacht = nachtZum(l.fenster);
  const grund = l.grund ? ` ${l.grund}` : '';
  switch (l.ergebnis) {
    case 'eingespielt':
      return `${nacht} wurde auf ${l.nach ?? 'die neue Fassung'} aktualisiert.`;
    case 'zurueckgefallen':
      return `${nacht} ist die Aktualisierung auf ${l.nach ?? 'die neue Fassung'} misslungen. Das Gerät läuft wieder mit ${l.von ?? 'der vorigen Fassung'}.`;
    case 'fehlgeschlagen':
      return `${nacht} ist die Aktualisierung fehlgeschlagen.${grund}`;
    case 'uebersprungen':
      return `${nacht} wurde nicht aktualisiert.${grund}`;
    case 'nichts_zu_tun':
      return `${nacht} gab es nichts einzuspielen.`;
    case 'laeuft':
      return `${nacht} läuft die Aktualisierung.`;
    case 'trockenlauf':
      return l.grund ?? 'Der Ablauf wurde geprüft.';
  }
}
