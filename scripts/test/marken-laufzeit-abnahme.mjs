/**
 * Abnahme: die Bibliothek zur Laufzeit (M5, Karte marken-zur-laufzeit,
 * 03.10.2026).
 *
 * Das Gerät liefert `packages/marken` unter `/marken/<haupt>/` aus: Bausteine,
 * Primitive, Muster, Tokens und das fertig übersetzte Stylesheet. Eine App
 * lädt sie von dort, braucht kein Tailwind und trägt keine Kopie. Gemessen
 * wird mit der Probe-App aus `tests/marken-laufzeit-app/` (ohne Bau, `h(...)`):
 *
 *   1. AUSLIEFERUNG. `/marken/marken.json` nennt Fassung und Hauptzahl; die
 *      Eingänge antworten mit dem richtigen Typ; feste Namen tragen
 *      `no-cache` mit ETag und geben auf `If-None-Match` ein 304, die Teile
 *      mit Hash `immutable`; eine fehlende Datei ist 404 und keine Seite.
 *   2. DIE PROBE IM RAHMEN. Seitenleiste (auf- und zuklappen, die Breite
 *      ändert sich wirklich), Tabelle (`Datenliste` mit vier Zeilen) und
 *      Freigabe (bestätigen) kommen vom Gerät; jede Anfrage nach der
 *      Bibliothek geht an `/marken/<haupt>/`, keine an das Paket der App;
 *      kein Fehler und kein CSP-Verstoß in der Konsole.
 *   3. HELL UND DUNKEL. Das Theme des Menschen geht über die Shell in die App
 *      (`data-theme`), die Fläche ist die des Tokens, mit Bild.
 *   4. OHNE NEUBAU NEU. Die Probe zeigt die Fassung, die sie zur Laufzeit
 *      bekommt. Sie steht gleich der Fassung des Geräts; wer die Probe über
 *      ein Update stehen lässt (`ARASUL_SCHRITTE=einspielen,messen`, Update,
 *      dann `messen,entfernen`), sieht die neue Zahl ohne neues Paket.
 *
 * SCHRITTE (`ARASUL_SCHRITTE`, durch Komma, Vorgabe alle drei am Gerät):
 *
 *   einspielen   Wegwerf-Schlüssel mit `app:deploy`, Paket ohne Bibliothek
 *                hinein, live schalten, Schlüssel widerrufen, die App
 *                `probe-admin` freigeben.
 *   messen       1 bis 4 oben, Bilder nach docs/plans/audits/<tag>-marken-laufzeit-m5/<fassung>/.
 *   entfernen    die App samt Dateien weg (nur die eigene Kennung).
 *   lokal        ohne Gerät: ein Server hier mit der CSP des Geräts aus
 *                `config/traefik/dynamic/middlewares.yml`, die Bibliothek aus
 *                `apps/dashboard-frontend/dist/marken` (vorher
 *                `npm run marken:laufzeit --workspace=arasul-dashboard-frontend`).
 *
 * KONTEN: nur `probe-admin`, Passwort aus Bitwarden, nie in eine Datei:
 *
 *   ARASUL_URL=https://100.121.244.80 ARASUL_APP=probe-marken-1003 \
 *   ARASUL_ADMIN_PW="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
 *     node scripts/test/marken-laufzeit-abnahme.mjs
 *
 * Das Theme von `probe-admin` steht am Ende wieder so, wie es vorher war.
 * Temporäre Dateien (das Paket) liegen in einem eigenen Ordner unter dem
 * Temp-Verzeichnis und sind am Ende weg.
 *
 * Rückgabe 0, wenn jede Prüfung grün war, sonst 1.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, request } from 'playwright';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCHRITTE = (process.env.ARASUL_SCHRITTE || 'einspielen,messen,entfernen')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const LOKAL = SCHRITTE.includes('lokal');
const APP =
  process.env.ARASUL_APP ||
  `probe-marken-${new Date().toISOString().slice(5, 10).replace('-', '')}`;
const TAG = process.env.ARASUL_TAG || new Date().toISOString().slice(0, 10);
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-marken-laufzeit-m5`);
const QUELLE = path.join(WURZEL, 'tests/marken-laufzeit-app');
const PASSWORT = process.env.ARASUL_ADMIN_PW || '';
const BENUTZER = 'probe-admin';
let URL = process.env.ARASUL_URL || 'https://100.121.244.80';

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok: Boolean(ok) });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
  return Boolean(ok);
};

/** Die Fläche eines Themes, aus `theme.css` gelesen, nicht abgeschrieben. */
function flaechen() {
  const css = fs.readFileSync(path.join(WURZEL, 'packages/marken/src/theme.css'), 'utf8');
  const wert = block => {
    const start = css.indexOf(block);
    const rumpf = css.slice(start, css.indexOf('}', start));
    return rumpf.match(/--background:\s*(#[0-9a-fA-F]{6})/)?.[1];
  };
  const rgb = hex =>
    `rgb(${[1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
  return { light: rgb(wert('\n:root {')), dark: rgb(wert("[data-theme='dark'] {")) };
}

// --- 1. Auslieferung --------------------------------------------------------

async function auslieferungPruefen(api) {
  const verzeichnis = await api.get('/marken/marken.json');
  const stand = verzeichnis.ok() ? await verzeichnis.json().catch(() => null) : null;
  pruefe(
    '/marken/marken.json nennt Fassung und Hauptzahl',
    stand?.fassung && stand?.haupt && stand.adresse === `/marken/${stand.haupt}/`,
    `HTTP ${verzeichnis.status()}, ${stand?.fassung} unter ${stand?.adresse}`
  );
  if (!stand) return null;
  const basis = stand.adresse;

  const voll = await api.get(`${basis}marken.json`);
  const liste = voll.ok() ? await voll.json().catch(() => null) : null;
  pruefe(
    `${basis}marken.json nennt dieselbe Fassung und jede Datei mit sha256`,
    liste?.fassung === stand.fassung && Object.keys(liste?.dateien || {}).length > 5,
    `${Object.keys(liste?.dateien || {}).length} Dateien`
  );

  const typen = {
    'marken.js': /javascript/,
    'marken.css': /text\/css/,
    'react.js': /javascript/,
    'jsx-runtime.js': /javascript/,
    'diagramm.js': /javascript/,
  };
  for (const [datei, typ] of Object.entries(typen)) {
    const r = await api.get(basis + datei);
    pruefe(
      `${basis}${datei} kommt als ${typ.source.replace(/\\/g, '')}`,
      r.status() === 200 && typ.test(r.headers()['content-type'] || ''),
      `HTTP ${r.status()}, ${r.headers()['content-type']}`
    );
  }

  if (!LOKAL) {
    const js = await api.get(`${basis}marken.js`);
    const kopf = js.headers();
    pruefe(
      'Feste Namen: Cache-Control no-cache mit ETag',
      /no-cache/.test(kopf['cache-control'] || '') && Boolean(kopf.etag),
      `cache-control=${kopf['cache-control']}, etag=${kopf.etag}`
    );
    const nochmal = await api.get(`${basis}marken.js`, {
      headers: { 'If-None-Match': kopf.etag || '' },
    });
    pruefe('Nachfrage mit ETag gibt 304', nochmal.status() === 304, `HTTP ${nochmal.status()}`);

    const teil = Object.keys(liste?.dateien || {}).find(d => /^teil-.+\.js$/.test(d));
    const t = teil ? await api.get(basis + teil) : null;
    pruefe(
      'Teile mit Hash: immutable, ein Jahr',
      t &&
        /immutable/.test(t.headers()['cache-control'] || '') &&
        /max-age=31536000/.test(t.headers()['cache-control'] || ''),
      `${teil}: ${t?.headers()['cache-control']}`
    );
    const fehlt = await api.get(`${basis}gibt-es-nicht.js`);
    pruefe(
      'Eine fehlende Datei ist 404, keine Seite der Shell',
      fehlt.status() === 404,
      `HTTP ${fehlt.status()}`
    );
  }
  return stand;
}

// --- 2. bis 4. Die Probe ----------------------------------------------------

/** Wartet, bis die Fläche des Dokuments der App steht (die Shell blendet über). */
async function flaecheAbwarten(rahmen, erwartet) {
  for (let i = 0; i < 40; i += 1) {
    const ist = await rahmen.evaluate(() => getComputedStyle(document.body).backgroundColor);
    if (ist === erwartet) return ist;
    await new Promise(r => setTimeout(r, 100));
  }
  return rahmen.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

async function probePruefen({ seite, rahmen, stand, theme, flaeche, bild }) {
  const attribut = await rahmen.evaluate(() => document.documentElement.getAttribute('data-theme'));
  pruefe(
    `[${theme}] das Dokument der App trägt das Theme`,
    theme === 'dark' ? attribut === 'dark' : attribut !== 'dark',
    `data-theme=${attribut}`
  );
  const ist = await flaecheAbwarten(rahmen, flaeche);
  pruefe(
    `[${theme}] die Fläche ist die des Tokens`,
    ist === flaeche,
    `${ist}, erwartet ${flaeche}`
  );

  const fassung = await rahmen.locator('[data-testid="probe-fassung"]').textContent();
  pruefe(
    `[${theme}] die Probe zeigt die Fassung, die das Gerät ausliefert`,
    fassung?.includes(stand.fassung),
    fassung || 'nichts'
  );

  const zeilen = await rahmen.locator('table tbody tr').count();
  pruefe(
    `[${theme}] die Tabelle (Datenliste) steht mit vier Zeilen`,
    zeilen === 4,
    `${zeilen} Zeilen`
  );

  const leiste = rahmen.locator('[data-slot="sidebar"]');
  const behaelter = rahmen.locator('[data-slot="sidebar-container"]');
  const breiteOffen = (await behaelter.boundingBox())?.width ?? 0;
  pruefe(
    `[${theme}] die Seitenleiste steht offen, breit`,
    (await leiste.getAttribute('data-state')) === 'offen' && breiteOffen > 200,
    `${Math.round(breiteOffen)} px`
  );
  const zahl = await rahmen.evaluate(() => {
    const abzeichen = document.querySelector('[data-sidebar="menu-badge"]');
    const knopf = abzeichen?.parentElement?.querySelector('[data-sidebar="menu-button"]');
    if (!abzeichen || !knopf) return null;
    const a = abzeichen.getBoundingClientRect();
    const k = knopf.getBoundingClientRect();
    return Math.round(a.top + a.height / 2 - (k.top + k.height / 2));
  });
  pruefe(
    `[${theme}] die Zahl am Eintrag steht in seiner Zeile`,
    zahl !== null && Math.abs(zahl) <= 4,
    `Mitte ${zahl} px neben der des Eintrags`
  );
  if (bild) await seite.screenshot({ path: path.join(ZIEL, `${bild}-offen.png`) });

  await rahmen.locator('[data-testid="probe-umschalten"]').click();
  await rahmen
    .locator('[data-slot="sidebar"][data-state="zu"]')
    .waitFor({ timeout: 5000 })
    .catch(() => {});
  await seite.waitForTimeout(400);
  const breiteZu = (await behaelter.boundingBox())?.width ?? 0;
  pruefe(
    `[${theme}] zugeklappt bleiben nur die Symbole`,
    (await leiste.getAttribute('data-state')) === 'zu' && breiteZu > 0 && breiteZu < 80,
    `${Math.round(breiteZu)} px`
  );
  // Gemessen am TEXT, nicht an den Kaesten: ein Wort ragt ueber den Rand
  // seines Kastens hinaus, ohne dass der Kasten es tut. Es zaehlt, was rechts
  // ueber die Leiste reicht und von keinem Vorfahren abgeschnitten wird.
  const ueberstand = await rahmen.evaluate(() => {
    const behaelter = document.querySelector('[data-slot="sidebar-container"]');
    const rand = behaelter.getBoundingClientRect().right;
    const gang = document.createTreeWalker(behaelter, NodeFilter.SHOW_TEXT);
    const funde = [];
    for (let knoten = gang.nextNode(); knoten; knoten = gang.nextNode()) {
      if (!knoten.textContent.trim()) continue;
      const bereich = document.createRange();
      bereich.selectNodeContents(knoten);
      const r = bereich.getBoundingClientRect();
      if (!r.width || r.right <= rand + 1) continue;
      let geschnitten = false;
      for (let e = knoten.parentElement; e && e !== behaelter.parentElement; e = e.parentElement) {
        const stil = getComputedStyle(e);
        if (stil.display === 'none' || stil.visibility === 'hidden') geschnitten = true;
        if (stil.overflowX !== 'visible' && e.getBoundingClientRect().right <= rand + 1) {
          geschnitten = true;
        }
        // Text nur fuer Screenreader (`sr-only`) ist auf einen Pixel geschnitten.
        if (e.classList.contains('sr-only')) geschnitten = true;
      }
      if (!geschnitten) funde.push(knoten.textContent.trim());
    }
    return funde;
  });
  pruefe(
    `[${theme}] zugeklappt ragt nichts über den Inhalt`,
    ueberstand.length === 0,
    ueberstand.join(', ') || 'nichts'
  );
  if (bild) await seite.screenshot({ path: path.join(ZIEL, `${bild}-zu.png`) });
  await rahmen.locator('[data-testid="probe-umschalten"]').click();
  await rahmen
    .locator('[data-slot="sidebar"][data-state="offen"]')
    .waitFor({ timeout: 5000 })
    .catch(() => {});

  await rahmen.locator('[data-sidebar="sidebar"] button[title="Freigaben"]').click();
  const eintrag = rahmen.locator('[data-testid="freigabe-1"]');
  const steht = await eintrag
    .waitFor({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  pruefe(
    `[${theme}] die Freigabe zeigt die offenen Anfragen`,
    steht &&
      (await rahmen.locator('[data-testid^="freigabe-"][data-testid$="-bestaetigen"]').count()) >= 1
  );
  await seite.waitForTimeout(300);
  if (bild) await seite.screenshot({ path: path.join(ZIEL, `${bild}-freigabe.png`) });
  const knopf = rahmen.locator('[data-testid="freigabe-1-bestaetigen"]');
  if (await knopf.count()) {
    await knopf.click();
    const weg = await knopf
      .waitFor({ state: 'detached', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    pruefe(`[${theme}] bestätigen entscheidet die Anfrage`, weg);
  }
  await rahmen.locator('[data-sidebar="sidebar"] button[title="Vorgänge"]').click();
}

/** Alles, was der Browser holt und meldet, für die Prüfungen danach. */
function mitschreiben(kontext) {
  const anfragen = [];
  const fehler = [];
  kontext.on('response', r => anfragen.push({ url: r.url(), status: r.status() }));
  kontext.on('page', p => {
    p.on('console', m => m.type() === 'error' && fehler.push(m.text()));
    p.on('pageerror', e => fehler.push(String(e)));
  });
  return { anfragen, fehler };
}

function netzPruefen({ anfragen, fehler }, stand, appPfad) {
  const bibliothek = anfragen.filter(a => /\/marken[/.-]/.test(new globalThis.URL(a.url).pathname));
  const fremd = bibliothek.filter(
    a =>
      !new globalThis.URL(a.url).pathname.startsWith(stand.adresse) &&
      !new globalThis.URL(a.url).pathname.startsWith('/assets/')
  );
  const ausPaket = anfragen.filter(a => {
    const p = new globalThis.URL(a.url).pathname;
    // Nach dem Dateinamen, nicht dem Pfad: die Kennung der App darf "marken" enthalten.
    return p.startsWith(appPfad) && /^marken|pdf-dateien/.test(p.slice(appPfad.length));
  });
  pruefe(
    'Die Bibliothek kommt nur von der Adresse des Geräts',
    bibliothek.some(a => a.url.endsWith(`${stand.adresse}marken.js`)) && fremd.length === 0,
    `${bibliothek.length} Anfragen, fremd: ${fremd.map(a => a.url).join(' ') || 'keine'}`
  );
  pruefe(
    'Das Paket der App liefert keine Kopie der Bibliothek',
    ausPaket.length === 0,
    ausPaket.map(a => a.url).join(' ') || 'keine'
  );
  const schlecht = bibliothek.filter(a => a.status >= 400);
  pruefe(
    'Jede Datei der Bibliothek kam an',
    schlecht.length === 0,
    schlecht.map(a => `${a.status} ${a.url}`).join(' ') || `${bibliothek.length} mit 200/304`
  );
  const csp = fehler.filter(f => /Content Security Policy|Refused to/i.test(f));
  pruefe('Kein CSP-Verstoß', csp.length === 0, csp.join(' | ') || 'keiner');
  pruefe(
    'Kein Fehler in der Konsole',
    fehler.length === 0,
    fehler.slice(0, 3).join(' | ') || 'keiner'
  );
}

// --- am Gerät ---------------------------------------------------------------

async function anmelden() {
  const api = await request.newContext({ baseURL: URL, ignoreHTTPSErrors: true });
  const r = await api.post('/api/auth/login', { data: { username: BENUTZER, password: PASSWORT } });
  if (!r.ok()) throw new Error(`Anmeldung ${BENUTZER}: HTTP ${r.status()}`);
  const token = (await r.json()).token;
  // Das Sitzungscookie steht im Kontext, also prueft das Geraet bei jedem
  // schreibenden Aufruf das CSRF-Token. Es wechselt nach einer Aenderung:
  // je Anfrage frisch aus dem Cookie lesen.
  const kopf = {
    authorization: `Bearer ${token}`,
    get 'X-CSRF-Token'() {
      return csrf;
    },
  };
  let csrf = '';
  const auffrischen = async () => {
    csrf = (await api.storageState()).cookies.find(c => c.name === 'arasul_csrf')?.value || '';
  };
  await auffrischen();
  for (const verb of ['post', 'put', 'delete']) {
    const ursprung = api[verb].bind(api);
    api[verb] = async (...argumente) => {
      await auffrischen();
      return ursprung(...argumente);
    };
  }
  return { api, token, kopf };
}

async function einspielen({ api, kopf }) {
  const neu = await api.post('/api/v1/external/api-keys', {
    headers: kopf,
    data: { name: `Abnahme ${APP}`, allowed_endpoints: ['app:deploy'] },
  });
  const schluessel = neu.ok() ? await neu.json() : null;
  if (!pruefe('Wegwerf-Schlüssel mit app:deploy', schluessel?.api_key, `HTTP ${neu.status()}`))
    return;
  const mitSchluessel = { 'x-api-key': schluessel.api_key };
  // Ein eigener Kontext ohne Sitzungscookie: so ruft das Kit, nur mit Schluessel.
  const kit = await request.newContext({ baseURL: URL, ignoreHTTPSErrors: true });

  const arbeit = fs.mkdtempSync(path.join(os.tmpdir(), 'marken-laufzeit-'));
  try {
    fs.cpSync(path.join(QUELLE, 'frontend'), path.join(arbeit, 'paket/frontend'), {
      recursive: true,
    });
    const manifest = JSON.parse(fs.readFileSync(path.join(QUELLE, 'app.json'), 'utf8'));
    manifest.id = APP;
    manifest.name = `Probe Marken ${APP.split('-').pop()}`;
    fs.writeFileSync(path.join(arbeit, 'paket/app.json'), JSON.stringify(manifest, null, 2));
    const archiv = path.join(arbeit, 'paket.tgz');
    execFileSync('tar', ['czf', archiv, '-C', path.join(arbeit, 'paket'), '.'], {
      env: { ...process.env, COPYFILE_DISABLE: '1' },
    });
    const inhalt = execFileSync('tar', ['tzf', archiv]).toString().split('\n').filter(Boolean);
    pruefe(
      'Das Paket trägt keine Datei der Bibliothek',
      !inhalt.some(d => /marken\.(js|css)$|pdf-dateien/.test(d)),
      inhalt.filter(d => !d.endsWith('/')).join(' ')
    );

    const r = await kit.post('/api/v1/external/apps', {
      headers: mitSchluessel,
      multipart: {
        paket: { name: 'paket.tgz', mimeType: 'application/gzip', buffer: fs.readFileSync(archiv) },
        aenderungstext: 'Probe der Bibliothek zur Laufzeit.',
      },
      timeout: 600000,
    });
    pruefe(
      `${APP} eingespielt, "marken": "5" angenommen`,
      r.status() === 201,
      `HTTP ${r.status()} ${r.ok() ? '' : (await r.text()).slice(0, 200)}`
    );
    const live = await kit.post(`/api/v1/external/apps/${APP}/schalten`, {
      headers: mitSchluessel,
      data: { ziel: 'live' },
    });
    pruefe('live geschaltet', live.ok(), `HTTP ${live.status()}`);
  } finally {
    await kit.dispose();
    fs.rmSync(arbeit, { recursive: true, force: true });
    const weg = await api.delete(`/api/v1/external/api-keys/${schluessel.key_id}`, {
      headers: kopf,
    });
    pruefe('Wegwerf-Schlüssel widerrufen', weg.ok(), `HTTP ${weg.status()}`);
  }

  const personen = (await (await api.get('/api/benutzer', { headers: kopf })).json()).data || [];
  const ich = personen.find(p => p.username === BENUTZER);
  const frei = await api.post('/api/freigaben', {
    headers: kopf,
    data: { app_id: APP, benutzer_id: ich?.id, stand: 'live' },
  });
  pruefe(`${APP} für ${BENUTZER} freigegeben`, frei.ok(), `HTTP ${frei.status()}`);
}

async function entfernen({ api, kopf }) {
  const r = await api.delete(`/api/apps/${APP}?dateien=true`, { headers: kopf });
  pruefe(`${APP} samt Dateien entfernt`, r.ok(), `HTTP ${r.status()}`);
}

async function themeLesen({ api, kopf }) {
  const me = await (await api.get('/api/auth/me', { headers: kopf })).json().catch(() => ({}));
  const finde = o =>
    o && typeof o === 'object' ? (o.theme ?? Object.values(o).map(finde).find(Boolean)) : undefined;
  return finde(me) || 'light';
}

async function messenAmGeraet(anmeldung, stand) {
  const { api, kopf } = anmeldung;
  fs.mkdirSync(path.join(ZIEL, stand.fassung), { recursive: true });
  const vorher = await themeLesen(anmeldung);
  const browser = await chromium.launch();
  const kontext = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
    storageState: await api.storageState(),
  });
  const log = mitschreiben(kontext);
  const seite = await kontext.newPage();
  const farben = flaechen();
  try {
    for (const theme of ['light', 'dark']) {
      const gesetzt = await api.put('/api/darstellung', { headers: kopf, data: { theme } });
      pruefe(`Theme von ${BENUTZER} auf ${theme}`, gesetzt.ok(), `HTTP ${gesetzt.status()}`);
      await seite.goto(`${URL}/workspace/app/${APP}`, { waitUntil: 'networkidle' });
      const element = seite.locator(`[data-testid="app-rahmen-${APP}"]`);
      const da = await element
        .waitFor({ timeout: 30000 })
        .then(() => true)
        .catch(() => false);
      if (!pruefe(`[${theme}] die Probe steht im Rahmen der Shell`, da)) continue;
      const rahmen = await (await element.elementHandle()).contentFrame();
      await rahmen.locator('[data-slot="sidebar"]').waitFor({ timeout: 30000 });
      await probePruefen({
        seite,
        rahmen,
        stand,
        theme,
        flaeche: farben[theme],
        bild: `${stand.fassung}/${theme}-1440`,
      });
    }
  } finally {
    const zurueck = await api.put('/api/darstellung', { headers: kopf, data: { theme: vorher } });
    pruefe(`Theme von ${BENUTZER} wieder ${vorher}`, zurueck.ok(), `HTTP ${zurueck.status()}`);
    await browser.close();
  }
  netzPruefen(log, stand, `/apps/${APP}/`);
}

// --- lokal ------------------------------------------------------------------

/** Ein Server wie das Gerät: dieselbe CSP, die Bibliothek und die Probe. */
function lokalerServer() {
  const yaml = fs.readFileSync(path.join(WURZEL, 'config/traefik/dynamic/middlewares.yml'), 'utf8');
  const csp = yaml
    .slice(yaml.indexOf('security-headers-dokument:'))
    .match(/Content-Security-Policy:\s*"([^"]+)"/)[1];
  const marken = path.join(WURZEL, 'apps/dashboard-frontend/dist');
  const typen = {
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.html': 'text/html',
    '.wasm': 'application/wasm',
  };
  const server = http.createServer((anfrage, antwort) => {
    const pfad = decodeURIComponent(new globalThis.URL(anfrage.url, 'http://x').pathname);
    let datei = null;
    if (pfad.startsWith('/marken/')) datei = path.join(marken, pfad);
    else if (pfad.startsWith(`/apps/${APP}/`))
      datei = path.join(QUELLE, 'frontend', pfad.slice(`/apps/${APP}/`.length) || 'index.html');
    if (!datei || !fs.existsSync(datei) || fs.statSync(datei).isDirectory()) {
      antwort.writeHead(404).end();
      return;
    }
    antwort.writeHead(200, {
      'content-type': typen[path.extname(datei)] || 'application/octet-stream',
      'content-security-policy': csp,
      'x-content-type-options': 'nosniff',
    });
    fs.createReadStream(datei).pipe(antwort);
  });
  return new Promise(fertig => server.listen(0, '127.0.0.1', () => fertig(server)));
}

async function lokalMessen() {
  const server = await lokalerServer();
  URL = `http://127.0.0.1:${server.address().port}`;
  const api = await request.newContext({ baseURL: URL });
  const browser = await chromium.launch();
  try {
    const stand = await auslieferungPruefen(api);
    if (!stand) return;
    const kontext = await browser.newContext({ viewport: { width: 1180, height: 820 } });
    const log = mitschreiben(kontext);
    const seite = await kontext.newPage();
    const farben = flaechen();
    for (const theme of ['light', 'dark']) {
      await seite.goto(`${URL}/apps/${APP}/`, { waitUntil: 'networkidle' });
      // Was die Shell am Gerät tut: das Attribut in das Dokument der App.
      await seite.evaluate(
        t =>
          t === 'dark'
            ? document.documentElement.setAttribute('data-theme', 'dark')
            : document.documentElement.removeAttribute('data-theme'),
        theme
      );
      await seite.locator('[data-slot="sidebar"]').waitFor({ timeout: 15000 });
      await probePruefen({
        seite,
        rahmen: seite.mainFrame(),
        stand,
        theme,
        flaeche: farben[theme],
        bild: null,
      });
    }
    netzPruefen(log, stand, `/apps/${APP}/`);
  } finally {
    await browser.close();
    await api.dispose();
    server.close();
  }
}

// --- Ablauf -----------------------------------------------------------------

if (LOKAL) {
  await lokalMessen();
} else {
  if (!PASSWORT) {
    console.log(`ROT    Passwort für ${BENUTZER} fehlt: ARASUL_ADMIN_PW aus Bitwarden setzen.`);
    process.exit(1);
  }
  const anmeldung = await anmelden();
  try {
    const stand = await auslieferungPruefen(anmeldung.api);
    if (SCHRITTE.includes('einspielen')) await einspielen(anmeldung);
    if (SCHRITTE.includes('messen') && stand) await messenAmGeraet(anmeldung, stand);
    if (SCHRITTE.includes('entfernen')) await entfernen(anmeldung);
  } finally {
    await anmeldung.api.post('/api/auth/logout', { headers: anmeldung.kopf }).catch(() => {});
    await anmeldung.api.dispose();
  }
}

const rot = ergebnisse.filter(e => !e.ok).length;
console.log(`\n${ergebnisse.length - rot} gruen, ${rot} rot`);
process.exit(rot ? 1 : 0);
