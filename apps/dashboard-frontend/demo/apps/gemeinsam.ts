/**
 * Was die fünf Fach-Apps der Demo teilen (J54, M7): Sprache, Formate, die
 * Schnittstelle zur eigenen App (`api/…`, relativ, also je Stand die
 * richtige) und kleine Rechnungen für Kennzahlen und Diagramme.
 *
 * Die Apps sind gebaut wie eine App aus dem Kit (`apps/werkstatt/`): React
 * und die Bibliothek kommen zur Laufzeit von `/marken/5/`, der Bau
 * (`bauen.mjs`, esbuild) legt sie nicht ins Bündel.
 */
import type { Eintrag, Wert } from '../bestand';
import type { Text } from '../firma';

export type Sprache = 'de' | 'en';

/** Deutsch ist Standard, egal was der Browser meldet (J54). */
export const SPRACHE: Sprache = (() => {
  try {
    return window.localStorage.getItem('arasul-demo-sprache') === 'en' ? 'en' : 'de';
  } catch {
    return 'de';
  }
})();
document.documentElement.lang = SPRACHE;

export const t = (de: string, en: string): string => (SPRACHE === 'en' ? en : de);
export const tx = (w: Wert | Text | undefined): string => {
  if (w === null || w === undefined) return '';
  if (typeof w === 'object') return w[SPRACHE];
  return String(w);
};

const ORT = SPRACHE === 'en' ? 'en-GB' : 'de-DE';

export const euro = (n: number, nachkomma = false) =>
  new Intl.NumberFormat(ORT, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: nachkomma ? 2 : 0,
    minimumFractionDigits: nachkomma ? 2 : 0,
  }).format(n);

export const zahl = (n: number, stellen = 0) =>
  new Intl.NumberFormat(ORT, { maximumFractionDigits: stellen }).format(n);

/** Ein Tag als `Date` aus `JJJJ-MM-TT`, mittags (keine Zeitzonen-Falle). */
export const tagAus = (iso: string): Date => new Date(`${iso.slice(0, 10)}T12:00:00`);

export const heuteIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const isoIn = (tage: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + tage);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const datum = (iso: Wert | undefined): string =>
  typeof iso === 'string' && iso
    ? tagAus(iso).toLocaleDateString(ORT, { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '–';

export const datumKurz = (iso: string): string =>
  tagAus(iso).toLocaleDateString(ORT, { day: '2-digit', month: '2-digit' });

/** Abstand in Tagen von heute (negativ: vergangen). */
export function tageBis(iso: Wert | undefined): number {
  if (typeof iso !== 'string' || !iso) return 0;
  return Math.round((tagAus(iso).getTime() - tagAus(heuteIso()).getTime()) / 86_400_000);
}

/** „heute", „morgen", „in 3 Tagen", „vor 2 Tagen". */
export function relativTag(iso: Wert | undefined): string {
  const n = tageBis(iso);
  if (n === 0) return t('heute', 'today');
  if (n === 1) return t('morgen', 'tomorrow');
  if (n === -1) return t('gestern', 'yesterday');
  if (n > 0) return t(`in ${n} Tagen`, `in ${n} days`);
  return t(`vor ${-n} Tagen`, `${-n} days ago`);
}

/** Ein Zeitpunkt als „vor 3 Std." bzw. Datum mit Uhrzeit. */
export function wann(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  const min = Math.round(ms / 60_000);
  if (min < 1) return t('gerade eben', 'just now');
  if (min < 60) return t(`vor ${min} Min.`, `${min} min ago`);
  const std = Math.round(min / 60);
  if (std < 24) return t(`vor ${std} Std.`, `${std} h ago`);
  return new Date(iso).toLocaleString(ORT, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const MONATE = {
  de: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/** Die letzten `n` Monate, ältester zuerst, je mit Summe aus `wert`. */
export function proMonat(
  liste: Eintrag[],
  tagVon: (e: Eintrag) => string | null,
  n: number,
  reihen: Record<string, (e: Eintrag) => number>,
  /** Monate nach dem laufenden, für Pläne. */
  voraus = 0
): { x: number; name: string; [reihe: string]: number | string }[] {
  const jetzt = new Date();
  const aus = Array.from({ length: n + voraus }, (_, i) => {
    const d = new Date(jetzt.getFullYear(), jetzt.getMonth() - (n - 1 - i), 1);
    const zeile: { x: number; name: string; [reihe: string]: number | string } = {
      x: i,
      name: MONATE[SPRACHE][d.getMonth()]!,
    };
    for (const r of Object.keys(reihen)) zeile[r] = 0;
    return { zeile, jahr: d.getFullYear(), monat: d.getMonth() };
  });
  for (const e of liste) {
    const iso = tagVon(e);
    if (!iso) continue;
    const d = tagAus(iso);
    const ziel = aus.find(a => a.jahr === d.getFullYear() && a.monat === d.getMonth());
    if (!ziel) continue;
    for (const [r, f] of Object.entries(reihen)) ziel.zeile[r] = Number(ziel.zeile[r]) + f(e);
  }
  return aus.map(a => a.zeile);
}

/** Wochen um heute: `zurueck` Wochen davor bis `voraus` danach. */
export function proWoche(
  liste: Eintrag[],
  tagVon: (e: Eintrag) => string | null,
  zurueck: number,
  voraus: number,
  reihen: Record<string, (e: Eintrag) => number>
): { x: number; name: string; [reihe: string]: number | string }[] {
  const montag = tagAus(heuteIso());
  montag.setDate(montag.getDate() - ((montag.getDay() + 6) % 7));
  const aus = Array.from({ length: zurueck + voraus + 1 }, (_, i) => {
    const beginn = new Date(montag);
    beginn.setDate(beginn.getDate() + (i - zurueck) * 7);
    const zeile: { x: number; name: string; [reihe: string]: number | string } = {
      x: i,
      name: `${t('KW', 'Wk')} ${kalenderwoche(beginn)}`,
    };
    for (const r of Object.keys(reihen)) zeile[r] = 0;
    return { zeile, beginn: beginn.getTime() };
  });
  for (const e of liste) {
    const iso = tagVon(e);
    if (!iso) continue;
    const ms = tagAus(iso).getTime();
    const ziel = aus.find(a => ms >= a.beginn && ms < a.beginn + 7 * 86_400_000);
    if (!ziel) continue;
    for (const [r, f] of Object.entries(reihen)) ziel.zeile[r] = Number(ziel.zeile[r]) + f(e);
  }
  return aus.map(a => a.zeile);
}

export function kalenderwoche(d: Date): number {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const tag = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - tag);
  const jahr = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x.getTime() - jahr.getTime()) / 86_400_000 + 1) / 7);
}

// ── Schnittstelle der App ───────────────────────────────────────────────────

async function rufe<T>(methode: string, pfad: string, koerper?: unknown): Promise<T> {
  const r = await fetch(`api/${pfad}`, {
    method: methode,
    headers: {
      accept: 'application/json',
      ...(koerper ? { 'content-type': 'application/json' } : {}),
    },
    body: koerper ? JSON.stringify(koerper) : undefined,
  });
  const j = (await r.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!r.ok) throw new Error(j?.error?.message ?? t('Das ging nicht.', 'That did not work.'));
  return j?.data as T;
}

export const api = {
  fassung: () => rufe<{ version: string; stand: 'live' | 'test' }>('GET', 'fassung'),
  daten: () => rufe<{ eintraege: Eintrag[]; ich: number }>('GET', 'daten'),
  anlegen: (felder: Record<string, Wert>, stand: string) =>
    rufe<Eintrag>('POST', 'eintraege', { felder, stand }),
  aendern: (
    id: number,
    aenderung: { felder?: Record<string, Wert>; stand?: string; notiz?: string }
  ) => rufe<Eintrag>('PATCH', `eintraege/${id}`, aenderung),
  loeschen: (id: number) => rufe<{ id: number }>('DELETE', `eintraege/${id}`),
  freigabe: (id: number, entscheidung: 'ja' | 'nein', grund?: string) =>
    rufe<{ eintrag: Eintrag }>('POST', `eintraege/${id}/freigabe`, { entscheidung, grund }),
  dateiAnhaengen: (id: number, name: string, data: string) =>
    rufe<Eintrag>('POST', `eintraege/${id}/dateien`, { name, data }),
  dateiEntfernen: (id: number, datei: string) =>
    rufe<Eintrag>('DELETE', `eintraege/${id}/dateien/${datei}`),
};

export const dateiAdresse = (id: number, datei: string) => `api/eintraege/${id}/dateien/${datei}`;

/** `a >= b` für Fassungen wie `1.5.0`. */
export function mindestens(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return true;
}

/** Eine Liste als CSV herunterladen (Semikolon, wie es eine deutsche Tabellenkalkulation öffnet). */
export function csvLaden(dateiname: string, kopf: string[], zeilen: string[][]): void {
  const zelle = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const text = [kopf, ...zeilen].map(z => z.map(zelle).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = dateiname;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ── Zeitraum der Auswertung (J55) ───────────────────────────────────────────

export type ZeitraumKennung = '3m' | '6m' | '12m' | 'jahr';

export interface Zeitraum {
  kennung: ZeitraumKennung;
  /** Erster Tag, `JJJJ-MM-TT`. */
  von: string;
  /** Letzter Tag, `JJJJ-MM-TT`; bei Plänen auch in der Zukunft. */
  bis: string;
  /** Wie viele Monate die Diagramme zeigen. */
  monate: number;
  text: string;
}

export const ZEITRAEUME: [ZeitraumKennung, string][] = [
  ['3m', t('3 Monate', '3 months')],
  ['6m', t('6 Monate', '6 months')],
  ['12m', t('12 Monate', '12 months')],
  ['jahr', t('Dieses Jahr', 'This year')],
];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Der Zeitraum bis heute (oder `voraus` Tage darüber hinaus), ab dem ersten des Monats. */
export function zeitraum(kennung: ZeitraumKennung, voraus = 0): Zeitraum {
  const jetzt = new Date();
  const monate =
    kennung === '3m' ? 3 : kennung === '6m' ? 6 : kennung === '12m' ? 12 : jetzt.getMonth() + 1;
  const von = new Date(jetzt.getFullYear(), jetzt.getMonth() - (monate - 1), 1, 12);
  const text = ZEITRAEUME.find(([k]) => k === kennung)![1];
  return { kennung, von: iso(von), bis: isoIn(voraus), monate, text };
}

export const imZeitraum = (z: Zeitraum, tag: string | null | undefined): boolean =>
  !!tag && tag.slice(0, 10) >= z.von && tag.slice(0, 10) <= z.bis;

export const prozent = (teil: number, ganz: number): number =>
  ganz ? Math.round((teil / ganz) * 100) : 0;

export const tausend = (n: number): string =>
  n >= 1000 ? t(`${zahl(Math.round(n / 1000))} Tsd.`, `${zahl(Math.round(n / 1000))}k`) : zahl(n);

// ── Wege zwischen den Apps (J55) ────────────────────────────────────────────

/**
 * In der Shell zu einer Adresse gehen, wie ein Klick in der Leiste. Die App
 * läuft im Rahmen derselben Herkunft; die Shell hört auf `popstate`.
 */
function geheZu(pfad: string): void {
  const oben = window.top ?? window;
  oben.history.pushState(null, '', pfad);
  const Ereignis = (oben as unknown as { PopStateEvent: typeof PopStateEvent }).PopStateEvent;
  oben.dispatchEvent(new Ereignis('popstate'));
}

/** Einen Vorgang in seiner App öffnen. */
export function vorgangOeffnen(app: string, id: number): void {
  geheZu(`/workspace/app/${app}?freigabe=${id}`);
}

export type StammArt = 'kunde' | 'lieferant' | 'maschine' | 'person';

/**
 * Einen Stammsatz in den Stammdaten öffnen. Die Shell trägt nur die Nummer
 * einer Freigabe in die Adresse der App; der Stammsatz geht deshalb über den
 * Speicher des Browsers, wie „neu anlegen" von der Startseite.
 */
export function stammOeffnen(art: StammArt, id: number | string): void {
  try {
    window.localStorage.setItem(
      'arasul-demo-stamm',
      JSON.stringify({ art, id: String(id), am: Date.now() })
    );
  } catch {
    /* dann öffnet sie nur die Stammdaten */
  }
  geheZu('/workspace/app/stammdaten');
}

/** Mehrere Tabellen in eine CSV, je mit ihrem Titel darüber. */
export function csvMehrteilig(
  dateiname: string,
  teile: { titel: string; kopf: string[]; zeilen: string[][] }[]
): void {
  const zelle = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const text = teile
    .map(tl => [[tl.titel], tl.kopf, ...tl.zeilen].map(z => z.map(zelle).join(';')).join('\r\n'))
    .join('\r\n\r\n');
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = dateiname;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const pdfAdresse = (id: number) => `api/eintraege/${id}/pdf`;
