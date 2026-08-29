/**
 * Gate G2: „Rueckmeldung bei jeder Aktion", quer ueber die Plattform gemessen.
 *
 * Das Gate verlangt nicht, dass irgendwo ein Hinweis erscheint, sondern dass
 * es UEBERALL derselbe ist. Sieben Aufgaben aus Plan 023 zahlen darauf ein
 * (C6, D3, E2, E3, E4, H5, J5), jede an ihrer Ecke. Ob die Ecken zusammen ein
 * einheitliches Bild ergeben, hat bis zum 23.08.2026 niemand nachgesehen.
 *
 * Diese Abnahme fuehrte bis B2 echte Aktionen in drei Bereichen aus: Ordner
 * anlegen, Ordner loeschen (mit der Rueckfrage aus J5), eine Erweiterung ein-
 * und ausschalten. Der Explorer ist mit B2 gefallen; geblieben ist der
 * Schalter der Erweiterung. D6 schneidet die Abnahme auf die neue Oberflaeche
 * neu.
 *
 * Sie raeumt hinter sich auf.
 *
 * Aufruf (SSH-Tunnel auf 8443 vorausgesetzt):
 *   node scripts/test/rueckmeldung-abnahme.mjs
 */

import { chromium } from 'playwright';
import { anmeldenFallsNoetig, sitzungsZustand, hinweisWeg } from './anmeldung.mjs';

const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const BENUTZER = process.env.ARASUL_BENUTZER || 'admin';
const PASSWORT = process.env.ARASUL_PASSWORT || '2309';
const APP = process.env.ARASUL_APP || 'Beispiel-App';

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok, detail });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

/**
 * Wartet auf eine Rueckmeldung und gibt ihren Text zurueck.
 *
 * Rueckmeldungen sind `role="alert"` im Toast-Behaelter. Der heisst seit H3
 * `[data-slot='toast-viewport']` und nicht mehr `.toast-container`: die
 * Meldung ist ein Primitiv der Bibliothek geworden, damit eine App dieselbe
 * zeigen kann. Verglichen werden die TEXTE vor der Aktion, nicht ihre
 * Anzahl.
 *
 * Die Anzahl war falsch, und zwar auf eine Art, die nur manchmal auffiel: ein
 * Toast verschwindet nach ein paar Sekunden von selbst. Stand vor der Aktion
 * noch einer und lief er ab, waehrend der neue erschien, blieb die Anzahl bei
 * eins — `alle.length > vorher` wurde nie wahr, und die Abnahme meldete „keine
 * Rueckmeldung", obwohl eine da war. Am 24.08.2026 zweimal hintereinander
 * gesehen, jedes Mal an einer anderen Stelle: erst „Ordner anlegen", im
 * naechsten Lauf „Ordner loeschen". Ein Messfehler, der wandert, sieht aus wie
 * ein Produktfehler, der wandert.
 *
 * Ein Text, der vorher nicht da war, ist ein neuer Toast — unabhaengig davon,
 * wie viele daneben stehen oder verschwinden.
 */
async function rueckmeldung(seite, vorherTexte, zeitlimitMs = 12000) {
  const bis = Date.now() + zeitlimitMs;
  const alt = new Set(vorherTexte);
  while (Date.now() < bis) {
    const alle = await seite.locator('[data-slot="toast-viewport"] [role="alert"]').allInnerTexts();
    const neu = alle.map(t => t.replace(/\s+/g, ' ').trim()).find(t => t && !alt.has(t));
    if (neu) {
      return neu;
    }
    await seite.waitForTimeout(300);
  }
  return null;
}

/** Die Texte, die JETZT stehen. Alles Spaetere daneben ist neu. */
const meldungsTexte = async seite =>
  (await seite.locator('[data-slot="toast-viewport"] [role="alert"]').allInnerTexts()).map(t =>
    t.replace(/\s+/g, ' ').trim()
  );

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1600, height: 1000 },
  ...(sitzungsZustand() ? { storageState: sitzungsZustand() } : {}),
});
const seite = await ctx.newPage();

try {
  await seite.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const an = await anmeldenFallsNoetig(seite, ctx, {
    url: URL,
    benutzer: BENUTZER,
    passwort: PASSWORT,
  });
  pruefe(
    'Anmeldung',
    an.angemeldet,
    an.angemeldet ? (an.neu ? 'neu' : 'Sitzung wiederverwendet') : an.grund
  );
  if (!an.angemeldet) {
    throw new Error('abbruch');
  }
  await hinweisWeg(seite);
  await seite.goto(`${URL}/workspace`, { waitUntil: 'domcontentloaded' });
  await seite.waitForTimeout(5000);

  // Bis B2 standen hier zwei Schritte im Datei-Explorer (Ordner anlegen,
  // Loeschen mit Rueckfrage). Der Explorer ist gefallen; was bleibt, ist der
  // Schalter einer Erweiterung im Store.
  let vorher;

  // --- 1. Eine Erweiterung schalten -----------------------------------------
  await seite.goto(`${URL}/store`, { waitUntil: 'domcontentloaded' });
  await seite.waitForTimeout(4000);
  const aus = seite.locator(`[aria-label="${APP} deaktivieren"]`).first();
  const ein = seite.locator(`[aria-label="${APP} aktivieren"]`).first();
  const warAn = (await aus.count()) > 0;
  const schalter = warAn ? aus : ein;
  const schalterDa = (await schalter.count()) > 0;
  pruefe(`der Schalter fuer „${APP}" ist da`, schalterDa, warAn ? 'stand an' : 'stand aus');
  if (schalterDa) {
    vorher = await meldungsTexte(seite);
    await schalter.click();
    // Ausschalten fragt nach, wenn Tabs offen sind (H5). Beides ist erlaubt;
    // gemessen wird, dass eine Rueckmeldung KOMMT.
    const dialog = seite.locator('[role="dialog"]').last();
    if (await dialog.isVisible().catch(() => false)) {
      const knopf = dialog.getByRole('button').last();
      await knopf.click().catch(() => {});
    }
    const m3 = await rueckmeldung(seite, vorher, 15000);
    pruefe('das Schalten einer Erweiterung meldet sich', Boolean(m3), m3 || 'keine Rueckmeldung');

    // Zurueck in den Ausgangszustand.
    await seite.waitForTimeout(2000);
    const zurueck = warAn
      ? seite.locator(`[aria-label="${APP} aktivieren"]`).first()
      : seite.locator(`[aria-label="${APP} deaktivieren"]`).first();
    if ((await zurueck.count()) > 0) {
      await zurueck.click();
      const d2 = seite.locator('[role="dialog"]').last();
      if (await d2.isVisible().catch(() => false)) {
        await d2
          .getByRole('button')
          .last()
          .click()
          .catch(() => {});
      }
      await seite.waitForTimeout(2000);
    }
  }
} catch (err) {
  if (err.message !== 'abbruch') {
    pruefe('Durchlauf', false, `Abbruch: ${String(err.message).slice(0, 200)}`);
  }
} finally {
  await browser.close();
}

const rot = ergebnisse.filter(e => !e.ok).length;
console.log(`\n${ergebnisse.length - rot} von ${ergebnisse.length} gruen`);
process.exit(rot ? 1 : 0);
