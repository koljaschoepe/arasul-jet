/**
 * Messung und Bilder der Aufräumkarte rueckmeldung-auskunft-und-drossel
 * (J42, M7, 21.11.2026), Nachtrag vom 21.11.2026:
 *
 *   1. Felder der Bibliothek: bei grobem Zeiger mindestens 44 px
 *      Trefferfläche, am Rechner mit Maus 32 px hoch (Bibliothek 5.11.0).
 *   2. Die Leiste am Handy bricht keinen App-Namen um: der Name am gewählten
 *      Eintrag steht in einer Zeile oder gar nicht.
 *   3. Die Befehlspalette sucht scharf: „Ab“ findet keine App, in der kein
 *      Wort mit „Ab“ beginnt (etwa Belege).
 *
 * Es liest nur. Das Theme setzt es über `PUT /api/darstellung` und stellt am
 * Ende das vorherige wieder her; Freigaben, Konten und Apps fasst es nicht an.
 * Konto nur aus der Umgebung, nie `admin`:
 *
 *   ARASUL_URL=https://100.121.244.80 \
 *   ARASUL_PLAYWRIGHT=<Ordner mit node_modules/playwright> \
 *   ARASUL_ADMIN_PW="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
 *   ARASUL_AUSBLENDEN=<app-id,…> \
 *     node scripts/test/felder-leiste-palette-bilder.mjs
 *
 * `ARASUL_AUSBLENDEN` nennt Apps, die auf keinem Bild stehen dürfen (etwa
 * eine Probe-App mit dem Namen eines Kunden); sie werden in Leiste, Palette
 * und auf der Startseite unsichtbar gemacht. Die Kennungen stehen nur in der
 * Umgebung, nie im Repo.
 *
 * Bilder unter docs/plans/audits/2026-11-21-felder-leiste-palette/. Rückgabe
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
const ZIEL = path.join(WURZEL, 'docs/plans/audits/2026-11-21-felder-leiste-palette');
const BENUTZER = 'probe-admin';
const PASSWORT = process.env.ARASUL_ADMIN_PW || '';
const AUSBLENDEN = (process.env.ARASUL_AUSBLENDEN || '').split(',').filter(Boolean);

const ANSICHTEN = [
  { name: '1440', viewport: { width: 1440, height: 900 } },
  { name: '390', viewport: { width: 390, height: 844 }, mobil: true },
];
// Seiten mit Feldern der Bibliothek: Eingabe, Auswahl, Schalter.
const FELDSEITEN = [
  { name: 'profil', pfad: '/workspace/settings/profil' },
  { name: 'passwort', pfad: '/workspace/settings/passwort' },
  { name: 'erscheinungsbild', pfad: '/workspace/settings/erscheinungsbild' },
  { name: 'personen', pfad: '/workspace/verwaltung/benutzer' },
  { name: 'daten', pfad: '/workspace/verwaltung/daten' },
];

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
const me = await (await api.get('/api/auth/me')).json().catch(() => ({}));
const themeVorher = me?.user?.theme || 'system';
const apps = ((await (await api.get('/api/apps/meine')).json()).data || []).filter(
  a => !AUSBLENDEN.includes(a.id)
);

/** Was ausgeblendet wird, verschwindet ganz, auch aus dem Ablauf der Leiste. */
async function blendeAus(seite) {
  if (AUSBLENDEN.length === 0) return;
  const regeln = AUSBLENDEN.map(
    id =>
      `[data-testid="leiste-app-${id}"], [data-testid="palette-app-${id}"], ` +
      `[data-testid="palette-app-${id}-test"], [data-testid^="uebersicht-app-${id}"], ` +
      `[data-app-id="${id}"], a[href*="/apps/${id}/"], a[href*="/app/${id}"]`
  ).join(', ');
  await seite.addStyleTag({ content: `${regeln} { display: none !important; }` });
}

/** Höhen der Felder und die Trefferflächen der Auswahlknöpfe auf der Seite. */
async function felderLesen(seite) {
  return seite.evaluate(() => {
    const sichtbar = el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
    const hoehen = sel =>
      Array.from(document.querySelectorAll(sel))
        .filter(sichtbar)
        .map(el => Math.round(el.getBoundingClientRect().height));
    const treffer = sel =>
      Array.from(document.querySelectorAll(sel))
        .filter(sichtbar)
        .map(el => {
          const vor = getComputedStyle(el, '::before');
          const r = el.getBoundingClientRect();
          const h = vor.content && vor.content !== 'none' ? parseFloat(vor.height) || 0 : 0;
          const b = vor.content && vor.content !== 'none' ? parseFloat(vor.width) || 0 : 0;
          return Math.round(Math.min(Math.max(h, r.height), Math.max(b, r.width)));
        });
    return {
      eingaben: hoehen('[data-slot="input"]'),
      auswahl: hoehen('[data-slot="select-trigger"][data-size="default"]'),
      knoepfe: treffer(
        '[data-slot="checkbox"], [data-slot="switch"], [data-slot="radio-group-item"]'
      ),
    };
  });
}

/** Die Leiste unten: Höhe, und ob ein Name in mehr als einer Zeile steht. */
async function leisteLesen(seite) {
  return seite.evaluate(() => {
    const nav = document.querySelector('[data-testid="aktivitaetsleiste"]');
    if (!nav) return null;
    const namen = Array.from(nav.querySelectorAll('span'))
      .filter(s => s.textContent && s.children.length === 0)
      .map(s => {
        const zeile = parseFloat(getComputedStyle(s).lineHeight) || 16;
        return {
          text: s.textContent,
          zeilen: Math.round(s.getBoundingClientRect().height / zeile),
          abgeschnitten: s.scrollWidth > s.clientWidth + 1,
        };
      });
    return { hoehe: Math.round(nav.getBoundingClientRect().height), namen };
  });
}

const browser = await chromium.launch();
try {
  for (const theme of ['light', 'dark']) {
    const gesetzt = await api.put('/api/darstellung', { headers: await kopf(), data: { theme } });
    pruefe(`Theme ${theme} gesetzt`, gesetzt.ok(), `HTTP ${gesetzt.status()}`);
    for (const ansicht of ANSICHTEN) {
      const kontext = await browser.newContext({
        viewport: ansicht.viewport,
        deviceScaleFactor: 2,
        ignoreHTTPSErrors: true,
        isMobile: Boolean(ansicht.mobil),
        hasTouch: Boolean(ansicht.mobil),
        colorScheme: theme,
        storageState: await api.storageState(),
      });
      const seite = await kontext.newPage();
      const bild = async name => {
        await blendeAus(seite);
        await seite.waitForTimeout(400);
        await seite.screenshot({
          path: path.join(ZIEL, `orin-${ansicht.name}-${theme}-${name}.png`),
        });
      };
      const grob = await seite.evaluate(() => matchMedia('(pointer: coarse)').matches);
      const marke = `${ansicht.name} ${theme}`;

      // 1. Felder.
      for (const s of FELDSEITEN) {
        await seite.goto(`${URL}${s.pfad}`, { waitUntil: 'domcontentloaded' });
        await seite.waitForLoadState('networkidle').catch(() => {});
        await seite.waitForTimeout(800);
        const f = await felderLesen(seite);
        const alle = [...f.eingaben, ...f.auswahl];
        if (alle.length > 0) {
          pruefe(
            `${marke} ${s.name}: Felder ${grob ? 'mindestens 44 px (grober Zeiger)' : '32 px (Maus)'}`,
            grob ? alle.every(h => h >= 44) : alle.every(h => h === 32),
            `Eingaben ${f.eingaben.join('/') || '–'}, Auswahl ${f.auswahl.join('/') || '–'}`
          );
        }
        if (f.knoepfe.length > 0 && grob) {
          pruefe(
            `${marke} ${s.name}: Checkbox, Radio, Schalter mit 44 px Trefferfläche`,
            f.knoepfe.every(h => h >= 44),
            f.knoepfe.join('/')
          );
        }
        // Personen wird gemessen, nicht fotografiert: dort stehen echte Namen
        // und die Freigaben jeder App als Spalte.
        if (['profil', 'erscheinungsbild'].includes(s.name)) await bild(`felder-${s.name}`);
      }

      // 2. Leiste am Handy: jede App der Leiste einmal gewählt.
      if (ansicht.mobil) {
        await seite.goto(`${URL}/workspace/dashboard`, { waitUntil: 'domcontentloaded' });
        await seite.waitForSelector('[data-testid="aktivitaetsleiste"]');
        await seite.waitForTimeout(800);
        const laengste = [...apps].sort((a, b) => b.name.length - a.name.length);
        let gezeigt = false;
        for (const app of laengste) {
          const feld = seite.locator(`[data-testid="leiste-app-${app.id}"]`).first();
          if ((await feld.count()) === 0 || !(await feld.isVisible())) continue;
          await feld.click();
          await seite.waitForTimeout(1200);
          const l = await leisteLesen(seite);
          const name = l?.namen.find(n => n.text === app.name);
          pruefe(
            `${marke} Leiste: „${app.name}“ gewählt, kein Umbruch, nichts abgeschnitten`,
            l && l.hoehe <= 56 && l.namen.every(n => n.zeilen <= 1 && !n.abgeschnitten),
            name ? `Name sichtbar, ${name.zeilen} Zeile` : 'nur Symbol'
          );
          if (!gezeigt) {
            await bild('leiste-langer-name');
            gezeigt = true;
          }
        }
        await seite.goto(`${URL}/workspace/settings/erscheinungsbild`, {
          waitUntil: 'domcontentloaded',
        });
        await seite.waitForTimeout(1000);
        const l = await leisteLesen(seite);
        pruefe(
          `${marke} Leiste: „Einstellungen“ unter Mehr, in einer Zeile`,
          l && l.namen.every(n => n.zeilen <= 1 && !n.abgeschnitten),
          l?.namen.map(n => `${n.text}: ${n.zeilen}`).join(', ')
        );
      }

      // 3. Die Palette, mit „Ab“.
      await seite.goto(`${URL}/workspace/dashboard`, { waitUntil: 'domcontentloaded' });
      await seite.waitForTimeout(1200);
      if (ansicht.mobil) {
        await seite.locator('[data-testid="leiste-mehr"]').click();
        await seite.locator('[data-testid="leiste-palette"]').click();
      } else {
        await seite.keyboard.press('Control+k');
      }
      const feld = seite.locator('[data-testid="befehlspalette-feld"]');
      await feld.waitFor();
      await feld.fill('Ab');
      await seite.waitForTimeout(500);
      const treffer = await seite.evaluate(() =>
        Array.from(document.querySelectorAll('[data-testid^="palette-"]'))
          .filter(el => el.getBoundingClientRect().height > 0)
          .map(el => el.getAttribute('data-testid'))
      );
      const sichtbareApps = treffer.filter(t => t.startsWith('palette-app-'));
      const ohneAb = apps
        .filter(
          a =>
            !`${a.name} ${a.id}`
              .toLowerCase()
              .split(/[^a-zäöüß0-9]+/)
              .some(w => w.startsWith('ab'))
        )
        .map(a => a.id);
      pruefe(
        `${marke} Palette „Ab“: keine App ohne ein Wort, das mit „Ab“ beginnt`,
        sichtbareApps.every(
          t => !ohneAb.some(id => t === `palette-app-${id}` || t === `palette-app-${id}-test`)
        ),
        sichtbareApps.join(', ') || 'keine App'
      );
      if (apps.some(a => a.id === 'abschluss')) {
        pruefe(`${marke} Palette „Ab“ findet Abschluss`, treffer.includes('palette-app-abschluss'));
      }
      pruefe(`${marke} Palette „Ab“ findet nicht Belege`, !treffer.includes('palette-app-belege'));
      await bild('palette-ab');
      await kontext.close();
    }
  }
} finally {
  await browser.close();
  const zurueck = await api.put('/api/darstellung', {
    headers: await kopf(),
    data: { theme: themeVorher },
  });
  pruefe(`Theme zurück auf ${themeVorher}`, zurueck.ok(), `HTTP ${zurueck.status()}`);
  await api.post('/api/auth/logout', { headers: await kopf() }).catch(() => {});
}

const rot = ergebnisse.filter(e => !e.ok).length;
console.log(`\n${ergebnisse.length - rot} grün, ${rot} rot`);
process.exit(rot === 0 ? 0 : 1);
