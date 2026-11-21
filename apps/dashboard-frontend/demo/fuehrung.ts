/**
 * Der geführte Weg der Demo (J51, M7, Karte palette-symbol-und-demo): fünf
 * Schritte, jeder mit einem kurzen Hinweis an der Stelle, um die es geht, und
 * einem sichtbaren „Weiter". „Überspringen" beendet ihn jederzeit, „So geht’s"
 * im Band fängt ihn neu an.
 *
 *   1  App öffnen               Kachel „Angebote" auf der Startseite
 *   2  Rückmeldung              das Icon in der Kapsel über der App
 *   3  Wechsel zum Entwickler   der Schalter im Band
 *   4  Eingang im Cockpit       der Eingang im Entwickler-Cockpit
 *   5  Test nach Live           „Live schalten" bei Angebote 1.5.0
 *
 * Wer selbst klickt, kommt ohne „Weiter" voran; wer nur „Weiter" klickt,
 * sieht den ganzen Weg trotzdem: „Weiter" tut, was der Schritt zeigt (App
 * öffnen, Rolle wechseln, zu „Test nach Live" gehen), nur die Rückmeldung
 * schreibt der Besucher selbst.
 *
 * Reines DOM wie das Band: die Demo steht neben dem Produkt, nicht in ihm.
 * Der Stand liegt in `sessionStorage`, weil der Rollenwechsel die Seite neu
 * lädt. Der Hinweis sucht seine Stelle alle 300 ms neu, auch in den iframes
 * (dieselbe Herkunft): die Shell lädt nach, eine App ebenso, und am Handy
 * liegt dieselbe Stelle woanders.
 */
import type { Sprache } from './daten';

const SCHLUESSEL = 'arasul-demo-weg';
const COCKPIT = '/workspace/app/entwickler-cockpit';
const ANGEBOTE = '/workspace/app/angebote';

/** 1 bis 5 ist ein Schritt, 0 heißt aus (übersprungen oder fertig). */
export function schrittLesen(): number {
  try {
    const s = window.sessionStorage.getItem(SCHLUESSEL);
    if (s === null) return 1;
    const n = Number(s);
    return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 1;
  } catch {
    return 0;
  }
}

export function schrittSetzen(n: number): void {
  try {
    window.sessionStorage.setItem(SCHLUESSEL, String(n));
  } catch {
    /* ohne Speicher gilt der Schritt bis zum Neuladen */
  }
}

interface Schritt {
  titel: string;
  text: string;
  /** Die Stellen, an denen der Hinweis steht; die erste sichtbare gilt. */
  ziele: string[];
  /** Was „Weiter" tut, bevor der nächste Schritt kommt. */
  weiter?: 'angebote' | 'entwickler' | 'live';
}

const TEXTE: Record<
  Sprache,
  {
    schritte: Schritt[];
    von: (n: number) => string;
    weiter: string;
    fertig: string;
    ueberspringen: string;
    beschriftung: string;
  }
> = {
  de: {
    beschriftung: 'Geführter Weg durch die Demo',
    von: n => `Schritt ${n} von 5`,
    weiter: 'Weiter',
    fertig: 'Fertig',
    ueberspringen: 'Überspringen',
    schritte: [
      {
        titel: 'Eine App öffnen',
        text: 'Sie sind Mitarbeiter der Beispielwerk GmbH. Jede Kachel ist eine App, die der Betrieb selbst gebaut hat. Öffnen Sie „Angebote“.',
        ziele: ['[data-testid="uebersicht-app-angebote"]', '[data-testid="leiste-app-angebote"]'],
        weiter: 'angebote',
      },
      {
        titel: 'Sagen, was fehlt',
        text: 'Über jeder App steht dieses Symbol. Markieren Sie eine Stelle und schreiben Sie einen Satz, etwa „Hier fehlt ein Rabatt“.',
        ziele: ['[data-testid="rueckmeldung-knopf"]'],
      },
      {
        titel: 'Zum Entwickler wechseln',
        text: 'Die Meldung geht an die Person, die bei Ihnen die Apps betreut. Wechseln Sie in ihre Rolle.',
        ziele: ['.demo-band-wahl button[data-rolle="entwickler"]'],
        weiter: 'entwickler',
      },
      {
        titel: 'Der Eingang im Cockpit',
        text: 'Hier kommt jede Rückmeldung an, mit Foto und markierter Stelle. Ein KI-Assistent setzt sie in einer neuen Fassung um.',
        ziele: ['iframe >> [data-testid="cockpit-eingang"]'],
        weiter: 'live',
      },
      {
        titel: 'Von Test nach Live',
        text: 'Angebote 1.5.0 rechnet mit Rabatt und liegt im Test. Ein Klick schaltet die Fassung für alle live.',
        ziele: [
          'iframe >> [data-testid="cockpit-live-schalten-angebote"]',
          'iframe >> [data-testid="cockpit-eingang"]',
        ],
      },
    ],
  },
  en: {
    beschriftung: 'Guided tour of the demo',
    von: n => `Step ${n} of 5`,
    weiter: 'Next',
    fertig: 'Done',
    ueberspringen: 'Skip',
    schritte: [
      {
        titel: 'Open an app',
        text: 'You work at Beispielwerk GmbH. Each tile is an app the company built for itself. Open “Quotes”.',
        ziele: ['[data-testid="uebersicht-app-angebote"]', '[data-testid="leiste-app-angebote"]'],
        weiter: 'angebote',
      },
      {
        titel: 'Say what is missing',
        text: 'Every app carries this icon. Mark a spot and write one sentence, such as “A discount is missing here”.',
        ziele: ['[data-testid="rueckmeldung-knopf"]'],
      },
      {
        titel: 'Switch to developer',
        text: 'The feedback goes to the person who looks after your apps. Switch to their role.',
        ziele: ['.demo-band-wahl button[data-rolle="entwickler"]'],
        weiter: 'entwickler',
      },
      {
        titel: 'The cockpit inbox',
        text: 'Every piece of feedback arrives here, with a screenshot and the marked spot. An AI assistant turns it into a new version.',
        ziele: ['iframe >> [data-testid="cockpit-eingang"]'],
        weiter: 'live',
      },
      {
        titel: 'From test to live',
        text: 'Quotes 1.5.0 calculates discounts and is in test. One click switches the version live for everyone.',
        ziele: [
          'iframe >> [data-testid="cockpit-live-schalten-angebote"]',
          'iframe >> [data-testid="cockpit-eingang"]',
        ],
      },
    ],
  },
};

/** Die Stelle eines Ziels im Fenster, auch in einem iframe; sonst null. */
function stelle(ziel: string): DOMRect | null {
  const sichtbar = (r: DOMRect) => r.width > 0 && r.height > 0;
  if (!ziel.startsWith('iframe >> ')) {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(ziel))) {
      const r = el.getBoundingClientRect();
      if (sichtbar(r) && !el.closest('[inert], .invisible')) return r;
    }
    return null;
  }
  const innen = ziel.slice('iframe >> '.length);
  for (const rahmen of Array.from(document.querySelectorAll('iframe'))) {
    const außen = rahmen.getBoundingClientRect();
    if (!sichtbar(außen) || rahmen.closest('[inert], .invisible')) continue;
    let el: Element | null = null;
    try {
      el = rahmen.contentDocument?.querySelector(innen) ?? null;
    } catch {
      continue;
    }
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (!sichtbar(r)) continue;
    // Nur der Teil, der im Rahmen zu sehen ist.
    const oben = Math.max(außen.top, außen.top + r.top);
    const unten = Math.min(außen.bottom, außen.top + r.bottom);
    if (unten - oben < 8) continue;
    return new DOMRect(außen.left + r.left, oben, r.width, unten - oben);
  }
  return null;
}

/** Ein Element im Cockpit anklicken, wenn es da ist. */
function imCockpit(kennung: string): boolean {
  for (const rahmen of Array.from(document.querySelectorAll('iframe'))) {
    try {
      const el = rahmen.contentDocument?.querySelector<HTMLElement>(`[data-testid="${kennung}"]`);
      if (el && el.getBoundingClientRect().width > 0) {
        el.click();
        return true;
      }
    } catch {
      /* fremde Herkunft gibt es in der Demo nicht */
    }
  }
  return false;
}

export interface WegHandgriffe {
  /** Die Rolle wechseln, wie der Schalter im Band. */
  zumEntwickler: () => Promise<void>;
}

export function wegSetzen(sprache: Sprache, griffe: WegHandgriffe): void {
  const t = TEXTE[sprache];

  const karte = document.createElement('section');
  karte.className = 'demo-weg';
  karte.setAttribute('aria-label', t.beschriftung);
  karte.setAttribute('aria-live', 'polite');
  karte.dataset.demoNichtUebersetzen = '';
  karte.dataset.testid = 'demo-weg';

  const zaehler = document.createElement('p');
  zaehler.className = 'demo-weg-zaehler';
  const titel = document.createElement('h2');
  titel.className = 'demo-weg-titel';
  const text = document.createElement('p');
  text.className = 'demo-weg-text';
  const punkte = document.createElement('div');
  punkte.className = 'demo-weg-punkte';
  punkte.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 5; i += 1) punkte.append(document.createElement('span'));

  const ueberspringen = document.createElement('button');
  ueberspringen.type = 'button';
  ueberspringen.className = 'demo-weg-leise';
  ueberspringen.textContent = t.ueberspringen;
  ueberspringen.dataset.testid = 'demo-weg-ueberspringen';

  const weiter = document.createElement('button');
  weiter.type = 'button';
  weiter.className = 'demo-weg-weiter';
  weiter.dataset.testid = 'demo-weg-weiter';

  const unten = document.createElement('div');
  unten.className = 'demo-weg-unten';
  unten.append(punkte, ueberspringen, weiter);
  karte.append(zaehler, titel, text, unten);

  // Der Ring um die Stelle, auf die der Hinweis zeigt.
  const ring = document.createElement('div');
  ring.className = 'demo-weg-ring';
  ring.setAttribute('aria-hidden', 'true');

  document.body.append(ring, karte);

  let schritt = schrittLesen();
  let gezeigt = -1;

  function zeigen() {
    if (schritt < 1) {
      karte.hidden = true;
      ring.hidden = true;
      return;
    }
    const s = t.schritte[schritt - 1]!;
    if (gezeigt !== schritt) {
      gezeigt = schritt;
      zaehler.textContent = t.von(schritt);
      titel.textContent = s.titel;
      text.textContent = s.text;
      weiter.textContent = schritt === 5 ? t.fertig : t.weiter;
      punkte.querySelectorAll('span').forEach((p, i) => {
        p.dataset.an = String(i < schritt);
      });
      karte.dataset.schritt = String(schritt);
    }
    // Ein offener Dialog (die Rückmeldung) hat Vorrang: der Hinweis tritt zurück.
    const dialog = document.querySelector('[role="dialog"], [role="alertdialog"]');
    karte.hidden = !!dialog;
    let ort: DOMRect | null = null;
    for (const z of s.ziele) {
      ort = stelle(z);
      if (ort) break;
    }
    ring.hidden = !ort || !!dialog;
    platzieren(ort);
  }

  function platzieren(ort: DOMRect | null) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rand = 12;
    const breite = Math.min(340, vw - 2 * rand);
    karte.style.width = `${breite}px`;
    const hoehe = karte.offsetHeight || 180;
    if (ort) {
      ring.style.left = `${ort.left - 4}px`;
      ring.style.top = `${ort.top - 4}px`;
      ring.style.width = `${ort.width + 8}px`;
      ring.style.height = `${ort.height + 8}px`;
    }
    // Am Handy steht der Hinweis immer über der Leiste unten; die Stelle
    // zeigt der Ring.
    if (!ort || vw < 640) {
      const untenFrei = vw < 900 ? 92 : rand;
      let oben = vh - untenFrei - hoehe;
      // Liegt die Stelle unter dem Hinweis, rückt er nach oben.
      if (ort && ort.bottom > oben - 8 && ort.top > hoehe + 2 * rand) oben = rand + 48;
      karte.style.left = `${(vw - breite) / 2}px`;
      karte.style.top = `${Math.max(rand, oben)}px`;
      return;
    }
    // Daneben: rechts, sonst links, sonst darunter, sonst darüber.
    let x: number;
    let y: number;
    if (ort.right + 16 + breite <= vw - rand) {
      x = ort.right + 16;
      y = ort.top + ort.height / 2 - hoehe / 2;
    } else if (ort.left - 16 - breite >= rand) {
      x = ort.left - 16 - breite;
      y = ort.top + ort.height / 2 - hoehe / 2;
    } else if (ort.bottom + 16 + hoehe <= vh - rand) {
      x = ort.left + ort.width / 2 - breite / 2;
      y = ort.bottom + 16;
    } else {
      x = ort.left + ort.width / 2 - breite / 2;
      y = ort.top - 16 - hoehe;
    }
    karte.style.left = `${Math.min(Math.max(rand, x), vw - rand - breite)}px`;
    karte.style.top = `${Math.min(Math.max(rand + 40, y), vh - rand - hoehe)}px`;
  }

  function gehe(n: number) {
    schritt = n;
    schrittSetzen(n);
    zeigen();
  }

  ueberspringen.addEventListener('click', () => gehe(0));
  weiter.addEventListener('click', () => {
    const s = t.schritte[schritt - 1];
    if (!s) return;
    if (schritt === 5) {
      gehe(0);
      return;
    }
    if (s.weiter === 'angebote' && !window.location.pathname.startsWith(ANGEBOTE)) {
      gehe(schritt + 1);
      const kachel = document.querySelector<HTMLElement>(
        '[data-testid="uebersicht-app-angebote"], [data-testid="leiste-app-angebote"]'
      );
      if (kachel) kachel.click();
      else window.location.assign(ANGEBOTE);
      return;
    }
    if (s.weiter === 'entwickler') {
      gehe(schritt + 1);
      void griffe.zumEntwickler();
      return;
    }
    if (s.weiter === 'live') {
      gehe(schritt + 1);
      if (!imCockpit('cockpit-leiste-live')) {
        imCockpit('cockpit-leiste-umschalten');
        window.setTimeout(() => imCockpit('cockpit-leiste-live'), 250);
      }
      return;
    }
    gehe(schritt + 1);
  });
  window.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && schritt > 0 && !document.querySelector('[role="dialog"]')) {
      gehe(0);
    }
  });

  // Wer selbst klickt, kommt auch voran.
  function vonSelbst() {
    if (schritt === 1 && window.location.pathname.startsWith(ANGEBOTE)) gehe(2);
    else if (schritt === 2 && document.querySelector('[data-testid="rueckmeldung-bestaetigung"]'))
      gehe(3);
    else if (schritt <= 3 && schritt > 0 && window.location.pathname.startsWith(COCKPIT))
      gehe(4);
    else if (schritt === 4 && stelle('iframe >> [data-testid="cockpit-live-schalten-angebote"]'))
      gehe(5);
  }

  // Die Bestätigung der Rückmeldung kann kürzer stehen als ein Takt.
  new MutationObserver(() => {
    if (schritt === 2 && document.querySelector('[data-testid="rueckmeldung-bestaetigung"]')) {
      gehe(3);
    }
  }).observe(document.body, { childList: true, subtree: true });

  zeigen();
  window.setInterval(() => {
    vonSelbst();
    zeigen();
  }, 300);
  window.addEventListener('resize', zeigen);
}
