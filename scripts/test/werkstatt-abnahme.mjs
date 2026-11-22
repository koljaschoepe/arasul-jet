/**
 * Abnahme „Werkstatt und Rechte“ (J52, M7, Karte werkstatt-und-rechte), am Orin.
 * Löst die Abnahme des Entwickler-Cockpits (J44) ab, die unter diesem Namen
 * bis 22.11.2026 hier lag.
 *
 *   wege        Die alte Adresse /apps/entwickler-cockpit/ zieht dauerhaft auf
 *               /apps/werkstatt/ um; beide Konten haben die Werkstatt in
 *               /api/apps/meine, die Seite kommt; /api/werkstatt/ich sagt das
 *               Recht.
 *   ohne Recht  Ein Mitarbeiter ohne das Recht (ARASUL_A) meldet zur Werkstatt
 *               selbst (er hat sonst keine App, und Freigaben fasst diese
 *               Abnahme nicht an). Danach liest er nur die eigenen Meldungen
 *               (Sicht „eigene“), das eigene Bild ja, ein fremdes nie (404);
 *               Apps, Stand setzen, Entfernen und Live schalten geben 403.
 *   mit Recht   Das Probekonto mit dem Recht sieht alle samt Bildern. Im Browser
 *               (Chromium und WebKit, 1440 und 390 px) Eingang, Apps und Test
 *               nach Live; bei Chromium 1440 setzt es den Stand der neuen
 *               Meldung auf „abgelehnt“ mit Grund und schaltet eine neue
 *               Fassung der Probe-App „Probe Cockpit“ live (Sicherung vorher).
 *   Sicht A     Der Mitarbeiter im Browser, dieselben vier Läufe: nur „Meine
 *               Meldungen“, seine Meldung mit Stand und Ablehnungsgrund, keine
 *               fremde, keine Seiten Eingang, Apps, Live.
 *   Personen    Verwaltung › Personen nennt den Schalter „Werkstatt“, als
 *               Recht in der Werkstatt; nur gemessen, nicht fotografiert
 *               (echte Namen).
 *
 * ANGEFASST WIRD NUR, WAS DIESER LAUF ANLEGT, und gelöscht wird nichts: eine
 * Meldung von ARASUL_A zur Werkstatt (Stand am Ende „abgelehnt“), eine neue
 * Fassung der vorhandenen Probe-App „Probe Cockpit“ (Sicherung vorher, wie
 * jedes Live-Schalten), ein Wegwerf-Schlüssel mit app:deploy, der am Ende
 * widerrufen wird. Keine Freigabe, kein Kennzeichen, nie das Konto admin.
 *
 *   ssh -f -N -L 8443:localhost:443 jetson
 *   ARASUL_PLAYWRIGHT=/Users/koljaschope/Code/arasul/arasul-jet \
 *   ARASUL_BENUTZER=probe-admin \
 *   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
 *   ARASUL_A=probe-j36-a ARASUL_A_PASSWORT="$(geheim get 'Arasul Orin Probe-Konto probe-j36-a')" \
 *   ARASUL_BILDER=1 node scripts/test/werkstatt-abnahme.mjs
 *
 * Bilder: docs/plans/audits/<tag>-werkstatt/. Was nicht in ein Bild gehört
 * (etwa eine App mit Kundennamen), steht nie in diesem Skript, sondern kommt
 * aus der Umgebung: ARASUL_AUSBLENDEN=<app-id,…> blendet Kacheln und Einträge
 * der Leiste in der Shell aus, ARASUL_ABDECKEN=<Wort,…> macht Zeilen in der
 * Werkstatt unscharf. Rückgabe 0 bei lauter Grün.
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
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-werkstatt`);
const BILDER = process.env.ARASUL_BILDER === '1';
const AUSBLENDEN = (process.env.ARASUL_AUSBLENDEN ?? '').split(',').filter(Boolean);
const ABDECKEN = (process.env.ARASUL_ABDECKEN ?? '').split(',').filter(Boolean);
const OHNE_LIVE = process.env.ARASUL_OHNE_LIVE === '1';
const W = 'werkstatt';
const BREITEN = [
  [1440, 900],
  [390, 844],
];
const GRUND = 'Abnahme J52: nur eine Probe. Diesen Grund sieht, wer gemeldet hat.';
// Ein Bild von 1 x 1 Punkt, wie es der Rahmen schickt.
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

if (!ADMIN || !ADMIN_PASS || ADMIN === 'admin') {
  console.log('ROT    ARASUL_BENUTZER und ARASUL_PASSWORT fehlen (nie das Konto admin).');
  process.exit(1);
}
if (!A || !A_PASS || A === 'admin') {
  console.log('ROT    ARASUL_A und ARASUL_A_PASSWORT fehlen (ein Mitarbeiter ohne das Recht).');
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
const roh = async antwort => antwort.json().catch(() => ({}));
const daten = async antwort => (await roh(antwort)).data;

const chromium = await pw.chromium.launch();
const haupt = await anmelden(chromium, ADMIN, ADMIN_PASS);
const mia = await anmelden(chromium, A, A_PASS);
const ichHaupt = (await roh(await haupt.api.get('/auth/me'))).user ?? {};
const ichA = (await roh(await mia.api.get('/auth/me'))).user ?? {};
pruefe(`${ADMIN} hat das Recht in der Werkstatt`, ichHaupt.entwickler === true);
pruefe(`${A} hat es nicht`, ichA.entwickler !== true && ichA.role === 'mitarbeiter');

// --- wege ------------------------------------------------------------------
{
  const alt = await haupt.api.seite('/apps/entwickler-cockpit/');
  pruefe(
    'Die alte Adresse zieht dauerhaft auf /apps/werkstatt/ um',
    alt.status() === 301 && alt.headers().location === '/apps/werkstatt/',
    `${alt.status()} ${alt.headers().location ?? ''}`
  );
  for (const [wer, api] of [
    [ADMIN, haupt.api],
    [A, mia.api],
  ]) {
    const meine = (await daten(await api.get('/apps/meine'))) ?? [];
    const w = meine.find(a => a.id === W);
    pruefe(`${wer}: die Werkstatt in /api/apps/meine`, w?.name === 'Werkstatt', w?.symbol);
    const seite = await api.seite(`/apps/${W}/`);
    pruefe(
      `${wer}: /apps/werkstatt/ kommt`,
      seite.status() === 200 && (await seite.text()).includes('<title>Werkstatt</title>'),
      String(seite.status())
    );
  }
  pruefe(
    `${ADMIN}: /api/werkstatt/ich sagt recht`,
    (await daten(await haupt.api.get('/werkstatt/ich')))?.recht === true
  );
  pruefe(
    `${A}: /api/werkstatt/ich sagt kein Recht`,
    (await daten(await mia.api.get('/werkstatt/ich')))?.recht === false
  );
}

// --- ohne Recht: melden, nur die eigenen lesen --------------------------------
const TEXT = `Abnahme J52: eigene Meldung vom ${new Date().toLocaleString('de-DE')}`;
let eigeneId = 0;
{
  const neu = await mia.api.post('/rueckmeldungen', {
    app_id: W,
    stand: 'live',
    seite: `/apps/${W}/`,
    text: TEXT,
    bild: PIXEL,
  });
  eigeneId = (await daten(neu))?.id ?? 0;
  pruefe(`${A} meldet zur Werkstatt`, neu.status() === 201 && eigeneId > 0, String(neu.status()));

  const alle = await roh(await haupt.api.get('/rueckmeldungen'));
  pruefe(`${ADMIN}: Sicht „alle“`, alle.sicht === 'alle');
  const fremde = (alle.data ?? []).filter(m => m.person?.id !== Number(ichA.id));
  const fremdMitBild = fremde.find(m => m.hat_bild);
  pruefe(
    `${ADMIN}: sieht die neue Meldung und fremde`,
    (alle.data ?? []).some(m => m.id === eigeneId) && fremde.length > 0,
    `${alle.data?.length ?? 0} Meldungen`
  );
  pruefe(
    `${ADMIN}: das Bild der neuen Meldung kommt`,
    (await haupt.api.get(`/rueckmeldungen/${eigeneId}/bild`)).status() === 200
  );

  const meine = await roh(await mia.api.get('/rueckmeldungen'));
  pruefe(`${A}: Sicht „eigene“`, meine.sicht === 'eigene');
  pruefe(
    `${A}: nur eigene Meldungen, die neue dabei`,
    (meine.data ?? []).length > 0 &&
      (meine.data ?? []).every(m => m.person?.id === Number(ichA.id)) &&
      (meine.data ?? []).some(m => m.id === eigeneId),
    `${meine.data?.length ?? 0}`
  );
  pruefe(
    `${A}: keine fremde Meldung in der Antwort`,
    !fremde.some(f => (meine.data ?? []).some(m => m.id === f.id))
  );
  pruefe(
    `${A}: das eigene Bild kommt`,
    (await mia.api.get(`/rueckmeldungen/${eigeneId}/bild`)).status() === 200
  );
  if (fremdMitBild) {
    const b = await mia.api.get(`/rueckmeldungen/${fremdMitBild.id}/bild`);
    pruefe(`${A}: ein fremdes Bild nie (404)`, b.status() === 404, String(b.status()));
  } else {
    pruefe('Es gibt eine fremde Meldung mit Bild zum Prüfen', false);
  }
  pruefe(`${A}: /api/werkstatt/apps 403`, (await mia.api.get('/werkstatt/apps')).status() === 403);
  pruefe(
    `${A}: Stand setzen 403`,
    (
      await mia.api.patch(`/rueckmeldungen/${eigeneId}`, { stand_meldung: 'umgesetzt' })
    ).status() === 403
  );
  pruefe(
    `${A}: Entfernen 403`,
    (await mia.api.del(`/rueckmeldungen/${eigeneId}`)).status() === 403
  );
}

// --- die Probe-App: eine neue Fassung in den Test -----------------------------
const appsMitRecht = async () => (await daten(await haupt.api.get('/werkstatt/apps'))) ?? [];
const probe = (await appsMitRecht()).find(a => a.name === 'Probe Cockpit');
const PROBE = probe?.id ?? '';
let ALT = probe?.live?.version ?? '';
let NEU = '';
let schluesselId = '';
const arbeit = fs.mkdtempSync(path.join(os.tmpdir(), 'werkstatt-abnahme-'));
async function aufraeumen() {
  if (schluesselId) {
    const weg = await haupt.api.del(`/v1/external/api-keys/${schluesselId}`);
    pruefe('Wegwerf-Schlüssel widerrufen', weg.ok(), String(weg.status()));
    schluesselId = '';
  }
  fs.rmSync(arbeit, { recursive: true, force: true });
}
process.on('uncaughtException', async fehler => {
  console.log(`ROT    Abbruch: ${fehler.message.split('\n')[0]}`);
  await aufraeumen().catch(() => {});
  process.exit(1);
});
async function gesund(weg, sekunden) {
  for (let i = 0; i < sekunden / 5; i += 1) {
    if ((await haupt.api.get(`roh:${weg}`)).status() === 200) return true;
    await warte(5000);
  }
  return false;
}
if (OHNE_LIVE) {
  console.log('—      ARASUL_OHNE_LIVE=1: kein Live-Schalten in diesem Lauf');
} else if (!PROBE) {
  pruefe('Die Probe-App „Probe Cockpit“ der Abnahme J44 ist am Gerät', false);
} else {
  const s = await (
    await haupt.api.post('/v1/external/api-keys', {
      name: 'Abnahme Werkstatt (J52)',
      allowed_endpoints: ['app:deploy'],
    })
  )
    .json()
    .catch(() => ({}));
  const schluessel = s?.data?.api_key ?? s?.api_key ?? '';
  schluesselId = s?.data?.key_id ?? s?.key_id ?? '';
  pruefe('Wegwerf-Schlüssel mit app:deploy', Boolean(schluessel));
  const [a, b, c] = ALT.split('.').map(Number);
  NEU = `${a}.${b}.${c + 1}`;
  const ordner = path.join(arbeit, `paket-${NEU}`);
  fs.cpSync(path.join(WURZEL, 'tests/probe-live/backend'), path.join(ordner, 'backend'), {
    recursive: true,
  });
  const m = JSON.parse(fs.readFileSync(path.join(WURZEL, 'tests/probe-live/app.json'), 'utf8'));
  Object.assign(m, { id: PROBE, name: 'Probe Cockpit', version: NEU });
  m.backend.image = `arasul-${PROBE}:${NEU}`;
  m.backend.umgebung = { PROBE_VERSION: NEU, PROBE_STRUKTUR: '3' };
  fs.writeFileSync(path.join(ordner, 'app.json'), JSON.stringify(m, null, 2));
  execFileSync('node', [path.join(WURZEL, 'scripts/test/nachweis-stempeln.mjs'), ordner]);
  const tgz = path.join(arbeit, `paket-${NEU}.tgz`);
  execFileSync('tar', ['czf', tgz, '-C', ordner, '.'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });
  const kit = await pw.request.newContext({ ignoreHTTPSErrors: true });
  const r = await kit.post(`${URL}/api/v1/external/apps`, {
    headers: { 'x-api-key': schluessel },
    multipart: {
      paket: { name: 'paket.tgz', mimeType: 'application/gzip', buffer: fs.readFileSync(tgz) },
      aenderungstext: 'Abnahme J52: neue Fassung für Test nach Live.',
    },
    timeout: 30 * 60_000,
  });
  await kit.dispose();
  pruefe(`${PROBE} ${NEU} in den Test`, [200, 201].includes(r.status()), String(r.status()));
  await gesund(`/apps/${PROBE}/test/api/gesund`, 300);
  const st = (await appsMitRecht()).find(x => x.id === PROBE);
  pruefe('Die Werkstatt sagt: Test neuer als live', st?.test_neuer === true, st?.test?.version);
  pruefe(
    `${A}: Live schalten 403`,
    (await mia.api.post(`/apps/${PROBE}/schalten`, { ziel: 'live' })).status() === 403
  );
}

// --- im Browser ------------------------------------------------------------
const rahmen = seite => seite.frameLocator(`[data-testid="app-rahmen-${W}"]`);
const rahmenFrame = seite => seite.frames().find(fr => fr.url().includes(`/apps/${W}/`));
const kein_seitliches_rollen = async seite => {
  const f = rahmenFrame(seite);
  if (!f) return false;
  return f.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  );
};
/** Was nicht ins Bild gehört, verschwindet; die Namen kommen nur aus der Umgebung. */
async function bildSauber(seite) {
  if (AUSBLENDEN.length) {
    await seite.addStyleTag({
      content: AUSBLENDEN.map(
        id =>
          `[data-testid^="leiste-app-${id}"],[data-testid^="uebersicht-app-${id}"]{display:none!important}`
      ).join('\n'),
    });
  }
  if (ABDECKEN.length) {
    await rahmenFrame(seite)?.evaluate(woerter => {
      for (const el of document.querySelectorAll('tr, li, [role="row"], [data-slot="card"]')) {
        if (woerter.some(w => el.textContent?.includes(w))) el.style.filter = 'blur(10px)';
      }
    }, ABDECKEN);
  }
}
const bild = async (seite, name) => {
  if (!BILDER) return;
  await bildSauber(seite);
  await seite.screenshot({ path: path.join(ZIEL, `${name}.png`) });
};
async function zuAnsicht(seite, schmal, kennung) {
  const r = rahmen(seite);
  if (!schmal) {
    await r.locator(`[data-testid="werkstatt-leiste-${kennung}"]`).first().click();
    return;
  }
  const blatt = r.locator('[data-slot="sidebar"][data-schmal="true"]');
  await blatt.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  await r.locator('[data-testid="werkstatt-leiste-umschalten"]').click();
  await blatt.locator(`[data-testid="werkstatt-leiste-${kennung}"]`).click();
  await blatt.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
}
async function werkstattOeffnen(seite, schmal, name) {
  await seite.goto(`${URL}/workspace`);
  await seite.locator('[data-testid="aktivitaetsleiste"]').waitFor({ timeout: 30000 });
  if (!schmal) {
    const eintrag = seite.locator(`[data-testid^="leiste-app-${W}"]`);
    pruefe(`${name}: Werkstatt in der Leiste`, (await eintrag.count()) === 1);
    await eintrag.first().click();
  } else {
    await seite.goto(`${URL}/workspace/app/${W}`);
  }
}
const wartet = loc =>
  loc.waitFor({ timeout: 30000 }).then(
    () => true,
    () => false
  );

const LAEUFE = MOTOREN.flatMap(m => BREITEN.map(b => [m, b])).sort(
  (x, y) =>
    Number(x[0] === 'chromium' && x[1][0] === 1440) -
    Number(y[0] === 'chromium' && y[1][0] === 1440)
);
const weitere = {};
const motor = m => (m === 'chromium' ? chromium : (weitere[m] ??= pw[m].launch()));

// Mit Recht: Eingang, Apps, Test nach Live; Chromium 1440 setzt den Stand und schaltet.
for (const [m, [breite, hoehe]] of LAEUFE) {
  const browser = await motor(m);
  const schmal = breite < 900;
  const name = `mit Recht, ${m} ${breite}px`;
  const { ctx } = await anmelden(browser, ADMIN, ADMIN_PASS, { width: breite, height: hoehe });
  const seite = await ctx.newPage();
  await werkstattOeffnen(seite, schmal, name);
  const r = rahmen(seite);
  pruefe(`${name}: der Eingang lädt`, await wartet(r.locator('[data-testid="werkstatt-eingang"]')));
  // Die neue Meldung ist „neu“, steht also im Filter „offen“.
  pruefe(
    `${name}: die Meldung des Mitarbeiters steht im Eingang`,
    await wartet(r.getByText(TEXT).first())
  );
  pruefe(`${name}: kein seitliches Rollen im Eingang`, await kein_seitliches_rollen(seite));
  await bild(seite, `mit-recht-${m}-${breite}-eingang`);

  await zuAnsicht(seite, schmal, 'apps');
  pruefe(`${name}: Apps`, await wartet(r.locator('[data-testid="werkstatt-apps"]')));
  pruefe(`${name}: kein seitliches Rollen in Apps`, await kein_seitliches_rollen(seite));
  await bild(seite, `mit-recht-${m}-${breite}-apps`);

  await zuAnsicht(seite, schmal, 'live');
  if (PROBE && NEU) {
    pruefe(
      `${name}: Test nach Live zeigt ${PROBE} ${NEU}`,
      await wartet(r.locator(`[data-testid="werkstatt-wartet-${PROBE}"]`))
    );
  }
  pruefe(`${name}: kein seitliches Rollen in Test nach Live`, await kein_seitliches_rollen(seite));
  await bild(seite, `mit-recht-${m}-${breite}-test-nach-live`);

  if (m === 'chromium' && breite === 1440) {
    // Stand setzen: die neue Meldung ablehnen, mit Grund, im Browser.
    await zuAnsicht(seite, false, 'eingang');
    await r.getByText(TEXT).first().click();
    const dialog = r.locator('[data-testid="werkstatt-meldung"]');
    await dialog.waitFor({ timeout: 10000 });
    pruefe(
      'Die Meldung zeigt ihr Bild',
      await r
        .locator('[data-testid="werkstatt-bild"]')
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
    await r.locator('[data-testid="werkstatt-stand-wahl"]').click();
    await r.getByRole('option', { name: 'Abgelehnt' }).click();
    pruefe(
      'Abgelehnt ohne Grund: Speichern gesperrt',
      await r.locator('[data-testid="werkstatt-stand-speichern"]').isDisabled()
    );
    await r.locator('[data-testid="werkstatt-grund"]').fill(GRUND);
    await warte(400);
    await bild(seite, 'mit-recht-chromium-1440-meldung');
    await r.locator('[data-testid="werkstatt-stand-speichern"]').click();
    await dialog.waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
    const gesetzt = ((await daten(await haupt.api.get('/rueckmeldungen'))) ?? []).find(
      x => x.id === eigeneId
    );
    pruefe(
      'Stand und Grund stehen am Gerät',
      gesetzt?.stand_meldung === 'abgelehnt' && gesetzt?.grund === GRUND
    );

    if (PROBE && NEU) {
      const vorher = ((await daten(await haupt.api.get('/backup/staende'))) ?? []).map(s => s.id);
      await zuAnsicht(seite, false, 'live');
      await r.locator(`[data-testid="werkstatt-live-schalten-${PROBE}"]`).click();
      await r.getByRole('button', { name: 'Live schalten' }).last().click();
      const ausgang = r.locator('[data-testid="werkstatt-schalt-ausgang"]');
      await ausgang.waitFor({ timeout: 10 * 60_000 }).catch(() => {});
      const satz = (await ausgang.textContent().catch(() => '')) ?? '';
      pruefe('Live geschaltet, Satz in der Werkstatt', satz.includes(NEU), satz.slice(0, 80));
      await bild(seite, 'mit-recht-chromium-1440-live-geschaltet');
      const st = (await appsMitRecht()).find(x => x.id === PROBE);
      pruefe(
        `Live steht auf ${NEU}, nichts wartet`,
        st?.live?.version === NEU && st?.test_neuer === false
      );
      const staende = (await daten(await haupt.api.get('/backup/staende'))) ?? [];
      pruefe(
        'Sicherung vorher: ein Stand „vor dem Live-Schalten“',
        staende.some(x => !vorher.includes(x.id) && x.fuer?.art === 'live' && x.fuer?.id === PROBE)
      );
    }

    // Verwaltung › Personen: das Recht heißt Werkstatt (nur gemessen).
    const v = await ctx.newPage();
    await v.goto(`${URL}/workspace/verwaltung/personen`);
    const liste = v.locator('[data-testid="personen-liste"]');
    await liste.waitFor({ timeout: 30000 }).catch(() => {});
    pruefe(
      'Personen: Spalte „Werkstatt“',
      (await liste.locator('th', { hasText: /^Werkstatt$/ }).count()) === 1
    );
    pruefe(
      'Personen: keine Spalte „Entwickler“',
      (await liste.locator('th', { hasText: /^Entwickler$/ }).count()) === 0
    );
    const schalter = v.locator(`[data-testid="entwickler-${A}"]`);
    pruefe(
      'Personen: der Schalter heißt Recht in der Werkstatt',
      ((await schalter.getAttribute('aria-label').catch(() => '')) ?? '').startsWith(
        'Recht in der Werkstatt für'
      )
    );
    await v.close();
  }
  await ctx.close();
}

// Ohne Recht: nur „Meine Meldungen“, mit Stand und Grund.
const fremdeTexte = ((await daten(await haupt.api.get('/rueckmeldungen'))) ?? [])
  .filter(x => x.person?.id !== Number(ichA.id))
  .map(x => x.text);
for (const [m, [breite, hoehe]] of LAEUFE) {
  const browser = await motor(m);
  const schmal = breite < 900;
  const name = `ohne Recht, ${m} ${breite}px`;
  const { ctx } = await anmelden(browser, A, A_PASS, { width: breite, height: hoehe });
  const seite = await ctx.newPage();
  await werkstattOeffnen(seite, schmal, name);
  const r = rahmen(seite);
  pruefe(
    `${name}: „Meine Meldungen“ lädt`,
    await wartet(r.locator('[data-testid="werkstatt-meine"]'))
  );
  pruefe(`${name}: die eigene Meldung steht da`, await wartet(r.getByText(TEXT).first()));
  let fremd = 0;
  for (const t of fremdeTexte) fremd += await r.getByText(t, { exact: true }).count();
  pruefe(`${name}: keine fremde Meldung`, fremd === 0, String(fremd));
  let seiten = 0;
  for (const k of ['eingang', 'apps', 'live']) {
    seiten += await r.locator(`[data-testid="werkstatt-leiste-${k}"]`).count();
  }
  pruefe(`${name}: keine Seite Eingang, Apps, Live`, seiten === 0, String(seiten));
  pruefe(`${name}: kein seitliches Rollen`, await kein_seitliches_rollen(seite));
  await bild(seite, `ohne-recht-${m}-${breite}-meine`);
  await r.getByText(TEXT).first().click();
  const grund = r.locator('[data-testid="werkstatt-grund-lesen"]');
  pruefe(
    `${name}: der Ablehnungsgrund steht in der Meldung`,
    (await wartet(grund)) && (await grund.textContent())?.includes(GRUND)
  );
  pruefe(
    `${name}: nur lesen, kein Stand setzen`,
    (await r.locator('[data-testid="werkstatt-stand-speichern"]').count()) === 0
  );
  await warte(500);
  await bild(seite, `ohne-recht-${m}-${breite}-meldung`);
  await ctx.close();
}
for (const b of Object.values(weitere)) await (await b).close();

await aufraeumen();
console.log(
  `—      Die Meldung ${eigeneId} bleibt am Gerät (Stand abgelehnt), nichts wird gelöscht.`
);
await mia.ctx.close();
await haupt.ctx.close();
await chromium.close();
console.log(rot === 0 ? '\nAlles grün.' : `\n${rot} rot.`);
process.exit(rot === 0 ? 0 : 1);
