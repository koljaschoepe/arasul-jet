/**
 * Das Band der Demo (J46, M7): sagt, dass hier Beispieldaten stehen, schaltet
 * zwischen Mitarbeiter und Entwickler, zwischen Deutsch und Englisch, setzt
 * zurück und führt zurück auf arasul.de. Reines DOM ohne React: es gehört
 * nicht zum Produkt und soll neben ihm stehen, nicht in ihm.
 *
 * Farben nur aus den Tokens (`theme.css`), Gestalt in `band.css`.
 */
import './band.css';
import type { Rolle, Sprache } from './daten';

const SPRACHE_SCHLUESSEL = 'arasul-demo-sprache';
const COCKPIT = '/workspace/app/entwickler-cockpit';

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
    entwickler: 'Entwickler',
    hilfe: 'So geht’s',
    sprache: 'Sprache',
    zurueck: 'Zur Website',
    zuruecksetzen: 'Demo zurücksetzen',
    hinweis:
      'Alles hier ist erfunden: die Firma, die Apps, die Meldungen. Was Sie eingeben, bleibt in Ihrem Browser und geht an keinen Server.',
    schritte: [
      'Öffnen Sie eine App, zum Beispiel „Angebote“.',
      'Tippen Sie oben rechts in der App auf das Symbol für Rückmeldungen, markieren Sie eine Stelle und schreiben Sie, was fehlt.',
      'Schalten Sie oben auf „Entwickler“. Das Entwickler-Cockpit öffnet sich, Ihre Meldung steht im Eingang.',
      'Unter „Test nach Live“ schalten Sie die neue Fassung der Angebote live. Danach rechnet die App mit Rabatt.',
    ],
    schliessen: 'Schließen',
  },
  en: {
    band: 'Demo with sample data',
    kurz: 'Demo',
    rolle: 'You are',
    mitarbeiter: 'Employee',
    entwickler: 'Developer',
    hilfe: 'How it works',
    sprache: 'Language',
    zurueck: 'To the website',
    zuruecksetzen: 'Reset demo',
    hinweis:
      'Everything here is made up: the company, the apps, the feedback. What you enter stays in your browser and is sent to no server.',
    schritte: [
      'Open an app, for example “Quotes”.',
      'Tap the feedback icon at the top right of the app, mark a spot and write what is missing.',
      'Switch to “Developer” at the top. The developer cockpit opens and your feedback is in the inbox.',
      'Under “Test to live”, switch the new version of Quotes live. Afterwards the app calculates with a discount.',
    ],
    schliessen: 'Close',
  },
} as const;

function knopf(text: string, beiKlick: () => void, gedrueckt?: boolean): HTMLButtonElement {
  const k = document.createElement('button');
  k.type = 'button';
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
  titel.innerHTML = `<span class="demo-band-lang">${t.band}</span><span class="demo-band-kurz">${t.kurz}</span>`;

  let rolle: Rolle = 'mitarbeiter';
  const mitarbeiter = knopf(t.mitarbeiter, () => void rolleSetzen('mitarbeiter'), true);
  const entwickler = knopf(t.entwickler, () => void rolleSetzen('entwickler'), false);
  const rollen = gruppe(t.rolle, mitarbeiter, entwickler);
  async function rolleSetzen(neu: Rolle) {
    if (neu === rolle) return;
    await anDienst({ typ: 'rolle', rolle: neu });
    window.location.assign(neu === 'entwickler' ? COCKPIT : '/workspace');
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
    const offen = !hilfe.hidden;
    hilfe.hidden = offen;
    hilfeKnopf.setAttribute('aria-expanded', String(!offen));
  });
  hilfeKnopf.className = 'demo-band-hilfe';
  hilfeKnopf.setAttribute('aria-expanded', 'false');
  hilfeKnopf.setAttribute('aria-controls', 'demo-hilfe');

  const website = document.createElement('a');
  website.href = 'https://www.arasul.de';
  website.textContent = t.zurueck;
  website.className = 'demo-band-link';

  band.append(titel, rollen, hilfeKnopf, sprachen, website);

  // Die Erklärung des Wegs: zugeklappt, beim ersten Besuch offen.
  const hilfe = document.createElement('div');
  hilfe.id = 'demo-hilfe';
  hilfe.className = 'demo-hilfe';
  hilfe.dataset.demoNichtUebersetzen = '';
  const liste = document.createElement('ol');
  for (const s of t.schritte) {
    const li = document.createElement('li');
    li.textContent = s;
    liste.append(li);
  }
  const hinweis = document.createElement('p');
  hinweis.textContent = t.hinweis;
  const unten = document.createElement('div');
  unten.className = 'demo-hilfe-unten';
  const zuruecksetzen = knopf(t.zuruecksetzen, () => {
    void anDienst({ typ: 'zuruecksetzen' }).then(() => window.location.assign('/workspace'));
  });
  const link = website.cloneNode(true) as HTMLAnchorElement;
  link.className = '';
  const schliessen = knopf(t.schliessen, () => {
    hilfe.hidden = true;
    hilfeKnopf.setAttribute('aria-expanded', 'false');
  });
  unten.append(zuruecksetzen, link, schliessen);
  hilfe.append(liste, hinweis, unten);
  hilfe.hidden = true;
  try {
    if (!window.sessionStorage.getItem('arasul-demo-gesehen')) {
      hilfe.hidden = false;
      hilfeKnopf.setAttribute('aria-expanded', 'true');
      window.sessionStorage.setItem('arasul-demo-gesehen', 'ja');
    }
  } catch {
    /* ohne Speicher bleibt sie zu */
  }

  document.body.prepend(band, hilfe);

  void anDienst({ typ: 'abfrage' }).then(stand => {
    rolle = stand.rolle;
    mitarbeiter.setAttribute('aria-pressed', String(rolle === 'mitarbeiter'));
    entwickler.setAttribute('aria-pressed', String(rolle === 'entwickler'));
  });
}
