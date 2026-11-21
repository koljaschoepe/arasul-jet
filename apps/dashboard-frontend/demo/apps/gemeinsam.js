/**
 * Was die drei Beispiel-Apps der Demo teilen (J46, M7): Sprache, Fassung,
 * Zahlen und Daten in der Sprache des Besuchers.
 *
 * Die Apps sind Apps ohne Bau, wie `tests/beispielapp/` (JavaScript mit
 * `h()` statt JSX, die Bibliothek kommt zur Laufzeit von `/marken/5/`). Sie
 * sprechen nur mit ihrer eigenen Schnittstelle (`api/fassung`, relativ, also
 * je Stand die richtige); die Antwort gibt in der Demo der Service Worker.
 */
import { useEffect, useState } from '/marken/5/marken.js';

export function sprache() {
  try {
    const s = window.localStorage.getItem('arasul-demo-sprache');
    if (s === 'de' || s === 'en') return s;
  } catch {
    /* ohne Speicher gilt die Sprache des Browsers */
  }
  return navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export const SPRACHE = sprache();
document.documentElement.lang = SPRACHE;

/** Ein Text in beiden Sprachen; der passende. */
export const t = (de, en) => (SPRACHE === 'en' ? en : de);

const ORT = () => (SPRACHE === 'en' ? 'en-GB' : 'de-DE');

export const euro = betrag =>
  new Intl.NumberFormat(ORT(), { style: 'currency', currency: 'EUR' }).format(betrag);

/** Ein Tag relativ zu heute, damit Beispieldaten nicht altern. */
export function tag(abstand) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + abstand);
  return d;
}

export const datum = d =>
  d.toLocaleDateString(ORT(), { day: '2-digit', month: '2-digit', year: 'numeric' });

/** `a >= b` für Fassungen wie `1.5.0`. */
export function mindestens(a, b) {
  const x = String(a).split('.').map(Number);
  const y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return true;
}

/** Welche Fassung in diesem Stand läuft (`api/fassung`). */
export function useFassung() {
  const [fassung, setFassung] = useState(null);
  useEffect(() => {
    fetch('api/fassung', { headers: { accept: 'application/json' } })
      .then(r => (r.ok ? r.json() : null))
      .then(j => setFassung(j?.data ?? null))
      .catch(() => setFassung(null));
  }, []);
  return fassung;
}

/**
 * Die Form jeder Seite der drei Apps (J51): Seitenkopf, eine Reihe
 * Kennzahlen, eine kompakte Tabelle, darunter was die App sonst braucht.
 * Die Breite ist die einer Arbeitsseite, nicht die eines Lesetexts.
 */
export const SEITE = {
  maxWidth: '72rem',
  margin: '0 auto',
  padding: 'var(--ara-abstand-4, 1rem)',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: 'var(--ara-abstand-4, 1rem)',
};

/** Zahlen und Nummern in Tabellen in Mono, wie im Produkt. */
export const MONO = { fontFamily: 'var(--font-mono)', fontSize: '0.92em' };

/** Der Satz unter dem Titel: was die App tut, dazu die Fassung. */
export function unterzeile(satz, fassung) {
  if (!fassung) return satz;
  const f = t(`Fassung ${fassung.version}`, `Version ${fassung.version}`);
  return `${satz} ${f}${fassung.stand === 'test' ? ' · Test' : ''}.`;
}
