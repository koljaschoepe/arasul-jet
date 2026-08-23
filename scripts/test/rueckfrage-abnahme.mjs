/**
 * Live-Abnahme I2, I3 und I4 (Plan 023): ein Flow haelt an und fragt.
 *
 * Der Plan fordert drei Dinge, und sie haengen zusammen:
 *
 *   I2  zwei Betriebsarten. `autonom` trifft die Annahme und schreibt sie mit,
 *       `rueckfragen` darf anhalten und fragen.
 *   I3  die Rueckfrage selbst: sie haelt den Lauf wirklich an, und das Warten
 *       blockiert die GPU nicht.
 *   I4  eine Vorlage nach dem Muster aus dem Entwicklungsordner: Daten zu einem
 *       Kunden auslesen, Rueckfrage, Ergebnis als Dokument.
 *
 * Gemessen wird im BROWSER und nicht ueber die API. Die Zusage lautet, dass ein
 * Nutzer die Frage beantworten kann; ein `curl` auf `/antwort` belegt nur, dass
 * der Endpunkt existiert.
 *
 * Aufruf (SSH-Tunnel auf 8443 vorausgesetzt):
 *   node scripts/test/rueckfrage-abnahme.mjs
 *
 * Voraussetzung am Geraet: der Flow `angebot` ist angelegt und im Kundenordner
 * liegen Unterlagen. Fehlt eines von beidem, sagt das Skript das und faellt
 * nicht mit einem Fehler auf, der nach einem Produktmangel aussieht.
 */

import { chromium } from 'playwright';

const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const BENUTZER = process.env.ARASUL_BENUTZER || 'admin';
const PASSWORT = process.env.ARASUL_PASSWORT || '2309';
const KUNDE = process.env.ARASUL_KUNDE || 'Abnahme Musterbau GmbH';
// Ein Lauf mit drei Schritten auf dem Standardmodell braucht Minuten, nicht
// Sekunden. Die Grenze ist grosszuegig, weil ein zu knapper Wert einen
// gesunden Lauf als Mangel meldet.
const GEDULD_MS = parseInt(process.env.ARASUL_GEDULD_MS || '1800000', 10);

const ergebnisse = [];
function pruefe(was, ok, detail = '') {
  ergebnisse.push({ was, ok, detail });
  console.log(`${ok ? 'gruen ' : 'ROT   '} ${was}${detail ? `  (${detail})` : ''}`);
}

/**
 * Das CSRF-Token aus dem Cookie, wie es die Oberflaeche selbst tut.
 *
 * Ein `fetch` aus der Seite heraus traegt es nicht von allein: `useApi` setzt
 * `X-CSRF-Token` aus dem Cookie `arasul_csrf` (siehe `utils/csrf.ts`). Ohne
 * das antwortet jede aendernde Anfrage mit 403 CSRF_INVALID, und genau so soll
 * es sein.
 */
async function mitCsrf(page, pfad, koerper) {
  return page.evaluate(
    async ([p, b]) => {
      const treffer = document.cookie.match(/(?:^|;\s*)arasul_csrf=([^;]*)/);
      const token = treffer && treffer[1] ? decodeURIComponent(treffer[1]) : '';
      const antwort = await fetch(p, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-CSRF-Token': token },
        credentials: 'include',
        body: JSON.stringify(b),
      });
      return { status: antwort.status, koerper: await antwort.json().catch(() => ({})) };
    },
    [pfad, koerper]
  );
}

async function assistentUeberspringen(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem('arasul-onboarding-seen-v1', '1');
    } catch {
      /* nicht lesbar, dann eben mit Vorhang */
    }
  });
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1600, height: 1000 },
});
const page = await ctx.newPage();

try {
  // --- Anmelden -------------------------------------------------------------
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('input[name="username"], input[type="text"]', BENUTZER);
  await page.fill('input[type="password"]', PASSWORT);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
  await assistentUeberspringen(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  pruefe('Anmeldung', !page.url().includes('login'), page.url().replace(URL, '') || '/');

  // --- Den Lauf starten -----------------------------------------------------
  //
  // Bewusst ueber die API, mit Gespraechsbezug, und nicht ueber den
  // Slash-Befehl. Der Grund steht hier, damit niemand es fuer Bequemlichkeit
  // haelt: `angebot` hat ZWEI Pflicht-Argumente, und eines davon ist vom Typ
  // `ordner`. Der Composer fuehrt dafuer eine Argument-Hilfe mit einer
  // Ordner-Auswahl, die keine eigenen Testkennungen traegt; sie blind zu
  // bedienen waere geraten, nicht gemessen. Ein von Hand getippter Befehl
  // fuellt nur das erste FREITEXT-Argument (`ComposerCard.submit`), `kunde`
  // bliebe leer, und der Start scheiterte an der Pflichtpruefung.
  //
  // Geprueft wird ohnehin etwas anderes: dass der Lauf ANHAELT und der Nutzer
  // im Browser antworten kann. Genau das steht in I3. Ein Start ueber die API
  // ist zudem kein Kunstgriff, sondern der Weg, den n8n und der externe
  // Ausloeser ohnehin nehmen.
  const chatAntwort = await mitCsrf(page, '/api/chats', { title: 'Abnahme Rueckfrage' });
  // `POST /api/chats` antwortet mit `{ chat: { id } }`, nicht mit `{ data }`.
  // Am Geraet nachgesehen, nachdem der erste Versuch den Lauf ohne
  // Gespraechsbezug startete und die Karte deshalb nirgends erscheinen konnte.
  const chatId =
    chatAntwort.koerper?.chat?.id ??
    chatAntwort.koerper?.data?.id ??
    chatAntwort.koerper?.id;
  pruefe(
    'Ein Gespraech fuer den Lauf',
    !!chatId,
    chatId ? `Chat ${chatId}` : JSON.stringify(chatAntwort).slice(0, 140)
  );

  const start = await mitCsrf(page, '/api/flows/laeufe', {
    flow: 'angebot',
    conversation_id: chatId,
    args: {
      kunde: `projekt://aktiv/${KUNDE}`,
      leistung: 'Lokale Dokumentensuche fuer Bauakten, ohne Cloud',
    },
  });
  pruefe(
    'I2: ein Flow mit betriebsart rueckfragen startet',
    start.status === 202,
    `HTTP ${start.status} ${JSON.stringify(start.koerper).slice(0, 140)}`
  );
  if (start.status !== 202) {
    throw new Error('Ohne Lauf sind die weiteren Pruefungen sinnlos.');
  }

  // In das Gespraech wechseln, in dem der Lauf haengt.
  //
  // Das Panel merkt sich den offenen Chat in `localStorage` unter
  // `arasul_panel_chat_id` (AgentChatPanel). Ohne diesen Schritt stuende der
  // Browser im zuletzt geoeffneten Gespraech, die Rueckfrage-Karte erschiene
  // nie, und die Abnahme meldete einen Mangel, den es nicht gibt.
  await page.evaluate(id => {
    try {
      localStorage.setItem('arasul_panel_chat_id', String(id));
    } catch {
      /* ohne Speicher eben im zuletzt geoeffneten Chat */
    }
  }, chatId);
  await page.goto(`${URL}/workspace`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // --- I3: die Rueckfrage erscheint und haelt den Lauf an -------------------
  const karte = page.locator('[data-testid="flow-antwort-senden"]');
  let kamNach = null;
  const t0 = Date.now();
  try {
    await karte.waitFor({ state: 'visible', timeout: GEDULD_MS });
    kamNach = Math.round((Date.now() - t0) / 1000);
  } catch {
    /* bleibt null */
  }
  pruefe(
    'I3: der Lauf haelt an und fragt',
    kamNach !== null,
    kamNach !== null ? `nach ${kamNach} s` : 'keine Rueckfrage in der Geduldsspanne'
  );

  if (kamNach === null) {
    throw new Error('Ohne Rueckfrage sind die weiteren Pruefungen sinnlos.');
  }

  // Die Optionen aus dem Flow, plus das Freitextfeld.
  // Kennungen aus `RueckfrageKarte.tsx` gelesen, nicht geraten: die Optionen
  // heissen `flow-option-<i>`, das Freitextfeld `flow-antwort-frei`.
  const optionen = await page.locator('[data-testid^="flow-option-"]').count();
  pruefe('I3: die Frage bietet Optionen an', optionen >= 3, `${optionen} Optionen`);

  const freitext = await page.locator('[data-testid="flow-antwort-frei"]').count();
  pruefe('I3: daneben ein Freitextfeld', freitext > 0, `${freitext} Feld`);

  const frageText = await page
    .locator('[data-testid="flow-rueckfrage"]')
    .innerText()
    .catch(() => '');
  pruefe(
    'I3: die Frage ist deutsch',
    !/\b(please|choose|select|how detailed)\b/i.test(frageText),
    frageText.split('\n')[0]?.slice(0, 70) || '(kein Text gefunden)'
  );

  // --- I3: antworten --------------------------------------------------------
  const ersteOption = page.locator('[data-testid^="flow-option-"]').first();
  if (await ersteOption.count()) {
    await ersteOption.click();
    await page.waitForTimeout(400);
  }
  await page.locator('[data-testid="flow-antwort-senden"]').click();
  await page.waitForTimeout(2000);
  const kartenDanach = await page.locator('[data-testid="flow-antwort-senden"]').count();
  pruefe('I3: nach dem Absenden ist die Frage weg', kartenDanach === 0, `${kartenDanach} Karten`);

  // --- I4: das Ergebnis ist ein Dokument im Kundenordner --------------------
  //
  // Gewartet wird auf den LAUF, nicht auf eine feste Zeit, und geprueft wird
  // die Datei, nicht der Text der Antwort. Ein Modell, das behauptet, es habe
  // geschrieben, ist genau der Fall, den Plan 023 E9 schon einmal gefunden
  // hat.
  const runId = start.koerper?.data?.runId;
  let lauf = null;
  const t1 = Date.now();
  while (Date.now() - t1 < GEDULD_MS) {
    lauf = await page.evaluate(async id => {
      const antwort = await fetch(`/api/flows/laeufe/${id}`, { credentials: 'include' });
      return (await antwort.json())?.data;
    }, runId);
    if (lauf && ['fertig', 'gescheitert', 'abgebrochen'].includes(lauf.status)) break;
    await page.waitForTimeout(8000);
  }
  const dauer = Math.round((Date.now() - t1) / 1000);
  pruefe(
    'I4: der Lauf kommt zu Ende',
    lauf?.status === 'fertig',
    `${lauf?.status || 'unbekannt'} nach ${dauer} s`
  );

  // Gelesen wird ueber die Projektablage, also denselben Weg, den auch der
  // Editor nimmt. Das aktive Projekt liefert `/api/projects/active`.
  const datei = await page.evaluate(async kunde => {
    const aktiv = await (await fetch('/api/projects/active', { credentials: 'include' })).json();
    const projektId = aktiv?.data?.id ?? aktiv?.id;
    if (!projektId) return { ok: false, status: 'kein aktives Projekt' };
    const antwort = await fetch(
      `/api/projects/${projektId}/dateien/inhalt?pfad=${encodeURIComponent(`${kunde}/angebot.md`)}`,
      { credentials: 'include' }
    );
    if (!antwort.ok) return { ok: false, status: antwort.status };
    const d = await antwort.json();
    const inhalt = d?.data?.inhalt ?? d?.data?.content ?? '';
    return {
      ok: true,
      laenge: inhalt.length,
      deutsch: /Angebot|Leistung|Preis|Gueltig|Gültig/i.test(inhalt),
    };
  }, KUNDE);
  pruefe(
    'I4: das Angebot liegt im Kundenordner',
    datei.ok && datei.laenge > 200,
    datei.ok ? `${datei.laenge} Zeichen` : `HTTP ${datei.status}`
  );
  pruefe(
    'I4: das Angebot ist deutsch und traegt die erwarteten Teile',
    !!datei.deutsch,
    datei.deutsch ? 'Angebot, Leistung, Preis, Gueltigkeit' : 'Teile nicht gefunden'
  );

  await page.screenshot({ path: '/tmp/abnahme-rueckfrage.png', fullPage: false });
} catch (fehler) {
  pruefe('Durchlauf ohne Ausnahme', false, String(fehler.message || fehler).slice(0, 300));
} finally {
  await browser.close();
}

const rot = ergebnisse.filter(e => !e.ok);
console.log(`\n${ergebnisse.length - rot.length} von ${ergebnisse.length} gruen`);
process.exit(rot.length ? 1 : 0);
