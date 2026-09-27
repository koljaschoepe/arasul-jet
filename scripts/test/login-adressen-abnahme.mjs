/**
 * Anmeldung unter jeder Adresse des Geräts (J34, 27.09.2026).
 *
 * WARUM ES DIESE REIHE GIBT
 *
 * Am 27.09.2026 meldete die Anmeldeseite unter `https://arasul` „Konto
 * gesperrt", und das Konto war gesund: die CORS-Regel des Backends kannte den
 * nackten Netznamen nicht und antwortete mit 403, und die Seite las jeden 403
 * als Sperre. Unter `https://192.168.0.197` ging dieselbe Anmeldung. Zwei
 * Fehler, und der zweite schickte einen Menschen auf die falsche Fährte.
 *
 * WAS GEMESSEN WIRD
 *
 *   1. ANMELDUNG JE ADRESSE UND BREITE. Jede Adresse aus `ARASUL_ADRESSEN`
 *      (Vorgabe: `https://arasul`, `https://arasul.local`,
 *      `https://192.168.0.197`) mal 390 und 1440 px, jeweils in einem frischen
 *      Browserkontext über das FORMULAR: 200 auf `POST /api/auth/login`, und
 *      die Shell steht da. Danach wird abgemeldet.
 *   2. EINE FREMDE HERKUNFT BLEIBT DRAUSSEN. `POST /api/auth/login` mit
 *      `Origin: https://fremd.example` ist 403 `ORIGIN_NOT_ALLOWED`, ohne
 *      `Access-Control-Allow-Origin`; dasselbe für einen Namen, der mit dem
 *      Netznamen nur anfängt (`https://arasul.fremd.example`).
 *   3. EIN TECHNISCHER FEHLER HEISST NICHT GESPERRT. Im Browser wird die
 *      Antwort auf die Anmeldung ersetzt (kein Netz, Zeitüberschreitung,
 *      abgewiesene Herkunft, 403 ohne Code, 502) — keine davon erreicht das
 *      Gerät. Jede Meldung sagt, dass mit dem Konto alles in Ordnung ist, und
 *      keine sagt „gesperrt".
 *   4. GESPERRT NUR NACH EINER WIRKLICHEN SPERRE. Mit `ARASUL_SPERRKONTO`
 *      (ein Wegwerf-Konto, angelegt von `login-adressen-abnahme.sh`) fünfmal
 *      ein falsches Passwort — jedes Mal „falsch", nie „gesperrt" —, beim
 *      sechsten Mal 403 `ACCOUNT_LOCKED` und „gesperrt".
 *
 * KEIN BILD ZEIGT EIN PASSWORT. Der Kit-Worker hat am 27.09.2026 eine
 * Momentaufnahme mit dem Inhalt des Passwortfelds abgelegt. Jedes Bild geht
 * hier durch `fotografieren`: es leert jedes Passwortfeld, prüft danach, dass
 * keines etwas trägt und dass das Passwort nirgends im Text der Seite steht,
 * und verweigert sonst das Bild (das ist dann ein Rot). Eine Momentaufnahme
 * des Barrierebaums macht die Reihe gar nicht.
 *
 * Aufruf (das Passwort nur aus dem Schlüsselbund, nie als Argument):
 *   ARASUL_PASSWORT="$(security find-generic-password -s 'Arasul Orin Mitarbeiter' \
 *     -a probe-0925-mitarbeiter -w)" ARASUL_BENUTZER=probe-0925-mitarbeiter \
 *     node scripts/test/login-adressen-abnahme.mjs
 *
 * Umgebung: ARASUL_BENUTZER, ARASUL_PASSWORT, ARASUL_ADRESSEN (Komma),
 * ARASUL_SPERRKONTO, ARASUL_AUSGABE (Ordner der Bilder).
 * Rückgabe 0, wenn jede Zelle grün war, sonst 1.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium, request as pwRequest } from 'playwright';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BENUTZER = process.env.ARASUL_BENUTZER || '';
const PASSWORT = process.env.ARASUL_PASSWORT || '';
const ADRESSEN = (
  process.env.ARASUL_ADRESSEN || 'https://arasul,https://arasul.local,https://192.168.0.197'
)
  .split(',')
  .map(a => a.trim().replace(/\/+$/, ''))
  .filter(Boolean);
const SPERRKONTO = process.env.ARASUL_SPERRKONTO || '';
const BREITEN = [390, 1440];
const DATUM = new Date().toISOString().slice(0, 10);
const AUSGABE =
  process.env.ARASUL_AUSGABE || path.join(WURZEL, `docs/plans/audits/${DATUM}-login-adressen`);

if (!BENUTZER || !PASSWORT) {
  console.error('login-adressen: ARASUL_BENUTZER und ARASUL_PASSWORT fehlen.');
  process.exit(2);
}
fs.mkdirSync(AUSGABE, { recursive: true });

const zellen = [];
function zelle(name, gruen, befund = '') {
  zellen.push({ name, gruen, befund });
  console.log(`${gruen ? 'GRUEN' : 'ROT  '}  ${name}${befund ? ` -- ${befund}` : ''}`);
}

// Jedes Passwort, das diese Reihe tippt. `fotografieren` sucht jedes davon im
// Text der Seite, nicht nur das echte.
const getippt = new Set([PASSWORT]);

/**
 * Das einzige Bild der Reihe. Leert jedes Passwortfeld, prüft, dass keines
 * mehr etwas trägt und keines der getippten Passwörter in der Seite steht
 * (auch nicht in einem Textfeld, falls jemand „anzeigen" eingebaut hat).
 */
async function fotografieren(page, name) {
  const befund = await page.evaluate(passwoerter => {
    const felder = [...document.querySelectorAll('input[type="password"]')];
    const setzen = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    for (const f of felder) {
      setzen.call(f, '');
      f.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const voll = felder.filter(f => f.value !== '').length;
    const werte = [...document.querySelectorAll('input, textarea')].map(e => e.value);
    const text = `${document.body.innerText}\n${werte.join('\n')}`;
    const sichtbar = passwoerter.filter(p => p && text.includes(p)).length;
    return { voll, sichtbar };
  }, [...getippt]);
  if (befund.voll > 0 || befund.sichtbar > 0) {
    zelle(`Bild ${name}`, false, 'verweigert: ein Passwort stünde darin');
    return;
  }
  await page.screenshot({ path: path.join(AUSGABE, `${name}.png`), fullPage: false });
}

function hoehe(breite) {
  return breite < 900 ? 844 : 900;
}

async function kontext(browser, breite) {
  return browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: breite, height: hoehe(breite) },
  });
}

async function formularAusfuellen(page, benutzer, passwort) {
  await page.locator('#username').fill(benutzer);
  await page.locator('#password').fill(passwort);
}

async function anmeldenUndAntwort(page) {
  const [antwort] = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/auth/login'), { timeout: 45_000 }),
    page.getByRole('button', { name: /^Anmelden$/ }).click(),
  ]);
  let code = '';
  try {
    code = (await antwort.json())?.error?.code || '';
  } catch {
    code = '';
  }
  return { status: antwort.status(), code };
}

async function meldung(page) {
  const alarm = page.locator('#login-error');
  await alarm.waitFor({ state: 'visible', timeout: 45_000 });
  return (await alarm.innerText()).trim();
}

function kurz(adresse) {
  return new URL(adresse).hostname.replace(/[^a-z0-9]+/gi, '-');
}

// ---------------------------------------------------------------- 1. Anmeldung
async function anmeldungJeAdresse(browser) {
  for (const adresse of ADRESSEN) {
    for (const breite of BREITEN) {
      const name = `${breite} px · ${adresse}`;
      const ctx = await kontext(browser, breite);
      const page = await ctx.newPage();
      const konsole = [];
      page.on('console', m => {
        if (m.type() === 'error' && /cors|origin/i.test(m.text())) konsole.push(m.text());
      });
      try {
        await page.goto(`${adresse}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.locator('#username').waitFor({ state: 'visible', timeout: 30_000 });
        await fotografieren(page, `${kurz(adresse)}-${breite}-anmeldung`);
        await formularAusfuellen(page, BENUTZER, PASSWORT);
        const { status, code } = await anmeldenUndAntwort(page);
        if (status !== 200) {
          const text = await meldung(page).catch(() => '');
          await fotografieren(page, `${kurz(adresse)}-${breite}-rot`);
          zelle(`Anmeldung ${name}`, false, `${status} ${code} „${text}"`);
          continue;
        }
        await page
          .locator('[data-shell-aufbau]')
          .first()
          .waitFor({ state: 'visible', timeout: 30_000 });
        await fotografieren(page, `${kurz(adresse)}-${breite}-shell`);
        zelle(
          `Anmeldung ${name}`,
          konsole.length === 0,
          konsole.length ? `Konsole: ${konsole[0]}` : ''
        );
      } catch (err) {
        zelle(`Anmeldung ${name}`, false, err.message.split('\n')[0]);
      } finally {
        // Abmelden: die Sitzung soll nicht liegen bleiben.
        await page
          .evaluate(async () => {
            const csrf = document.cookie.match(/(?:^|; )arasul_csrf=([^;]*)/)?.[1] || '';
            await fetch('/api/auth/logout', {
              method: 'POST',
              credentials: 'include',
              headers: { 'X-CSRF-Token': decodeURIComponent(csrf) },
            });
          })
          .catch(() => {});
        await ctx.close();
      }
    }
  }
}

// ------------------------------------------------------- 2. Fremde Herkunft
async function fremdeHerkunft() {
  const ziel = ADRESSEN[ADRESSEN.length - 1];
  const api = await pwRequest.newContext({ ignoreHTTPSErrors: true });
  try {
    for (const fremd of ['https://fremd.example', 'https://arasul.fremd.example']) {
      const antwort = await api.post(`${ziel}/api/auth/login`, {
        headers: { Origin: fremd, 'Content-Type': 'application/json' },
        data: { username: 'j34-fremd', password: 'kein-passwort' },
        failOnStatusCode: false,
      });
      const kopf = antwort.headers();
      let code = '';
      try {
        code = (await antwort.json())?.error?.code || '';
      } catch {
        code = '';
      }
      const gruen =
        antwort.status() === 403 &&
        code === 'ORIGIN_NOT_ALLOWED' &&
        !kopf['access-control-allow-origin'];
      zelle(
        `fremde Herkunft ${fremd} abgewiesen`,
        gruen,
        `${antwort.status()} ${code}${kopf['access-control-allow-origin'] ? ' mit ACAO' : ''}`
      );
    }
    // Gegenprobe: die eigenen Adressen sind als Herkunft zugelassen.
    for (const eigen of ADRESSEN) {
      const antwort = await api.get(`${ziel}/api/auth/needs-setup`, {
        headers: { Origin: eigen },
        failOnStatusCode: false,
      });
      zelle(
        `eigene Herkunft ${eigen} zugelassen`,
        antwort.status() === 200 && antwort.headers()['access-control-allow-origin'] === eigen,
        String(antwort.status())
      );
    }
  } finally {
    await api.dispose();
  }
}

// ------------------------------------------- 3. Technische Fehler im Browser
const TECHNISCH = [
  ['kein-netz', 'kein Netz', r => r.abort('failed')],
  ['zeit', 'Zeitüberschreitung', r => r.abort('timedout')],
  [
    'herkunft',
    'abgewiesene Herkunft',
    r =>
      r.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin not allowed by CORS policy' },
        }),
      }),
  ],
  [
    'verboten',
    '403 ohne engeren Code',
    r =>
      r.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Access denied' } }),
      }),
  ],
  ['502', 'Gerät nicht bereit', r => r.fulfill({ status: 502, body: 'Bad Gateway' })],
];

async function technischeFehler(browser) {
  const adresse = ADRESSEN[0];
  for (const breite of BREITEN) {
    for (const [kennung, name, antwort] of TECHNISCH) {
      const ctx = await kontext(browser, breite);
      const page = await ctx.newPage();
      try {
        await page.route('**/api/auth/login', antwort);
        await page.goto(`${adresse}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.locator('#username').waitFor({ state: 'visible', timeout: 30_000 });
        const attrappe = `j34-attrappe-${crypto.randomBytes(4).toString('hex')}`;
        getippt.add(attrappe);
        await formularAusfuellen(page, 'j34-niemand', attrappe);
        await page.getByRole('button', { name: /^Anmelden$/ }).click();
        const text = await meldung(page);
        await fotografieren(page, `technisch-${kennung}-${breite}`);
        const gruen = !/gesperrt/i.test(text) && /Mit dem Konto ist alles in Ordnung/.test(text);
        zelle(`technisch ${breite} px · ${name}`, gruen, `„${text}"`);
      } catch (err) {
        zelle(`technisch ${breite} px · ${name}`, false, err.message.split('\n')[0]);
      } finally {
        await ctx.close();
      }
    }
  }
}

// ------------------------------------------------- 4. Die wirkliche Sperre
async function wirklicheSperre(browser) {
  if (!SPERRKONTO) {
    zelle('wirkliche Sperre', false, 'ARASUL_SPERRKONTO fehlt, nicht gemessen');
    return;
  }
  const ctx = await kontext(browser, 390);
  const page = await ctx.newPage();
  try {
    await page.goto(`${ADRESSEN[0]}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.locator('#username').waitFor({ state: 'visible', timeout: 30_000 });
    for (let i = 1; i <= 5; i += 1) {
      const falsch = `j34-falsch-${crypto.randomBytes(4).toString('hex')}`;
      getippt.add(falsch);
      await formularAusfuellen(page, SPERRKONTO, falsch);
      const { status, code } = await anmeldenUndAntwort(page);
      const text = await meldung(page);
      const gruen = status === 401 && !/gesperrt/i.test(text);
      zelle(`Fehlversuch ${i} heißt nicht gesperrt`, gruen, `${status} ${code} „${text}"`);
    }
    const falsch = `j34-falsch-${crypto.randomBytes(4).toString('hex')}`;
    getippt.add(falsch);
    await formularAusfuellen(page, SPERRKONTO, falsch);
    const { status, code } = await anmeldenUndAntwort(page);
    const text = await meldung(page);
    await fotografieren(page, 'gesperrt-390');
    zelle(
      'nach fünf Fehlversuchen: gesperrt',
      status === 403 && code === 'ACCOUNT_LOCKED' && /gesperrt/.test(text),
      `${status} ${code} „${text}"`
    );
  } catch (err) {
    zelle('wirkliche Sperre', false, err.message.split('\n')[0]);
  } finally {
    await ctx.close();
  }
}

const browser = await chromium.launch();
try {
  await anmeldungJeAdresse(browser);
  await fremdeHerkunft();
  await technischeFehler(browser);
  await wirklicheSperre(browser);
} finally {
  await browser.close();
}

const rot = zellen.filter(z => !z.gruen);
fs.writeFileSync(
  path.join(AUSGABE, 'bericht.json'),
  `${JSON.stringify({ datum: new Date().toISOString(), adressen: ADRESSEN, zellen }, null, 2)}\n`
);
console.log(`\n${zellen.length - rot.length} von ${zellen.length} grün. Bilder: ${AUSGABE}`);
process.exit(rot.length ? 1 : 0);
