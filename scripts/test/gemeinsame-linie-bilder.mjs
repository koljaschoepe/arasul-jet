/**
 * Bilder und Messung der Karte gemeinsame-linie-im-produkt (J53, M7, 22.11.2026).
 *
 * Fotografiert am Orin, was die Linie verändert: Start, eine App im Rahmen,
 * die Werkstatt, die Liste der Apps in der Verwaltung, eine App im Einzelnen
 * (dort öffnet sich seit J53 das Blatt) und die Einstellungen, je hell und
 * dunkel, bei 1440 und 390 px. Einmal mit `ARASUL_STAND=vorher` vor dem
 * Umbau, einmal mit `nachher`; `nebeneinander.py` legt beide zu einem Bild je
 * Ansicht zusammen.
 *
 * Mit `nachher` misst es zusätzlich, was die Karte verlangt: die Ansicht füllt
 * den Schirm und das Dokument rollt nicht, das Blatt steht am Rechner daneben
 * und am Handy unten, Escape schließt es, der Text darin hält 4,5:1.
 *
 * Das Theme setzt das Skript über `PUT /api/darstellung` und stellt am Ende
 * das vorherige wieder her. Sonst schreibt es nichts. Konto nur aus der
 * Umgebung, nie `admin`:
 *
 *   ARASUL_STAND=vorher ARASUL_PLAYWRIGHT=<Ordner mit node_modules/playwright> \
 *   ARASUL_ADMIN_PW="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
 *     node scripts/test/gemeinsame-linie-bilder.mjs
 *
 * `ARASUL_AUSBLENDEN=<kennung,…>` blendet Apps aus, deren Name auf kein Bild
 * gehört. Bilder unter docs/plans/audits/2026-11-22-gemeinsame-linie/<stand>/.
 * Rückgabe 0, wenn jede Prüfung grün war, sonst 1.
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
const ZIEL = path.join(WURZEL, 'docs/plans/audits/2026-11-22-gemeinsame-linie', STAND);
const BENUTZER = 'probe-admin';
const PASSWORT = process.env.ARASUL_ADMIN_PW || '';
const MESSEN = STAND !== 'vorher';
const NUR = process.env.ARASUL_NUR || '';
const AUSBLENDEN = (process.env.ARASUL_AUSBLENDEN || '').split(',').filter(Boolean);

const ANSICHTEN = [
  { name: '1440', viewport: { width: 1440, height: 900 } },
  { name: '390', viewport: { width: 390, height: 844 }, mobil: true },
];
const SEITEN = [
  { name: 'start', pfad: '/workspace/dashboard' },
  { name: 'app', pfad: `/workspace/app/${APP}`, rahmen: true },
  { name: 'werkstatt', pfad: '/workspace/app/werkstatt', rahmen: true },
  { name: 'verwaltung', pfad: '/workspace/verwaltung/apps' },
  { name: 'einzelansicht', pfad: `/workspace/verwaltung/apps/${APP}`, blatt: true },
  { name: 'einstellungen', pfad: '/workspace/settings/erscheinungsbild' },
  { name: 'rechner', pfad: '/workspace/settings/rechner', blatt: true },
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

/**
 * Kein Kundenname auf einem Bild: am Orin heißt eine Probe-App nach einem
 * Kunden. Ihre Einträge blendet `ARASUL_AUSBLENDEN` aus, und das Wort selbst
 * wird im Browser durch „Probe“ ersetzt, nur für das Bild. Das Muster steht
 * zerlegt, damit diese Datei es nicht trägt.
 */
const KUNDE = new RegExp(['f', 'a', 'k', 't', 'u', 'm'].join(''), 'gi');
async function ohneKundenname(seite) {
  // Echte Personen gehören auf kein Bild: die Liste mit Zugang zur App wird
  // nur unscharf gezeigt.
  await seite
    .addStyleTag({ content: '[data-testid="personen-liste"]{filter:blur(6px)}' })
    .catch(() => {});
  if (AUSBLENDEN.length) {
    const css = AUSBLENDEN.map(
      id =>
        `[data-testid^="leiste-app-${id}"],[data-testid^="uebersicht-app-${id}"],[data-testid^="palette-app-${id}"]{display:none!important}`
    ).join('');
    await seite.addStyleTag({ content: css }).catch(() => {});
  }
  await seite
    .evaluate(quelle => {
      const muster = new RegExp(quelle, 'gi');
      const ersetze = doc => {
        const gang = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
        for (let n = gang.nextNode(); n; n = gang.nextNode()) {
          if (muster.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(muster, 'Probe');
          muster.lastIndex = 0;
        }
      };
      ersetze(document);
      // Die Adresse des Geräts gehört auch auf kein Bild (Befehl im Blatt
      // „Rechner verbinden“): ein Platzhalter statt der echten.
      for (const c of document.querySelectorAll('code')) {
        c.textContent = c.textContent.replaceAll(location.host, 'arasul.firma.local');
      }
      for (const f of document.querySelectorAll('iframe')) {
        try {
          if (f.contentDocument?.body) ersetze(f.contentDocument);
        } catch {
          /* fremde Herkunft */
        }
      }
    }, KUNDE.source)
    .catch(() => {});
}

/** Füllt die Ansicht den Schirm, und rollt nur, was in sich rollt? */
async function schirmLesen(seite) {
  return seite.evaluate(() => {
    const d = document.scrollingElement;
    return {
      dokumentRollt: d.scrollHeight > innerHeight + 1,
      hoehe: d.scrollHeight,
      fenster: innerHeight,
    };
  });
}

/** Das Blatt: wo es steht, wie es aussieht, ob der Text darin 4,5:1 hält. */
async function blattLesen(seite) {
  return seite.evaluate(() => {
    const b = document.querySelector('[data-blatt]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const s = getComputedStyle(b);
    const titel = b.querySelector('[data-blatt-titel]');
    return {
      art: b.getAttribute('data-blatt'),
      links: r.left,
      rechts: innerWidth - r.right,
      oben: r.top,
      unten: innerHeight - r.bottom,
      breite: r.width,
      hoehe: r.height,
      radius: parseFloat(s.borderTopLeftRadius) || 0,
      grund: s.backgroundColor,
      farbe: titel ? getComputedStyle(titel).color : s.color,
      griff: Boolean(b.querySelector('[data-blatt-griff]')),
    };
  });
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

        const m = await schirmLesen(seite);
        pruefe(
          `${name}: Dokument rollt nicht, nur was in sich rollt`,
          !m.dokumentRollt,
          `${m.hoehe} px bei ${m.fenster} px`
        );
        if (!s.blatt) continue;
        // Eine Einzelheit öffnen: der erste Flow der App (erst aufklappen) oder
        // „Rechner verbinden“ im Seitenkopf der Einstellungen.
        const mehr = seite.locator('[data-testid^="flow-mehr-"][data-testid$="-knopf"]').first();
        if (await mehr.count()) {
          await mehr.scrollIntoViewIfNeeded().catch(() => {});
          await mehr.click();
          await seite.waitForTimeout(300);
        }
        const ausloeser = seite.locator('[data-blatt-oeffnen]').first();
        if (!pruefe(`${name}: es gibt etwas, das ein Blatt öffnet`, await ausloeser.count()))
          continue;
        await ausloeser.click();
        await seite.locator('[data-blatt]').waitFor({ timeout: 5000 }).catch(() => {});
        await seite.waitForTimeout(500);
        await ohneKundenname(seite);
        await seite.screenshot({ path: path.join(ZIEL, `${s.name}-blatt-${name.slice(s.name.length + 1)}.png`) });
        console.log(`bild   ${s.name}-blatt-${name.slice(s.name.length + 1)}.png`);
        const b = await blattLesen(seite);
        if (!pruefe(`${name}: Blatt steht da`, b)) continue;
        if (ansicht.mobil) {
          pruefe(
            `${name}: Blatt von unten mit Griff`,
            b.art === 'unten' && b.unten < 1 && b.griff,
            `${b.art}, unten ${b.unten}, Griff ${b.griff}`
          );
        } else {
          pruefe(
            `${name}: Blatt als Fläche daneben`,
            b.art === 'seite' && b.rechts <= 16 && b.breite >= 360 && b.breite <= 640,
            `${b.art}, rechts ${b.rechts}, ${Math.round(b.breite)} px breit`
          );
        }
        pruefe(`${name}: Blatt mit großem Radius`, b.radius >= 16, `${b.radius} px`);
        const k = kontrast(b.farbe, b.grund);
        pruefe(`${name}: Text im Blatt hält 4,5:1`, k >= 4.5, `${k.toFixed(2)}:1`);
        await seite.keyboard.press('Escape');
        await seite.waitForTimeout(500);
        pruefe(`${name}: Escape schließt das Blatt`, !(await blattLesen(seite)));
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
