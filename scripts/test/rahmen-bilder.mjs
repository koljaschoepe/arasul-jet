/**
 * Bilder und Messung des Rahmens, Karte M5 rahmen-aktivitaetsleiste
 * (03.10.2026).
 *
 * Meldet sich mit zwei vorhandenen Konten an (nie `admin`, kein neues Konto),
 * macht Bildschirmfotos bei 1440 x 900 und, mit ARASUL_PHASE=nachher, prüft
 * den Rahmen und misst jeden Wechsel zwischen Apps und Bereichen:
 *
 *   1. Es gibt keine Kopfleiste, keine Tab-Leiste, keine rechte Spalte und
 *      keine zweite Seitenleiste; die Aktivitätsleiste steht da.
 *   2. Die Leiste zeigt Haus, Apps, unten Verwaltung (nur Admin), Zahnrad und
 *      das eigene Bild; das Kontomenü nur Name und Abmelden.
 *   3. Die Auswahl ist eine getönte Fläche ohne Linie, Hover blendet in
 *      120 ms ein, mit „weniger Bewegung" ohne Übergang.
 *   4. Jeder Wechsel (Klick bis zum gezeichneten Ziel) bleibt unter 200 ms —
 *      gemessen im Browser, ab der zweiten Runde (die erste lädt Brocken nach
 *      und wird gesondert genannt).
 *
 * Mit ARASUL_APPS_FREIGEBEN=app1,app2 gibt `probe-admin` beiden Konten diese
 * Apps für die Dauer der Messung frei und nimmt am Ende genau die Freigaben
 * zurück, die er selbst erteilt hat — ohne App gäbe es keinen Wechsel
 * zwischen Apps zu messen.
 *
 * Die Sitzung bleibt im Speicher dieses Prozesses; geschrieben werden nur die
 * Bilder. Keine Passwörter in Dateien:
 *
 *   ARASUL_URL=https://100.121.244.80 ARASUL_PHASE=vorher \
 *   ARASUL_ADMIN_PW="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
 *   ARASUL_MA_PW="$(geheim get 'Arasul Orin Probe-Konto probe-j36-a')" \
 *     node scripts/test/rahmen-bilder.mjs
 *
 * Rückgabe 0, wenn jede Prüfung grün war, sonst 1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, request } from 'playwright';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://100.121.244.80';
const PHASE = process.env.ARASUL_PHASE === 'nachher' ? 'nachher' : 'vorher';
const TAG = process.env.ARASUL_TAG || new Date().toISOString().slice(0, 10);
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-rahmen-m5`);
const FREIGEBEN = (process.env.ARASUL_APPS_FREIGEBEN || '').split(',').filter(Boolean);
const GRENZE_MS = 200;
const RUNDEN = 3;

const KONTEN = [
  { benutzer: 'probe-admin', passwort: process.env.ARASUL_ADMIN_PW || '', admin: true },
  { benutzer: 'probe-j36-a', passwort: process.env.ARASUL_MA_PW || '', admin: false },
];

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

for (const k of KONTEN) {
  if (!k.passwort) {
    console.log(`ROT    Passwort für ${k.benutzer} fehlt -- der Aufrufer setzt es aus Bitwarden.`);
    process.exit(1);
  }
}
fs.mkdirSync(ZIEL, { recursive: true });

async function anmelden(browser, { benutzer, passwort }) {
  const kontext = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
  });
  const seite = await kontext.newPage();
  await seite.goto(URL, { waitUntil: 'domcontentloaded' });
  await seite.fill('input[name="username"], input[type="text"]', benutzer);
  await seite.fill('input[type="password"]', passwort);
  await seite.click('button[type="submit"]');
  await seite.waitForURL(/\/workspace/, { timeout: 20000 });
  await seite.waitForLoadState('networkidle').catch(() => {});
  return { kontext, seite };
}

/**
 * Freigaben für die Dauer der Messung: `probe-admin` gibt beiden Konten die
 * genannten Apps frei und merkt sich, welche davon neu waren.
 */
async function freigabenSetzen() {
  const api = await request.newContext({ baseURL: URL, ignoreHTTPSErrors: true });
  const anmeldung = await api.post('/api/auth/login', {
    data: { username: KONTEN[0].benutzer, password: KONTEN[0].passwort },
  });
  if (!anmeldung.ok()) throw new Error(`Anmeldung für Freigaben: ${anmeldung.status()}`);
  const csrf = (await api.storageState()).cookies.find(c => c.name === 'arasul_csrf')?.value;
  const kopf = { 'X-CSRF-Token': csrf || '' };
  const personen = (await (await api.get('/api/benutzer')).json()).data || [];
  const erteilt = [];
  for (const konto of KONTEN) {
    const person = personen.find(p => p.username === konto.benutzer);
    if (!person) throw new Error(`${konto.benutzer} fehlt am Gerät`);
    for (const app of FREIGEBEN) {
      const r = await api.post('/api/freigaben', {
        headers: kopf,
        data: { app_id: app, benutzer_id: person.id, stand: 'live' },
      });
      const neu = r.ok() && (await r.json()).neu;
      if (neu) erteilt.push({ app, id: person.id });
      console.log(
        `       Freigabe ${app} für ${konto.benutzer}: ${r.status()}${neu ? ' (neu)' : ''}`
      );
    }
  }
  return async () => {
    for (const { app, id } of erteilt) {
      const r = await api.delete(`/api/freigaben/${app}/${id}`, { headers: kopf });
      console.log(`       Freigabe ${app} für ${id} zurückgenommen: ${r.status()}`);
    }
    await api.post('/api/auth/logout', { headers: kopf });
    await api.dispose();
  };
}

/** Abmelden über das Kontomenü, damit keine Sitzung des Probekontos offen bleibt. */
async function abmelden(seite) {
  await seite.goto(`${URL}/workspace`, { waitUntil: 'domcontentloaded' });
  await seite.click('[data-testid="workspace-benutzermenue"]');
  await seite.click('[data-testid="workspace-abmelden"]');
  await seite
    .waitForURL(url => !url.pathname.startsWith('/workspace'), { timeout: 10000 })
    .catch(() => {});
}

/**
 * Ein Wechsel, gemessen im Browser: vom Klick bis zu dem Bild, in dem das Ziel
 * steht (ein Animationsrahmen nach dem Erscheinen).
 */
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

async function rahmenPruefen(seite, konto) {
  const wer = konto.benutzer;
  const zahl = async sel => seite.locator(sel).count();
  pruefe(`${wer}: keine Kopfleiste`, (await zahl('header')) === 0);
  pruefe(`${wer}: keine Tab-Leiste`, (await zahl('[role="tablist"]')) === 0);
  pruefe(`${wer}: keine Spalten (Panels)`, (await zahl('[data-panel]')) === 0);
  pruefe(`${wer}: keine Notizen`, (await zahl('textarea')) === 0);
  pruefe(
    `${wer}: Aktivitätsleiste steht da`,
    (await zahl('[data-testid="aktivitaetsleiste"]')) === 1
  );
  pruefe(`${wer}: Haus zur Startseite`, (await zahl('[data-testid="leiste-startseite"]')) === 1);
  pruefe(
    `${wer}: Verwaltung ${konto.admin ? 'da' : 'nicht da'}`,
    (await zahl('[data-testid="leiste-verwaltung"]')) === (konto.admin ? 1 : 0)
  );
  pruefe(`${wer}: Zahnrad`, (await zahl('[data-testid="leiste-einstellungen"]')) === 1);
  pruefe(`${wer}: eigenes Bild`, (await zahl('[data-testid="workspace-benutzermenue"]')) === 1);
  const apps = await zahl('[data-testid^="leiste-app-"]');
  pruefe(`${wer}: Apps als Symbol`, apps > 0, `${apps}`);

  const stil = await seite.evaluate(() => {
    const aktiv = document.querySelector('[data-testid="leiste-startseite"]');
    const s = getComputedStyle(aktiv);
    const vorher = getComputedStyle(aktiv, '::before');
    return {
      hintergrund: s.backgroundColor,
      dauer: s.transitionDuration,
      linie: vorher.content !== 'none' && vorher.width !== 'auto' && vorher.width !== '0px',
    };
  });
  pruefe(
    `${wer}: Auswahl ist eine getönte Fläche`,
    stil.hintergrund !== 'rgba(0, 0, 0, 0)' && !stil.linie,
    stil.hintergrund
  );
  pruefe(`${wer}: Hover blendet in 120 ms ein`, stil.dauer === '0.12s', stil.dauer);

  await seite.click('[data-testid="workspace-benutzermenue"]');
  const menue = seite.locator('[role="dialog"]');
  await menue.waitFor();
  const knoepfe = await menue.locator('button').count();
  pruefe(`${wer}: Kontomenü nur Name und Abmelden`, knoepfe === 1, `${knoepfe} Knopf`);
  await seite.screenshot({ path: path.join(ZIEL, `nachher-${wer}-kontomenue.png`) });
  await seite.keyboard.press('Escape');
}

async function wechselMessen(seite, konto) {
  const ziele = [];
  const appKnoepfe = await seite
    .locator('[data-testid^="leiste-app-"]')
    .evaluateAll(el => el.map(e => e.getAttribute('data-testid')));
  for (const k of appKnoepfe.slice(0, 3)) {
    const rest = k.replace(/^leiste-app-/, '');
    const stand = rest.endsWith('-test') ? 'test' : 'live';
    const id = rest.slice(0, -stand.length - 1);
    const pfad = stand === 'test' ? `/apps/${id}/test/` : `/apps/${id}/`;
    ziele.push({
      name: `App ${id} (${stand})`,
      klick: `[data-testid="${k}"]`,
      ziel: `iframe[src="${pfad}"]`,
    });
  }
  ziele.push({
    name: 'Startseite',
    klick: '[data-testid="leiste-startseite"]',
    ziel: '[data-ansicht="dashboard"]',
  });
  ziele.push({
    name: 'Einstellungen',
    klick: '[data-testid="leiste-einstellungen"]',
    ziel: '[data-testid="einstellungen"]',
  });
  if (konto.admin) {
    ziele.push({
      name: 'Verwaltung',
      klick: '[data-testid="leiste-verwaltung"]',
      ziel: '[data-testid="verwaltung-bereiche"]',
    });
    for (const b of ['benutzer', 'apps', 'firmenordner', 'modelle', 'system', 'lizenz']) {
      ziele.push({
        name: `Bereich ${b}`,
        vorher: '[data-testid="leiste-verwaltung"]',
        vorherZiel: '[data-testid="verwaltung-bereiche"]',
        klick: `[data-testid="verwaltung-${b}"]`,
        ziel: `[data-testid="verwaltung-${b}"][aria-current="true"]`,
      });
    }
  }

  const zeiten = {};
  for (let runde = 1; runde <= RUNDEN; runde++) {
    for (const z of ziele) {
      if (z.vorher && !(await seite.locator(z.vorherZiel).count())) {
        await wechsel(seite, z.vorher, z.vorherZiel);
      }
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
      `${konto.benutzer}: Wechsel zu ${name} unter ${GRENZE_MS} ms`,
      max >= 0 && max < GRENZE_MS,
      `erste ${liste[0].toFixed(0)} ms, danach höchstens ${max.toFixed(0)} ms`
    );
  }
  console.log(
    `       ${konto.benutzer}: langsamster Wechsel ab Runde 2: ${hoechste.toFixed(0)} ms`
  );
}

const zuruecknehmen = FREIGEBEN.length ? await freigabenSetzen() : async () => {};
const browser = await chromium.launch();
try {
  for (const konto of KONTEN) {
    const { kontext, seite } = await anmelden(browser, konto);
    await seite.goto(`${URL}/workspace`, { waitUntil: 'networkidle' });
    await seite.waitForTimeout(1500);
    await seite.screenshot({ path: path.join(ZIEL, `${PHASE}-${konto.benutzer}.png`) });
    if (PHASE === 'nachher') {
      await rahmenPruefen(seite, konto);
      if (konto.admin) {
        await seite.goto(`${URL}/workspace/verwaltung/benutzer`, { waitUntil: 'networkidle' });
        await seite.waitForTimeout(1000);
        await seite.screenshot({
          path: path.join(ZIEL, `nachher-${konto.benutzer}-verwaltung.png`),
        });
        await seite.goto(`${URL}/workspace/verwaltung/system`, { waitUntil: 'networkidle' });
        await seite.waitForTimeout(1000);
        pruefe(
          `${konto.benutzer}: System ohne zweite Reiterstufe`,
          (await seite.locator('[role="tablist"]').count()) === 0
        );
        await seite.goto(`${URL}/workspace`, { waitUntil: 'networkidle' });
      }
      const app = seite.locator('[data-testid^="leiste-app-"]').first();
      if (await app.count()) {
        await app.click();
        await seite.waitForTimeout(2500);
        await seite.screenshot({ path: path.join(ZIEL, `nachher-${konto.benutzer}-app.png`) });
      }
      await wechselMessen(seite, konto);
    }
    await abmelden(seite);
    await kontext.close();
  }

  if (PHASE === 'nachher') {
    const kontext = await browser.newContext({ ignoreHTTPSErrors: true, reducedMotion: 'reduce' });
    const seite = await kontext.newPage();
    await seite.goto(URL, { waitUntil: 'domcontentloaded' });
    await seite.fill('input[name="username"], input[type="text"]', KONTEN[1].benutzer);
    await seite.fill('input[type="password"]', KONTEN[1].passwort);
    await seite.click('button[type="submit"]');
    await seite.waitForURL(/\/workspace/, { timeout: 20000 });
    await seite.locator('[data-testid="leiste-startseite"]').waitFor();
    const dauer = await seite.evaluate(
      () =>
        getComputedStyle(document.querySelector('[data-testid="leiste-startseite"]'))
          .transitionDuration
    );
    pruefe('weniger Bewegung: kein Übergang', dauer === '0s', dauer);
    await abmelden(seite);
    await kontext.close();
  }
} finally {
  await browser.close();
  await zuruecknehmen();
}

const rot = ergebnisse.filter(e => !e.ok).length;
console.log(
  `\n${ergebnisse.length - rot} gruen, ${rot} rot, Bilder in ${path.relative(WURZEL, ZIEL)}`
);
process.exit(rot === 0 ? 0 : 1);
