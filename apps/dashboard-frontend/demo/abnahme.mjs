/**
 * Die Abnahme der Demo (J46, J54, M7) am fertigen Bau `dist-demo/`.
 *
 *   npm run demo:bauen && node demo/abnahme.mjs [--bilder <ordner>] [--sammeln]
 *   ARASUL_DEMO_URL=https://… node demo/abnahme.mjs   (gegen die Auslieferung)
 *
 * Ohne Adresse startet sie einen kleinen Server für `dist-demo/`, der die
 * Regeln aus `vercel.json` nachspielt (Umschreibungen, Köpfe). Dann geht sie
 * je Sprache und Breite (360, 390, 768, 1440 px) durch die Demo:
 *
 *   Startseite (Firma, Kennzahlen, Freigaben, kein Band, nirgends „Sample")
 *   → je Fach-App: Liste, ein Eintrag angelegt, einer geändert, eine Datei
 *   geöffnet → Werkstatt → geführter Weg (beginnt nicht von selbst)
 *   → Zurücksetzen.
 *
 * Gemessen wird: jeder Schritt sichtbar, kein waagrechter Überlauf (Shell und
 * App im Rahmen), keine Anfrage an eine fremde Herkunft, keine Anfrage an
 * `/api/…`, die den Server erreicht (der Service Worker beantwortet alle),
 * kein Fehler in der Konsole, im Englischen kein deutscher Satz in Shell und
 * Werkstatt. `--sammeln` gibt diese deutschen Reste als Liste aus.
 *
 * Playwright steht nicht im Lockfile: `ARASUL_PLAYWRIGHT=<Ordner mit
 * node_modules/playwright>` oder `npm i --no-save playwright`.
 */
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
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

const demo = path.dirname(fileURLToPath(import.meta.url));
const bau = path.resolve(demo, '../dist-demo');
const args = process.argv.slice(2);
const SAMMELN = args.includes('--sammeln');
const bilderArg = args.indexOf('--bilder');
const BILDER = bilderArg >= 0 ? path.resolve(args[bilderArg + 1]) : null;
const BREITEN = [360, 390, 768, 1440];
const spracheArg = args.indexOf('--sprache');
const SPRACHEN = spracheArg >= 0 ? [args[spracheArg + 1]] : SAMMELN ? ['en'] : ['de', 'en'];
const breiteArg = args.indexOf('--breite');
const NUR_BREITE = breiteArg >= 0 ? Number(args[breiteArg + 1]) : null;

const befunde = [];
const rot = text => {
  befunde.push(text);
  console.log(`ROT    ${text}`);
};
const gruen = text => console.log(`GRÜN   ${text}`);

// ── Der Server für dist-demo/, mit den Regeln aus vercel.json ──────────────
const apiTreffer = [];
const alleAnfragen = [];
const protokollArg = args.indexOf('--protokoll');
const PROTOKOLL = protokollArg >= 0 ? path.resolve(args[protokollArg + 1]) : null;
function server() {
  const regeln = JSON.parse(readFileSync(path.join(bau, 'vercel.json'), 'utf8'));
  const koepfe = Object.fromEntries(
    regeln.headers.find(x => x.source === '/(.*)').headers.map(k => [k.key, k.value])
  );
  const typen = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.wasm': 'application/wasm',
  };
  return createServer((req, res) => {
    const pfad = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (pfad.startsWith('/api/') || /\/api\//.test(pfad)) apiTreffer.push(pfad);
    let datei = path.join(bau, pfad);
    if (pfad === '/workspace' || pfad.startsWith('/workspace/'))
      datei = path.join(bau, 'index.html');
    else if (existsSync(datei) && statSync(datei).isDirectory())
      datei = path.join(datei, 'index.html');
    if (!datei.startsWith(bau) || !existsSync(datei)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404');
      return;
    }
    res.writeHead(200, {
      ...koepfe,
      'Content-Type': typen[path.extname(datei)] ?? 'application/octet-stream',
    });
    createReadStream(datei).pipe(res);
  });
}

// ── Hilfen ──────────────────────────────────────────────────────────────────
const warte = ms => new Promise(r => setTimeout(r, ms));

async function ueberlauf(seite, wo) {
  const shell = await seite.evaluate(() => ({
    breit: document.documentElement.scrollWidth - window.innerWidth,
    hoch: document.documentElement.scrollHeight - window.innerHeight,
  }));
  if (shell.breit > 1) rot(`${wo}: Seite ${shell.breit} px zu breit`);
  if (shell.hoch > 1) rot(`${wo}: Seite ${shell.hoch} px zu hoch (die Seite rollt)`);
  for (const rahmen of seite.frames().slice(1)) {
    const r = await rahmen
      .evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      .catch(() => 0);
    if (r > 1) rot(`${wo}: App ${new URL(rahmen.url()).pathname} ${r} px zu breit`);
  }
}

/** Deutsch erkennen: Umlaute oder ein Wort, das es im Englischen nicht gibt. */
const DEUTSCH =
  /[äöüß]|\b(und|oder|nicht|mit|für|der|die|das|ein|eine|ist|sind|wird|Ihre?|Sie|bei|noch|zur|zum|vor|seit|Tage|heute|gestern|Freigabe|Meldung|Stand|alle)\b/;
const saetze = new Set();
/** Sichtbare Sätze in Shell und Werkstatt, die im Englischen deutsch blieben. */
async function deutscheReste(seite, wo) {
  const funde = [];
  for (const rahmen of seite.frames()) {
    const pfad = new URL(rahmen.url()).pathname;
    // Die Fach-Apps sind selbst zweisprachig; Daten wie Namen bleiben.
    if (
      /^\/apps\/(angebote|wareneingang|wartungsplan|pruefprotokolle|urlaub|stammdaten)\//.test(pfad)
    )
      continue;
    const liste = await rahmen
      .evaluate(() => {
        const aus = [];
        const sichtbar = el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        };
        const gang = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let k = gang.nextNode(); k; k = gang.nextNode()) {
          const el = k.parentElement;
          if (!el || el.closest('script, style, [inert], .sr-only')) continue;
          const w = k.nodeValue.trim();
          if (w && sichtbar(el)) aus.push(w);
        }
        for (const el of document.querySelectorAll('[aria-label], [title], [placeholder]')) {
          if (el.closest('[inert]') || !sichtbar(el)) continue;
          for (const a of ['aria-label', 'placeholder']) {
            const w = el.getAttribute(a);
            if (w) aus.push(w.trim());
          }
        }
        return aus;
      })
      .catch(() => []);
    for (const satz of liste) {
      if (
        DEUTSCH.test(satz) &&
        !/Kerschner|Grünfelden|Yıldız|[Mm]üller|Präzision|Hagedorn|Mühlbach|Möbelwerk|Wärmetechnik|Landkreis|Eschenau|Rieger|Brandl|Schulzentrum/.test(
          satz
        )
      ) {
        funde.push(satz);
        saetze.add(satz);
      }
    }
  }
  if (!SAMMELN && funde.length)
    rot(`${wo}: deutsch im Englischen: ${[...new Set(funde)].slice(0, 6).join(' | ')}`);
}

async function bild(seite, name) {
  if (BILDER) await seite.screenshot({ path: path.join(BILDER, `${name}.png`) });
}

const FACH_APPS = ['angebote', 'wareneingang', 'wartungsplan', 'pruefprotokolle', 'urlaub'];

/** In der Shell zu einer Adresse, wie ein Klick in der Leiste. */
async function geheZu(seite, pfad) {
  await seite.evaluate(p => {
    window.history.pushState(null, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, pfad);
}

async function rahmenVon(seite, app) {
  for (let i = 0; i < 60; i += 1) {
    const f = seite.frames().find(x => new URL(x.url()).pathname.startsWith(`/apps/${app}/`));
    if (f) {
      const da = await f
        .locator('[data-testid^="fa-zeile-"], [data-testid="werkstatt-seite"], main, h1')
        .first()
        .isVisible()
        .catch(() => false);
      if (da) return f;
    }
    await warte(250);
  }
  throw new Error(`App ${app} kommt nicht`);
}

/** Was die Abnahme einträgt: so, wie es im Betrieb stünde. */
const TEXTE = {
  'feld-betreff': 'Treppengeländer Rathaus, Edelstahl',
  'feld-bauteil': 'Podest Treppe Nord',
  'feld-aufgabe': 'Hydraulikfilter wechseln',
  'feld-lieferschein': 'LS 48213',
  'feld-lagerort': 'R-12',
};

/** Die Änderung je App: eine Bemerkung, wie sie dort stünde. */
const NOTIZ = {
  angebote: ['Kunde wünscht Montage im Januar.', 'Customer asks for installation in January.'],
  wareneingang: ['Zwei Bunde, Etiketten vollständig.', 'Two bundles, labels complete.'],
  wartungsplan: ['Ersatzfilter liegt im Lager R-12.', 'Spare filter is in store R-12.'],
  pruefprotokolle: ['Nahtbild gleichmäßig, keine Nacharbeit.', 'Even weld pattern, no rework.'],
  urlaub: ['Abgestimmt mit Frank Wiesner.', 'Agreed with Frank Wiesner.'],
};

/** Ein leeres Formular so füllen, dass es die Prüfung besteht. */
async function formularFuellen(rahmen, app) {
  const heute = new Date().toISOString().slice(0, 10);
  const felder = rahmen.locator(
    '[data-testid="fa-formular"] input, [data-testid="fa-formular"] select'
  );
  for (let i = 0; i < (await felder.count()); i += 1) {
    const f = felder.nth(i);
    const id = await f.getAttribute('id');
    const wert = await f.inputValue();
    const art = await f.evaluate(el => (el.tagName === 'SELECT' ? 'select' : el.type));
    if (id === 'feld-bestellung') await f.fill('B-26-0999');
    else if (wert) continue;
    else if (art === 'select') {
      const zweite = await f.locator('option').nth(1).getAttribute('value');
      await f.selectOption(zweite);
    } else if (art === 'date') await f.fill(heute);
    else if (
      id === 'feld-menge' ||
      id === 'feld-betrag' ||
      id === 'feld-messwert' ||
      id === 'feld-dauer' ||
      id === 'feld-intervall' ||
      id === 'feld-rabatt'
    )
      await f.fill(id === 'feld-betrag' ? '12400' : '2');
    else await f.fill(TEXTE[id] ?? 'Nach Rücksprache mit dem Kunden.');
  }
}

async function ueberlaufApp(seite, rahmen, wo) {
  const r = await rahmen
    .evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    .catch(() => 0);
  if (r > 1) rot(`${wo}: App ${r} px zu breit`);
  await ueberlauf(seite, wo);
}

// ── Der Weg ─────────────────────────────────────────────────────────────────
async function weg(browser, basis, sprache, breite) {
  const kontext = await browser.newContext({
    viewport: {
      width: breite,
      height: breite < 600 ? (breite < 380 ? 640 : 844) : breite < 1000 ? 1024 : 900,
    },
    // Ein englischer Browser: die Demo bleibt trotzdem deutsch, bis man wählt.
    locale: 'en-US',
    hasTouch: breite < 900,
    serviceWorkers: 'allow',
    acceptDownloads: true,
  });
  const herkunft = new URL(basis).origin;
  kontext.on('request', r => {
    alleAnfragen.push(
      `${sprache} ${breite} ${r.method()} ${r.url()}${r.serviceWorker() ? ' (Service Worker)' : ''}`
    );
    const u = new URL(r.url());
    if (u.protocol.startsWith('http') && u.origin !== herkunft)
      rot(`fremde Herkunft: ${u.origin} (${r.url()})`);
  });
  if (sprache === 'en') {
    await kontext.addInitScript(() => {
      try {
        localStorage.setItem('arasul-demo-sprache', 'en');
      } catch {
        /* ohne Speicher bleibt es deutsch */
      }
    });
  }
  const seite = await kontext.newPage();
  const wo = `${sprache} ${breite}`;
  seite.on('console', m => {
    if (m.type() === 'error' && !/404 \(Not Found\)/.test(m.text()))
      rot(`${wo}: Konsole: ${m.text().slice(0, 200)}`);
  });
  seite.on('pageerror', f => rot(`${wo}: Fehler: ${f.message.slice(0, 200)}`));

  // Startseite
  await seite.goto(`${basis}/`);
  await seite.getByTestId('demo-uebersicht').waitFor({ timeout: 20000 });
  await seite.locator('[data-testid^="demo-kennzahl-"]').first().waitFor();
  await warte(600);
  const start = await seite.evaluate(() => ({
    band: Boolean(document.querySelector('.demo-band')),
    text: document.body.innerText,
    lang: document.documentElement.lang,
    weg: Boolean(document.querySelector('[data-testid="demo-weg"]')),
  }));
  if (start.band) rot(`${wo}: ein Band ist da`);
  if (/Beispiel-Mitarbeiter|Sample employee|Sample/i.test(start.text))
    rot(`${wo}: „Sample" oder „Beispiel-Mitarbeiter" sichtbar`);
  if (!start.text.includes('Kerschner Metallbau GmbH')) rot(`${wo}: Name der Firma fehlt`);
  if (!/Miriam/.test(start.text)) rot(`${wo}: angemeldete Person ohne Namen`);
  if (start.lang !== sprache) rot(`${wo}: Sprache ${start.lang} statt ${sprache}`);
  if (start.weg) rot(`${wo}: der geführte Weg beginnt von selbst`);
  if (!(await seite.locator('#fuer-sie').count())) rot(`${wo}: „Für Sie" fehlt`);
  // J55: zwei Diagramme über alle Apps und die Auslastung der Woche.
  await seite
    .getByTestId('demo-woche')
    .waitFor({ timeout: 8000 })
    .catch(() => rot(`${wo}: Auslastung der Woche fehlt`));
  const diagramme = await seite.locator('.demo-diagramm .recharts-surface').count();
  if (diagramme < 2) rot(`${wo}: ${diagramme} statt zwei Diagramme auf der Startseite`);
  await ueberlauf(seite, `${wo} Start`);
  if (sprache === 'en') await deutscheReste(seite, `${wo} Start`);
  await bild(seite, `${wo.replace(' ', '-')}-1-start`);
  gruen(`${wo}: Startseite`);

  // Je Fach-App: Liste, anlegen, ändern, Datei öffnen
  for (const app of FACH_APPS) {
    await geheZu(seite, `/workspace/app/${app}`);
    const rahmen = await rahmenVon(seite, app);
    await warte(500);
    // Reiter (J55): Übersicht, Auswertung, Kalender, dann die Liste.
    await ueberlaufApp(seite, rahmen, `${wo} ${app} Übersicht`);
    await bild(seite, `${wo.replace(' ', '-')}-2-${app}-uebersicht`);
    await rahmen.getByTestId('fa-reiter-auswertung').click();
    const teile = await rahmen
      .locator('[data-testid="fa-auswertung"] .fa-flaeche')
      .count()
      .catch(() => 0);
    if (teile < 3) rot(`${wo} ${app}: Auswertung mit nur ${teile} Teilen`);
    await rahmen.getByTestId('fa-zeitraum-3m').click();
    await warte(300);
    await ueberlaufApp(seite, rahmen, `${wo} ${app} Auswertung`);
    await bild(seite, `${wo.replace(' ', '-')}-2-${app}-auswertung`);
    if (await rahmen.getByTestId('fa-reiter-kalender').count()) {
      await rahmen.getByTestId('fa-reiter-kalender').click();
      await rahmen.getByTestId('fa-kalender').waitFor({ timeout: 4000 });
      if (!(await rahmen.locator('.fa-termin').count())) rot(`${wo} ${app}: Kalender leer`);
      await ueberlaufApp(seite, rahmen, `${wo} ${app} Kalender`);
      await bild(seite, `${wo.replace(' ', '-')}-2-${app}-kalender`);
    }
    await rahmen.getByTestId('fa-reiter-liste').click();
    await rahmen.locator('[data-testid^="fa-zeile-"]').first().waitFor();
    // Mehrfachauswahl: zwei wählen, die Sammelleiste erscheint, aufheben.
    const wahl = rahmen.locator('[data-testid^="fa-wahl-"]:not([data-testid="fa-wahl-alle"])');
    await wahl.nth(0).click();
    await wahl.nth(1).click();
    if (!(await rahmen.locator('[data-testid="fa-sammel"][data-aktiv]').count()))
      rot(`${wo} ${app}: keine Sammelleiste nach zwei gewählten`);
    await rahmen.getByTestId('fa-wahl-alle').click();
    await rahmen.getByTestId('fa-wahl-alle').click();
    const zeilen = await rahmen.locator('[data-testid^="fa-zeile-"]').count();
    if (zeilen < 30) rot(`${wo} ${app}: nur ${zeilen} Zeilen`);
    await ueberlaufApp(seite, rahmen, `${wo} ${app}`);
    await bild(seite, `${wo.replace(' ', '-')}-2-${app}`);

    // Anlegen
    await rahmen.getByTestId('fa-neu').first().click();
    await rahmen.getByTestId('fa-formular').waitFor();
    await formularFuellen(rahmen, app);
    await rahmen.getByTestId('fa-speichern').click();
    await rahmen
      .getByTestId('fa-blatt')
      .waitFor({ timeout: 5000 })
      .catch(() => rot(`${wo} ${app}: nach dem Anlegen kein Blatt`));
    if ((await rahmen.locator('[data-testid^="fa-zeile-"]').count()) !== zeilen + 1)
      rot(`${wo} ${app}: Anlage fehlt in der Liste`);
    await warte(400);
    await bild(seite, `${wo.replace(' ', '-')}-3-${app}-angelegt`);

    // Ändern: im Blatt bearbeiten, eine Bemerkung setzen
    await rahmen.getByTestId('fa-bearbeiten').click();
    await rahmen.getByTestId('fa-formular').waitFor();
    const notiz = NOTIZ[app][sprache === 'en' ? 1 : 0];
    await rahmen.locator('#feld-notiz').fill(notiz);
    await rahmen.getByTestId('fa-speichern').click();
    await rahmen.getByTestId('fa-formular').waitFor({ state: 'detached', timeout: 5000 });
    const geaendert = await rahmen.getByTestId('fa-blatt').innerText();
    if (!geaendert.includes(notiz)) rot(`${wo} ${app}: Änderung nicht im Blatt`);
    await seite.keyboard.press('Escape');
    await warte(300);

    // Datei öffnen: der erste Eintrag mit Datei
    const mitDatei = await rahmen.evaluate(async () => {
      const r = await fetch('api/daten');
      const j = await r.json();
      const e = j.data.eintraege.find(x => x.dateien.length > 0 && x.verlauf.length > 1);
      return e ? e.nr : null;
    });
    if (!mitDatei) {
      rot(`${wo} ${app}: kein Eintrag mit Datei`);
      continue;
    }
    await rahmen.locator('input[type="search"], input[placeholder]').first().fill(mitDatei);
    await rahmen.getByTestId(`fa-zeile-${mitDatei}`).click();
    await rahmen.locator('[data-testid^="fa-datei-"]').first().click();
    const dok = rahmen.getByTestId('fa-dokument');
    await dok.waitFor({ timeout: 8000 });
    const gezeigt = await rahmen
      .locator('[data-testid="fa-dokument"] canvas, [data-testid="fa-dokument"] img')
      .first()
      .waitFor({ timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    if (!gezeigt) rot(`${wo} ${app}: Datei ${mitDatei} zeigt nichts`);
    await warte(700);
    await bild(seite, `${wo.replace(' ', '-')}-4-${app}-datei`);
    await seite.keyboard.press('Escape');
    await warte(250);
    // Der Vorgang als PDF.
    await rahmen.getByTestId('fa-pdf').click();
    const pdf = await rahmen
      .locator('[data-testid="fa-dokument"] canvas')
      .first()
      .waitFor({ timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    if (!pdf) rot(`${wo} ${app}: PDF des Vorgangs zeigt nichts`);
    await seite.keyboard.press('Escape');
    await warte(250);
    await seite.keyboard.press('Escape');
    await rahmen.locator('input[type="search"], input[placeholder]').first().fill('');
    gruen(
      `${wo} ${app}: Reiter, Auswertung ${teile} Teile, Auswahl, Liste ${zeilen}, angelegt, geändert, Datei und PDF`
    );
  }

  // Stammdaten (J55): Kunde mit Vorgängen, vom Vorgang in seine App und zurück.
  await geheZu(seite, '/workspace/app/stammdaten');
  const stamm = await rahmenVon(seite, 'stammdaten');
  await stamm.locator('[data-testid^="st-zeile-kunden-"]').first().waitFor();
  const kunden = await stamm.locator('[data-testid^="st-zeile-kunden-"]').count();
  if (kunden < 20) rot(`${wo} Stammdaten: nur ${kunden} Kunden`);
  await ueberlaufApp(seite, stamm, `${wo} Stammdaten`);
  await bild(seite, `${wo.replace(' ', '-')}-2-stammdaten`);
  await stamm.getByTestId('st-zeile-kunden-2').click();
  await stamm.getByTestId('st-blatt').waitFor();
  const vorgang = stamm.locator('[data-testid^="st-vorgang-AN-"]').first();
  if (!(await vorgang.count())) rot(`${wo} Stammdaten: Kunde ohne Angebote`);
  await warte(400);
  await bild(seite, `${wo.replace(' ', '-')}-3-stammdaten-kunde`);
  const nr = (await vorgang.getAttribute('data-testid')).replace('st-vorgang-', '');
  await vorgang.click();
  const angebote = await rahmenVon(seite, 'angebote');
  const blattDa = await angebote
    .getByTestId('fa-blatt')
    .waitFor({ timeout: 6000 })
    .then(() => true)
    .catch(() => false);
  if (!blattDa || !(await angebote.getByTestId('fa-blatt').innerText()).includes(nr))
    rot(`${wo} Stammdaten: ${nr} öffnet nicht in Angebote`);
  await angebote.getByTestId('fa-stamm-kunde').click();
  await warte(800);
  const zurueck = await rahmenVon(seite, 'stammdaten');
  const kundeWieder = await zurueck
    .getByTestId('st-blatt')
    .waitFor({ timeout: 6000 })
    .then(() => true)
    .catch(() => false);
  if (!kundeWieder) rot(`${wo} Stammdaten: vom Angebot nicht zurück zum Kunden`);
  else gruen(`${wo} Stammdaten: ${kunden} Kunden, Kunde zu ${nr} und zurück`);
  await seite.keyboard.press('Escape');

  // Werkstatt: alle Meldungen, Test nach Live
  await geheZu(seite, '/workspace/app/werkstatt');
  const werkstatt = await rahmenVon(seite, 'werkstatt');
  await warte(1200);
  await ueberlaufApp(seite, werkstatt, `${wo} Werkstatt`);
  if (sprache === 'en') await deutscheReste(seite, `${wo} Werkstatt`);
  await bild(seite, `${wo.replace(' ', '-')}-5-werkstatt`);

  // Einstellungen: nur Überlauf und Sprache
  await geheZu(seite, '/workspace/settings');
  await warte(1200);
  await ueberlauf(seite, `${wo} Einstellungen`);
  if (sprache === 'en') await deutscheReste(seite, `${wo} Einstellungen`);

  // Der geführte Weg: nur auf Wunsch, Escape schließt
  await geheZu(seite, '/workspace');
  await seite.getByTestId('demo-uebersicht').waitFor();
  const breitZeile = await seite.locator('.demo-zeigen').isVisible();
  if (breitZeile) await seite.locator('.demo-zeigen').click();
  else {
    await seite.locator('.demo-kapsel-auf').click();
    await seite.locator('.demo-menue button').first().click();
  }
  await seite.locator('[data-testid="demo-weg"]').waitFor();
  await warte(500);
  await bild(seite, `${wo.replace(' ', '-')}-6-weg`);
  if (sprache === 'en') await deutscheReste(seite, `${wo} Weg`);
  for (let i = 0; i < 4; i += 1) {
    await seite.locator('[data-testid="demo-weg-weiter"]').click();
    await warte(900);
    await ueberlauf(seite, `${wo} Weg ${i + 2}`);
  }
  await bild(seite, `${wo.replace(' ', '-')}-7-weg-werkstatt`);
  await seite.keyboard.press('Escape');
  if (await seite.locator('[data-testid="demo-weg"]').count())
    rot(`${wo}: Escape schließt den Weg nicht`);

  // Zurücksetzen stellt den Anfang her (ein Klick fragt, der zweite setzt zurück)
  await geheZu(seite, '/workspace');
  const knopf = breitZeile
    ? seite.locator('.demo-kapsel-breit button', { hasText: /zurücksetzen|reset/i })
    : null;
  if (knopf) {
    await knopf.click();
    await knopf.click();
  } else {
    await seite.locator('.demo-kapsel-auf').click();
    const k = seite.locator('.demo-menue button', { hasText: /zurücksetzen|reset/i });
    await k.click();
    await k.click();
  }
  await seite.waitForURL(/\/workspace$/);
  await seite.getByTestId('demo-uebersicht').waitFor();
  const nachher = await seite.evaluate(async () => {
    const r = await fetch('/apps/angebote/api/daten');
    return (await r.json()).data.eintraege.length;
  });
  if (nachher !== 42) rot(`${wo}: nach dem Zurücksetzen ${nachher} statt 42 Angebote`);

  gruen(`${wo}: Weg vollständig`);
  await kontext.close();
}

// ── Lauf ────────────────────────────────────────────────────────────────────
const { chromium } = await ladePlaywright();
let basis = process.env.ARASUL_DEMO_URL?.replace(/\/$/, '');
let laufenderServer = null;
if (!basis) {
  if (!existsSync(path.join(bau, 'index.html'))) {
    console.log('ROT    dist-demo/ fehlt: zuerst `npm run demo:bauen`.');
    process.exit(1);
  }
  laufenderServer = server();
  await new Promise(r => laufenderServer.listen(0, '127.0.0.1', r));
  basis = `http://localhost:${laufenderServer.address().port}`;
}
if (BILDER) mkdirSync(BILDER, { recursive: true });

// Ein anderer Chromium als der zur Playwright-Fassung passende, falls nur er da ist.
const browser = await chromium.launch(
  process.env.ARASUL_CHROMIUM ? { executablePath: process.env.ARASUL_CHROMIUM } : {}
);
try {
  for (const sprache of SPRACHEN) {
    for (const breite of NUR_BREITE ? [NUR_BREITE] : SAMMELN ? [1440] : BREITEN) {
      try {
        await weg(browser, basis, sprache, breite);
      } catch (f) {
        rot(`${sprache} ${breite}: Weg abgebrochen: ${f.message.split('\n')[0]}`);
      }
    }
  }
} finally {
  await browser.close();
  laufenderServer?.close();
}

if (apiTreffer.length)
  rot(`Anfragen an /api/ erreichten den Server: ${[...new Set(apiTreffer)].join(', ')}`);
else if (laufenderServer) gruen('keine Anfrage an /api/ erreichte den Server');

if (PROTOKOLL) {
  const herkuenfte = [...new Set(alleAnfragen.map(z => new URL(z.split(' ')[3]).origin))];
  writeFileSync(
    PROTOKOLL,
    [
      `# Netzwerkprotokoll der Demo, ${new Date().toISOString()}`,
      `# Adresse: ${basis}`,
      `# Herkünfte: ${herkuenfte.join(', ')}`,
      `# Anfragen: ${alleAnfragen.length}`,
      ...alleAnfragen,
    ].join('\n') + '\n'
  );
  console.log(
    `Protokoll: ${PROTOKOLL} (${alleAnfragen.length} Anfragen, Herkünfte: ${herkuenfte.join(', ')})`
  );
}
if (SAMMELN) {
  console.log(JSON.stringify([...saetze].sort(), null, 2));
}
console.log(befunde.length ? `\n${befunde.length} Befund(e).` : '\nAlles grün.');
process.exit(befunde.length ? 1 : 0);
