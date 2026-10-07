/**
 * Bilder und Messung der Karte jet-rahmen-einheitlich (M5, 07.10.2026).
 *
 * Eine Seitenleiste für alles: Verwaltung, Einstellungen und jede App tragen
 * das Muster `Seitenleiste` mit Titel oben, Zeilen 32 px, Symbol 16 px, 2 px
 * Abstand, Auswahl getönt, Gruppen mit Überschrift. Die Einstellungen haben je
 * Bereich eine Seite, das eigene Bild steht in der Fußzeile mit einem Menü nur
 * „Abmelden", am Handy ist „Abmelden" der letzte Eintrag der Einstellungen,
 * und jedes Konto folgt beim Erscheinungsbild dem System (Migration 212).
 *
 * Fotografiert werden Start, Verwaltung je Bereich, Einstellungen je Bereich
 * und eine App, je dreimal: Desktop hell, Desktop dunkel (1440 x 900) und
 * Handy hell (390 x 844). Hell und dunkel kommen aus dem System des Browsers
 * (`colorScheme`): das Konto steht seit Migration 212 auf `system`, und genau
 * das prüft dieses Skript mit, statt das Theme am Gerät umzustellen.
 *
 * Gemessen wird jeder Wechsel zwischen Apps und Bereichen (Klick bis zum
 * gezeichneten Ziel, im Browser), drei Runden, ab der zweiten unter 200 ms.
 *
 * DIE APP ist eine eigene Probe (`tests/marken-laufzeit-app`, lädt die
 * Bibliothek vom Gerät). Sie wird vorher mit
 * `ARASUL_SCHRITTE=einspielen node scripts/test/marken-laufzeit-abnahme.mjs`
 * eingespielt und danach mit `ARASUL_SCHRITTE=entfernen` entfernt; an einer
 * echten App des Geräts fotografiert dieses Skript nie.
 *
 * Konten nur aus der Umgebung, nie `admin`, kein neues Konto:
 *
 *   ARASUL_URL=https://100.121.244.80 ARASUL_APP=probe-rahmen-1007 \
 *   ARASUL_ADMIN_PW="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
 *   ARASUL_MA_PW="$(geheim get 'Arasul Orin Probe-Konto probe-j36-a')" \
 *   ARASUL_PLAYWRIGHT=/Users/koljaschope/Code/arasul/arasul-jet \
 *     node scripts/test/rahmen-einheitlich-bilder.mjs
 *
 * Bilder unter docs/plans/audits/<tag>-rahmen-einheitlich/. Rückgabe 0, wenn
 * jede Prüfung grün war, sonst 1.
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
const { chromium } = await ladePlaywright();

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://100.121.244.80';
const APP = process.env.ARASUL_APP || '';
const TAG = process.env.ARASUL_TAG || new Date().toISOString().slice(0, 10);
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-rahmen-einheitlich`);
const GRENZE_MS = 200;
const RUNDEN = 3;

const VERWALTUNG = [
  'benutzer',
  'apps',
  'laeufe',
  'firmenordner',
  'modelle',
  'system',
  'daten',
  'geraet',
];
const EINSTELLUNGEN = ['profil', 'passwort', 'rechner', 'erscheinungsbild'];

const ADMIN = { benutzer: 'probe-admin', passwort: process.env.ARASUL_ADMIN_PW || '' };
const MA = { benutzer: 'probe-j36-a', passwort: process.env.ARASUL_MA_PW || '' };

const ANSICHTEN = [
  { name: 'desktop-hell', viewport: { width: 1440, height: 900 }, colorScheme: 'light' },
  { name: 'desktop-dunkel', viewport: { width: 1440, height: 900 }, colorScheme: 'dark' },
  { name: 'handy-hell', viewport: { width: 390, height: 844 }, colorScheme: 'light' },
];

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok: Boolean(ok) });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
  return Boolean(ok);
};

for (const k of [ADMIN, MA]) {
  if (!k.passwort) {
    console.log(`ROT    Passwort für ${k.benutzer} fehlt -- der Aufrufer setzt es aus Bitwarden.`);
    process.exit(1);
  }
}
fs.mkdirSync(ZIEL, { recursive: true });

async function anmelden(browser, konto, ansicht) {
  const kontext = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: ansicht.viewport,
    colorScheme: ansicht.colorScheme,
    deviceScaleFactor: ansicht.viewport.width < 900 ? 2 : 1,
  });
  const seite = await kontext.newPage();
  await seite.goto(URL, { waitUntil: 'domcontentloaded' });
  await seite.fill('input[name="username"], input[type="text"]', konto.benutzer);
  await seite.fill('input[type="password"]', konto.passwort);
  await seite.click('button[type="submit"]');
  await seite.waitForURL(/\/workspace/, { timeout: 30000 });
  await seite.locator('[data-testid="workspace-shell"]').waitFor({ timeout: 30000 });
  return { kontext, seite };
}

/** Abmelden über die Oberfläche, damit keine Sitzung des Probekontos offen bleibt. */
async function abmelden(seite, schmal) {
  try {
    if (schmal) {
      await geh(seite, '/workspace/settings');
      await seite.getByTestId('einstellungen-bereiche-oeffnen').click();
    } else {
      await seite.getByTestId('workspace-benutzermenue').click();
    }
    await seite.getByTestId('workspace-abmelden').click();
    await seite.locator('input[type="password"]').waitFor({ timeout: 15000 });
  } catch (fehler) {
    pruefe('Abmelden über die Oberfläche', false, String(fehler).slice(0, 80));
  }
}

async function geh(seite, pfad) {
  await seite.goto(`${URL}${pfad}`, { waitUntil: 'domcontentloaded' });
  await seite.locator('[data-testid="workspace-ansicht"]').waitFor({ timeout: 30000 });
  await seite.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await seite.waitForTimeout(700);
}

async function bild(seite, name) {
  await seite.screenshot({ path: path.join(ZIEL, `${name}.png`) });
}

/** Die Maße einer Leiste: Titel, Zeilenhöhe, Symbol, Abstand, Auswahl. */
async function leisteMessen(rahmen, kennzeichen) {
  return rahmen.evaluate(k => {
    const nav = k
      ? document.querySelector(`[data-testid="${k}"]`)
      : document.querySelector('[data-sidebar="content"]');
    if (!nav) return null;
    const leiste = nav.closest('[data-sidebar="sidebar"]') || nav.parentElement;
    const titel = leiste?.querySelector('[data-slot="sidebar-titel"]')?.textContent ?? null;
    const knoepfe = Array.from(nav.querySelectorAll('[data-sidebar="menu-button"]'));
    const erster = knoepfe[0];
    const zweiter = knoepfe[1];
    const svg = erster?.querySelector('svg');
    const aktiv = nav.querySelector('[data-sidebar="menu-button"][data-active="true"]');
    const gruppen = Array.from(nav.querySelectorAll('[data-sidebar="group-label"]')).map(
      g => g.textContent
    );
    return {
      titel,
      gruppen,
      zeile: erster ? erster.getBoundingClientRect().height : 0,
      symbol: svg ? svg.getBoundingClientRect().width : 0,
      abstand:
        erster &&
        zweiter &&
        erster.parentElement?.parentElement === zweiter.parentElement?.parentElement
          ? zweiter.getBoundingClientRect().top - erster.getBoundingClientRect().bottom
          : null,
      auswahl: aktiv ? getComputedStyle(aktiv).backgroundColor : null,
    };
  }, kennzeichen);
}

function leistePruefen(wer, m, titel) {
  if (!pruefe(`${wer}: Leiste steht da`, m)) return;
  pruefe(`${wer}: Titel oben „${titel}"`, m.titel === titel, m.titel ?? 'kein Titel');
  pruefe(`${wer}: Gruppen mit Überschrift`, m.gruppen.length > 0, m.gruppen.join(', '));
  pruefe(`${wer}: Zeilen 32 px`, Math.round(m.zeile) === 32, `${m.zeile}`);
  pruefe(`${wer}: Symbol 16 px`, Math.round(m.symbol) === 16, `${m.symbol}`);
  pruefe(`${wer}: 2 px Abstand`, m.abstand !== null && Math.round(m.abstand) === 2, `${m.abstand}`);
  pruefe(
    `${wer}: Auswahl getönt`,
    m.auswahl && m.auswahl !== 'rgba(0, 0, 0, 0)' && m.auswahl !== 'transparent',
    m.auswahl ?? 'keine Auswahl'
  );
}

async function wechsel(seite, klick, ziel) {
  return seite.evaluate(
    async ({ klick, ziel }) => {
      const knopf = document.querySelector(klick);
      if (!knopf) return -1;
      const t0 = performance.now();
      knopf.click();
      const da = await new Promise(fertig => {
        const schau = () => {
          if (document.querySelector(ziel)) requestAnimationFrame(() => fertig(true));
          else if (performance.now() - t0 > 5000) fertig(false);
          else requestAnimationFrame(schau);
        };
        schau();
      });
      return da ? performance.now() - t0 : -1;
    },
    { klick, ziel }
  );
}

async function wechselMessen(seite) {
  const ziele = [
    {
      name: 'Startseite',
      klick: '[data-testid="leiste-startseite"]',
      ziel: '[data-ansicht="dashboard"]',
    },
  ];
  if (APP) {
    ziele.push({
      name: 'App',
      klick: `[data-testid="leiste-app-${APP}-live"]`,
      ziel: `iframe[src="/apps/${APP}/"]`,
    });
  }
  ziele.push({
    name: 'Verwaltung',
    klick: '[data-testid="leiste-verwaltung"]',
    ziel: '[data-testid="verwaltung-bereiche"]',
  });
  for (const b of VERWALTUNG) {
    ziele.push({
      name: `Verwaltung ${b}`,
      klick: `[data-testid="verwaltung-${b}"]`,
      ziel: `[data-testid="verwaltung-${b}"][aria-current="page"]`,
    });
  }
  ziele.push({
    name: 'Einstellungen',
    klick: '[data-testid="leiste-einstellungen"]',
    ziel: '[data-testid="einstellungen-bereiche"]',
  });
  for (const b of EINSTELLUNGEN) {
    ziele.push({
      name: `Einstellungen ${b}`,
      klick: `[data-testid="einstellungen-${b}"]`,
      ziel: `[data-testid="einstellungen-${b}"][aria-current="page"]`,
    });
  }
  const zeiten = {};
  for (let runde = 1; runde <= RUNDEN; runde++) {
    for (const z of ziele) {
      const ms = await wechsel(seite, z.klick, z.ziel);
      (zeiten[z.name] ||= []).push(ms);
      await seite.waitForTimeout(300);
    }
  }
  let hoechste = 0;
  for (const [name, liste] of Object.entries(zeiten)) {
    const warm = liste.slice(1);
    const max = Math.max(...warm);
    hoechste = Math.max(hoechste, max);
    pruefe(
      `Wechsel zu ${name} unter ${GRENZE_MS} ms`,
      Math.min(...warm) >= 0 && max < GRENZE_MS,
      `erste ${liste[0].toFixed(0)} ms, danach höchstens ${max.toFixed(0)} ms`
    );
  }
  console.log(`       langsamster Wechsel ab Runde 2: ${hoechste.toFixed(0)} ms`);
}

const browser = await chromium.launch({
  headless: true,
  ...(process.env.ARASUL_CHROMIUM ? { executablePath: process.env.ARASUL_CHROMIUM } : {}),
});
try {
  for (const ansicht of ANSICHTEN) {
    const schmal = ansicht.viewport.width < 900;
    const { kontext, seite } = await anmelden(browser, ADMIN, ansicht);
    const fehler = [];
    seite.on('pageerror', e => fehler.push(String(e)));

    if (ansicht.name === 'desktop-hell') {
      const theme = await seite.evaluate(async () => {
        const r = await fetch('/api/auth/session', { credentials: 'include' });
        const j = await r.json().catch(() => ({}));
        return j.user?.theme ?? j.data?.user?.theme ?? j.theme ?? null;
      });
      pruefe('probe-admin folgt dem System (Migration 212)', theme === 'system', `${theme}`);
    }
    pruefe(
      `${ansicht.name}: das Theme folgt dem Browser`,
      (await seite.evaluate(
        () => document.documentElement.getAttribute('data-theme') || 'light'
      )) === (ansicht.colorScheme === 'dark' ? 'dark' : 'light')
    );

    await geh(seite, '/workspace/dashboard');
    await bild(seite, `start-${ansicht.name}`);

    if (!schmal) {
      pruefe(
        `${ansicht.name}: kein eigenes Bild in der Aktivitätsleiste`,
        (await seite
          .locator('[data-testid="aktivitaetsleiste"] [data-testid="workspace-benutzermenue"]')
          .count()) === 0
      );
      const fuss = seite.getByTestId('statusbar');
      pruefe(
        `${ansicht.name}: Fußzeile links Bild, Name, Rolle`,
        (await fuss.getByTestId('workspace-benutzermenue').count()) === 1 &&
          (await fuss.getByTestId('statusbar-rolle').textContent()) === 'Administrator'
      );
      await fuss.getByTestId('workspace-benutzermenue').click();
      const menue = seite.locator('[role="menu"]');
      await menue.waitFor({ timeout: 5000 });
      await seite.waitForTimeout(300);
      const eintraege = await menue.locator('[role="menuitem"]').allTextContents();
      pruefe(
        `${ansicht.name}: Menü nur „Abmelden"`,
        eintraege.length === 1 && eintraege[0].trim() === 'Abmelden',
        eintraege.join(', ')
      );
      await bild(seite, `kontomenue-${ansicht.name}`);
      await seite.keyboard.press('Escape');
    }

    for (const b of VERWALTUNG) {
      await geh(seite, `/workspace/verwaltung/${b}`);
      await bild(seite, `verwaltung-${b}-${ansicht.name}`);
    }
    if (!schmal) {
      await geh(seite, '/workspace/verwaltung/benutzer');
      leistePruefen(
        `${ansicht.name} Verwaltung`,
        await leisteMessen(seite, 'verwaltung-bereiche'),
        'Verwaltung'
      );
    } else {
      await geh(seite, '/workspace/verwaltung/benutzer');
      await seite.getByTestId('verwaltung-bereiche-oeffnen').click();
      await seite.getByTestId('verwaltung-bereiche').waitFor({ timeout: 5000 });
      await seite.waitForTimeout(500);
      await bild(seite, `verwaltung-leiste-${ansicht.name}`);
      await seite.keyboard.press('Escape');
    }

    for (const b of EINSTELLUNGEN) {
      await geh(seite, `/workspace/settings/${b}`);
      pruefe(
        `${ansicht.name}: Einstellungen ${b} ist eine eigene Seite`,
        (await seite.locator('h1').count()) === 1
      );
      await bild(seite, `einstellungen-${b}-${ansicht.name}`);
    }
    if (!schmal) {
      await geh(seite, '/workspace/settings/profil');
      leistePruefen(
        `${ansicht.name} Einstellungen`,
        await leisteMessen(seite, 'einstellungen-bereiche'),
        'Einstellungen'
      );
      pruefe(
        `${ansicht.name}: kein Abmelden in der Leiste der Einstellungen`,
        (await seite
          .getByTestId('einstellungen-bereiche')
          .getByTestId('workspace-abmelden')
          .count()) === 0
      );
    } else {
      await geh(seite, '/workspace/settings/profil');
      await seite.getByTestId('einstellungen-bereiche-oeffnen').click();
      const leiste = seite.getByTestId('einstellungen-bereiche');
      await leiste.waitFor({ timeout: 5000 });
      await seite.waitForTimeout(500);
      pruefe(
        `${ansicht.name}: Abmelden ist der letzte Eintrag der Einstellungen`,
        (await leiste
          .locator('[data-sidebar="menu-button"]')
          .last()
          .getAttribute('data-testid')) === 'workspace-abmelden'
      );
      await bild(seite, `einstellungen-leiste-${ansicht.name}`);
      await seite.keyboard.press('Escape');
      pruefe(
        `${ansicht.name}: unter „Mehr" kein Abmelden`,
        await (async () => {
          await seite.getByTestId('leiste-mehr').click();
          const m = seite.getByTestId('leiste-mehr-menue');
          await m.waitFor({ timeout: 5000 });
          const n = await m.getByTestId('workspace-abmelden').count();
          await seite.keyboard.press('Escape');
          return n === 0;
        })()
      );
    }

    if (APP) {
      await geh(seite, `/workspace/app/${APP}`);
      const rahmen = seite.frameLocator(`iframe[src="/apps/${APP}/"]`);
      await rahmen
        .locator('[data-sidebar="menu-button"]')
        .first()
        .waitFor({ timeout: 30000 })
        .catch(() => {});
      await seite.waitForTimeout(1500);
      await bild(seite, `app-${ansicht.name}`);
      if (!schmal) {
        const frame = seite.frames().find(f => f.url().includes(`/apps/${APP}/`));
        leistePruefen(
          `${ansicht.name} App`,
          frame ? await leisteMessen(frame, null) : null,
          'Marken zur Laufzeit'
        );
      }
    }

    if (ansicht.name === 'desktop-hell') await wechselMessen(seite);

    pruefe(
      `${ansicht.name}: kein Fehler in der Seite`,
      fehler.length === 0,
      fehler[0]?.slice(0, 100)
    );
    await abmelden(seite, schmal);
    await kontext.close();
  }

  // Der Mitarbeiter sieht dieselben Einstellungen, am Handy mit Abmelden zuletzt.
  for (const ansicht of [ANSICHTEN[0], ANSICHTEN[2]]) {
    const schmal = ansicht.viewport.width < 900;
    const { kontext, seite } = await anmelden(browser, MA, ansicht);
    await geh(seite, '/workspace/settings/erscheinungsbild');
    await bild(seite, `mitarbeiter-einstellungen-${ansicht.name}`);
    if (!schmal) {
      leistePruefen(
        `Mitarbeiter ${ansicht.name}`,
        await leisteMessen(seite, 'einstellungen-bereiche'),
        'Einstellungen'
      );
      pruefe(
        'Mitarbeiter: Rolle in der Fußzeile',
        (await seite.getByTestId('statusbar-rolle').textContent()) === 'Mitarbeiter'
      );
    }
    await abmelden(seite, schmal);
    await kontext.close();
  }
} finally {
  await browser.close();
}

const rot = ergebnisse.filter(e => !e.ok).length;
console.log(
  `\n${ergebnisse.length - rot} gruen, ${rot} rot, Bilder in ${path.relative(WURZEL, ZIEL)}`
);
process.exit(rot === 0 ? 0 : 1);
