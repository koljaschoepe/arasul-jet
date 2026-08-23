/**
 * Ein Modell ueber einen Link hinzufuegen, im Browser gemessen.
 *
 * Warum es diese Abnahme gibt (Entscheidung Kolja, 23.08.2026): der Kunde soll
 * neue Modelle nachladen koennen, auch wenn sein Geraet nie wieder eine
 * Software-Aktualisierung sieht. Ein Geraet, das keine Modelle mehr bekommt,
 * altert schneller als eines, das einmal telefoniert.
 *
 * Gemessen wird die KETTE, nicht die einzelnen Endpunkte. Die waren beim Bauen
 * schon gruen, und trotzdem endete jeder Aufruf mit HTTP 500: `category` ist
 * eine Groessenklasse und kein Typ, und kein Unit-Test hat es gemerkt, weil
 * dort die Datenbank nachgebildet ist. Genau dagegen laeuft das hier.
 *
 * Nicht geladen wird das Modell. Ein GGUF-Pull dauert je nach Variante eine
 * halbe Stunde und misst Ollama, nicht diese Funktion. Was hier zaehlt: die
 * Varianten stehen VOR dem Laden da, mit Groesse und dem Urteil, ob sie ins
 * Geraet passen.
 *
 * Aufruf (SSH-Tunnel auf 8443 vorausgesetzt):
 *   node scripts/test/modell-link-abnahme.mjs
 */

import { chromium } from 'playwright';
import { anmeldenFallsNoetig, sitzungsZustand, hinweisWeg } from './anmeldung.mjs';

const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const BENUTZER = process.env.ARASUL_BENUTZER || 'admin';
const PASSWORT = process.env.ARASUL_PASSWORT || '2309';

// Eine kleine, oeffentliche GGUF-Ablage. Klein ist Absicht: die Abnahme laedt
// nichts, aber sie fragt HuggingFace nach der Dateiliste, und eine Ablage mit
// dreissig Varianten macht die Antwort nur langsamer.
const ABLAGE = process.env.ARASUL_TEST_ABLAGE || 'unsloth/Qwen3-0.6B-GGUF';

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1600, height: 1000 },
  ...(sitzungsZustand() ? { storageState: sitzungsZustand() } : {}),
});
const seite = await ctx.newPage();
let kennung = null;

try {
  await seite.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const an = await anmeldenFallsNoetig(seite, ctx, { url: URL, benutzer: BENUTZER, passwort: PASSWORT });
  pruefe('Anmeldung', an.angemeldet, an.angemeldet ? (an.neu ? 'neu' : 'Sitzung wiederverwendet') : an.grund);
  if (!an.angemeldet) {
    throw new Error('abbruch');
  }
  await hinweisWeg(seite);
  await seite.goto(`${URL}/workspace/modelle`, { waitUntil: 'domcontentloaded' });
  await seite.waitForTimeout(4000);

  // --- 1. Der Weg ist ueberhaupt da ----------------------------------------
  const oeffner = seite.locator('[data-testid="modell-hinzufuegen-oeffnen"]');
  const oeffnerDa = (await oeffner.count()) > 0;
  pruefe('der Weg steht in der Modell-Ansicht', oeffnerDa);
  if (!oeffnerDa) {
    throw new Error('abbruch');
  }
  await oeffner.click();

  // --- 2. Nachsehen, was hinter dem Link steckt -----------------------------
  await seite.locator('[data-testid="modell-quelle"]').fill(`https://huggingface.co/${ABLAGE}`);
  await seite.locator('[data-testid="modell-nachsehen"]').click();

  const liste = seite.locator('[data-testid="modell-varianten"]');
  await liste.waitFor({ state: 'visible', timeout: 60000 }).catch(() => {});
  const variantenDa = (await liste.count()) > 0;
  pruefe('die Varianten stehen VOR dem Laden da', variantenDa, ABLAGE);
  if (!variantenDa) {
    throw new Error('abbruch');
  }

  const text = (await liste.innerText()).replace(/\s+/g, ' ');
  // „11.3 GB · braucht 15 GB" — beides gehoert dazu: die Dateigroesse allein
  // sagt nichts darueber, ob das Modell ins Geraet passt.
  pruefe(
    'jede Variante nennt Groesse UND Speicherbedarf',
    /[\d.,]+ GB · braucht \d+ GB/.test(text),
    text.slice(0, 80)
  );

  const eintraege = await liste.locator('li').count();
  pruefe('mehr als eine Variante zur Auswahl', eintraege > 1, `${eintraege} Varianten`);

  // --- 3. In den Katalog aufnehmen ------------------------------------------
  const ersteKnopf = liste.locator('li button').first();
  const ersterTag = (await liste.locator('li code').first().innerText()).trim();
  await ersteKnopf.click();
  await seite.waitForTimeout(3000);
  kennung = `hf.co/${ABLAGE}:${ersterTag}`;

  // Der Katalog ist die Wahrheit, nicht der Toast: eine Meldung kann erscheinen,
  // ohne dass etwas geschrieben wurde (genau das war der 500er beim Bauen).
  const imKatalog = await seite.evaluate(async id => {
    const r = await fetch('/api/models/catalog', { credentials: 'include' });
    const d = await r.json();
    const liste = Array.isArray(d) ? d : d.models || d.data || [];
    return liste.find(m => m.id === id) || null;
  }, kennung);

  pruefe('das Modell steht danach im Katalog', Boolean(imKatalog), kennung);
  pruefe(
    'es ist als ungeprueft gekennzeichnet',
    imKatalog?.jetson_tested === false && /Nicht von Arasul geprüft/.test(imKatalog?.description || ''),
    imKatalog?.description?.slice(0, 60) || 'keine Beschreibung'
  );
  pruefe(
    'Groesse und Speicherbedarf sind gefuellt',
    Number(imKatalog?.size_bytes) > 0 && Number(imKatalog?.ram_required_gb) >= 2,
    `${imKatalog?.size_bytes} Bytes, ${imKatalog?.ram_required_gb} GB`
  );

  // --- 4. Und wieder wegnehmen ----------------------------------------------
  // Die Kehrseite gehoert dazu: hinzufuegen ohne entfernen hiesse, dass ein
  // Tippfehler fuer immer im Katalog des Kunden steht.
  const weg = await seite.evaluate(async id => {
    const csrf = (document.cookie.match(/arasul_csrf=([^;]+)/) || [])[1] || '';
    const r = await fetch(`/api/models/katalog/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'X-CSRF-Token': csrf },
    });
    return r.status;
  }, kennung);
  pruefe('es laesst sich wieder aus dem Katalog nehmen', weg === 200, `HTTP ${weg}`);
  if (weg === 200) {
    kennung = null;
  }

  // --- 5. Ein kuratiertes Modell bleibt --------------------------------------
  const kuratiert = await seite.evaluate(async () => {
    const csrf = (document.cookie.match(/arasul_csrf=([^;]+)/) || [])[1] || '';
    const r = await fetch('/api/models/katalog/gemma3:1b', {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'X-CSRF-Token': csrf },
    });
    return r.status;
  });
  pruefe('ein kuratiertes Modell laesst sich NICHT entfernen', kuratiert === 400, `HTTP ${kuratiert}`);
} catch (err) {
  if (err.message !== 'abbruch') {
    pruefe('Durchlauf', false, `Abbruch: ${String(err.message).slice(0, 200)}`);
  }
} finally {
  // Nichts liegen lassen. Ein Katalogeintrag aus einer Messung ist genau die
  // Art Rest, die spaeter jemand fuer ein echtes Modell haelt.
  if (kennung) {
    const rest = await seite
      .evaluate(async id => {
        const csrf = (document.cookie.match(/arasul_csrf=([^;]+)/) || [])[1] || '';
        const r = await fetch(`/api/models/katalog/${id}`, {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'X-CSRF-Token': csrf },
        });
        return r.status;
      }, kennung)
      .catch(() => 0);
    console.log(`\nabgeraeumt: ${kennung} (HTTP ${rest})`);
  }
  await browser.close();
}

const rot = ergebnisse.filter(e => !e.ok).length;
console.log(`\n${ergebnisse.length - rot} von ${ergebnisse.length} gruen`);
process.exit(rot ? 1 : 0);
