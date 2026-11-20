/**
 * Abnahme „Entwickler-Cockpit“ (J44, M7, Karte entwickler-cockpit), am Orin.
 *
 *   abweisung   Ein Mitarbeiter ohne Kennzeichen (ARASUL_A) und der
 *               Administrator ohne Kennzeichen: kein Eintrag in /api/apps/meine,
 *               die Adresse /apps/entwickler-cockpit/ gibt 403, die Wege des
 *               Cockpits geben 403, keine Kachel in der Leiste.
 *   sichtbar    Mit Kennzeichen: Eintrag in der Leiste, die App lädt im Rahmen,
 *               der Eingang zeigt die Meldungen, kein seitliches Rollen; Chromium
 *               und WebKit, 1440 und 390 px. Verwaltung › Rückmeldungen gibt es
 *               nicht mehr.
 *   stand       Im Eingang eine Meldung öffnen, „Abgelehnt“ ohne Grund geht
 *               nicht, mit Grund geht es; die Schnittstelle sagt dasselbe. Danach
 *               wird der Stand über dieselbe Route wieder auf den alten gesetzt.
 *   live        Eine Probe-App (`tests/probe-live`, Kennung probe-cockpit-<MMTT>)
 *               mit 1.0.0 live und 3.0.0 im Test: das Cockpit zeigt 3.0.0 mit
 *               Änderungstext unter „Test nach Live“, ein Klick schaltet live
 *               (Sicherung vorher: ein Stand `fuer:live:<app>`), „Zurück“ geht
 *               auf 1.0.0, am Ende steht 3.0.0 wieder live und nichts wartet.
 *
 * ANGEFASST WIRD NUR, WAS DIESER LAUF ANLEGT, und gelöscht wird nichts: die
 * Probe-App bleibt am Gerät (Container, Datenbank, Stände der Sicherung), der
 * Wegwerf-Schlüssel wird widerrufen. Das Kennzeichen des Probekontos wird kurz
 * ab- und wieder angeschaltet (wie in der Abnahme J42). Die Meldungen
 * „Abnahme J42“ behalten ihren Stand. Nie das Konto admin.
 *
 *   ssh -f -N -L 8443:localhost:443 jetson
 *   ARASUL_PLAYWRIGHT=/Users/koljaschope/Code/arasul/arasul-jet \
 *   ARASUL_BENUTZER=probe-admin \
 *   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
 *   ARASUL_A=probe-j36-a ARASUL_A_PASSWORT="$(geheim get 'Arasul Orin Probe-Konto probe-j36-a')" \
 *   ARASUL_BILDER=1 node scripts/test/entwickler-cockpit-abnahme.mjs
 *
 * Bilder: docs/plans/audits/<tag>-entwickler-cockpit/. Zeilen einer App, deren
 * Name nicht in ein Bild gehört (etwa ein Kundenname), deckt ARASUL_ABDECKEN=<Wort>
 * im Bild ab; der Name steht nie in diesem Skript. Rückgabe 0 bei lauter Grün.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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
const pw = await ladePlaywright();

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const ADMIN = process.env.ARASUL_BENUTZER || '';
const ADMIN_PASS = process.env.ARASUL_PASSWORT || '';
const A = process.env.ARASUL_A || '';
const A_PASS = process.env.ARASUL_A_PASSWORT || '';
const MOTOREN = (process.env.ARASUL_MOTOREN || 'chromium,webkit').split(',').filter(Boolean);
const TAG = process.env.ARASUL_TAG || new Date().toLocaleDateString('sv-SE');
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-entwickler-cockpit`);
const BILDER = process.env.ARASUL_BILDER === '1';
const ABDECKEN = process.env.ARASUL_ABDECKEN ?? '';
const MMTT = new Date()
  .toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
  .split('.')
  .reverse()
  .join('');
const PROBE = process.env.ARASUL_PROBE_APP || `probe-cockpit-${MMTT}`;
const COCKPIT = 'entwickler-cockpit';
const BREITEN = [
  [1440, 900],
  [390, 844],
];

if (!ADMIN || !ADMIN_PASS || ADMIN === 'admin') {
  console.log('ROT    ARASUL_BENUTZER und ARASUL_PASSWORT fehlen (nie das Konto admin).');
  process.exit(1);
}
if (BILDER) fs.mkdirSync(ZIEL, { recursive: true });

let rot = 0;
const pruefe = (was, ok, detail = '') => {
  if (!ok) rot += 1;
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
  return ok;
};
const warte = ms => new Promise(r => setTimeout(r, ms));

/** Ein angemeldeter Kontext; schreibende Aufrufe tragen das CSRF-Token. */
async function anmelden(browser, benutzer, passwort, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport, deviceScaleFactor: 2 });
  const antwort = await ctx.request.post(`${URL}/api/auth/login`, {
    data: { username: benutzer, password: passwort },
  });
  if (!antwort.ok()) throw new Error(`Anmeldung ${benutzer}: ${antwort.status()}`);
  const csrf = async () => (await ctx.cookies()).find(c => c.name === 'arasul_csrf')?.value ?? '';
  // `/api…` fuer die Plattform; ein Weg mit `roh:` davor geht so, wie er ist
  // (die Schnittstelle einer App unter `/apps/<id>/api/…`).
  const mit = async (methode, p, data) =>
    ctx.request.fetch(p.startsWith('roh:') ? `${URL}${p.slice(4)}` : `${URL}/api${p}`, {
      method: methode,
      data,
      headers: { 'X-CSRF-Token': await csrf(), Accept: 'application/json' },
      timeout: 10 * 60_000,
    });
  const api = {
    get: p => mit('GET', p),
    put: (p, d) => mit('PUT', p, d),
    post: (p, d) => mit('POST', p, d),
    patch: (p, d) => mit('PATCH', p, d),
    del: p => mit('DELETE', p),
    seite: p =>
      ctx.request.get(`${URL}${p}`, { headers: { Accept: 'text/html' }, maxRedirects: 0 }),
  };
  return { ctx, api };
}
const daten = async antwort => (await antwort.json().catch(() => ({}))).data;
const hatCockpit = async api =>
  ((await daten(await api.get('/apps/meine'))) ?? []).some(a => a.id === COCKPIT);

/** Die Abweisung, für wen auch immer gerade angemeldet ist. */
async function abgewiesen(api, wer) {
  pruefe(`${wer}: kein Cockpit in /api/apps/meine`, !(await hatCockpit(api)));
  const seite = await api.seite(`/apps/${COCKPIT}/`);
  pruefe(`${wer}: /apps/${COCKPIT}/ ist zu`, seite.status() === 403, String(seite.status()));
  const datei = await api.seite(`/apps/${COCKPIT}/app.json`);
  pruefe(`${wer}: auch keine Datei aus der App`, datei.status() === 403, String(datei.status()));
  pruefe(`${wer}: /api/entwickler/apps 403`, (await api.get('/entwickler/apps')).status() === 403);
  pruefe(
    `${wer}: Stand setzen 403`,
    (await api.patch('/rueckmeldungen/1', { stand_meldung: 'angenommen' })).status() === 403
  );
}

const chromium = await pw.chromium.launch();
const haupt = await anmelden(chromium, ADMIN, ADMIN_PASS);
const ich = (await (await haupt.api.get('/auth/me')).json()).user ?? {};

// --- abweisung ------------------------------------------------------------
if (A && A_PASS) {
  const { ctx, api } = await anmelden(chromium, A, A_PASS);
  await abgewiesen(api, `Mitarbeiter ${A}`);
  pruefe(
    `Mitarbeiter ${A}: live schalten 403`,
    (await api.post('/apps/belege/schalten', { ziel: 'live' })).status() === 403
  );
  await ctx.close();
} else {
  console.log('—      ohne ARASUL_A keine Probe als Mitarbeiter');
}
{
  await haupt.api.put(`/benutzer/${ich.id}/entwickler`, { entwickler: false });
  await abgewiesen(haupt.api, 'Administrator ohne Kennzeichen');
  const seite = await haupt.ctx.newPage();
  await seite.goto(`${URL}/workspace`);
  await seite.locator('[data-testid="aktivitaetsleiste"]').waitFor({ timeout: 30000 });
  pruefe(
    'Administrator ohne Kennzeichen: kein Cockpit in der Leiste',
    (await seite.locator(`[data-testid="leiste-app-${COCKPIT}-live"]`).count()) === 0
  );
  await seite.close();
  const an = await haupt.api.put(`/benutzer/${ich.id}/entwickler`, { entwickler: true });
  pruefe('Kennzeichen Entwickler wieder gesetzt', an.ok(), String(an.status()));
}
pruefe('Mit Kennzeichen: Cockpit in /api/apps/meine', await hatCockpit(haupt.api));
const seiteDa = await haupt.api.seite(`/apps/${COCKPIT}/`);
pruefe(
  'Mit Kennzeichen: die Seite kommt',
  seiteDa.status() === 200 && (await seiteDa.text()).includes('Entwickler-Cockpit')
);

// --- die Probe-App: 1.0.0 live, 3.0.0 im Test -------------------------------
let schluessel = '';
let schluesselId = '';
const arbeit = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-abnahme-'));
async function ausrollen(version, struktur, text) {
  const ordner = path.join(arbeit, `paket-${version}`);
  fs.cpSync(path.join(WURZEL, 'tests/probe-live/backend'), path.join(ordner, 'backend'), {
    recursive: true,
  });
  const m = JSON.parse(fs.readFileSync(path.join(WURZEL, 'tests/probe-live/app.json'), 'utf8'));
  Object.assign(m, { id: PROBE, name: 'Probe Cockpit', version });
  m.backend.image = `arasul-${PROBE}:${version}`;
  m.backend.umgebung = { PROBE_VERSION: version, PROBE_STRUKTUR: struktur };
  fs.writeFileSync(path.join(ordner, 'app.json'), JSON.stringify(m, null, 2));
  const tgz = path.join(arbeit, `paket-${version}.tgz`);
  execFileSync('tar', ['czf', tgz, '-C', ordner, '.'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });
  const kit = await pw.request.newContext({ ignoreHTTPSErrors: true });
  const r = await kit.post(`${URL}/api/v1/external/apps`, {
    headers: { 'x-api-key': schluessel },
    multipart: {
      paket: { name: 'paket.tgz', mimeType: 'application/gzip', buffer: fs.readFileSync(tgz) },
      ...(text ? { aenderungstext: text } : {}),
    },
    timeout: 30 * 60_000,
  });
  await kit.dispose();
  return r.status();
}
async function gesund(weg, sekunden) {
  for (let i = 0; i < sekunden / 5; i += 1) {
    if ((await haupt.api.get(`roh:${weg}`)).status() === 200) return true;
    await warte(5000);
  }
  return false;
}
const probeStand = async () =>
  ((await daten(await haupt.api.get('/entwickler/apps'))) ?? []).find(a => a.id === PROBE);

// Wird der Lauf wiederholt, nimmt er die eigene Probe-App vom ersten Lauf
// und rollt eine neue Fassung in den Test, statt eine zweite App anzulegen.
let ALT = '1.0.0';
let NEU = '3.0.0';
async function aufraeumen() {
  if (schluesselId) {
    const weg = await haupt.api.del(`/v1/external/api-keys/${schluesselId}`);
    pruefe('Wegwerf-Schlüssel widerrufen', weg.ok(), String(weg.status()));
    schluesselId = '';
  }
  fs.rmSync(arbeit, { recursive: true, force: true });
}
// Auch ein Abbruch widerruft den Schlüssel.
process.on('uncaughtException', async fehler => {
  console.log(`ROT    Abbruch: ${fehler.message.split('\n')[0]}`);
  await aufraeumen().catch(() => {});
  process.exit(1);
});
{
  const vorher = await haupt.api.get(`/apps/${PROBE}`);
  const wiederholung = vorher.status() === 200;
  if (wiederholung && (await daten(vorher))?.name !== 'Probe Cockpit') {
    console.log(`ROT    Die App ${PROBE} gibt es schon und ist nicht die Probe dieser Abnahme.`);
    process.exit(2);
  }
  const roh = await (
    await haupt.api.post('/v1/external/api-keys', {
      name: 'Abnahme Entwickler-Cockpit (J44)',
      allowed_endpoints: ['app:deploy'],
    })
  )
    .json()
    .catch(() => ({}));
  schluessel = roh?.data?.api_key ?? roh?.api_key ?? '';
  schluesselId = roh?.data?.key_id ?? roh?.key_id ?? '';
  pruefe('Wegwerf-Schlüssel mit app:deploy', Boolean(schluessel));
  if (wiederholung) {
    ALT = (await probeStand())?.live?.version ?? '3.0.0';
    const [a, b, c] = ALT.split('.').map(Number);
    NEU = `${a}.${b}.${c + 1}`;
    console.log(`—      ${PROBE} gibt es vom ersten Lauf, live ${ALT}; neu in den Test: ${NEU}`);
  } else {
    pruefe(
      `${PROBE} ${ALT} in den Test`,
      [200, 201].includes(await ausrollen(ALT, '1', 'Erste Fassung.'))
    );
    await haupt.api.post('/freigaben', { app_id: PROBE, benutzer_id: ich.id, stand: 'test' });
    await gesund(`/apps/${PROBE}/test/api/gesund`, 300);
    const erst = await haupt.api.post(`/apps/${PROBE}/schalten`, { ziel: 'live' });
    pruefe(`${PROBE} ${ALT} live (über die Schnittstelle)`, erst.ok(), String(erst.status()));
    await gesund(`/apps/${PROBE}/api/gesund`, 180);
    await haupt.api.post(`roh:/apps/${PROBE}/api/eintrag?text=Probe%20vor%20dem%20Schalten`);
  }
  pruefe(
    `${PROBE} ${NEU} in den Test, mit Änderungstext`,
    [200, 201].includes(await ausrollen(NEU, '3', 'Neu: Kostenstelle je Eintrag.'))
  );
  await gesund(`/apps/${PROBE}/test/api/gesund`, 300);
  const s = await probeStand();
  pruefe(
    'Die Übersicht sagt: Test neuer als live',
    s?.test_neuer === true,
    `${s?.live?.version} / ${s?.test?.version}`
  );
}

// --- im Browser ------------------------------------------------------------
const rahmen = seite => seite.frameLocator(`[data-testid="app-rahmen-${COCKPIT}"]`);
const kein_seitliches_rollen = async seite => {
  const f = seite.frames().find(fr => fr.url().includes(`/apps/${COCKPIT}/`));
  if (!f) return false;
  return f.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  );
};
const bild = async (seite, name) => {
  if (BILDER) await seite.screenshot({ path: path.join(ZIEL, `${name}.png`) });
};
async function zuAnsicht(seite, schmal, kennung) {
  const r = rahmen(seite);
  if (!schmal) {
    await r.locator(`[data-testid="cockpit-leiste-${kennung}"]`).first().click();
    return;
  }
  // Unter 900 px ist die Leiste ein Blatt: erst warten, bis das vorige zu
  // ist, dann öffnen, dann im Blatt wählen.
  const blatt = r.locator('[data-slot="sidebar"][data-schmal="true"]');
  await blatt.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  await r.locator('[data-testid="cockpit-leiste-umschalten"]').click();
  await blatt.locator(`[data-testid="cockpit-leiste-${kennung}"]`).click();
  await blatt.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
}

// Chromium bei 1440 px zuletzt: dort wird geschaltet, und davor soll jede
// Ansicht die wartende Fassung noch sehen.
const LAEUFE = MOTOREN.flatMap(m => BREITEN.map(b => [m, b])).sort(
  (x, y) =>
    Number(x[0] === 'chromium' && x[1][0] === 1440) -
    Number(y[0] === 'chromium' && y[1][0] === 1440)
);
const weitere = {};
for (const [motor, [breite, hoehe]] of LAEUFE) {
  const browser = motor === 'chromium' ? chromium : (weitere[motor] ??= await pw[motor].launch());
  const schmal = breite < 900;
  const { ctx } = await anmelden(browser, ADMIN, ADMIN_PASS, { width: breite, height: hoehe });
  const seite = await ctx.newPage();
  const name = `${motor} ${breite}px`;
  await seite.goto(`${URL}/workspace`);
  await seite.locator('[data-testid="aktivitaetsleiste"]').waitFor({ timeout: 30000 });
  if (!schmal) {
    pruefe(
      `${name}: Cockpit in der Leiste`,
      (await seite.locator(`[data-testid="leiste-app-${COCKPIT}-live"]`).count()) === 1
    );
    await seite.locator(`[data-testid="leiste-app-${COCKPIT}-live"]`).click();
  } else {
    await seite.goto(`${URL}/workspace/app/${COCKPIT}`);
  }
  const r = rahmen(seite);
  const eingang = r.locator('[data-testid="cockpit-eingang"]');
  pruefe(
    `${name}: der Eingang lädt im Rahmen`,
    await eingang.waitFor({ timeout: 30000 }).then(
      () => true,
      () => false
    )
  );
  await r
    .getByText('Abnahme J42', { exact: false })
    .first()
    .waitFor({ timeout: 15000 })
    .catch(() => {});
  const zahl = await r.getByText('Abnahme J42', { exact: false }).count();
  pruefe(`${name}: die Meldungen „Abnahme J42“ stehen da`, zahl >= 4, String(zahl));
  pruefe(`${name}: kein seitliches Rollen im Eingang`, await kein_seitliches_rollen(seite));
  await bild(seite, `${motor}-${breite}-eingang`);
  if (schmal) {
    // Am Handy: eine Meldung öffnen, lesen, wieder schließen.
    await r.getByText('Abnahme J42', { exact: false }).first().click();
    const offen = await r
      .locator('[data-testid="cockpit-meldung"]')
      .waitFor({ timeout: 10000 })
      .then(
        () => true,
        () => false
      );
    pruefe(`${name}: eine Meldung öffnet sich`, offen);
    await warte(800);
    await bild(seite, `${motor}-${breite}-meldung`);
    await seite.keyboard.press('Escape');
    await r
      .locator('[data-testid="cockpit-meldung"]')
      .waitFor({ state: 'detached', timeout: 10000 })
      .catch(() => {});
  }

  await zuAnsicht(seite, schmal, 'apps');
  await r.locator('[data-testid="cockpit-apps"]').waitFor({ timeout: 15000 });
  await r
    .getByText('Probe Cockpit')
    .first()
    .waitFor({ timeout: 15000 })
    .catch(() => {});
  pruefe(`${name}: Apps zeigt die Probe-App`, (await r.getByText('Probe Cockpit').count()) > 0);
  pruefe(`${name}: kein seitliches Rollen in Apps`, await kein_seitliches_rollen(seite));
  // Zeilen mit einem Namen, der nicht ins Bild gehört, werden unscharf.
  // Eine Maske von Playwright über ein iframe bricht in Chromium ab.
  if (ABDECKEN) {
    const f = seite.frames().find(fr => fr.url().includes(`/apps/${COCKPIT}/`));
    const zahl = await f?.evaluate(wort => {
      let n = 0;
      for (const el of document.querySelectorAll('tr, li, [role="row"], [data-slot="card"]')) {
        if (el.textContent?.includes(wort)) {
          el.style.filter = 'blur(10px)';
          n += 1;
        }
      }
      return n;
    }, ABDECKEN);
    pruefe(`${name}: Zeilen im Bild abgedeckt`, (zahl ?? 0) > 0, String(zahl));
  }
  await bild(seite, `${motor}-${breite}-apps`);

  await zuAnsicht(seite, schmal, 'live');
  const karte = r.locator(`[data-testid="cockpit-wartet-${PROBE}"]`);
  pruefe(
    `${name}: Test nach Live zeigt ${NEU}`,
    await karte.waitFor({ timeout: 15000 }).then(
      () => true,
      () => false
    )
  );
  pruefe(
    `${name}: mit Änderungstext`,
    (
      await r
        .locator(`[data-testid="cockpit-aenderung-${PROBE}"]`)
        .textContent()
        .catch(() => '')
    )?.includes('Kostenstelle')
  );
  pruefe(`${name}: kein seitliches Rollen in Test nach Live`, await kein_seitliches_rollen(seite));
  await bild(seite, `${motor}-${breite}-test-nach-live`);

  if (motor === 'chromium' && breite === 1440) {
    // Verwaltung › Rückmeldungen gibt es nicht mehr.
    const v = await ctx.newPage();
    await v.goto(`${URL}/workspace/verwaltung/apps`);
    await v.locator('[data-testid="verwaltung-bereiche"]').waitFor({ timeout: 30000 });
    pruefe(
      'Verwaltung ohne Bereich Rückmeldungen',
      (await v.locator('[data-testid="verwaltung-rueckmeldungen"]').count()) === 0
    );
    await v.close();

    // stand: Meldung 1 ablehnen, im Browser.
    const alt = ((await daten(await haupt.api.get('/rueckmeldungen'))) ?? []).find(m => m.id === 1);
    await zuAnsicht(seite, false, 'eingang');
    await r
      .getByText(alt?.text ?? 'Abnahme J42')
      .first()
      .click();
    const dialog = r.locator('[data-testid="cockpit-meldung"]');
    await dialog.waitFor({ timeout: 10000 });
    if (alt?.hat_bild) {
      pruefe(
        'Meldung offen mit Bild',
        await r
          .locator('[data-testid="cockpit-bild"]')
          .evaluate(
            i =>
              new Promise(fertig => {
                if (i.complete) return fertig(i.naturalWidth > 0);
                i.addEventListener('load', () => fertig(i.naturalWidth > 0));
                i.addEventListener('error', () => fertig(false));
                setTimeout(() => fertig(false), 15000);
              })
          )
          .catch(() => false)
      );
    }
    await r.locator('[data-testid="cockpit-stand-wahl"]').click();
    await r.getByRole('option', { name: 'Abgelehnt' }).click();
    pruefe(
      'Abgelehnt ohne Grund: Speichern gesperrt',
      await r.locator('[data-testid="cockpit-stand-speichern"]').isDisabled()
    );
    await r.locator('[data-testid="cockpit-grund"]').fill('Abnahme J44: nur eine Probe.');
    await warte(500);
    await bild(seite, 'chromium-1440-meldung');
    await r.locator('[data-testid="cockpit-stand-speichern"]').click();
    await dialog.waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
    const neu = ((await daten(await haupt.api.get('/rueckmeldungen'))) ?? []).find(m => m.id === 1);
    pruefe(
      'Stand und Grund stehen am Gerät',
      neu?.stand_meldung === 'abgelehnt' && neu?.grund === 'Abnahme J44: nur eine Probe.'
    );
    const zurueck = await haupt.api.patch('/rueckmeldungen/1', {
      stand_meldung: alt?.stand_meldung ?? 'neu',
      ...(alt?.grund ? { grund: alt.grund } : {}),
    });
    pruefe('Stand der Meldung 1 wieder wie vorher', zurueck.ok(), alt?.stand_meldung);

    // dunkel, ein Bild.
    const f = seite.frames().find(fr => fr.url().includes(`/apps/${COCKPIT}/`));
    await f?.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await seite.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await bild(seite, 'chromium-1440-eingang-dunkel');
    await f?.evaluate(() => document.documentElement.removeAttribute('data-theme'));
    await seite.evaluate(() => document.documentElement.removeAttribute('data-theme'));

    // live: ein Klick, mit Rückfrage.
    const staendeVorher = ((await daten(await haupt.api.get('/backup/staende'))) ?? []).map(
      s => s.id
    );
    await zuAnsicht(seite, false, 'live');
    await r.locator(`[data-testid="cockpit-live-schalten-${PROBE}"]`).click();
    await r.getByRole('button', { name: 'Live schalten' }).last().click();
    const ausgang = r.locator('[data-testid="cockpit-schalt-ausgang"]');
    await ausgang.waitFor({ timeout: 10 * 60_000 }).catch(() => {});
    const satz = (await ausgang.textContent().catch(() => '')) ?? '';
    pruefe('Live geschaltet, Satz im Cockpit', satz.includes(NEU), satz.slice(0, 80));
    await bild(seite, 'chromium-1440-live-geschaltet');
    let s = await probeStand();
    pruefe(
      `Live steht auf ${NEU}, nichts wartet`,
      s?.live?.version === NEU && s?.test_neuer === false
    );
    const staende = (await daten(await haupt.api.get('/backup/staende'))) ?? [];
    const davor = staende.find(
      x => !staendeVorher.includes(x.id) && x.fuer?.art === 'live' && x.fuer?.id === PROBE
    );
    pruefe('Sicherung vorher: ein Stand „vor dem Live-Schalten“', Boolean(davor), davor?.id);
    const eintraege = await (
      await haupt.api.get(`roh:/apps/${PROBE}/api/eintraege`)
    )
      .json()
      .catch(() => ({}));
    pruefe(
      'Die Live-Daten sind noch da',
      (eintraege.eintraege ?? []).includes('Probe vor dem Schalten')
    );

    // zurück: derselbe Weg.
    await r.locator(`[data-testid="cockpit-zurueck-${PROBE}"]`).waitFor({ timeout: 30000 });
    await bild(seite, 'chromium-1440-zurueck-moeglich');
    await r.locator(`[data-testid="cockpit-zurueck-${PROBE}"]`).click();
    await r.getByRole('button', { name: 'Zurückschalten' }).click();
    await warte(2000);
    await r
      .locator('[data-testid="cockpit-schalt-ausgang"]')
      .filter({ hasText: 'zurück' })
      .waitFor({ timeout: 10 * 60_000 })
      .catch(() => {});
    s = await probeStand();
    pruefe(
      `Zurück: live wieder ${ALT}, ${NEU} wartet wieder`,
      s?.live?.version === ALT && s?.test_neuer === true
    );

    // Am Ende steht die neue Fassung live, damit im Cockpit nichts liegen bleibt.
    const wieder = await haupt.api.post(`/apps/${PROBE}/schalten`, { ziel: 'live' });
    s = await probeStand();
    pruefe(
      `Am Ende: ${NEU} live, nichts wartet`,
      wieder.ok() && s?.live?.version === NEU && !s?.test_neuer
    );
  }
  await ctx.close();
}
for (const b of Object.values(weitere)) await b.close();

// --- aufräumen: nur der Schlüssel, gelöscht wird nichts ------------------------
await aufraeumen();
console.log(`—      Die Probe-App ${PROBE} bleibt am Gerät (nichts wird gelöscht).`);
await haupt.ctx.close();
await chromium.close();
console.log(rot === 0 ? '\nAlles grün.' : `\n${rot} rot.`);
process.exit(rot === 0 ? 0 : 1);
