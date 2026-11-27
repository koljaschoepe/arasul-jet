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
 * Setzt die Zeile und hält sie an ihrem Platz: in der sichtbaren Kapsel einer
 * App, sonst schwebend. `zeigen` beginnt den geführten Weg.
 */
export function kapselSetzen(sprache: Sprache, zeigen: () => void): void {
  const t = TEXTE[sprache];
  document.body.dataset.demo = 'an';

  const zeile = document.createElement('div');
  zeile.className = 'demo-kapsel';
  zeile.dataset.demoNichtUebersetzen = '';
  zeile.dataset.testid = 'demo-kapsel';
  zeile.setAttribute('role', 'region');
  zeile.setAttribute('aria-label', t.menue);

  // Breit: alles in der Zeile.
  const breit = document.createElement('div');
  breit.className = 'demo-kapsel-breit';
  const marke = document.createElement('span');
  marke.className = 'demo-kapsel-marke';
  marke.title = t.satz;
  marke.innerHTML = `<span class="demo-punkt" aria-hidden="true"></span>${t.demo}`;
  breit.append(
    marke,
    knopf(t.zeigen, () => zeigen(), 'demo-zeigen'),
    zuruecksetzKnopf(t),
    sprachWahl(sprache, t),
    websiteLink(t)
  );

  // Schmal: ein Knopf „Demo", dahinter das Menü.
  const schmal = document.createElement('div');
  schmal.className = 'demo-kapsel-schmal';
  const auf = knopf(t.demo, () => menueSchalten(), 'demo-kapsel-auf');
  auf.innerHTML = `<span class="demo-punkt" aria-hidden="true"></span>${t.demo}`;
  auf.setAttribute('aria-expanded', 'false');
  auf.setAttribute('aria-haspopup', 'true');
  const menue = document.createElement('div');
  menue.className = 'demo-menue glas';
  menue.hidden = true;
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
  schmal.append(auf);
  function menueSchalten(offen = menue.hidden) {
    menue.hidden = !offen;
    auf.setAttribute('aria-expanded', String(offen));
    if (offen) {
      const r = auf.getBoundingClientRect();
      menue.style.top = `${r.bottom + 8}px`;
      menue.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
    }
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !menue.hidden) menueSchalten(false);
  });
  document.addEventListener('pointerdown', e => {
    if (!menue.hidden && !menue.contains(e.target as Node) && !auf.contains(e.target as Node)) {
      menueSchalten(false);
    }
  });

  zeile.append(breit, schmal);
  document.body.append(menue);

  let zuletzt = '';
  const platzieren = () => {
    const kapsel = [
      ...document.querySelectorAll<HTMLElement>('[data-testid="rahmen-kapsel"]'),
    ].find(k => !k.closest('[inert]') && k.offsetParent !== null);
    // Am Handy ist in der Leiste kein Platz: dort schwebt die Zeile allein.
    if (kapsel && window.innerWidth >= 900) {
      if (zeile.parentElement !== kapsel) {
        kapsel.prepend(zeile);
        zeile.dataset.ort = 'kapsel';
        zeile.classList.remove('glas');
      }
    } else {
      if (zeile.parentElement !== document.body) document.body.append(zeile);
      zeile.dataset.ort = 'frei';
      zeile.classList.add('glas');
    }
    platzHalten(kapsel && window.innerWidth >= 900 ? kapsel : null);
    const stand = `${zeile.dataset.ort}:${zeile.offsetWidth}`;
    if (stand !== zuletzt) {
      zuletzt = stand;
      if (!menue.hidden) menueSchalten(true);
    }
  };

  /**
   * Der Platz, den der Seitenkopf rechts freihält. Schwebt die Zeile allein,
   * nennt die Demo ihn der Shell; sitzt sie in der Kapsel einer App, legt sie
   * ihre Breite auf den Wert, den der Rahmen der App genannt hat.
   */
  function platzHalten(kapsel: HTMLElement | null) {
    const breite = Math.ceil(zeile.offsetWidth) + 24;
    const wurzel = document.documentElement;
    if (!kapsel) {
      wurzel.style.setProperty('--ara-kapsel-platz', `${breite}px`);
      return;
    }
    wurzel.style.removeProperty('--ara-kapsel-platz');
    const rahmen = kapsel.parentElement?.querySelector('iframe');
    const doc = (() => {
      try {
        return rahmen?.contentDocument ?? null;
      } catch {
        return null;
      }
    })();
    if (!doc?.documentElement) return;
    const html = doc.documentElement;
    const jetzt = parseFloat(html.style.getPropertyValue('--ara-kapsel-platz')) || 0;
    const gesetzt = Number(html.dataset.demoPlatz ?? NaN);
    // Hat der Rahmen den Wert neu gesetzt, ist er die neue Grundlage.
    const grund = jetzt === gesetzt ? Number(html.dataset.demoGrund ?? jetzt) : jetzt;
    const ziel = grund + zeile.offsetWidth + 12;
    if (jetzt !== ziel) {
      html.dataset.demoGrund = String(grund);
      html.dataset.demoPlatz = String(ziel);
      html.style.setProperty('--ara-kapsel-platz', `${ziel}px`);
      // Der Seitenkopf misst beim Ändern der Größe nach.
      rahmen?.contentWindow?.dispatchEvent(new Event('resize'));
    }
  }

  let geplant = false;
  const spaeter = () => {
    if (geplant) return;
    geplant = true;
    requestAnimationFrame(() => {
      geplant = false;
      platzieren();
    });
  };
  new MutationObserver(spaeter).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['inert', 'class', 'style'],
  });
  window.addEventListener('resize', spaeter);
  // Ein App-Rahmen setzt seinen Platz beim Laden: gleich danach messen, und
  // in kurzen Abständen, falls er ihn später noch einmal setzt (Theme).
  document.addEventListener(
    'load',
    e => {
      if (e.target instanceof HTMLIFrameElement) {
        window.setTimeout(platzieren, 0);
        window.setTimeout(platzieren, 120);
      }
    },
    true
  );
  window.setInterval(platzieren, 500);
  platzieren();
}
