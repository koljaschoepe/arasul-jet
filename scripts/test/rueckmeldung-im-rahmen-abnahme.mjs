/**
 * Abnahme „Rückmeldung im Rahmen“ (J42, M7, Karte rueckmeldung-im-rahmen),
 * am Orin im Browser. Nicht zu verwechseln mit `rueckmeldung-abnahme.mjs`
 * (Gate G2, Hinweise nach einer Aktion).
 *
 *   abweisung   Ein Mitarbeiter (ARASUL_A) und der Administrator OHNE
 *               Kennzeichen Entwickler bekommen auf GET /api/rueckmeldungen 403.
 *   icon        Über jeder App aus ARASUL_APPS steht oben rechts das Icon, in
 *               Chromium und WebKit, bei 1440 und 390 px; nichts läuft seitlich
 *               über.
 *   melden      In der ersten App: Klick, Foto da, Text, Stelle ziehen,
 *               Absenden, nur die Bestätigung.
 *   liste       Mit Kennzeichen: Verwaltung › Rückmeldungen zeigt die Meldung
 *               mit geladenem Bild; die Schnittstelle liefert Seite, Person,
 *               Markierung und ein PNG.
 *   entfernen   Eine Meldung ohne Bild geht mit DELETE und ist danach weg.
 *
 * Das Kennzeichen setzt die Abnahme für das Probekonto selbst
 * (PUT /api/benutzer/:id/entwickler) und lässt es stehen. Die Meldungen der
 * Abnahme bleiben in der Liste (Text beginnt mit „Abnahme J42“).
 *
 *   ssh -f -N -L 8443:localhost:443 jetson
 *   ARASUL_PLAYWRIGHT=/Users/koljaschope/Code/arasul/arasul-jet \
 *   ARASUL_BENUTZER=probe-admin \
 *   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
 *   ARASUL_A=probe-j36-a ARASUL_A_PASSWORT="$(geheim get 'Arasul Orin Probe-Konto probe-j36-a')" \
 *   ARASUL_APPS=belege,abschluss,<probe-app> ARASUL_BILDER=1 \
 *   node scripts/test/rueckmeldung-im-rahmen-abnahme.mjs
 *
 * Passwörter nur aus der Umgebung, nie das Konto admin. Bilder:
 * docs/plans/audits/<tag>-rueckmeldung/. Rückgabe 0 bei lauter Grün.
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
const pw = await ladePlaywright();

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const ADMIN = process.env.ARASUL_BENUTZER || '';
const ADMIN_PASS = process.env.ARASUL_PASSWORT || '';
const A = process.env.ARASUL_A || '';
const A_PASS = process.env.ARASUL_A_PASSWORT || '';
const APPS = (process.env.ARASUL_APPS || 'belege').split(',').filter(Boolean);
const MOTOREN = (process.env.ARASUL_MOTOREN || 'chromium,webkit').split(',').filter(Boolean);
const TAG = process.env.ARASUL_TAG || new Date().toLocaleDateString('sv-SE');
const ZIEL = path.join(WURZEL, 'docs/plans/audits', `${TAG}-rueckmeldung`);
const BILDER = process.env.ARASUL_BILDER === '1';
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
};
const bild = async (seite, name) => {
  if (BILDER) await seite.screenshot({ path: path.join(ZIEL, `${name}.png`) });
};

/** Ein angemeldeter Kontext; schreibende Aufrufe tragen das CSRF-Token. */
async function anmelden(browser, benutzer, passwort, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport,
    deviceScaleFactor: 2,
  });
  const antwort = await ctx.request.post(`${URL}/api/auth/login`, {
    data: { username: benutzer, password: passwort },
  });
  if (!antwort.ok()) throw new Error(`Anmeldung ${benutzer}: ${antwort.status()}`);
  const csrf = async () => (await ctx.cookies()).find(c => c.name === 'arasul_csrf')?.value ?? '';
  const api = {
    get: p => ctx.request.get(`${URL}/api${p}`),
    put: async (p, data) =>
      ctx.request.put(`${URL}/api${p}`, { data, headers: { 'X-CSRF-Token': await csrf() } }),
    post: async (p, data) =>
      ctx.request.post(`${URL}/api${p}`, { data, headers: { 'X-CSRF-Token': await csrf() } }),
    del: async p =>
      ctx.request.delete(`${URL}/api${p}`, { headers: { 'X-CSRF-Token': await csrf() } }),
  };
  return { ctx, api };
}

const stempel = new Date().toISOString().slice(11, 16);
const chromium = await pw.chromium.launch();

// --- abweisung ------------------------------------------------------------
{
  if (A && A_PASS) {
    const { ctx, api } = await anmelden(chromium, A, A_PASS);
    pruefe(
      'Mitarbeiter liest keine Rückmeldungen',
      (await api.get('/rueckmeldungen')).status() === 403
    );
    await ctx.close();
  } else {
    console.log('—      ohne ARASUL_A keine Probe als Mitarbeiter');
  }
  const { ctx, api } = await anmelden(chromium, ADMIN, ADMIN_PASS);
  const ich = (await (await api.get('/auth/me')).json()).user ?? {};
  const id = ich.id;
  pruefe('Konto bekannt', Boolean(id), String(id));
  // Ohne Kennzeichen abweisen: erst abschalten, dann fragen, dann einschalten.
  await api.put(`/benutzer/${id}/entwickler`, { entwickler: false });
  pruefe(
    'Administrator ohne Kennzeichen liest keine Rückmeldungen',
    (await api.get('/rueckmeldungen')).status() === 403
  );
  const an = await api.put(`/benutzer/${id}/entwickler`, { entwickler: true });
  pruefe('Kennzeichen Entwickler gesetzt', an.ok(), String(an.status()));
  await ctx.close();
}

// --- icon und melden ------------------------------------------------------
const gemeldet = [];
for (const motor of MOTOREN) {
  const browser = motor === 'chromium' ? chromium : await pw[motor].launch();
  for (const [breite, hoehe] of BREITEN) {
    const { ctx } = await anmelden(browser, ADMIN, ADMIN_PASS, { width: breite, height: hoehe });
    const seite = await ctx.newPage();
    for (const app of APPS) {
      await seite.goto(`${URL}/workspace/app/${app}`);
      const knopf = seite.locator('[data-testid="rueckmeldung-knopf"]');
      const da = await knopf
        .waitFor({ timeout: 30000 })
        .then(() => true)
        .catch(() => false);
      await seite.waitForTimeout(2000);
      const rahmen = await seite.locator(`[data-testid="app-rahmen-${app}"]`).boundingBox();
      const kb = await knopf.boundingBox();
      const obenRechts =
        Boolean(rahmen && kb) &&
        kb.x + kb.width <= rahmen.x + rahmen.width + 1 &&
        kb.x + kb.width >= rahmen.x + rahmen.width - 2 &&
        Math.abs(kb.y - rahmen.y) <= 2;
      const [sw, cw] = await seite.evaluate(() => [
        document.documentElement.scrollWidth,
        document.documentElement.clientWidth,
      ]);
      pruefe(`${motor} ${breite}px ${app}: Icon oben rechts über der App`, da && obenRechts);
      pruefe(`${motor} ${breite}px ${app}: kein seitliches Rollen`, sw <= cw, `${sw}/${cw}`);
      if (motor === 'chromium' || app === APPS[0]) await bild(seite, `${motor}-${breite}-${app}`);
    }

    // Melden in der ersten App.
    const app = APPS[0];
    await seite.goto(`${URL}/workspace/app/${app}`);
    await seite.locator('[data-testid="rueckmeldung-knopf"]').waitFor({ timeout: 30000 });
    await seite.waitForTimeout(2000);
    const t0 = Date.now();
    await seite.click('[data-testid="rueckmeldung-knopf"]');
    await seite.locator('[data-testid="rueckmeldung-text"]').waitFor({ timeout: 15000 });
    const dauer = Date.now() - t0;
    const fotoDa = (await seite.locator('[data-testid="rueckmeldung-markierung"]').count()) === 1;
    pruefe(`${motor} ${breite}px: Foto aufgenommen`, fotoDa, `${dauer} ms bis zum Formular`);
    const text = `Abnahme J42 ${motor} ${breite} px ${stempel}: Hier fehlt ein Filter nach Monat.`;
    await seite.fill('[data-testid="rueckmeldung-text"]', text);
    const box = await seite.locator('[data-testid="rueckmeldung-markierung"]').boundingBox();
    if (box) {
      await seite.mouse.move(
        box.x + box.width * 0.04,
        box.y + box.height * (breite < 900 ? 0.17 : 0.13)
      );
      await seite.mouse.down();
      await seite.mouse.move(
        box.x + box.width * 0.45,
        box.y + box.height * (breite < 900 ? 0.27 : 0.2),
        {
          steps: 6,
        }
      );
      await seite.mouse.up();
    }
    await seite.waitForTimeout(300);
    pruefe(
      `${motor} ${breite}px: Stelle markiert`,
      (await seite.locator('[data-testid="rueckmeldung-stelle"]').count()) === 1
    );
    await bild(seite, `${motor}-${breite}-formular`);
    await seite.click('[data-testid="rueckmeldung-absenden"]');
    const ok = await seite
      .locator('[data-testid="rueckmeldung-bestaetigung"]')
      .waitFor({ timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    pruefe(`${motor} ${breite}px: nach dem Absenden nur die Bestätigung`, ok);
    await bild(seite, `${motor}-${breite}-bestaetigung`);
    gemeldet.push(text);
    await ctx.close();
  }
  if (browser !== chromium) await browser.close();
}

// --- liste ----------------------------------------------------------------
for (const [breite, hoehe] of BREITEN) {
  const { ctx, api } = await anmelden(chromium, ADMIN, ADMIN_PASS, {
    width: breite,
    height: hoehe,
  });
  if (breite === 1440) {
    const liste = (await (await api.get('/rueckmeldungen')).json()).data ?? [];
    for (const text of gemeldet) {
      const m = liste.find(x => x.text === text);
      pruefe(
        `Schnittstelle: ${text.slice(0, 40)}…`,
        Boolean(
          m && m.hat_bild && m.markierung && m.person && m.seite.startsWith(`/apps/${APPS[0]}/`)
        ),
        m ? `${m.app_id} ${m.stand} ${m.seite}` : 'fehlt'
      );
    }
    const erste = liste.find(x => x.text === gemeldet[0]);
    if (erste) {
      const png = await api.get(`/rueckmeldungen/${erste.id}/bild`);
      const bytes = await png.body();
      pruefe(
        'Bild kommt als PNG',
        png.ok() && bytes.subarray(1, 4).toString() === 'PNG',
        `${bytes.length} Bytes`
      );
      if (BILDER) fs.writeFileSync(path.join(ZIEL, 'gespeichertes-bild.png'), bytes);
    }

    // entfernen
    const neu = await api.post('/rueckmeldungen', {
      app_id: APPS[0],
      stand: 'live',
      seite: `/apps/${APPS[0]}/`,
      text: `Abnahme J42 ${stempel}: wird gleich entfernt`,
    });
    const nid = (await neu.json()).data?.id;
    const weg = await api.del(`/rueckmeldungen/${nid}`);
    const danach = (await (await api.get('/rueckmeldungen')).json()).data ?? [];
    pruefe(
      'Entfernen nimmt die Meldung weg',
      neu.status() === 201 && weg.ok() && !danach.some(x => x.id === nid)
    );
  }

  const seite = await ctx.newPage();
  await seite.goto(`${URL}/workspace/verwaltung/rueckmeldungen`);
  const liste = seite.locator('[data-testid="rueckmeldungen-liste"]');
  const da = await liste
    .waitFor({ timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  await seite.waitForTimeout(1500);
  const bildGeladen = await seite.evaluate(() => {
    const img = document.querySelector('[data-testid="rueckmeldungen-liste"] img');
    return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
  });
  const [sw, cw] = await seite.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  pruefe(`Verwaltung › Rückmeldungen ${breite}px: Liste mit Bild`, da && bildGeladen);
  pruefe(`Verwaltung › Rückmeldungen ${breite}px: kein seitliches Rollen`, sw <= cw, `${sw}/${cw}`);
  await bild(seite, `liste-${breite}`);
  await ctx.close();
}

await chromium.close();
console.log(rot === 0 ? '\nALLES GRUEN' : `\n${rot} ROT`);
process.exit(rot === 0 ? 0 : 1);
