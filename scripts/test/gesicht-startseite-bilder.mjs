/**
 * Bilder und Messung der Karte jet-gesicht-startseite (M5, 07.10.2026).
 *
 * Das Gesicht: oben auf der Startseite ein blaues Band mit dem Gruß mit
 * Vorname und dem Knopf „N Freigaben warten auf Sie" (sonst „Alles
 * erledigt"), das beim ersten Laden einmal in etwa 300 ms einblendet und bei
 * „weniger Bewegung" steht; darunter Kacheln mit Symbol auf blau getöntem
 * Quadrat, Name und einer Zeile offener Freigaben, beim Überfahren leicht
 * angehoben; jeder Hauptknopf mit leichtem Blauverlauf, hell und dunkel; eine
 * App ohne Symbol zeigt ein neutrales Bild, keine Buchstaben, in der Leiste,
 * in der Leiste am Handy und auf der Kachel.
 *
 * Fotografiert wird die Startseite für probe-admin und den Mitarbeiter, je
 * Desktop hell, Desktop dunkel (1440 x 900) und Handy hell (390 x 844), dazu
 * eine angehobene Kachel und eine App mit Hauptknopf (die Probe
 * `tests/marken-laufzeit-app`, Seite Freigaben, Knopf „Prüfen"). Gemessen
 * wird jeder Wechsel Startseite, App, Verwaltung, Einstellungen, drei Runden,
 * ab der zweiten unter 200 ms.
 *
 * Die Probe-App wird vorher mit
 * `ARASUL_SCHRITTE=einspielen node scripts/test/marken-laufzeit-abnahme.mjs`
 * eingespielt und danach mit `ARASUL_SCHRITTE=entfernen` entfernt; an einer
 * echten App des Geräts drückt dieses Skript keinen Knopf.
 *
 * Konten nur aus der Umgebung, nie `admin`, kein neues Konto:
 *
 *   ARASUL_URL=https://100.121.244.80 ARASUL_APP=probe-gesicht-1007 \
 *   ARASUL_ADMIN_PW="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
 *   ARASUL_MA_PW="$(geheim get 'Arasul Orin Probe-Konto probe-j36-a')" \
 *   ARASUL_PLAYWRIGHT=/Users/koljaschope/Code/arasul/arasul-jet \
 *     node scripts/test/gesicht-startseite-bilder.mjs
 *
 * Bilder unter docs/plans/audits/<tag>-gesicht-startseite/. Rückgabe 0, wenn
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
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-gesicht-startseite`);
const GRENZE_MS = 200;
const RUNDEN = 3;

const ADMIN = {
  name: 'admin',
  benutzer: 'probe-admin',
  passwort: process.env.ARASUL_ADMIN_PW || '',
};
const MA = { name: 'ma', benutzer: 'probe-j36-a', passwort: process.env.ARASUL_MA_PW || '' };

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
    console.log(`ROT    Passwort für ${k.benutzer} fehlt: der Aufrufer setzt es aus Bitwarden.`);
    process.exit(1);
  }
}
fs.mkdirSync(ZIEL, { recursive: true });

async function anmelden(browser, konto, ansicht, extra = {}) {
  const kontext = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: ansicht.viewport,
    colorScheme: ansicht.colorScheme,
    deviceScaleFactor: ansicht.viewport.width < 900 ? 2 : 1,
    ...extra,
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
      await seite.goto(`${URL}/workspace/settings/profil`, { waitUntil: 'domcontentloaded' });
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

async function bild(seite, name) {
  await seite.screenshot({ path: path.join(ZIEL, `${name}.png`) });
}

/** Was das Band zeigt und wie es gezeichnet ist, gleich nach dem ersten Zeichnen. */
async function bandLesen(seite) {
  return seite.evaluate(() => {
    const band = document.querySelector('[data-testid="startband"]');
    if (!band) return null;
    const stil = getComputedStyle(band);
    const knopf = band.querySelector('[data-testid="startband-freigaben"]');
    const erledigt = band.querySelector('[data-testid="startband-erledigt"]');
    const zahl = document.querySelector('[data-testid="leiste-freigaben-zahl"]');
    const hinweise = document.querySelector('[data-testid="admin-hinweise"]');
    return {
      titel: band.querySelector('h1')?.textContent ?? null,
      text: band.textContent ?? '',
      verlauf: stil.backgroundImage,
      animation: stil.animationName,
      dauer: stil.animationDuration,
      eingeblendet: band.getAttribute('data-eingeblendet'),
      knopf: knopf?.textContent?.trim() ?? null,
      knopfVerlauf: knopf ? getComputedStyle(knopf).backgroundImage : null,
      erledigt: erledigt?.textContent?.trim() ?? null,
      leistenZahl: zahl ? zahl.textContent : '0',
      hinweiseImBand: hinweise ? band.contains(hinweise) : false,
      hinweiseDarunter: hinweise
        ? Boolean(band.compareDocumentPosition(hinweise) & Node.DOCUMENT_POSITION_FOLLOWING)
        : null,
    };
  });
}

const ZAHLWORT = [
  'Keine',
  'Eine',
  'Zwei',
  'Drei',
  'Vier',
  'Fünf',
  'Sechs',
  'Sieben',
  'Acht',
  'Neun',
  'Zehn',
  'Elf',
  'Zwölf',
];
const satzFuer = n =>
  n === 1 ? 'Eine Freigabe wartet auf Sie' : `${ZAHLWORT[n] ?? n} Freigaben warten auf Sie`;

function bandPruefen(wer, b, vorname) {
  if (!pruefe(`${wer}: blaues Band oben`, b)) return;
  pruefe(
    `${wer}: Gruß mit Vorname`,
    b.titel === `Guten Tag, ${vorname}`,
    `${b.titel} (erwartet Guten Tag, ${vorname})`
  );
  pruefe(`${wer}: Band mit Blauverlauf`, /gradient/.test(b.verlauf), b.verlauf.slice(0, 60));
  const n = Number(b.leistenZahl === '99+' ? 100 : b.leistenZahl);
  if (n > 0) {
    pruefe(`${wer}: Knopf „${satzFuer(n)}"`, b.knopf === satzFuer(n), b.knopf ?? 'kein Knopf');
    pruefe(
      `${wer}: Knopf im Band mit Blauverlauf`,
      /gradient/.test(b.knopfVerlauf ?? ''),
      (b.knopfVerlauf ?? '').slice(0, 60)
    );
  } else {
    pruefe(`${wer}: „Alles erledigt"`, b.erledigt === 'Alles erledigt', b.erledigt ?? '-');
  }
  pruefe(
    `${wer}: keine Technik im Band`,
    !/GPU|CPU|Fassung|Modell|Speicher|Sicherung|Lizenz|Update/.test(b.text),
    b.text.slice(0, 80)
  );
  if (b.hinweiseDarunter !== null) {
    pruefe(
      `${wer}: Hinweise des Administrators unter dem Band, nicht darin`,
      !b.hinweiseImBand && b.hinweiseDarunter
    );
  }
}

/** Kacheln: Symbol auf getöntem Quadrat, Name, Zeile offener Freigaben, kein Kürzel. */
async function kachelnLesen(seite) {
  return seite.evaluate(() =>
    Array.from(document.querySelectorAll('button.ara-karte[data-testid^="uebersicht-app-"]')).map(
      k => {
        const quadrat = k.querySelector('.ara-karte__symbol');
        return {
          id: k.getAttribute('data-testid'),
          name: k.querySelector('.ara-karte__titel')?.textContent ?? '',
          zeile: k.querySelector('.ara-karte__inhalt')?.textContent ?? '',
          quadrat: quadrat ? getComputedStyle(quadrat).backgroundColor : null,
          svg: Boolean(quadrat?.querySelector('svg')),
          neutral: Boolean(quadrat?.querySelector('[data-testid="app-symbol-neutral"]')),
          kuerzel: quadrat?.querySelector('[data-testid="app-kuerzel"]')?.textContent ?? null,
        };
      }
    )
  );
}

/** Die Symbole der Leiste (links oder unten): Bild, neutrales Bild oder Text. */
async function leisteLesen(seite) {
  return seite.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="leiste-app-"]')).map(k => ({
      id: k.getAttribute('data-testid'),
      svg: Boolean(k.querySelector('svg')),
      neutral: Boolean(k.querySelector('[data-testid="app-symbol-neutral"]')),
      kuerzel: k.querySelector('[data-testid="app-kuerzel"]')?.textContent ?? null,
    }))
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
      ziel: '[data-testid="startband"]',
    },
  ];
  if (APP) {
    ziele.push({
      name: 'App',
      klick: `[data-testid="leiste-app-${APP}-live"]`,
      ziel: `iframe[src="/apps/${APP}/"]`,
    });
  }
  ziele.push(
    {
      name: 'Verwaltung',
      klick: '[data-testid="leiste-verwaltung"]',
      ziel: '[data-testid="verwaltung-bereiche"]',
    },
    {
      name: 'Einstellungen',
      klick: '[data-testid="leiste-einstellungen"]',
      ziel: '[data-testid="einstellungen-bereiche"]',
    }
  );
  const zeiten = {};
  for (let runde = 1; runde <= RUNDEN; runde++) {
    for (const z of ziele) {
      const ms = await wechsel(seite, z.klick, z.ziel);
      (zeiten[z.name] ||= []).push(ms);
      await seite.waitForTimeout(300);
    }
  }
  for (const [name, liste] of Object.entries(zeiten)) {
    const warm = liste.slice(1);
    const max = Math.max(...warm);
    pruefe(
      `Wechsel zu ${name} unter ${GRENZE_MS} ms`,
      Math.min(...warm) >= 0 && max < GRENZE_MS,
      `erste ${liste[0].toFixed(0)} ms, danach höchstens ${max.toFixed(0)} ms`
    );
  }
}

async function vornameVon(seite) {
  return seite.evaluate(async () => {
    const r = await fetch('/api/auth/me', { credentials: 'include' });
    const j = await r.json().catch(() => ({}));
    const u = j.user ?? j.data?.user ?? j;
    return (u.vorname || '').trim() || u.anzeigeName || u.anzeige_name || u.username || '';
  });
}

const browser = await chromium.launch({
  headless: true,
  ...(process.env.ARASUL_CHROMIUM ? { executablePath: process.env.ARASUL_CHROMIUM } : {}),
});
try {
  for (const konto of [ADMIN, MA]) {
    for (const ansicht of ANSICHTEN) {
      const schmal = ansicht.viewport.width < 900;
      const wer = `${konto.name} ${ansicht.name}`;
      const { kontext, seite } = await anmelden(browser, konto, ansicht);
      const fehler = [];
      seite.on('pageerror', e => fehler.push(String(e)));

      // Das erste Zeichnen nach der Anmeldung: das Band blendet ein.
      await seite.locator('[data-testid="startband"]').waitFor({ timeout: 30000 });
      const erst = await bandLesen(seite);
      pruefe(
        `${wer}: Band blendet beim ersten Laden ein (etwa 300 ms)`,
        erst?.eingeblendet === 'true' && erst.animation !== 'none' && erst.dauer === '0.3s',
        `${erst?.animation} ${erst?.dauer}`
      );
      await seite.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await seite.waitForTimeout(900);
      const vorname = await vornameVon(seite);
      bandPruefen(wer, await bandLesen(seite), vorname);
      await bild(seite, `start-${konto.name}-${ansicht.name}`);

      const kacheln = await kachelnLesen(seite);
      if (pruefe(`${wer}: Kacheln da`, kacheln.length > 0, `${kacheln.length}`)) {
        for (const k of kacheln) {
          pruefe(
            `${wer}: ${k.name} mit Symbol auf getöntem Quadrat`,
            k.svg && k.quadrat && !/rgba\(0, 0, 0, 0\)/.test(k.quadrat),
            `${k.quadrat}${k.neutral ? ', neutral' : ''}${k.kuerzel ? `, Kürzel ${k.kuerzel}` : ''}`
          );
          pruefe(
            `${wer}: ${k.name} mit Zeile offener Freigaben`,
            /Freigabe/.test(k.zeile),
            k.zeile
          );
        }
      }
      const leiste = await leisteLesen(seite);
      const ohne = leiste.filter(e => !e.svg && !e.kuerzel);
      pruefe(
        `${wer}: jede App in der Leiste mit Bild (neutral ohne Symbol)`,
        ohne.length === 0,
        `${leiste.filter(e => e.neutral).length} neutral, ${leiste.filter(e => e.kuerzel).length} Kürzel aus dem Manifest, ohne: ${ohne.map(e => e.id).join(', ') || '-'}`
      );

      if (!schmal && kacheln.length > 0) {
        const erste = seite.locator('button.ara-karte[data-testid^="uebersicht-app-"]').first();
        await erste.hover();
        await seite.waitForTimeout(250);
        const hoch = await erste.evaluate(k => {
          const s = getComputedStyle(k);
          return { transform: s.transform, schatten: s.boxShadow };
        });
        pruefe(
          `${wer}: Kachel hebt sich beim Überfahren leicht an`,
          hoch.transform !== 'none' && hoch.schatten !== 'none',
          `${hoch.transform}; ${hoch.schatten.slice(0, 40)}`
        );
        await bild(seite, `kachel-angehoben-${konto.name}-${ansicht.name}`);
        await seite.mouse.move(0, 0);
      }

      // Zurück zur Startseite: jetzt steht das Band, es blendet nicht noch einmal ein.
      if (await seite.getByTestId('leiste-einstellungen').count()) {
        await seite.getByTestId('leiste-einstellungen').click();
        await seite.waitForTimeout(400);
        await seite.getByTestId('leiste-startseite').click();
        await seite.locator('[data-testid="startband"]').waitFor({ timeout: 10000 });
        const zweit = await bandLesen(seite);
        pruefe(
          `${wer}: beim Zurückkehren bewegt sich nichts`,
          zweit && zweit.eingeblendet === null && zweit.animation === 'none',
          `${zweit?.eingeblendet} ${zweit?.animation}`
        );
      }

      if (konto === ADMIN && APP) {
        await seite.getByTestId(`leiste-app-${APP}-live`).click();
        const rahmen = seite.frameLocator(`iframe[src="/apps/${APP}/"]`);
        // Am Handy ist die Leiste der App ein Blatt: erst öffnen.
        if (schmal) await rahmen.getByTestId('probe-umschalten').click();
        await rahmen.getByText('Freigaben', { exact: true }).first().click();
        const knopf = rahmen.locator('[data-variant="solid"]').first();
        await knopf.waitFor({ timeout: 15000 });
        await seite.waitForTimeout(600);
        const verlauf = await knopf.evaluate(k => getComputedStyle(k).backgroundImage);
        pruefe(
          `${wer}: Hauptknopf in der App mit Blauverlauf (Laufzeit)`,
          /gradient/.test(verlauf),
          verlauf.slice(0, 60)
        );
        await bild(seite, `app-hauptknopf-${ansicht.name}`);
        if (ansicht.name === 'desktop-hell') await wechselMessen(seite);
      }

      pruefe(`${wer}: kein Fehler in der Konsole`, fehler.length === 0, fehler.join(' | '));
      await abmelden(seite, schmal);
      await kontext.close();
    }
  }

  // Weniger Bewegung: das Band steht vom ersten Zeichnen an.
  {
    const ansicht = ANSICHTEN[0];
    const { kontext, seite } = await anmelden(browser, MA, ansicht, {
      reducedMotion: 'reduce',
    });
    await seite.locator('[data-testid="startband"]').waitFor({ timeout: 30000 });
    const b = await bandLesen(seite);
    pruefe(
      'weniger Bewegung: das Band blendet nicht ein',
      b && b.animation === 'none',
      `${b?.animation} ${b?.dauer}`
    );
    await abmelden(seite, false);
    await kontext.close();
  }
} finally {
  await browser.close();
}

const rot = ergebnisse.filter(e => !e.ok);
console.log(
  `\n${ergebnisse.length - rot.length} grün, ${rot.length} rot. Bilder: ${path.relative(WURZEL, ZIEL)}`
);
process.exit(rot.length ? 1 : 0);
