/**
 * Live-Abnahme des Terminals auf dem Geraet (Plan 023, Phase F).
 *
 * Zwei Dinge lassen sich nur im echten Browser messen und nicht behaupten:
 *
 *   F1  Bleibt die Kopfzeile einzeilig? Gemessen wird ihre HOEHE bei mehreren
 *       Panel-Breiten. Ein Umbruch verdoppelt sie, das ist eindeutig.
 *   F2  Steht im Terminal ein Farbwert, der nicht aus den Themenwerten kommt?
 *       Gemessen werden die tatsaechlich gerechneten Farben aller Elemente,
 *       nicht die Klassennamen im Quelltext.
 *
 * Die ANSI-Palette von xterm ist ausdruecklich KEIN Verstoss: sie ist das, was
 * ein Programm im Terminal anfordert, wenn es gruen schreibt. Sie auf Blau zu
 * ziehen hiesse, `git diff` die Bedeutung seiner Farben zu nehmen.
 *
 * Aufruf, mit einem Tunnel auf den Orin:
 *
 *   ssh -f -N -L 8443:localhost:443 jetson
 *   node scripts/test/terminal-abnahme.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const BENUTZER = process.env.ARASUL_BENUTZER || 'admin';
const PASSWORT = process.env.ARASUL_PASSWORT || '2309';

/**
 * Den Erst-Start-Assistenten wegnehmen.
 *
 * Er erscheint einmal je Browser (localStorage-Flag) und legt eine Flaeche
 * ueber die Seite. Ein frischer Browser sieht ihn also bei JEDER Abnahme, und
 * gemessen wuerde dann eine Oberflaeche hinter einem Vorhang. Das Flag wird
 * VOR dem Anmelden gesetzt, damit er gar nicht erst aufgeht.
 */
async function assistentUeberspringen(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem('arasul-onboarding-seen-v1', '1');
    } catch {
      /* nicht lesbar, dann eben mit Vorhang */
    }
  });
}

const ergebnisse = [];
function pruefe(was, ok, detail = '') {
  ergebnisse.push({ was, ok });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
}

/** Die Grundfarben des Themas, gegen die F2 prueft. */
async function themenfarben(page) {
  return page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    const namen = [
      '--background',
      '--foreground',
      '--card',
      '--muted',
      '--muted-foreground',
      '--primary',
      '--primary-foreground',
      '--destructive',
      '--border',
      '--accent',
      '--accent-foreground',
      '--popover',
      '--popover-foreground',
      '--success',
    ];
    const werte = {};
    for (const n of namen) {
      const v = s.getPropertyValue(n).trim();
      if (v) werte[n] = v;
    }
    return werte;
  });
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1800, height: 1000 },
});
const page = await ctx.newPage();

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await assistentUeberspringen(page);
  const pw = page.locator('input[type="password"]');
  await pw.waitFor({ timeout: 20000 }).catch(() => {});
  if (await pw.count()) {
    await page.getByLabel(/Benutzername/i).fill(BENUTZER);
    await pw.fill(PASSWORT);
    await page.getByRole('button', { name: /Anmelden/i }).click();
  }
  await page.waitForTimeout(6000);

  // Auf das Terminal umschalten. Der Umschalter ist ein `role="tab"` im
  // Segment-Kopf des rechten Panels, kein Knopf mit Beschriftung.
  const reiter = page.getByRole('tab', { name: 'Terminal' }).first();
  await reiter.click({ timeout: 20000 }).catch(() => {});
  // Der erste Aufruf startet ggf. den Sandbox-Container; das dauert.
  await page.waitForTimeout(8000);
  // Ein eigenes Kennzeichen, kein geratener Aufbau.
  //
  // Der erste Versuch suchte den Kasten, der den Verbindungszustand enthaelt.
  // Das ging genau so lange gut, bis der Umbau den Zustand in eine eigene
  // Huelle steckte: danach traf der Selektor ein inneres Element von 40 Pixeln
  // Breite und meldete 19 Pixel Hoehe, also gruen. Ein gruenes Ergebnis aus
  // einem falschen Selektor ist schlimmer als ein rotes.
  const kopf = page.locator('[data-testid="terminal-kopfzeile"]').first();
  const kopfDa = await kopf.waitFor({ timeout: 120000 }).then(
    () => true,
    () => false
  );
  pruefe('Terminal-Kopfzeile ist da', kopfDa);

  if (kopfDa) {
    // --- F1: einzeilig bei jeder Breite ------------------------------------
    // Gemessen wird die Hoehe der Kopfzeile. Eine Zeile sind rund 26 Pixel;
    // ein Umbruch macht daraus rund 46. Die Grenze liegt deshalb bei 34.
    const EINZEILIG_MAX = 34;
    const hoehen = [];
    for (const breite of [400, 500, 700, 900, 1200, 1500, 1800]) {
      await page.setViewportSize({ width: breite, height: 1000 });
      await page.waitForTimeout(600);
      const mass = await kopf.evaluate(el => {
        const r = el.getBoundingClientRect();
        return { hoehe: Math.round(r.height), breite: Math.round(r.width) };
      });
      hoehen.push({ fenster: breite, ...mass });
    }
    for (const h of hoehen) {
      pruefe(
        `F1: einzeilig bei ${h.fenster} px Fenster`,
        h.hoehe > 0 && h.hoehe <= EINZEILIG_MAX,
        `Kopfzeile ${h.breite} px breit, ${h.hoehe} px hoch`
      );
    }

    // --- F2: kein Farbwert ausserhalb der Themenwerte ------------------------
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.waitForTimeout(600);
    const werte = await themenfarben(page);
    const fremde = await page.evaluate(erlaubt => {
      const panel = document.querySelector('[data-testid="workspace-terminal-panel"]');
      if (!panel) return null;
      // Ein Element in einen Farbwert uebersetzen, damit sich die Themenwerte
      // (die als `oklch(...)` oder als Kanaele dastehen) mit den gerechneten
      // `rgb(...)` vergleichen lassen.
      const probe = document.createElement('span');
      probe.style.display = 'none';
      document.body.appendChild(probe);
      const alsRgb = wert => {
        probe.style.color = '';
        probe.style.color = wert;
        return getComputedStyle(probe).color;
      };
      const erlaubteRgb = new Set();
      for (const v of Object.values(erlaubt)) {
        const direkt = alsRgb(v);
        if (direkt) erlaubteRgb.add(direkt);
        const alsVar = alsRgb(`rgb(${v})`);
        if (alsVar) erlaubteRgb.add(alsVar);
      }
      // Durchsichtig und geerbt zaehlen nicht.
      const egal = new Set(['rgba(0, 0, 0, 0)', 'transparent']);
      const gefunden = [];
      for (const el of panel.querySelectorAll('*')) {
        // Der xterm-Bereich traegt die ANSI-Palette. Sie ist das, was ein
        // Programm anfordert, wenn es gruen schreibt, und ausdruecklich kein
        // Verstoss.
        if (el.closest('.xterm')) continue;
        const s = getComputedStyle(el);
        for (const eig of ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor']) {
          const w = s[eig];
          if (!w || egal.has(w)) continue;
          // Halbdurchsichtige Ableitungen einer Themenfarbe (bg-primary/10,
          // border-primary/30) sind gewollt. Je nach Farbraum stehen sie als
          // `rgba(...)` oder als `oklab(... / 0.3)` da; erkennbar sind beide am
          // Alpha-Anteil, nicht an der Schreibweise.
          if (w.startsWith('rgba(') || /\/\s*0?\.\d+\s*\)/.test(w)) continue;
          if (!erlaubteRgb.has(w)) {
            gefunden.push(`${eig}=${w} an .${(el.className || '').toString().slice(0, 40)}`);
          }
        }
      }
      probe.remove();
      return [...new Set(gefunden)];
    }, werte);

    if (fremde === null) {
      pruefe('F2: Terminalbereich messbar', false, 'kein Panel');
    } else {
      pruefe(
        'F2: kein Farbwert ausserhalb der Themenwerte',
        fremde.length === 0,
        fremde.length ? fremde.slice(0, 4).join(' | ') : `${Object.keys(werte).length} Themenwerte`
      );
    }
    await page.screenshot({ path: '/tmp/abnahme-terminal.png' });
  }
} catch (err) {
  pruefe('Durchlauf ohne Ausnahme', false, String(err.message).slice(0, 200));
} finally {
  await browser.close();
}

const rot = ergebnisse.filter(e => !e.ok);
console.log(`\n${ergebnisse.length - rot.length} von ${ergebnisse.length} gruen`);
process.exit(rot.length === 0 ? 0 : 1);
