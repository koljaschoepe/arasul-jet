/**
 * Das Band der Demo (J46, J51, M7): sagt, dass hier Beispieldaten stehen,
 * schaltet zwischen zwei Menschen (Mitarbeiter und App-Betreuung, dieselbe
 * Art Konto, die zweite mit dem Recht in der Werkstatt), zwischen Deutsch und
 * Englisch, beginnt den geführten Weg neu, setzt zurück und führt zurück auf
 * arasul.de. Reines DOM ohne React: es gehört
 * nicht zum Produkt und soll neben ihm stehen, nicht in ihm.
 *
 * Farben nur aus den Tokens (`theme.css`), Gestalt in `band.css`.
 */
import './band.css';
import type { Rolle, Sprache } from './daten';
import { schrittSetzen, wegSetzen } from './fuehrung';

const SPRACHE_SCHLUESSEL = 'arasul-demo-sprache';
const WERKSTATT = '/workspace/app/werkstatt';

export function spracheLesen(): Sprache {
  try {
    const s = window.localStorage.getItem(SPRACHE_SCHLUESSEL);
    if (s === 'de' || s === 'en') return s;
  } catch {
    /* ohne Speicher gilt die Sprache des Browsers */
  }
  return navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en';
}

/** Eine Nachricht an den Service Worker, mit Antwort. */
export function anDienst(nachricht: {
  typ: string;
  rolle?: Rolle;
  sprache?: Sprache;
}): Promise<{ rolle: Rolle; sprache: Sprache }> {
  return new Promise((gut, schlecht) => {
    const ziel = navigator.serviceWorker.controller;
    if (!ziel) {
      schlecht(new Error('Der Service Worker der Demo steuert diese Seite nicht.'));
      return;
    }
    const kanal = new MessageChannel();
    kanal.port1.onmessage = e => gut(e.data as { rolle: Rolle; sprache: Sprache });
    ziel.postMessage(nachricht, [kanal.port2]);
  });
}

const TEXTE = {
  de: {
    band: 'Demo mit Beispieldaten',
    kurz: 'Demo',
    rolle: 'Sie sind',
    mitarbeiter: 'Mitarbeiter',
    entwickler: 'App-Betreuung',
    hilfe: 'So geht’s',
    hilfeTitel: 'Den geführten Weg von vorn beginnen',
    sprache: 'Sprache',
    zurueck: 'Zur Website',
    zuruecksetzen: 'Zurücksetzen',
    zuruecksetzenTitel:
      'Alles hier ist erfunden. Was Sie eingeben, bleibt in Ihrem Browser; Zurücksetzen löscht es.',
  },
  en: {
    band: 'Demo with sample data',
    kurz: 'Demo',
    rolle: 'You are',
    mitarbeiter: 'Employee',
    entwickler: 'App support',
    hilfe: 'How it works',
    hilfeTitel: 'Start the guided tour again',
    sprache: 'Language',
    zurueck: 'To the website',
    zuruecksetzen: 'Reset',
    zuruecksetzenTitel:
      'Everything here is made up. What you enter stays in your browser; reset deletes it.',
  },
} as const;

function knopf(text: string, beiKlick: () => void, gedrueckt?: boolean): HTMLButtonElement {
  const k = document.createElement('button');
  k.type = 'button';
  // Die Trefferfläche legt `band.css` selbst; die 44 px der Shell sprengten
  // die Höhe des Bands und schnitten die Knöpfe oben ab.
  k.dataset.trefferSelbst = '';
  k.textContent = text;
  k.addEventListener('click', beiKlick);
  if (gedrueckt !== undefined) k.setAttribute('aria-pressed', String(gedrueckt));
  return k;
}

function gruppe(beschriftung: string, ...knoepfe: HTMLElement[]): HTMLElement {
  const g = document.createElement('div');
  g.className = 'demo-band-wahl';
  g.setAttribute('role', 'group');
  g.setAttribute('aria-label', beschriftung);
  g.append(...knoepfe);
  return g;
}

/**
 * Das Band liegt seit J51 hell auf hell (dunkel auf dunkel): eine Zeile in
 * der Fläche des Produkts mit feiner Linie darunter, kein schwarzer Balken.
 * Darunter setzt es den geführten Weg (`fuehrung.ts`); „So geht’s" fängt ihn
 * von vorn an.
 */
export function bandSetzen(sprache: Sprache): void {
  const t = TEXTE[sprache];
  document.body.dataset.demo = 'an';

  const band = document.createElement('div');
  band.className = 'demo-band';
  band.setAttribute('role', 'region');
  band.setAttribute('aria-label', t.band);
  band.dataset.demoNichtUebersetzen = '';

  const titel = document.createElement('span');
  titel.className = 'demo-band-titel';
  titel.innerHTML = `<span class="demo-band-punkt" aria-hidden="true"></span><span class="demo-band-lang">${t.band}</span><span class="demo-band-kurz">${t.kurz}</span>`;

  let rolle: Rolle = 'mitarbeiter';
  const mitarbeiter = knopf(t.mitarbeiter, () => void rolleSetzen('mitarbeiter'), true);
  mitarbeiter.dataset.rolle = 'mitarbeiter';
  const entwickler = knopf(t.entwickler, () => void rolleSetzen('entwickler'), false);
  entwickler.dataset.rolle = 'entwickler';
  const rollen = gruppe(t.rolle, mitarbeiter, entwickler);
  async function rolleSetzen(neu: Rolle) {
    if (neu === rolle) return;
    await anDienst({ typ: 'rolle', rolle: neu });
    window.location.assign(neu === 'entwickler' ? WERKSTATT : '/workspace');
  }

  const sprachen = gruppe(
    t.sprache,
    knopf('DE', () => spracheSetzen('de'), sprache === 'de'),
    knopf('EN', () => spracheSetzen('en'), sprache === 'en')
  );
  function spracheSetzen(neu: Sprache) {
    if (neu === sprache) return;
    try {
      window.localStorage.setItem(SPRACHE_SCHLUESSEL, neu);
    } catch {
      /* dann gilt sie nur bis zum Neuladen nicht */
    }
    window.location.reload();
  }

  const hilfeKnopf = knopf(t.hilfe, () => {
    schrittSetzen(1);
    void anDienst({ typ: 'rolle', rolle: 'mitarbeiter' }).then(() =>
      window.location.assign('/workspace')
    );
  });
  hilfeKnopf.className = 'demo-band-knopf demo-band-hilfe';
  hilfeKnopf.title = t.hilfeTitel;

  const zuruecksetzen = knopf(t.zuruecksetzen, () => {
    schrittSetzen(1);
    void anDienst({ typ: 'zuruecksetzen' }).then(() => window.location.assign('/workspace'));
  });
  zuruecksetzen.className = 'demo-band-knopf demo-band-zuruecksetzen';
  zuruecksetzen.title = t.zuruecksetzenTitel;

  const website = document.createElement('a');
  website.href = 'https://www.arasul.de';
  website.textContent = t.zurueck;
  website.className = 'demo-band-link';
  website.dataset.trefferSelbst = '';

  band.append(titel, rollen, hilfeKnopf, zuruecksetzen, sprachen, website);
  document.body.prepend(band);

  wegSetzen(sprache, {
    zumEntwickler: () => rolleSetzen('entwickler'),
    zuruecksetzen: () => {
      schrittSetzen(1);
      void anDienst({ typ: 'zuruecksetzen' }).then(() => window.location.assign('/workspace'));
    },
  });

  void anDienst({ typ: 'abfrage' }).then(stand => {
    rolle = stand.rolle;
    mitarbeiter.setAttribute('aria-pressed', String(rolle === 'mitarbeiter'));
    entwickler.setAttribute('aria-pressed', String(rolle === 'entwickler'));
  });
}
