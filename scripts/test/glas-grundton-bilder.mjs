/**
 * Bilder und Messung der Karte glas-grundton-bibliothek (J48, M7, 20.11.2026).
 *
 * Der Grundton der Bibliothek: Farben der Marke, ruhiger Verlauf, Inter aus
 * der Bibliothek, Glas auf schwebenden Flächen, kompakte Knöpfe. Fotografiert
 * werden die fünf Ansichten des Entwurfs (Start, eine App, Cockpit,
 * Verwaltung, Einstellungen), je hell und dunkel, bei 1440 und 390 px. Das
 * Theme setzt das Skript über `PUT /api/darstellung` und stellt am Ende das
 * vorherige wieder her.
 *
 * DIE APP ist eine Probe aus `tests/marken-laufzeit-app` (lädt die Bibliothek
 * vom Gerät, ohne Bau). Sie wird vor der Änderung eingespielt und über den
 * Deploy stehen gelassen: dass sie danach das neue Aussehen zeigt, ohne neu
 * eingespielt zu sein, ist der Beleg für „Nebenfassung, Apps erben es“.
 *
 *   ARASUL_SCHRITTE=einspielen ARASUL_APP=probe-glas-1120 \
 *     node scripts/test/marken-laufzeit-abnahme.mjs
 *
 * Mit `ARASUL_STAND=nachher` misst das Skript zusätzlich:
 *   - Schrift: Inter kommt aus der Bibliothek (`document.fonts`), in Rahmen
 *     und App.
 *   - Kontraste: Text auf seiner Fläche 4,5:1, an Stichproben jeder Ansicht.
 *   - Knöpfe: Höhe 32 px mit Text, 28 px als Icon-Knopf (Desktop), bei
 *     grobem Zeiger 44 px Trefferfläche.
 *   - Glas: ein offenes Menü trägt `backdrop-filter`, der Inhalt nicht.
 *
 * Konto nur aus der Umgebung, nie `admin`, kein neues Konto:
 *
 *   ARASUL_URL=https://100.121.244.80 ARASUL_APP=probe-glas-1120 \
 *   ARASUL_STAND=vorher \
 *   ARASUL_ADMIN_PW="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
 *     node scripts/test/glas-grundton-bilder.mjs
 *
 * Bilder unter docs/plans/audits/2026-11-20-glas-grundton/<stand>/. Rückgabe
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
      console.log('ROT    playwright fehlt: ARASUL_PLAYWRIGHT=<Ordner mit node_modules/playwright>.');
      process.exit(1);
    }
    return createRequire(path.join(ort, 'x.js'))('playwright');
  }
}
const { chromium, request } = await ladePlaywright();

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://100.121.244.80';
const APP = process.env.ARASUL_APP || 'probe-glas-1120';
const STAND = process.env.ARASUL_STAND || 'nachher';
const ZIEL = path.join(WURZEL, 'docs/plans/audits/2026-11-20-glas-grundton', STAND);
const BENUTZER = 'probe-admin';
const PASSWORT = process.env.ARASUL_ADMIN_PW || '';
const MESSEN = STAND !== 'vorher';

const ANSICHTEN = [
  { name: '1440', viewport: { width: 1440, height: 900 } },
  { name: '390', viewport: { width: 390, height: 844 }, mobil: true },
];
const SEITEN = [
  { name: 'start', pfad: '/workspace/dashboard' },
  { name: 'app', pfad: `/workspace/app/${APP}`, rahmen: true },
  { name: 'cockpit', pfad: '/workspace/app/entwickler-cockpit', rahmen: true },
  { name: 'verwaltung', pfad: '/workspace/verwaltung/apps' },
  { name: 'einstellungen', pfad: '/workspace/settings/erscheinungsbild' },
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

// --- Anmeldung über die API, die Sitzung geht an jeden Browser-Kontext -------
const api = await request.newContext({ baseURL: URL, ignoreHTTPSErrors: true });
const login = await api.post('/api/auth/login', {
  data: { username: BENUTZER, password: PASSWORT },
});
if (!pruefe('Anmeldung probe-admin', login.ok(), `HTTP ${login.status()}`)) process.exit(1);
// Das CSRF-Cookie wechselt mit Antworten, also je Aufruf frisch lesen.
async function kopf() {
  const csrf = (await api.storageState()).cookies.find(c => c.name === 'arasul_csrf')?.value || '';
  return { 'X-CSRF-Token': csrf };
}

async function themeLesen() {
  const me = await (await api.get('/api/auth/me')).json().catch(() => ({}));
  const finde = o =>
    o && typeof o === 'object' ? (o.theme ?? Object.values(o).map(finde).find(Boolean)) : undefined;
  return finde(me) || 'system';
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
 * Stichproben: jedes sichtbare Element mit eigenem Text, seine Farbe gegen
 * die erste deckende Fläche darunter. Glas (halbdurchsichtig) wird über die
 * Fläche darunter gemischt; der Verlauf des Grunds zählt mit seiner
 * dunkelsten Stelle (die Farbe, die am Element steht, liefert `messpunkt`).
 */
async function kontrasteSammeln(ziel) {
  return ziel.evaluate(() => {
    const zahl = s => (s.match(/[\d.]+/g) || []).map(Number);
    const deckend = el => {
      const schichten = [];
      for (let e = el; e; e = e.parentElement) {
        const s = getComputedStyle(e);
        const bg = s.backgroundColor;
        const [, , , a = 1] = zahl(bg);
        if (bg && bg !== 'transparent' && a > 0) {
          schichten.push(bg);
          if (a >= 0.99) break;
        }
        const bild = s.backgroundImage;
        if (bild && bild !== 'none' && bild.includes('gradient')) {
          // der Verlauf: seine Farbstopps, die dunkelste und die hellste zählen
          const stopps = bild.match(/rgba?\([^)]+\)|color\([^)]+\)/g) || [];
          if (stopps.length) {
            schichten.push({ verlauf: stopps });
            break;
          }
        }
      }
      return schichten;
    };
    const proben = [];
    const alle = Array.from(document.querySelectorAll('body *'));
    for (const el of alle) {
      if (proben.length > 60) break;
      const eigenerText = Array.from(el.childNodes).some(
        n => n.nodeType === 3 && n.textContent.trim().length > 1
      );
      if (!eigenerText) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || Number(s.opacity) < 0.5) continue;
      if (el.closest('[aria-disabled="true"],:disabled,[data-disabled]')) continue;
      proben.push({
        text: el.textContent.trim().slice(0, 30),
        farbe: s.color,
        schichten: deckend(el),
        gross: parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && Number(s.fontWeight) >= 700),
      });
    }
    return proben;
  });
}

function probeAuswerten(probe, grundFarbe) {
  // Schichten von unten nach oben mischen: die unterste deckende zuerst.
  const schichten = [...probe.schichten].reverse();
  const flaechen = [];
  const mische = (oben, unten) => {
    const z = s => (s.match(/[\d.]+/g) || []).map(Number);
    const [r, g, b, a = 1] = z(oben);
    const [ur, ug, ub] = z(unten);
    return `rgb(${r * a + ur * (1 - a)}, ${g * a + ug * (1 - a)}, ${b * a + ub * (1 - a)})`;
  };
  let basen = [grundFarbe];
  for (const s of schichten) {
    if (typeof s === 'object' && s.verlauf) {
      basen = s.verlauf.filter(v => !v.startsWith('color('));
      if (!basen.length) basen = [grundFarbe];
      continue;
    }
    basen = basen.map(b => mische(s, b));
  }
  for (const b of basen) flaechen.push(kontrast(probe.farbe, b));
  return Math.min(...flaechen);
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
        let rahmen = null;
        if (s.rahmen) {
          const f = await seite.waitForSelector('iframe', { timeout: 20000 }).catch(() => null);
          rahmen = f ? await f.contentFrame() : null;
          await rahmen?.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        }
        await seite.waitForTimeout(1200);
        await seite.screenshot({ path: path.join(ZIEL, `${name}.png`) });
        console.log(`bild   ${name}.png`);

        if (!MESSEN) continue;
        // Kontraste in Rahmen und App
        const grund = await seite.evaluate(
          () => getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
        );
        const grundRgb = await seite.evaluate(g => {
          const d = document.createElement('div');
          d.style.color = g;
          document.body.appendChild(d);
          const c = getComputedStyle(d).color;
          d.remove();
          return c;
        }, grund);
        const ziele = [['Rahmen', seite]];
        if (rahmen) ziele.push(['App', rahmen]);
        for (const [wo, z] of ziele) {
          const proben = await kontrasteSammeln(z).catch(() => []);
          let schlechteste = { wert: 99 };
          for (const p of proben) {
            const w = probeAuswerten(p, grundRgb);
            const soll = p.gross ? 3 : 4.5;
            if (w / soll < schlechteste.wert / (schlechteste.soll || 4.5))
              schlechteste = { wert: w, soll, text: p.text };
          }
          if (proben.length)
            pruefe(
              `${name} ${wo}: Text hält ${schlechteste.soll ?? 4.5}:1`,
              schlechteste.wert >= (schlechteste.soll ?? 4.5) - 0.005,
              `${proben.length} Proben, schlechteste ${schlechteste.wert.toFixed(2)}:1 bei „${schlechteste.text}“`
            );
          const inter = await z
            .evaluate(async () => {
              await document.fonts.ready;
              return Array.from(document.fonts).some(
                f => /inter/i.test(f.family) && f.status === 'loaded'
              );
            })
            .catch(() => false);
          pruefe(`${name} ${wo}: Inter aus der Bibliothek geladen`, inter);
        }
      }

      if (MESSEN) {
        // Knöpfe in den Einstellungen und der Verwaltung
        await seite.goto(`${URL}/workspace/verwaltung/benutzer`, { waitUntil: 'domcontentloaded' });
        await seite.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await seite.waitForTimeout(800);
        const knoepfe = await seite.evaluate(() =>
          Array.from(document.querySelectorAll('[data-slot="button"]'))
            .filter(b => b.getBoundingClientRect().width > 0)
            .map(b => {
              const r = b.getBoundingClientRect();
              const vor = getComputedStyle(b, '::before');
              return {
                text: b.textContent.trim().slice(0, 20),
                hoehe: r.height,
                breite: r.width,
                groesse: b.getAttribute('data-size'),
                treffer: vor.content !== 'none' ? parseFloat(vor.height) || 0 : 0,
                bild: getComputedStyle(b).backgroundImage,
                wurzel: parseFloat(getComputedStyle(document.documentElement).fontSize),
              };
            })
        );
        const mitText = knoepfe.filter(k => k.text && k.groesse === 'default');
        const icons = knoepfe.filter(k => !k.text && k.groesse === 'icon');
        // Die Höhen stehen in Pixeln (`button.tsx`), nicht in rem: gemessen
        // wird roh, unabhängig von der Wurzelschrift der Shell.
        const f = 1;
        if (!ansicht.mobil) {
          pruefe(
            `${theme} ${ansicht.name}: Knopf mit Text 32 px`,
            mitText.length > 0 && mitText.every(k => Math.abs(k.hoehe * f - 32) < 0.6),
            mitText.map(k => `${k.text}:${(k.hoehe * f).toFixed(1)}`).join(', ') || 'keiner'
          );
          pruefe(
            `${theme} ${ansicht.name}: Icon-Knopf 28 px`,
            icons.length === 0 || icons.every(k => Math.abs(k.hoehe * f - 28) < 0.6),
            icons.map(k => (k.hoehe * f).toFixed(1)).join(', ') || 'keiner auf der Seite'
          );
        } else {
          pruefe(
            `${theme} ${ansicht.name}: Trefferfläche jedes Knopfs mindestens 44 px`,
            knoepfe.every(k => Math.max(k.hoehe, k.treffer) >= 43.5),
            knoepfe
              .filter(k => Math.max(k.hoehe, k.treffer) < 43.5)
              .map(k => `${k.text || k.groesse}:${Math.max(k.hoehe, k.treffer)}`)
              .join(', ') || 'alle'
          );
        }
        pruefe(
          `${theme} ${ansicht.name}: kein Knopf mit Verlauf`,
          knoepfe.every(k => !k.bild.includes('gradient')),
          `${knoepfe.length} Knöpfe`
        );
      }
      await kontext.close();
    }
  }

  if (MESSEN) {
    // Glas: ein offenes Menü in der Verwaltung trägt backdrop-filter, die
    // Tabelle darunter nicht.
    const kontext = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 900 },
      storageState: await api.storageState(),
    });
    const seite = await kontext.newPage();
    await seite.goto(`${URL}/workspace/verwaltung/benutzer`, { waitUntil: 'domcontentloaded' });
    await seite.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const glas = await seite.evaluate(() => {
      const mit = Array.from(document.querySelectorAll('body *')).filter(e => {
        const f = getComputedStyle(e).backdropFilter;
        return f && f !== 'none';
      });
      return mit.map(e => e.getAttribute('data-slot') || e.tagName.toLowerCase());
    });
    pruefe('Ohne offenes Menü: Inhalt ohne Glas', !glas.some(g => /table|card|input/.test(g)), glas.join(', ') || 'kein Glas');
    const menueKnopf = seite.locator('[aria-haspopup="menu"]').first();
    if (await menueKnopf.count()) {
      await menueKnopf.click();
      await seite.waitForTimeout(400);
      const menue = await seite.evaluate(() => {
        const m = document.querySelector('[role="menu"]');
        return m ? getComputedStyle(m).backdropFilter : null;
      });
      pruefe('Offenes Menü ist Glas', menue && menue !== 'none', String(menue));
      await seite.screenshot({ path: path.join(ZIEL, 'menue-glas-hell-1440.png') });
      await seite.keyboard.press('Escape');
    }
    await kontext.close();
  }
} finally {
  await browser.close();
  const r = await api.put('/api/darstellung', { headers: await kopf(), data: { theme: themeVorher } });
  pruefe(`Theme wieder ${themeVorher}`, r.ok(), `HTTP ${r.status()}`);
  await api.post('/api/auth/logout', { headers: await kopf() }).catch(() => {});
}

const rot = ergebnisse.filter(e => !e.ok).length;
console.log(`\n${ergebnisse.length - rot} gruen, ${rot} rot`);
process.exit(rot ? 1 : 0);
