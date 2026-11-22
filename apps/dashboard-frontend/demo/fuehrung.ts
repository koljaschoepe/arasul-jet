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
  /**
   * Wo der Hinweis steht: `ecke` unten rechts (Vorgabe seit der zweiten
   * Durchsicht: an der Stelle verdeckte er, was daneben erklärt wird; unten
   * rechts ist in jeder Ansicht der Demo Leere), `stelle` an der Stelle.
   */
  lage?: 'stelle' | 'ecke';
  /** Die Aufschrift von „Weiter", wenn der Knopf etwas tut. */
  knopf?: string;
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
    geschafft: {
      titel: string;
      text: string;
      ansehen: string;
      schliessen: string;
      zuruecksetzen: string;
      website: string;
    };
  }
> = {
  de: {
    beschriftung: 'Geführter Weg durch die Demo',
    von: n => `Schritt ${n} von 5`,
    weiter: 'Weiter',
    fertig: 'Fertig',
    ueberspringen: 'Überspringen',
    geschafft: {
      titel: 'Geschafft',
      text: 'Angebote 1.5.0 ist live. Ab jetzt rechnet die App für alle mit Rabatt, ohne dass jemand etwas installiert.',
      ansehen: 'Angebote ansehen',
      schliessen: 'Schließen',
      zuruecksetzen: 'Von vorn',
      website: 'Zur Website',
    },
    schritte: [
      {
        titel: 'Eine App öffnen',
        text: 'Sie sind Mitarbeiter der Beispielwerk GmbH. Jede Kachel ist eine App, die der Betrieb selbst gebaut hat. Öffnen Sie „Angebote“.',
        ziele: ['[data-testid="uebersicht-app-angebote"]', '[data-testid="leiste-app-angebote"]'],
        weiter: 'angebote',
        knopf: 'Angebote öffnen',
      },
      {
        titel: 'Sagen, was fehlt',
        text: 'Über jeder App steht dieses Symbol. Tippen Sie darauf, markieren Sie eine Stelle und schreiben Sie einen Satz, etwa „Hier fehlt ein Rabatt“. Oder gehen Sie ohne Meldung weiter.',
        ziele: ['[data-testid="rueckmeldung-knopf"]'],
        lage: 'ecke',
      },
      {
        titel: 'Zum Entwickler wechseln',
        text: 'Die Meldung geht an die Person, die bei Ihnen die Apps betreut. Wechseln Sie in ihre Rolle.',
        ziele: ['.demo-band-wahl button[data-rolle="entwickler"]'],
        weiter: 'entwickler',
        knopf: 'Zum Entwickler',
      },
      {
        titel: 'Der Eingang im Cockpit',
        text: 'Hier steht Ihre Meldung, mit Foto und markierter Stelle. Ein KI-Assistent setzt Meldungen in einer neuen Fassung um: eine frühere zum Rabatt liegt schon als Angebote 1.5.0 im Test.',
        ziele: [
          'iframe >> [data-testid="werkstatt-eingang"] tbody tr',
          'iframe >> [data-testid="werkstatt-eingang"] li',
          'iframe >> [data-testid="werkstatt-eingang"]',
        ],
        weiter: 'live',
      },
      {
        titel: 'Von Test nach Live',
        text: 'Schalten Sie die neue Fassung live und bestätigen Sie. Danach rechnet die App Angebote für alle mit Rabatt.',
        knopf: 'Live schalten',
        ziele: [
          'iframe >> [data-testid="werkstatt-live-schalten-angebote"]',
          'iframe >> [data-testid="werkstatt-eingang"]',
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
    geschafft: {
      titel: 'Done',
      text: 'Quotes 1.5.0 is live. From now on the app calculates discounts for everyone, with nothing to install.',
      ansehen: 'View Quotes',
      schliessen: 'Close',
      zuruecksetzen: 'Start over',
      website: 'To the website',
    },
    schritte: [
      {
        titel: 'Open an app',
        text: 'You work at Beispielwerk GmbH. Each tile is an app the company built for itself. Open “Quotes”.',
        ziele: ['[data-testid="uebersicht-app-angebote"]', '[data-testid="leiste-app-angebote"]'],
        weiter: 'angebote',
        knopf: 'Open Quotes',
      },
      {
        titel: 'Say what is missing',
        text: 'Every app carries this icon. Tap it, mark a spot and write one sentence, such as “A discount is missing here”. Or continue without feedback.',
        ziele: ['[data-testid="rueckmeldung-knopf"]'],
        lage: 'ecke',
      },
      {
        titel: 'Switch to developer',
        text: 'The feedback goes to the person who looks after your apps. Switch to their role.',
        ziele: ['.demo-band-wahl button[data-rolle="entwickler"]'],
        weiter: 'entwickler',
        knopf: 'To developer',
      },
      {
        titel: 'The cockpit inbox',
        text: 'Your feedback is here, with a screenshot and the marked spot. An AI assistant turns feedback into a new version: an earlier request for a discount is already in test as Quotes 1.5.0.',
        ziele: [
          'iframe >> [data-testid="werkstatt-eingang"] tbody tr',
          'iframe >> [data-testid="werkstatt-eingang"] li',
          'iframe >> [data-testid="werkstatt-eingang"]',
        ],
        weiter: 'live',
      },
      {
        titel: 'From test to live',
        text: 'Switch the new version live and confirm. Afterwards the Quotes app calculates discounts for everyone.',
        knopf: 'Switch live',
        ziele: [
          'iframe >> [data-testid="werkstatt-live-schalten-angebote"]',
          'iframe >> [data-testid="werkstatt-eingang"]',
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
  /** Die Demo zurücksetzen, wie im Band (das es am Handy dort nicht gibt). */
  zuruecksetzen: () => void;
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
  // Im Abschluss: von vorn und zur Website, die am Handy im Band fehlen.
  const mehr = document.createElement('p');
  mehr.className = 'demo-weg-mehr';
  const vonVorn = document.createElement('button');
  vonVorn.type = 'button';
  vonVorn.textContent = t.geschafft.zuruecksetzen;
  vonVorn.addEventListener('click', () => griffe.zuruecksetzen());
  const website = document.createElement('a');
  website.href = 'https://www.arasul.de';
  website.textContent = t.geschafft.website;
  vonVorn.dataset.trefferSelbst = '';
  website.dataset.trefferSelbst = '';
  mehr.append(vonVorn, website);
  mehr.hidden = true;

  karte.append(zaehler, titel, text, mehr, unten);

  // Der Ring um die Stelle, auf die der Hinweis zeigt.
  const ring = document.createElement('div');
  ring.className = 'demo-weg-ring';
  ring.setAttribute('aria-hidden', 'true');

  document.body.append(ring, karte);

  let schritt = schrittLesen();
  let gezeigt = '';

  /** Schritt 5 ist geschafft, wenn das Cockpit den Ausgang des Schaltens zeigt. */
  let warGeschafft = false;
  const geschafft = () => {
    if (schritt !== 5) return false;
    if (!warGeschafft && stelle('iframe >> [data-testid="werkstatt-schalt-ausgang"]')) {
      warGeschafft = true;
    }
    return warGeschafft;
  };

  /** Ein Dialog, auch im Rahmen einer App, hat Vorrang vor dem Hinweis. */
  function dialogOffen(): boolean {
    const wahl = '[role="dialog"], [role="alertdialog"]';
    if (document.querySelector(wahl)) return true;
    for (const rahmen of Array.from(document.querySelectorAll('iframe'))) {
      try {
        if (rahmen.contentDocument?.querySelector(wahl)) return true;
      } catch {
        /* fremde Herkunft gibt es in der Demo nicht */
      }
    }
    return false;
  }

  function zeigen() {
    if (schritt < 1) {
      karte.hidden = true;
      ring.hidden = true;
      return;
    }
    const s = t.schritte[schritt - 1]!;
    const fertig = geschafft();
    const kennung = `${schritt}${fertig ? '-fertig' : ''}`;
    if (gezeigt !== kennung) {
      gezeigt = kennung;
      zaehler.textContent = t.von(schritt);
      titel.textContent = fertig ? t.geschafft.titel : s.titel;
      text.textContent = fertig ? t.geschafft.text : s.text;
      weiter.textContent = fertig ? t.geschafft.ansehen : (s.knopf ?? t.weiter);
      ueberspringen.textContent = fertig ? t.geschafft.schliessen : t.ueberspringen;
      punkte.querySelectorAll('span').forEach((p, i) => {
        p.dataset.an = String(i < schritt);
      });
      karte.dataset.schritt = String(schritt);
      karte.dataset.geschafft = String(fertig);
      mehr.hidden = !fertig;
    }
    const dialog = dialogOffen();
    karte.hidden = dialog;
    let ort: DOMRect | null = null;
    const ziele = fertig
      ? [
          'iframe >> [data-testid="werkstatt-schalt-ausgang"]',
          'iframe >> [data-testid="werkstatt-eingang"]',
        ]
      : s.ziele;
    for (const z of ziele) {
      ort = stelle(z);
      if (ort) break;
    }
    ring.hidden = !ort || dialog || fertig;
    platzieren(ort, s.lage ?? 'ecke', fertig);
  }

  function platzieren(ort: DOMRect | null, lage: 'stelle' | 'ecke', oben = false) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rand = 12;
    const abstand = 14;
    const breite = Math.min(340, vw - 2 * rand);
    karte.style.width = `${breite}px`;
    const hoehe = karte.offsetHeight || 180;
    const untenFrei = vw < 900 ? 92 : rand + 4;
    if (ort) {
      // Luft zwischen Ring und Inhalt; bei großen Stellen liegt er innen,
      // damit er nicht über den Rand der Fläche ragt.
      const luft = ort.height > 120 ? -2 : 5;
      ring.style.left = `${ort.left - luft}px`;
      ring.style.top = `${ort.top - luft}px`;
      ring.style.width = `${ort.width + 2 * luft}px`;
      ring.style.height = `${ort.height + 2 * luft}px`;
    }
    const setze = (x: number, y: number) => {
      karte.style.left = `${Math.min(Math.max(rand, x), vw - rand - breite)}px`;
      karte.style.top = `${Math.min(Math.max(rand + 40, y), vh - untenFrei - hoehe)}px`;
    };
    // Am Handy steht der Hinweis über der Leiste unten, in der Ecke unten
    // rechts am Rechner; die Stelle zeigt der Ring.
    if (!ort || vw < 640 || lage === 'ecke') {
      let y = vh - untenFrei - hoehe;
      // Liegt die Stelle unter dem Hinweis, rückt er nach oben. Der Abschluss
      // am Handy steht direkt unter der Meldung des Cockpits, sonst verdeckt
      // er dort „Zurück“.
      if (oben && vw < 640 && ort && ort.bottom + 12 + hoehe <= vh - untenFrei) {
        y = ort.bottom + 12;
      } else if (!oben && ort && ort.bottom > y - 8 && ort.top > hoehe + 2 * rand) {
        y = rand + 48;
      }
      const links = vw < 640 ? (vw - breite) / 2 : vw - rand - 8 - breite;
      karte.style.left = `${links}px`;
      karte.style.top = `${Math.max(rand, y)}px`;
      return;
    }
    // Unter der Stelle, sonst darüber, sonst rechts, sonst links: so bleibt
    // der Inhalt daneben (die Kachel nebenan, die Kennzahl) frei.
    const mitte = ort.left + ort.width / 2 - breite / 2;
    const links = Math.max(ort.left, Math.min(mitte, ort.right - breite));
    if (ort.bottom + abstand + hoehe <= vh - untenFrei) setze(links, ort.bottom + abstand);
    else if (ort.top - abstand - hoehe >= rand + 40) setze(links, ort.top - abstand - hoehe);
    else if (ort.right + abstand + breite <= vw - rand)
      setze(ort.right + abstand, ort.top + ort.height / 2 - hoehe / 2);
    else setze(ort.left - abstand - breite, ort.top + ort.height / 2 - hoehe / 2);
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
      if (geschafft()) {
        gehe(0);
        window.location.assign(ANGEBOTE);
      } else {
        imCockpit('werkstatt-live-schalten-angebote');
      }
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
      if (!imCockpit('werkstatt-leiste-live')) {
        imCockpit('werkstatt-leiste-umschalten');
        window.setTimeout(() => imCockpit('werkstatt-leiste-live'), 250);
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
    else if (schritt <= 3 && schritt > 0 && window.location.pathname.startsWith(COCKPIT)) gehe(4);
    else if (schritt === 4 && stelle('iframe >> [data-testid="werkstatt-live-schalten-angebote"]'))
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
