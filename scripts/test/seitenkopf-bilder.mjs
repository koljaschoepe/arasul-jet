/**
 * Bilder und Messung der Karte bausteine-seitenkopf-und-kompakt (J50, M7,
 * 20.11.2026).
 *
 * Das Innere der Fläche nach dem Entwurf: jede Seite beginnt mit dem
 * Seitenkopf (Titel, ein Satz, rechts eine Werkzeugleiste aus kleinen
 * Icon-Buttons, der Knopf der Seitenleiste darin), ohne die Zeile mit einem
 * einzelnen Icon und ohne Trennlinie; Tabellen kompakt und deckend; die
 * Startseite zeigt jede App einmal.
 *
 * Fotografiert werden Start, das Cockpit (Eingang und Apps), die Verwaltung
 * und die Einstellungen, je hell und dunkel, bei 1440 und 390 px. Das Theme
 * setzt das Skript über `PUT /api/darstellung` und stellt am Ende das
 * vorherige wieder her. Es schreibt sonst nichts, Freigaben fasst es nicht an.
 *
 * Mit `ARASUL_STAND=nachher` misst es zusätzlich, was die Karte verlangt
 * (siehe `pruefe(...)` unten). Konto nur aus der Umgebung, nie `admin`:
 *
 *   ARASUL_URL=https://100.121.244.80 ARASUL_STAND=vorher \
 *   ARASUL_PLAYWRIGHT=<Ordner mit node_modules/playwright> \
 *   ARASUL_ADMIN_PW="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
 *     node scripts/test/seitenkopf-bilder.mjs
 *
 * Bilder unter docs/plans/audits/2026-11-20-seitenkopf/<stand>/. Rückgabe
 * 0, wenn jede Prüfung grün war, sonst 1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

async function ladePlaywright() {
  try {
    return await import('playwright');
  } catch {
    const ort = process.env.ARASUL_PLAYWRIGHT;
    if (!ort) {
      console.log(
        'ROT    playwright fehlt: ARASUL_PLAYWRIGHT=<Ordner mit node_modules/playwright>.'
      );
      process.exit(1);
    }
    return createRequire(path.join(ort, 'x.js'))('playwright');
  }
}
const { chromium, request } = await ladePlaywright();

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://100.121.244.80';
const STAND = process.env.ARASUL_STAND || 'nachher';
const ZIEL = path.join(WURZEL, 'docs/plans/audits/2026-11-20-seitenkopf', STAND);
const BENUTZER = 'probe-admin';
const PASSWORT = process.env.ARASUL_ADMIN_PW || '';
const MESSEN = STAND !== 'vorher';
const NUR = process.env.ARASUL_NUR || '';

const ANSICHTEN = [
  { name: '1440', viewport: { width: 1440, height: 900 } },
  { name: '390', viewport: { width: 390, height: 844 }, mobil: true },
];
const SEITEN = [
  { name: 'start', pfad: '/workspace/dashboard' },
  {
    name: 'werkstatt-eingang',
    pfad: '/workspace/app/werkstatt',
    rahmen: true,
    anker: 'eingang',
  },
  { name: 'werkstatt-apps', pfad: '/workspace/app/werkstatt', rahmen: true, anker: 'apps' },
  { name: 'verwaltung', pfad: '/workspace/verwaltung/apps' },
  { name: 'einstellungen', pfad: '/workspace/settings/erscheinungsbild' },
].filter(s => !NUR || NUR.split(',').includes(s.name));

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok: Boolean(ok) });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
  return Boolean(ok);
};

if (!PASSWORT) {
  console.log('ROT    Passwort für probe-admin fehlt, der Aufrufer setzt es aus Bitwarden.');
  process.exit(1);
}
fs.mkdirSync(ZIEL, { recursive: true });

const api = await request.newContext({ baseURL: URL, ignoreHTTPSErrors: true });
const login = await api.post('/api/auth/login', {
  data: { username: BENUTZER, password: PASSWORT },
});
if (!pruefe('Anmeldung probe-admin', login.ok(), `HTTP ${login.status()}`)) process.exit(1);
async function kopf() {
  const csrf = (await api.storageState()).cookies.find(c => c.name === 'arasul_csrf')?.value || '';
  return { 'X-CSRF-Token': csrf };
}
async function themeLesen() {
  const me = await (await api.get('/api/auth/me')).json().catch(() => ({}));
  return me?.user?.theme || 'system';
}
const themeVorher = await themeLesen();

/**
 * Was im Inneren der Fläche steht: der Seitenkopf, seine Werkzeugleiste, die
 * Tabelle. Läuft im Dokument der Shell und, über einer App, auch in dem der
 * App; Lagen der App werden in Koordinaten der Shell umgerechnet.
 */
async function innenLesen(seite, imRahmen) {
  const lesen = () => {
    const kasten = el => {
      const r = el.getBoundingClientRect();
      return {
        links: r.left,
        oben: r.top,
        rechts: r.right,
        unten: r.bottom,
        breite: r.width,
        hoehe: r.height,
      };
    };
    const sichtbar = el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
    const koepfe = Array.from(document.querySelectorAll('.ara-kopf')).filter(sichtbar);
    const kopf = koepfe[0] ?? null;
    const s = kopf ? getComputedStyle(kopf) : null;
    const werkzeuge = kopf
      ? Array.from(kopf.querySelectorAll('.ara-werkzeug, [data-slot="sidebar-trigger"]'))
          .filter(sichtbar)
          .map(kasten)
      : [];
    const tabelle = Array.from(document.querySelectorAll('table')).find(sichtbar) ?? null;
    const zeilen = tabelle ? Array.from(tabelle.querySelectorAll('tbody tr')).filter(sichtbar) : [];
    const kopfzeile = tabelle?.querySelector('thead tr');
    const deckend = el => {
      for (let e = el; e; e = e.parentElement) {
        const f = getComputedStyle(e).backgroundColor;
        const a = f
          .match(/rgba?\(([^)]+)\)/)?.[1]
          .split(',')
          .map(Number)[3];
        if (f && f !== 'rgba(0, 0, 0, 0)' && f !== 'transparent')
          return a === undefined || a >= 0.99;
      }
      return false;
    };
    return {
      anzahlKoepfe: koepfe.length,
      h1: Array.from(document.querySelectorAll('h1')).filter(sichtbar).length,
      kopf: kopf ? kasten(kopf) : null,
      kopfLinie: s ? parseFloat(s.borderBottomWidth) || 0 : null,
      kopfText: kopf?.querySelector('.ara-kopf__titel')?.textContent?.trim() ?? null,
      kopfSatz: Boolean(kopf?.querySelector('.ara-kopf__satz')),
      werkzeuge,
      oberhalb: kopf
        ? Array.from(document.querySelectorAll('[data-slot="sidebar-trigger"]'))
            .filter(sichtbar)
            .filter(t => !kopf.contains(t)).length
        : null,
      tabelle: tabelle
        ? {
            zeile: zeilen.length ? Math.round(zeilen[0].getBoundingClientRect().height) : null,
            kopfzeile: kopfzeile ? Math.round(kopfzeile.getBoundingClientRect().height) : null,
            deckend: deckend(tabelle),
          }
        : null,
    };
  };
  const shell = await seite.evaluate(lesen);
  if (!imRahmen) return { ...shell, kapsel: null };
  const f = await seite.$('iframe');
  const app = f ? await (await f.contentFrame())?.evaluate(lesen).catch(() => null) : null;
  const versatz = f ? await f.boundingBox() : null;
  const kapsel = await seite.evaluate(() => {
    const k = document.querySelector('[data-testid="rahmen-kapsel"]');
    if (!k) return null;
    const r = k.getBoundingClientRect();
    return { links: r.left, oben: r.top, rechts: r.right, unten: r.bottom };
  });
  if (app && versatz) {
    const schieben = k => ({
      ...k,
      links: k.links + versatz.x,
      rechts: k.rechts + versatz.x,
      oben: k.oben + versatz.y,
      unten: k.unten + versatz.y,
    });
    app.werkzeuge = app.werkzeuge.map(schieben);
    if (app.kopf) app.kopf = schieben(app.kopf);
  }
  return { ...(app ?? shell), kapsel };
}

const ueberdeckt = (a, b) =>
  a && b && a.links < b.rechts && b.links < a.rechts && a.oben < b.unten && b.oben < a.unten;

/** Die Namen auf den Kacheln der Startseite. */
async function kachelnLesen(seite) {
  return seite.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        '[data-testid^="uebersicht-app-"]:not([data-testid$="-wartend"]):not([data-testid$="-ruhig"])'
      )
    ).map(
      k =>
        k.querySelector('.ara-karte__titel, [data-slot="karte-titel"]')?.textContent?.trim() ??
        k.textContent.trim()
    )
  );
}
/**
 * Kein Kundenname auf einem Bild (Grenze jedes Auftrags): am Orin heißt eine
 * Probe-App nach einem Kunden. Vor jedem Foto wird das Wort in Rahmen und App
 * durch „Probe“ ersetzt, nur im Browser, nur für das Bild. Das Muster steht
 * hier zerlegt, damit diese Datei es selbst nicht trägt.
 */
const KUNDE = new RegExp(['f', 'a', 'k', 't', 'u', 'm'].join(''), 'gi');
async function ohneKundenname(seite) {
  const tausche = quelle =>
    `(() => {
      const muster = new RegExp(${JSON.stringify(quelle)}, 'gi');
      const ersetze = doc => {
        const gang = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
        for (let n = gang.nextNode(); n; n = gang.nextNode()) {
          if (muster.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(muster, 'Probe');
          muster.lastIndex = 0;
        }
        for (const el of doc.querySelectorAll('[title],[aria-label],[alt]')) {
          for (const at of ['title', 'aria-label', 'alt']) {
            const v = el.getAttribute(at);
            if (v && muster.test(v)) el.setAttribute(at, v.replace(muster, 'Probe'));
            muster.lastIndex = 0;
          }
        }
      };
      ersetze(document);
      for (const f of document.querySelectorAll('iframe')) {
        try { if (f.contentDocument?.body) ersetze(f.contentDocument); } catch {}
      }
    })()`;
  await seite.evaluate(tausche(KUNDE.source)).catch(() => {});
}

const browser = await chromium.launch({ headless: true });
try {
  for (const theme of ['light', 'dark']) {
    const r = await api.put('/api/darstellung', { headers: await kopf(), data: { theme } });
    pruefe(`Theme auf ${theme}`, r.ok(), `HTTP ${r.status()}`);
    for (const ansicht of ANSICHTEN) {
      const kontext = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: ansicht.viewport,
        deviceScaleFactor: ansicht.mobil ? 2 : 1,
        isMobile: Boolean(ansicht.mobil),
        hasTouch: Boolean(ansicht.mobil),
        storageState: await api.storageState(),
      });
      const seite = await kontext.newPage();
      for (const s of SEITEN) {
        const name = `${s.name}-${theme === 'light' ? 'hell' : 'dunkel'}-${ansicht.name}`;
        await seite.goto(`${URL}${s.pfad}`, { waitUntil: 'domcontentloaded' });
        await seite
          .locator('[data-testid="workspace-ansicht"]')
          .waitFor({ timeout: 30000 })
          .catch(() => {});
        await seite.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        if (s.rahmen) {
          const f = await seite.waitForSelector('iframe', { timeout: 20000 }).catch(() => null);
          const rahmen = f ? await f.contentFrame() : null;
          await rahmen?.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
          if (s.anker) {
            await rahmen?.evaluate(a => (window.location.hash = a), s.anker).catch(() => {});
            await rahmen?.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
          }
        }
        await seite.waitForTimeout(1200);
        await ohneKundenname(seite);
        await seite.screenshot({ path: path.join(ZIEL, `${name}.png`) });
        console.log(`bild   ${name}.png`);
        if (!MESSEN) continue;

        const m = await innenLesen(seite, Boolean(s.rahmen));
        pruefe(
          `${name}: Seitenkopf da, genau ein h1`,
          m.kopf && m.h1 === 1,
          `${m.anzahlKoepfe} Köpfe, ${m.h1} h1`
        );
        pruefe(`${name}: Seitenkopf ohne Trennlinie`, m.kopfLinie === 0, `${m.kopfLinie} px`);
        pruefe(`${name}: Seitenkopf mit einem Satz`, m.kopfSatz);
        pruefe(
          `${name}: keine Zeile mit einem einzelnen Icon über dem Kopf`,
          m.oberhalb === 0,
          `${m.oberhalb} Knöpfe der Seitenleiste außerhalb des Kopfs`
        );
        if (!ansicht.mobil) {
          const hoehen = m.werkzeuge.map(w => Math.round(w.hoehe));
          pruefe(
            `${name}: Werkzeuge im Kopf 28 px`,
            // Die Startseite hat keine Aktion und damit keine Werkzeuge.
            (s.name === 'start' || hoehen.length > 0) && hoehen.every(h => h === 28),
            hoehen.join(', ')
          );
        }
        if (s.rahmen) {
          pruefe(
            `${name}: Kapsel überdeckt kein Werkzeug`,
            m.kapsel && m.werkzeuge.every(w => !ueberdeckt(w, m.kapsel)),
            m.kapsel
              ? `Kapsel ab x ${Math.round(m.kapsel.links)}, Werkzeuge bis x ${Math.round(Math.max(0, ...m.werkzeuge.map(w => w.rechts)))}`
              : 'keine Kapsel'
          );
        }
        if (m.tabelle && !ansicht.mobil) {
          pruefe(
            `${name}: Tabelle kompakt (Zeile 40, Kopfzeile 32)`,
            m.tabelle.zeile === 40 && m.tabelle.kopfzeile === 32,
            `${m.tabelle.zeile} / ${m.tabelle.kopfzeile}`
          );
          pruefe(`${name}: Tabelle deckend`, m.tabelle.deckend);
        }
        if (s.name === 'start') {
          const namen = await kachelnLesen(seite);
          pruefe(
            `${name}: jede App einmal auf der Startseite, ohne „(Test)“`,
            namen.length > 0 &&
              new Set(namen).size === namen.length &&
              namen.every(n => !n.startsWith('(Test)')),
            namen.join(', ')
          );
        }
      }
      await kontext.close();
    }
  }
} finally {
  await browser.close();
  const r = await api.put('/api/darstellung', {
    headers: await kopf(),
    data: { theme: themeVorher },
  });
  pruefe(`Theme wieder ${themeVorher}`, r.ok(), `HTTP ${r.status()}`);
  await api.post('/api/auth/logout', { headers: await kopf() }).catch(() => {});
}

const rot = ergebnisse.filter(e => !e.ok).length;
console.log(`\n${ergebnisse.length - rot} gruen, ${rot} rot`);
process.exit(rot ? 1 : 0);
