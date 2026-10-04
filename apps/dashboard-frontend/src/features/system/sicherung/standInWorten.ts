/**
 * Ein Stand, wie ihn ein Mensch liest (Auftrag sicherung-zurueckholen, M5).
 *
 * Wer zurückholt, weiß nicht, was ein Stand ist, aber er weiß, wann der
 * Fehler passiert ist. Deshalb heißt ein Stand nach seinem Zeitpunkt, in
 * Worten: „Heute, 23:12 Uhr“, „Gestern, 2:00 Uhr“, „Freitag, 2. Oktober,
 * 2:00 Uhr“ — und aus einem anderen Jahr mit der Jahreszahl. Keine Kennung,
 * keine Ziffernkolonne; die steht nur unter „Technische Angaben“.
 */
import type { Stand } from './useSicherung';

function tagesbeginn(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function standInWorten(iso: string, jetzt: Date = new Date(), mitSekunden = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return 'unbekannter Zeitpunkt';
  }
  const zwei = (n: number) => String(n).padStart(2, '0');
  const uhr = `${d.getHours()}:${zwei(d.getMinutes())}${mitSekunden ? `:${zwei(d.getSeconds())}` : ''} Uhr`;
  // Gerundet: zwischen zwei Mitternächten liegen bei der Zeitumstellung 23
  // oder 25 Stunden.
  const tage = Math.round((tagesbeginn(jetzt) - tagesbeginn(d)) / 86_400_000);
  if (tage === 0) {
    return `Heute, ${uhr}`;
  }
  if (tage === 1) {
    return `Gestern, ${uhr}`;
  }
  const datum = new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() !== jetzt.getFullYear() ? { year: 'numeric' as const } : {}),
  }).format(d);
  return `${datum}, ${uhr}`;
}

/**
 * Was zu einem Stand dazugesagt wird: nur, wenn er vor einem Zurückholen
 * entstand — dann ist er der Weg, das Zurückholen rückgängig zu machen —
 * oder vor dem Live-Schalten einer App (M5).
 */
export function standZusatz(
  stand: Pick<Stand, 'vorher' | 'fuer'>,
  namen: { apps: Map<string, string>; bereiche: Map<string, string> }
): string | null {
  if (!stand.vorher) {
    return null;
  }
  const f = stand.fuer;
  if (f?.art === 'app' && f.id) {
    return `vor dem Zurückholen der App „${namen.apps.get(f.id) ?? f.id}“`;
  }
  if (f?.art === 'live' && f.id) {
    return `vor dem Live-Schalten der App „${namen.apps.get(f.id) ?? f.id}“`;
  }
  if (f?.art === 'bereich' && f.id) {
    return `vor dem Zurückholen des Bereichs „${namen.bereiche.get(f.id) ?? f.id}“`;
  }
  if (f?.art === 'update') {
    return 'vor dem Einspielen einer neuen Fassung';
  }
  if (f?.art === 'geraet') {
    return 'vor dem Zurückholen des ganzen Geräts';
  }
  return 'vor einem Zurückholen';
}

/** Die Namen, die in den Ständen vorkommen (eine App heißt in jedem Stand gleich). */
export function namenDerStaende(staende: Stand[]): {
  apps: Map<string, string>;
  bereiche: Map<string, string>;
} {
  const apps = new Map<string, string>();
  const bereiche = new Map<string, string>();
  for (const s of staende) {
    for (const a of s.apps) if (a.name && !apps.has(a.id)) apps.set(a.id, a.name);
    for (const b of s.bereiche)
      if (b.name && !bereiche.has(b.kennung)) bereiche.set(b.kennung, b.name);
  }
  return { apps, bereiche };
}

/**
 * Die Namen einer ganzen Liste: zwei Stände in derselben Minute (von Hand
 * gesichert, dann der Stand davor) hießen sonst gleich. Dann, und nur dann,
 * kommen die Sekunden dazu (am Orin gesehen, 04.10.2026).
 */
export function standNamen(
  staende: Pick<Stand, 'id' | 'zeitpunkt'>[],
  jetzt: Date = new Date()
): Map<string, string> {
  const zahl = new Map<string, number>();
  for (const s of staende) {
    const n = standInWorten(s.zeitpunkt, jetzt);
    zahl.set(n, (zahl.get(n) ?? 0) + 1);
  }
  return new Map(
    staende.map(s => {
      const n = standInWorten(s.zeitpunkt, jetzt);
      return [s.id, (zahl.get(n) ?? 0) > 1 ? standInWorten(s.zeitpunkt, jetzt, true) : n];
    })
  );
}
