/**
 * Der geführte Weg der Demo (J54, M7), neu: ruhig, an der richtigen Stelle,
 * jederzeit überspringbar. Er beginnt nicht von selbst, sondern über „Kurz
 * zeigen lassen" in der Kapsel.
 *
 * Fünf Schritte, jeder mit einer Karte aus Glas (am Rechner unten rechts, am
 * Handy als Blatt von unten) und einem ruhigen Rahmen um die Stelle, um die
 * es geht: kein Puls, kein Springen, der Rahmen gleitet in 200 ms zur
 * nächsten Stelle, bei „weniger Bewegung" sofort. „Weiter" geht dorthin, wo
 * der Schritt spielt; Escape und „Beenden" schließen.
 *
 * Der Stand liegt in `sessionStorage`, damit der Weg ein Neuladen übersteht.
 */
import type { Sprache } from './daten';

const SCHLUESSEL = 'arasul-demo-weg';

interface Schritt {
  /** Die Adresse, an der der Schritt spielt. */
  pfad: string;
  /** Die Stelle, um die der Rahmen liegt; ohne Treffer kein Rahmen. */
  ziel: string;
  titel: [string, string];
  text: [string, string];
}

const SCHRITTE: Schritt[] = [
  {
    pfad: '/workspace',
    ziel: '[data-testid="demo-uebersicht"]',
    titel: ['Die Startseite des Betriebs', 'The company home page'],
    text: [
      'Angemeldet ist Miriam Kerschner, Betriebsleiterin. Oben die Kennzahlen aus allen Apps, ein Klick öffnet die App dazu. Mit den Schnellzugriffen legen Sie direkt etwas an.',
      'Signed in is Miriam Kerschner, operations manager. At the top the figures from all apps; a click opens the app. Quick actions create something straight away.',
    ],
  },
  {
    pfad: '/workspace',
    ziel: '#fuer-sie',
    titel: ['Freigaben für Sie', 'Approvals for you'],
    text: [
      'Große Angebote, Prüfprotokolle und Urlaubsanträge warten hier auf ihre Entscheidung. Ein Klick öffnet den Vorgang in seiner App, dort geben Sie frei oder lehnen mit einem Satz ab.',
      'Large quotes, inspection reports and leave requests wait here for her decision. A click opens the item in its app, where you approve or decline with a sentence.',
    ],
  },
  {
    pfad: '/workspace/app/angebote',
    ziel: '[data-testid="app-rahmen-angebote"]',
    titel: ['Eine App, wie das Kit sie baut', 'An app as the kit builds it'],
    text: [
      'Kennzahlen, eine Auswertung, die Liste mit Suche, Filter und Sortierung. Legen Sie ein Angebot an, öffnen Sie eines mit seinem PDF, ändern Sie den Stand. Alles bleibt in Ihrem Browser.',
      'Figures, a chart, the list with search, filter and sorting. Create a quote, open one with its PDF, change its status. Everything stays in your browser.',
    ],
  },
  {
    pfad: '/workspace/app/angebote',
    ziel: '[data-testid="rueckmeldung-knopf"]',
    titel: ['Rückmeldung zu jeder Seite', 'Feedback on every page'],
    text: [
      'Fehlt etwas oder stimmt etwas nicht, schreibt jeder hier eine Rückmeldung, auf Wunsch mit Bildschirmfoto und markierter Stelle. Sie landet in der Werkstatt.',
      'If something is missing or wrong, anyone writes feedback here, optionally with a screenshot and a marked spot. It lands in the workshop.',
    ],
  },
  {
    pfad: '/workspace/app/werkstatt',
    ziel: '[data-testid="app-rahmen-werkstatt"]',
    titel: ['Die Werkstatt', 'The workshop'],
    text: [
      'Hier laufen die Rückmeldungen ein, mit Stand. Wer das Recht hat, sieht alle und schaltet eine geprüfte Testfassung live, etwa Angebote 1.5.0 mit Rabatt.',
      'Feedback arrives here with its status. Whoever has the right sees all of it and switches a tested version live, such as Quotes 1.5.0 with discounts.',
    ],
  },
];

const TEXTE = {
  de: {
    weiter: 'Weiter',
    zurueck: 'Zurück',
    fertig: 'Fertig',
    beenden: 'Beenden',
    von: 'von',
    titel: 'Kurz gezeigt',
  },
  en: {
    weiter: 'Next',
    zurueck: 'Back',
    fertig: 'Done',
    beenden: 'Close',
    von: 'of',
    titel: 'Quick tour',
  },
} as const;

let sprache: Sprache = 'de';
let karte: HTMLElement | null = null;
let rahmen: HTMLElement | null = null;
let uhr: number | undefined;

function stand(): number {
  try {
    return Number(window.sessionStorage.getItem(SCHLUESSEL) ?? 0);
  } catch {
    return 0;
  }
}

function standSetzen(n: number): void {
  try {
    if (n > 0) window.sessionStorage.setItem(SCHLUESSEL, String(n));
    else window.sessionStorage.removeItem(SCHLUESSEL);
  } catch {
    /* ohne Speicher gilt der Weg bis zum Neuladen */
  }
}

function geheZu(pfad: string) {
  if (window.location.pathname === pfad) return;
  window.history.pushState(null, '', pfad);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function knopf(
  text: string,
  art: 'haupt' | 'neben' | 'still',
  beiKlick: () => void
): HTMLButtonElement {
  const k = document.createElement('button');
  k.type = 'button';
  k.className = `demo-weg-knopf demo-weg-${art}`;
  k.textContent = text;
  k.addEventListener('click', beiKlick);
  return k;
}

function beenden(): void {
  standSetzen(0);
  karte?.remove();
  rahmen?.remove();
  karte = null;
  rahmen = null;
  window.clearInterval(uhr);
}

function zeigen(n: number): void {
  const s = SCHRITTE[n - 1];
  if (!s) {
    beenden();
    return;
  }
  standSetzen(n);
  geheZu(s.pfad);
  const t = TEXTE[sprache];
  const i = sprache === 'en' ? 1 : 0;

  if (!karte) {
    karte = document.createElement('div');
    karte.className = 'demo-weg glas';
    karte.dataset.demoNichtUebersetzen = '';
    karte.setAttribute('role', 'dialog');
    karte.setAttribute('aria-modal', 'false');
    karte.dataset.testid = 'demo-weg';
    document.body.append(karte);
  }
  if (!rahmen) {
    rahmen = document.createElement('div');
    rahmen.className = 'demo-weg-rahmen';
    rahmen.setAttribute('aria-hidden', 'true');
    document.body.append(rahmen);
  }

  karte.replaceChildren();
  karte.setAttribute('aria-label', s.titel[i]);
  const kopf = document.createElement('div');
  kopf.className = 'demo-weg-kopf';
  const zahl = document.createElement('span');
  zahl.textContent = `${t.titel} · ${n} ${t.von} ${SCHRITTE.length}`;
  kopf.append(zahl, knopf(t.beenden, 'still', beenden));
  const titel = document.createElement('h2');
  titel.textContent = s.titel[i];
  const text = document.createElement('p');
  text.textContent = s.text[i];
  const punkte = document.createElement('div');
  punkte.className = 'demo-weg-punkte';
  punkte.setAttribute('aria-hidden', 'true');
  SCHRITTE.forEach((_, k) => {
    const p = document.createElement('span');
    if (k === n - 1) p.dataset.an = '';
    punkte.append(p);
  });
  const knoepfe = document.createElement('div');
  knoepfe.className = 'demo-weg-knoepfe';
  if (n > 1) knoepfe.append(knopf(t.zurueck, 'neben', () => zeigen(n - 1)));
  const weiter = knopf(n === SCHRITTE.length ? t.fertig : t.weiter, 'haupt', () => zeigen(n + 1));
  weiter.dataset.testid = 'demo-weg-weiter';
  knoepfe.append(weiter);
  const fuss = document.createElement('div');
  fuss.className = 'demo-weg-fuss';
  fuss.append(punkte, knoepfe);
  karte.append(kopf, titel, text, fuss);
  weiter.focus({ preventScroll: true });

  window.clearInterval(uhr);
  const legen = () => rahmenLegen(s.ziel);
  legen();
  uhr = window.setInterval(legen, 300);
}

/** Der Rahmen um die Stelle, folgt ihr, wenn sie sich bewegt. */
function rahmenLegen(ziel: string): void {
  if (!rahmen) return;
  const el = [...document.querySelectorAll<HTMLElement>(ziel)].find(
    x => !x.closest('[inert]') && x.offsetParent !== null
  );
  if (!el) {
    rahmen.hidden = true;
    return;
  }
  el.scrollIntoView?.({ block: 'nearest' });
  const r = el.getBoundingClientRect();
  const luft = r.width > window.innerWidth * 0.6 ? -4 : 4;
  rahmen.hidden = false;
  rahmen.style.left = `${r.left - luft}px`;
  rahmen.style.top = `${r.top - luft}px`;
  rahmen.style.width = `${r.width + 2 * luft}px`;
  rahmen.style.height = `${r.height + 2 * luft}px`;
}

/** Den Weg vorn beginnen (aus der Kapsel). */
export function wegBeginnen(): void {
  zeigen(1);
}

/** Beim Laden: einen begonnenen Weg fortsetzen, Escape schließt ihn. */
export function wegSetzen(s: Sprache): void {
  sprache = s;
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && karte) beenden();
  });
  const n = stand();
  if (n > 0) window.setTimeout(() => zeigen(n), 600);
}
