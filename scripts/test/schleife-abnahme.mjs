/**
 * Die Verbesserungsschleife am Orin, geprüft, soweit es ohne Menschen geht
 * (J47, M7; Karten schleife-generalprobe und schleife-abnahme-am-orin).
 * Der Ablauf für den Menschen steht in docs/ops/SCHLEIFE_ABNAHME.md; dieses
 * Skript ist sein Prüfstand, es ersetzt ihn nicht.
 *
 *   vorher            Bevor der Lauf beginnt: Anmeldung, Recht in der
 *                     Werkstatt, die App hat in Test und Live eine Oberfläche,
 *                     nichts wartet schon im Test, über der App steht das Icon
 *                     und es entsteht ein Bildschirmfoto (Formular wird wieder
 *                     geschlossen, nichts gemeldet). Mit Schlüssel: der Kontrakt
 *                     kennt die Rückmeldungen, der Schlüssel liest die App.
 *   melden "<text>"   Was der Mensch im ersten Schritt tut, ohne ihn: Icon,
 *                     Stelle markieren, absenden. Für die Generalprobe und für
 *                     Bilder; in einer echten Abnahme meldet der Mensch selbst.
 *                     Gibt die Nummer der Meldung aus.
 *   nachher <nr>      Nach dem Lauf: die Meldung gehört zur App, hat Bild und
 *                     Stelle, steht auf „umgesetzt“; die App wurde nach der
 *                     Meldung live geschaltet, Test und Live sind gleich, die
 *                     Live-Seite kommt mit dem Icon. Mit ARASUL_ERWARTET muss
 *                     dieser Text in der Live-Fassung stehen (die Änderung ist
 *                     wirklich live). Mit Schlüssel: das Kit sieht „umgesetzt“.
 *
 * Aufruf (das Passwort nur in der Umgebung dieses einen Befehls, nie in einer
 * Datei, nie das Konto admin):
 *
 *   ARASUL_PLAYWRIGHT=/Users/koljaschope/Code/arasul/arasul-jet \
 *   ARASUL_BENUTZER=probe-admin \
 *   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
 *   ARASUL_APP=probe-cockpit-1120 \
 *   node scripts/test/schleife-abnahme.mjs vorher
 *
 * Weitere Umgebung:
 *   ARASUL_URL          Adresse des Geräts, Vorgabe https://100.121.244.80
 *   ARASUL_SCHLUESSEL   Schlüssel mit feedback:agent (der des Kits), dann wird
 *                       auch die Sicht des Kits geprüft. Ohne: übersprungen.
 *   ARASUL_ERWARTET     nur bei nachher: Text, der live stehen muss.
 *   ARASUL_BILDER       Ordner für Bilder je Schritt (1440 px, hell).
 *   ARASUL_AUSBLENDEN   App-Kennungen, deren Kacheln und Einträge in der Leiste
 *                       auf Bildern fehlen sollen (etwa mit Kundennamen).
 *   ARASUL_ERGEBNIS     Datei, in die eine Zeile JSON mit dem Ergebnis geht
 *                       (für das Cockpit des Überordners).
 *
 * Angefasst wird nur bei „melden“ etwas: eine Meldung mit dem gegebenen Text.
 * Rückgabe 0 bei lauter Grün, 1 sonst.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

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

const SCHRITT = process.argv[2] ?? '';
const ARG = process.argv[3] ?? '';
const URL = process.env.ARASUL_URL || 'https://100.121.244.80';
const BENUTZER = process.env.ARASUL_BENUTZER || '';
const PASSWORT = process.env.ARASUL_PASSWORT || '';
const APP = process.env.ARASUL_APP || '';
const SCHLUESSEL = process.env.ARASUL_SCHLUESSEL || '';
const ERWARTET = process.env.ARASUL_ERWARTET || '';
const BILDER = process.env.ARASUL_BILDER || '';
const AUSBLENDEN = (process.env.ARASUL_AUSBLENDEN ?? '').split(',').filter(Boolean);
const ERGEBNIS = process.env.ARASUL_ERGEBNIS || '';

if (!['vorher', 'melden', 'nachher'].includes(SCHRITT)) {
  console.log(
    'Aufruf: node scripts/test/schleife-abnahme.mjs vorher | melden "<text>" | nachher <nr>'
  );
  process.exit(1);
}
if (!BENUTZER || !PASSWORT || BENUTZER === 'admin') {
  console.log('ROT    ARASUL_BENUTZER und ARASUL_PASSWORT fehlen (nie das Konto admin).');
  process.exit(1);
}
if (!APP) {
  console.log('ROT    ARASUL_APP fehlt: die Kennung der App, an der die Schleife läuft.');
  process.exit(1);
}
if (SCHRITT === 'melden' && !ARG.trim()) {
  console.log('ROT    melden braucht den Text der Meldung als zweites Argument.');
  process.exit(1);
}
if (SCHRITT === 'nachher' && !/^\d+$/.test(ARG)) {
  console.log('ROT    nachher braucht die Nummer der Meldung.');
  process.exit(1);
}
if (BILDER) fs.mkdirSync(BILDER, { recursive: true });

const pw = await ladePlaywright();
const ergebnisse = [];
let rot = 0;
const pruefe = (was, ok, detail = '') => {
  if (!ok) rot += 1;
  ergebnisse.push({ was, ok: Boolean(ok), detail });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
  return ok;
};
const hinweis = satz => console.log(`—      ${satz}`);

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'light',
});

async function ende() {
  await browser.close().catch(() => {});
  if (ERGEBNIS) {
    const zeile = {
      art: 'schleife-abnahme',
      schritt: SCHRITT,
      app: APP,
      meldung: SCHRITT === 'nachher' ? Number(ARG) : (gemeldet ?? null),
      zeit: new Date().toISOString(),
      gruen: rot === 0,
      rot,
      pruefungen: ergebnisse,
    };
    fs.appendFileSync(ERGEBNIS, `${JSON.stringify(zeile)}\n`);
  }
  console.log(rot === 0 ? `\nAlles grün (${ergebnisse.length}).` : `\n${rot} rot.`);
  process.exit(rot === 0 ? 0 : 1);
}
let gemeldet = null;

// --- Anmeldung ----------------------------------------------------------------
const login = await ctx.request
  .post(`${URL}/api/auth/login`, { data: { username: BENUTZER, password: PASSWORT } })
  .catch(e => ({ ok: () => false, status: () => e.message.split('\n')[0] }));
if (!pruefe(`Anmeldung als ${BENUTZER} an ${URL}`, login.ok(), String(login.status()))) {
  await ende();
}
const csrf = async () => (await ctx.cookies()).find(c => c.name === 'arasul_csrf')?.value ?? '';
const api = async (methode, weg, data) =>
  ctx.request.fetch(`${URL}/api${weg}`, {
    method: methode,
    data,
    headers: { 'X-CSRF-Token': await csrf(), Accept: 'application/json' },
  });
const daten = async antwort => (await antwort.json().catch(() => ({}))).data;
const kit = async weg =>
  ctx.request.get(`${URL}/api/v1/external${weg}`, { headers: { 'X-API-Key': SCHLUESSEL } });

const appStand = async () =>
  ((await daten(await api('GET', '/werkstatt/apps'))) ?? []).find(a => a.id === APP);

/** Was nicht ins Bild gehört, verschwindet; die Kennungen kommen nur aus der Umgebung. */
async function bild(seite, name) {
  if (!BILDER) return;
  if (AUSBLENDEN.length) {
    await seite.addStyleTag({
      content: AUSBLENDEN.map(
        id =>
          `[data-testid^="leiste-app-${id}"],[data-testid^="uebersicht-app-${id}"],[data-testid^="palette-app-${id}"]{display:none!important}`
      ).join('\n'),
    });
  }
  await seite.waitForTimeout(300);
  await seite.screenshot({ path: path.join(BILDER, `${name}.png`) });
}

async function appOeffnen(seite) {
  await seite.goto(`${URL}/workspace/app/${APP}`);
  const knopf = seite.locator('[data-testid="rueckmeldung-knopf"]');
  const da = await knopf.waitFor({ timeout: 30000 }).then(
    () => true,
    () => false
  );
  await seite.waitForTimeout(2500);
  return da;
}

async function fotoOeffnen(seite) {
  const t0 = Date.now();
  await seite.click('[data-testid="rueckmeldung-knopf"]');
  await seite.locator('[data-testid="rueckmeldung-text"]').waitFor({ timeout: 15000 });
  const foto = (await seite.locator('[data-testid="rueckmeldung-markierung"]').count()) === 1;
  return { foto, ms: Date.now() - t0 };
}

// --- vorher -------------------------------------------------------------------
if (SCHRITT === 'vorher') {
  const ich = (await (await api('GET', '/auth/me')).json().catch(() => ({}))).user ?? {};
  pruefe(`${BENUTZER} hat das Recht in der Werkstatt`, ich.entwickler === true);
  const meine = (await daten(await api('GET', '/apps/meine'))) ?? [];
  pruefe(
    'Die Werkstatt steht in den eigenen Apps',
    meine.some(a => a.id === 'werkstatt')
  );
  const st = await appStand();
  if (pruefe(`Die App ${APP} ist am Gerät`, Boolean(st))) {
    pruefe(
      'Sie hat eine Test- und eine Live-Fassung',
      Boolean(st.test?.version && st.live?.version),
      `test ${st.test?.version ?? '–'}, live ${st.live?.version ?? '–'}`
    );
    pruefe(
      'Im Test wartet nichts, was nicht aus diesem Lauf kommt',
      st.test_neuer === false,
      st.test_neuer ? `Test ${st.test?.version} ist neuer als live; erst schalten oder zurück` : ''
    );
    hinweis(`offene Meldungen zu ${APP}: ${st.meldungen?.offen ?? '?'}`);
  }
  for (const stand of ['live', 'test']) {
    const weg = stand === 'live' ? `/apps/${APP}/` : `/apps/${APP}/test/`;
    const s = await ctx.request.get(`${URL}${weg}`, { headers: { Accept: 'text/html' } });
    pruefe(
      `${weg} hat eine Oberfläche`,
      s.status() === 200 && (await s.text()).includes('<html'),
      String(s.status())
    );
  }
  const seite = await ctx.newPage();
  pruefe('Über der App steht das Icon der Rückmeldung', await appOeffnen(seite));
  await bild(seite, '01-app-mit-icon');
  const { foto, ms } = await fotoOeffnen(seite);
  pruefe('Ein Klick nimmt das Bildschirmfoto auf', foto, `${ms} ms bis zum Formular`);
  await seite.keyboard.press('Escape');
  await seite.close();

  if (SCHLUESSEL) {
    const k = await kit('/contract');
    const vertrag = (await k.json().catch(() => ({}))).data ?? {};
    pruefe(
      'Der Kontrakt nennt die Rückmeldungen',
      k.ok() && Boolean(vertrag.rueckmeldungen),
      String(k.status())
    );
    const l = await kit(`/apps/${APP}/rueckmeldungen?grenze=1`);
    const d = await daten(l);
    pruefe('Der Schlüssel des Kits liest die Meldungen der App', l.ok(), String(l.status()));
    if (d)
      hinweis(`Bildschirmfotos an den Agenten für ${APP}: ${d.bilder_an_agenten ? 'an' : 'aus'}`);
  } else {
    hinweis('ohne ARASUL_SCHLUESSEL: die Sicht des Kits nicht geprüft');
  }
}

// --- melden -------------------------------------------------------------------
if (SCHRITT === 'melden') {
  const seite = await ctx.newPage();
  pruefe('Über der App steht das Icon', await appOeffnen(seite));
  await bild(seite, '01-app-mit-icon');
  const { foto, ms } = await fotoOeffnen(seite);
  pruefe('Bildschirmfoto aufgenommen', foto, `${ms} ms`);
  await seite.fill('[data-testid="rueckmeldung-text"]', ARG);
  const box = await seite.locator('[data-testid="rueckmeldung-markierung"]').boundingBox();
  if (box) {
    // Ein Rahmen um die Mitte des oberen Drittels: dort steht der leere Zustand.
    await seite.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.12);
    await seite.mouse.down();
    await seite.mouse.move(box.x + box.width * 0.56, box.y + box.height * 0.42, { steps: 8 });
    await seite.mouse.up();
  }
  await seite.waitForTimeout(300);
  pruefe(
    'Stelle markiert',
    (await seite.locator('[data-testid="rueckmeldung-stelle"]').count()) === 1
  );
  await bild(seite, '02-formular-mit-stelle');
  const vorher = new Set(((await daten(await api('GET', '/rueckmeldungen'))) ?? []).map(m => m.id));
  await seite.click('[data-testid="rueckmeldung-absenden"]');
  const ok = await seite
    .locator('[data-testid="rueckmeldung-bestaetigung"]')
    .waitFor({ timeout: 20000 })
    .then(
      () => true,
      () => false
    );
  pruefe('Nach dem Absenden die Bestätigung', ok);
  await bild(seite, '03-bestaetigung');
  const neu = ((await daten(await api('GET', '/rueckmeldungen'))) ?? []).find(
    m => !vorher.has(m.id) && m.app_id === APP && m.text === ARG
  );
  if (pruefe('Die Meldung steht am Gerät', Boolean(neu), neu ? `Nummer ${neu.id}` : '')) {
    gemeldet = neu.id;
    pruefe('mit Bild und Stelle', neu.hat_bild === true && Boolean(neu.markierung));
    console.log(`\nMeldung ${neu.id}`);
  }
  await seite.close();
}

// --- nachher ------------------------------------------------------------------
if (SCHRITT === 'nachher') {
  const nr = Number(ARG);
  const m = ((await daten(await api('GET', '/rueckmeldungen'))) ?? []).find(x => x.id === nr);
  if (pruefe(`Meldung ${nr} steht am Gerät`, Boolean(m))) {
    pruefe(`Sie gehört zu ${APP}`, m.app_id === APP, m.app_id);
    pruefe('mit Bildschirmfoto', m.hat_bild === true);
    pruefe('mit markierter Stelle', Boolean(m.markierung));
    pruefe('Stand „umgesetzt“', m.stand_meldung === 'umgesetzt', m.stand_meldung);
    const st = await appStand();
    if (pruefe(`Die App ${APP} ist am Gerät`, Boolean(st))) {
      const nach = Date.parse(m.erstellt_am);
      pruefe(
        'Nach der Meldung eine neue Fassung im Test',
        Date.parse(st.test?.eingespielt_am ?? 0) > nach,
        `test ${st.test?.version}, eingespielt ${st.test?.eingespielt_am}`
      );
      pruefe(
        'Nach der Meldung live geschaltet',
        st.letzte_schaltung?.ergebnis === 'live' && Date.parse(st.letzte_schaltung.am) > nach,
        st.letzte_schaltung?.satz ?? 'keine Schaltung'
      );
      pruefe(
        'Test und Live sind dieselbe Fassung',
        st.test_neuer === false && st.live?.version === st.test?.version,
        `live ${st.live?.version}`
      );
      pruefe(
        'Umgesetzt erst nach dem Einspielen in den Test',
        Date.parse(m.stand_geaendert_am ?? 0) >= Date.parse(st.test?.eingespielt_am ?? 0)
      );
    }
    const seite = await ctx.newPage();
    pruefe('Die Live-Seite kommt, mit dem Icon', await appOeffnen(seite));
    if (ERWARTET) {
      const rahmen = seite.frameLocator(`[data-testid="app-rahmen-${APP}"]`);
      const da = await rahmen
        .getByText(ERWARTET)
        .first()
        .waitFor({ timeout: 20000 })
        .then(
          () => true,
          () => false
        );
      pruefe(`Live steht „${ERWARTET}“`, da);
    } else {
      hinweis('ohne ARASUL_ERWARTET: nicht geprüft, was live neu steht');
    }
    await bild(seite, '09-live-nachher');
    await seite.close();
    if (SCHLUESSEL) {
      const l = await kit(`/apps/${APP}/rueckmeldungen?stand_meldung=umgesetzt`);
      const d = await daten(l);
      pruefe(
        'Das Kit sieht die Meldung als umgesetzt',
        Boolean(d?.meldungen?.some(x => x.id === nr)),
        String(l.status())
      );
    }
  }
}

await ende();
