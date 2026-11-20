/**
 * Bilder und Messung der Karte glas-rahmen-und-leiste (20.11.2026).
 *
 * Der Rahmen nach dem Entwurf: eine schwebende Leiste aus Glas links in drei
 * Abschnitten mit dem Konto unten, keine Statuszeile, die Ansicht als
 * abgerundete deckende Fläche auf dem Verlauf, jede App genau einmal in der
 * Leiste, oben rechts die Kapsel mit Live und Test und dem Rückmelde-Icon,
 * die Testfassung mit farbigem Rand und dem Wort Test; am Handy die Leiste
 * unten als Glas ohne abgeschnittene Namen.
 *
 * Fotografiert werden Start, eine App live und in Test, das Cockpit, die
 * Verwaltung und die Einstellungen, je hell und dunkel, bei 1440 und 390 px.
 * Das Theme setzt das Skript über `PUT /api/darstellung` und stellt am Ende
 * das vorherige wieder her.
 *
 * Mit `ARASUL_STAND=nachher` misst es zusätzlich, was die Karte verlangt
 * (siehe `pruefe(...)` unten). Konto nur aus der Umgebung, nie `admin`:
 *
 *   ARASUL_URL=https://100.121.244.80 ARASUL_APP=abschluss \
 *   ARASUL_STAND=vorher ARASUL_PLAYWRIGHT=<Ordner mit node_modules/playwright> \
 *   ARASUL_ADMIN_PW="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
 *     node scripts/test/rahmen-glas-bilder.mjs
 *
 * Bilder unter docs/plans/audits/2026-11-20-glas-rahmen/<stand>/. Rückgabe
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
const APP = process.env.ARASUL_APP || 'abschluss';
const STAND = process.env.ARASUL_STAND || 'nachher';
const ZIEL = path.join(WURZEL, 'docs/plans/audits/2026-11-20-glas-rahmen', STAND);
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
  { name: 'app', pfad: `/workspace/app/${APP}`, rahmen: true },
  { name: 'app-test', pfad: `/workspace/app/${APP}/test`, rahmen: true, test: true },
  { name: 'cockpit', pfad: '/workspace/app/entwickler-cockpit', rahmen: true },
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
const meine = (await (await api.get('/api/apps/meine')).json().catch(() => ({}))).data ?? [];

/** Kontrast zweier Farben `rgb(a)`, Vordergrund über Hintergrund gemischt. */
function kontrast(vorne, hinten) {
  const zahl = s => (s.match(/[\d.]+/g) || []).map(Number);
  const [hr, hg, hb] = zahl(hinten);
  const [vr, vg, vb, va = 1] = zahl(vorne);
  const m = [vr * va + hr * (1 - va), vg * va + hg * (1 - va), vb * va + hb * (1 - va)];
  const l = ([r, g, b]) => {
    const k = c => {
      c /= 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * k(r) + 0.7152 * k(g) + 0.0722 * k(b);
  };
  const a = l(m);
  const b = l([hr, hg, hb]);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Was der Rahmen ist: Leiste, Fläche der Ansicht, Kapsel, Statuszeile. */
async function rahmenLesen(seite) {
  return seite.evaluate(() => {
    const kasten = el => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        links: r.left,
        oben: r.top,
        rechts: innerWidth - r.right,
        unten: innerHeight - r.bottom,
        breite: r.width,
        hoehe: r.height,
        radius: parseFloat(s.borderTopLeftRadius) || 0,
        filter: s.backdropFilter || s.webkitBackdropFilter || 'none',
        hintergrund: s.backgroundColor,
        schatten: s.boxShadow,
        rand: s.borderTopColor,
        randBreite: parseFloat(s.borderTopWidth) || 0,
      };
    };
    const leiste = document.querySelector('[data-testid="aktivitaetsleiste"]');
    const flaeche = document.querySelector('[data-testid="workspace-ansicht"]');
    const kapsel = document.querySelector('[data-testid="rahmen-kapsel"]');
    const apps = Array.from(leiste?.querySelectorAll('[data-testid^="leiste-app-"]') ?? []);
    const namen = Array.from(leiste?.querySelectorAll('span') ?? [])
      .filter(s => s.textContent.trim() && s.getBoundingClientRect().width > 0)
      .map(s => ({
        text: s.textContent.trim(),
        abgeschnitten: s.scrollWidth > s.clientWidth + 0.5,
      }));
    const glasflaechen = Array.from(document.querySelectorAll('body *')).filter(e => {
      const f = getComputedStyle(e).backdropFilter;
      const r = e.getBoundingClientRect();
      return f && f !== 'none' && r.width > 0 && r.height > 0;
    }).length;
    return {
      leiste: kasten(leiste),
      flaeche: kasten(flaeche),
      kapsel: kasten(kapsel),
      kapselTest: Boolean(document.querySelector('[data-testid="kapsel-stand-test"]')),
      testRand: flaeche?.hasAttribute('data-testfassung') ? kasten(flaeche) : null,
      testWortImSchirm: (() => {
        const w = document.querySelector('[data-testid="ansicht-test-wort"]');
        if (!w) return null;
        const r = w.getBoundingClientRect();
        const f = document
          .querySelector('[data-testid="workspace-ansicht"]')
          .getBoundingClientRect();
        // Ganz innen in der Fläche, nicht am Rand des Schirms angeschnitten.
        return r.top >= f.top && r.left >= f.left && r.right <= f.right;
      })(),
      testWort:
        document.querySelector('[data-testid="ansicht-test-wort"]')?.textContent?.trim() ?? null,
      rueckmeldung: Boolean(document.querySelector('[data-testid="rueckmeldung-knopf"]')),
      statuszeile: Boolean(document.querySelector('[data-testid="statusbar"]')),
      konto: Boolean(leiste?.querySelector('[data-testid="workspace-benutzermenue"]')),
      trenner: leiste?.querySelectorAll('[data-testid="leiste-trenner"]').length ?? 0,
      appKennungen: apps.map(a => a.getAttribute('data-testid')),
      mehrImSchirm: (() => {
        const m = document.querySelector('[data-testid="leiste-mehr"]');
        if (!m) return null;
        const r = m.getBoundingClientRect();
        const n = leiste.getBoundingClientRect();
        return r.width > 0 && r.left >= n.left && r.right <= n.right + 0.5;
      })(),
      namen,
      glasflaechen,
    };
  });
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
        }
        await seite.waitForTimeout(1200);
        await ohneKundenname(seite);
        await seite.screenshot({ path: path.join(ZIEL, `${name}.png`) });
        console.log(`bild   ${name}.png`);
        if (!MESSEN) continue;

        const m = await rahmenLesen(seite);
        pruefe(`${name}: keine Statuszeile`, !m.statuszeile);
        pruefe(
          `${name}: Leiste ist Glas`,
          m.leiste && m.leiste.filter.includes('blur') && m.leiste.schatten !== 'none',
          m.leiste
            ? `${m.leiste.filter}, Schatten ${m.leiste.schatten.slice(0, 30)}`
            : 'keine Leiste'
        );
        pruefe(
          `${name}: Leiste schwebt (8 px Abstand, Radius 16 px)`,
          m.leiste &&
            Math.abs(m.leiste.radius - 16) < 0.6 &&
            (ansicht.mobil
              ? Math.abs(m.leiste.unten - 8) < 1.5 || m.leiste.unten > 8
              : Math.abs(m.leiste.links - 8) < 0.6 && Math.abs(m.leiste.oben - 8) < 0.6),
          m.leiste
            ? `links ${m.leiste.links}, oben ${m.leiste.oben}, unten ${m.leiste.unten}, Radius ${m.leiste.radius}`
            : ''
        );
        pruefe(
          `${name}: Ansicht deckend, Radius 14 px`,
          m.flaeche &&
            Math.abs(m.flaeche.radius - 14) < 0.6 &&
            !/rgba\(.*, 0(\.\d+)?\)$/.test(m.flaeche.hintergrund) &&
            m.flaeche.hintergrund !== 'rgba(0, 0, 0, 0)',
          m.flaeche
            ? `${m.flaeche.hintergrund}, Radius ${m.flaeche.radius}, rechts ${m.flaeche.rechts}`
            : ''
        );
        pruefe(`${name}: höchstens drei Glasflächen`, m.glasflaechen <= 3, `${m.glasflaechen}`);
        const kennungen = m.appKennungen.map(k => k.replace(/^leiste-app-/, ''));
        const sichtbar = ansicht.mobil ? Math.min(4, meine.length) : meine.length;
        pruefe(
          `${name}: jede App genau einmal in der Leiste`,
          new Set(kennungen).size === kennungen.length && kennungen.length === sichtbar,
          `${kennungen.length} Einträge, ${meine.length} Apps`
        );
        if (ansicht.mobil) {
          pruefe(`${name}: „Mehr“ steht ganz in der Leiste`, m.mehrImSchirm === true);
          pruefe(
            `${name}: kein abgeschnittener Name in der Leiste`,
            m.namen.every(n => !n.abgeschnitten),
            m.namen.map(n => `${n.text}${n.abgeschnitten ? ' (abgeschnitten)' : ''}`).join(', ')
          );
        } else {
          pruefe(`${name}: Konto unten in der Leiste`, m.konto);
          pruefe(`${name}: zwei Trenner in der Leiste`, m.trenner === 2, `${m.trenner}`);
        }
        if (s.rahmen) {
          const app = meine.find(a => s.pfad.includes(`/app/${a.id}`));
          pruefe(
            `${name}: Kapsel aus Glas, 32 px hoch`,
            m.kapsel && m.kapsel.filter.includes('blur') && Math.abs(m.kapsel.hoehe - 32) < 0.6,
            m.kapsel ? `${m.kapsel.filter}, ${m.kapsel.hoehe} px` : 'keine Kapsel'
          );
          pruefe(`${name}: Rückmelde-Icon in der Kapsel`, m.rueckmeldung);
          pruefe(
            `${name}: Umschalter Live und Test nur, wo es beide gibt`,
            m.kapselTest === Boolean(app?.live && app?.test),
            `Umschalter ${m.kapselTest ? 'da' : 'nicht da'}`
          );
          if (s.test) {
            pruefe(
              `${name}: Testfassung mit farbigem Rand und dem Wort Test`,
              m.testRand &&
                m.testRand.randBreite >= 1.5 &&
                m.testWort === 'Test' &&
                m.testWortImSchirm === true,
              m.testRand
                ? `${m.testRand.rand}, ${m.testRand.randBreite} px, „${m.testWort}“`
                : 'kein Rand'
            );
            // Das Wort Test hält 4,5:1 auf seiner Fläche.
            const k = await seite.evaluate(() => {
              const w = document.querySelector('[data-testid="ansicht-test-wort"]');
              if (!w) return null;
              const s = getComputedStyle(w);
              return { farbe: s.color, grund: s.backgroundColor };
            });
            if (k) {
              const wert = kontrast(k.farbe, k.grund);
              pruefe(`${name}: Wort Test hält 4,5:1`, wert >= 4.5, `${wert.toFixed(2)}:1`);
            }
          } else {
            pruefe(`${name}: Livefassung ohne Testrand`, !m.testRand);
          }
        }
      }
      await kontext.close();
    }
  }

  if (MESSEN) {
    // Abmelden: am Rechner im Konto der Leiste, am Handy unter „Mehr“.
    for (const ansicht of ANSICHTEN) {
      const kontext = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: ansicht.viewport,
        isMobile: Boolean(ansicht.mobil),
        hasTouch: Boolean(ansicht.mobil),
        storageState: await api.storageState(),
      });
      const seite = await kontext.newPage();
      await seite.goto(`${URL}/workspace/dashboard`, { waitUntil: 'domcontentloaded' });
      await seite.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      const knopf = ansicht.mobil ? 'leiste-mehr' : 'workspace-benutzermenue';
      await seite.locator(`[data-testid="${knopf}"]`).click();
      await seite.waitForTimeout(500);
      const abmelden = await seite.locator('[data-testid="workspace-abmelden"]').count();
      pruefe(
        `${ansicht.name}: „Abmelden“ unter ${ansicht.mobil ? '„Mehr“' : 'dem Konto'}`,
        abmelden === 1,
        `${abmelden}`
      );
      const filter = await seite.evaluate(() => {
        const m = document.querySelector('[role="menu"],[data-testid="leiste-mehr-menue"]');
        return m ? getComputedStyle(m).backdropFilter : null;
      });
      pruefe(`${ansicht.name}: Menü ist Glas`, filter && filter !== 'none', String(filter));
      await ohneKundenname(seite);
      await seite.screenshot({ path: path.join(ZIEL, `menue-${ansicht.name}.png`) });
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
