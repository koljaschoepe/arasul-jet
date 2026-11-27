/**
 * Der Hinweis auf die Demo (J54, M7): eine ruhige Zeile in der Kapsel oben
 * rechts, kein Band. Darin „Demo", „Kurz zeigen lassen", „Zurücksetzen", die
 * Sprache und „Zur Website". Am Rechner steht alles in der Zeile, darunter
 * (und am Handy) ein Knopf „Demo", der dieselben Punkte als Menü aus Glas
 * aufklappt.
 *
 * Über einer App sitzt die Zeile in der Kapsel des Rahmens, vor Live, Test
 * und Rückmeldung. Wo es keine Kapsel gibt (Startseite, Einstellungen),
 * schwebt sie allein an derselben Stelle. Beide Male hält der Seitenkopf
 * darunter den Platz frei (`--ara-kapsel-platz`), wie es die Bibliothek für
 * die Kapsel vorsieht.
 *
 * Reines DOM ohne React: das gehört nicht zum Produkt und steht neben ihm,
 * nicht in ihm. Farben nur aus den Tokens (`kapsel.css`).
 */
import './kapsel.css';
import type { Sprache } from './daten';

const SPRACHE_SCHLUESSEL = 'arasul-demo-sprache';

/** Deutsch ist Standard, egal was der Browser meldet (J54). */
export function spracheLesen(): Sprache {
  try {
    return window.localStorage.getItem(SPRACHE_SCHLUESSEL) === 'en' ? 'en' : 'de';
  } catch {
    return 'de';
  }
}

/** Eine Nachricht an den Service Worker, mit Antwort. */
export function anDienst(nachricht: {
  typ: string;
  sprache?: Sprache;
}): Promise<{ sprache: Sprache }> {
  return new Promise((gut, schlecht) => {
    const ziel = navigator.serviceWorker.controller;
    if (!ziel) {
      schlecht(new Error('Der Service Worker der Demo steuert diese Seite nicht.'));
      return;
    }
    const kanal = new MessageChannel();
    kanal.port1.onmessage = e => gut(e.data as { sprache: Sprache });
    ziel.postMessage(nachricht, [kanal.port2]);
  });
}

const TEXTE = {
  de: {
    demo: 'Demo',
    satz: 'Kerschner Metallbau ist erfunden. Was Sie ändern, bleibt nur in diesem Browser.',
    zeigen: 'Kurz zeigen lassen',
    zuruecksetzen: 'Zurücksetzen',
    wirklich: 'Wirklich zurücksetzen?',
    sprache: 'Sprache',
    website: 'Zur Website',
    menue: 'Demo: Hinweise und Einstellungen',
  },
  en: {
    demo: 'Demo',
    satz: 'Kerschner Metallbau is made up. What you change stays in this browser only.',
    zeigen: 'Show me around',
    zuruecksetzen: 'Reset',
    wirklich: 'Really reset?',
    sprache: 'Language',
    website: 'To the website',
    menue: 'Demo: notes and settings',
  },
} as const;

export function zuruecksetzen(): void {
  try {
    window.sessionStorage.removeItem('arasul-demo-weg');
    window.localStorage.removeItem('arasul-demo-weg-gesehen');
  } catch {
    /* ohne Speicher nichts zu löschen */
  }
  void anDienst({ typ: 'zuruecksetzen' }).then(() => window.location.assign('/workspace'));
}

function knopf(
  text: string,
  beiKlick: (k: HTMLButtonElement) => void,
  klasse = ''
): HTMLButtonElement {
  const k = document.createElement('button');
  k.type = 'button';
  k.dataset.trefferSelbst = '';
  k.textContent = text;
  if (klasse) k.className = klasse;
  k.addEventListener('click', () => beiKlick(k));
  return k;
}

/** Zurücksetzen fragt einmal nach: der erste Klick ändert die Beschriftung. */
function zuruecksetzKnopf(t: (typeof TEXTE)[Sprache]): HTMLButtonElement {
  let uhr: number | undefined;
  return knopf(t.zuruecksetzen, k => {
    if (k.dataset.frage === 'ja') {
      zuruecksetzen();
      return;
    }
    k.dataset.frage = 'ja';
    k.textContent = t.wirklich;
    window.clearTimeout(uhr);
    uhr = window.setTimeout(() => {
      delete k.dataset.frage;
      k.textContent = t.zuruecksetzen;
    }, 4000);
  });
}

function sprachWahl(sprache: Sprache, t: (typeof TEXTE)[Sprache]): HTMLElement {
  const g = document.createElement('div');
  g.className = 'demo-sprache';
  g.setAttribute('role', 'group');
  g.setAttribute('aria-label', t.sprache);
  for (const s of ['de', 'en'] as const) {
    const k = knopf(s.toUpperCase(), () => {
      if (s === sprache) return;
      try {
        window.localStorage.setItem(SPRACHE_SCHLUESSEL, s);
      } catch {
        /* dann gilt sie nur bis zum Neuladen nicht */
      }
      window.location.reload();
    });
    k.setAttribute('aria-pressed', String(s === sprache));
    k.lang = s;
    k.setAttribute('aria-label', s === 'de' ? 'Deutsch' : 'English');
    g.append(k);
  }
  return g;
}

function websiteLink(t: (typeof TEXTE)[Sprache]): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = 'https://www.arasul.de';
  a.textContent = t.website;
  a.dataset.trefferSelbst = '';
  return a;
}

/**
 * Setzt den Eintrag „Demo“ ins Dock und das schwebende Glas-X (J60). `zeigen`
 * beginnt den geführten Weg.
 */
export function kapselSetzen(sprache: Sprache, zeigen: () => void): void {
  const t = TEXTE[sprache];
  document.body.dataset.demo = 'an';

  // Das Menü: dieselben Punkte, aufgeklappt aus dem Eintrag „Demo“ im Dock.
  const menue = document.createElement('div');
  menue.className = 'demo-menue glas';
  menue.hidden = true;
  menue.dataset.demoNichtUebersetzen = '';
  menue.dataset.testid = 'demo-menue';
  const satz = document.createElement('p');
  satz.textContent = t.satz;
  menue.append(
    satz,
    knopf(t.zeigen, () => {
      menueSchalten(false);
      zeigen();
    }),
    zuruecksetzKnopf(t),
    sprachWahl(sprache, t),
    websiteLink(t)
  );
  let dockKnopf: HTMLButtonElement | null = null;
  function menueSchalten(offen = menue.hidden) {
    menue.hidden = !offen;
    dockKnopf?.setAttribute('aria-expanded', String(offen));
    if (offen && dockKnopf) {
      const r = dockKnopf.getBoundingClientRect();
      menue.style.bottom = `${window.innerHeight - r.top + 12}px`;
      menue.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - 150, window.innerWidth - 308))}px`;
    }
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !menue.hidden) menueSchalten(false);
  });
  document.addEventListener('pointerdown', e => {
    if (
      !menue.hidden &&
      !menue.contains(e.target as Node) &&
      !(dockKnopf && dockKnopf.contains(e.target as Node))
    ) {
      menueSchalten(false);
    }
  });
  document.body.append(menue);

  // Das Glas-X: zurück zur Website. Escape tut dasselbe, wenn nichts anderes offen ist.
  const x = document.createElement('a');
  x.href = 'https://www.arasul.de';
  x.className = 'demo-x glas';
  x.dataset.testid = 'demo-x';
  x.dataset.demoNichtUebersetzen = '';
  x.dataset.trefferSelbst = '';
  x.setAttribute('aria-label', t.website);
  x.title = t.website;
  x.innerHTML =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  document.body.append(x);
  // Im Erfassen, damit ein Popup oder der Weg, den dieselbe Taste gleich
  // schließt, noch im Dokument steht, wenn hier geprüft wird.
  document.addEventListener(
    'keydown',
    e => {
      if (e.key !== 'Escape' || e.defaultPrevented || !menue.hidden) return;
      if (document.querySelector('[role="dialog"], [data-state="open"], [data-testid="demo-weg"]'))
        return;
      window.location.assign('https://www.arasul.de');
    },
    true
  );

  // Der Eintrag „Demo“ im Dock der Shell. Das Dock gehört React; der Eintrag
  // hängt hinten daran und kommt wieder, wenn das Dock neu gebaut wird.
  const dockSetzen = () => {
    const dock = document.querySelector<HTMLElement>('[data-testid="schale-dock"]');
    if (!dock || dock.querySelector('[data-testid="dock-demo"]')) return;
    const k = document.createElement('button');
    k.type = 'button';
    k.className = 'ara-dock__eintrag';
    k.dataset.testid = 'dock-demo';
    k.dataset.demoNichtUebersetzen = '';
    k.setAttribute('aria-haspopup', 'true');
    k.setAttribute('aria-expanded', 'false');
    k.innerHTML = `<span class="demo-punkt" aria-hidden="true"></span><span class="ara-dock__wort">${t.demo}</span>`;
    k.addEventListener('click', () => menueSchalten());
    dock.append(k);
    dockKnopf = k;
  };
  new MutationObserver(dockSetzen).observe(document.body, { childList: true, subtree: true });
  dockSetzen();
}
