/**
 * Gate G2: „Rueckmeldung bei jeder Aktion", quer ueber die Plattform gemessen.
 *
 * Das Gate verlangt nicht, dass irgendwo ein Hinweis erscheint, sondern dass
 * es UEBERALL derselbe ist. Sieben Aufgaben aus Plan 023 zahlen darauf ein
 * (C6, D3, E2, E3, E4, H5, J5), jede an ihrer Ecke. Ob die Ecken zusammen ein
 * einheitliches Bild ergeben, hat bis zum 23.08.2026 niemand nachgesehen.
 *
 * Diese Abnahme fuehrt echte Aktionen in drei verschiedenen Bereichen aus und
 * prueft nach jeder, ob eine sichtbare Rueckmeldung kommt: Ordner anlegen,
 * Ordner loeschen, eine Erweiterung ein- und ausschalten. Zusaetzlich prueft
 * sie, was J5 verlangt: eine zerstoerende Aktion fragt vorher nach und nennt
 * die Folge.
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
const ORDNER = `abnahme-rueckmeldung-${Date.now().toString(36)}`;
const APP = process.env.ARASUL_APP || 'Beispiel-App';

const ergebnisse = [];
const pruefe = (was, ok, detail = '') => {
  ergebnisse.push({ was, ok, detail });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

/**
 * Wartet auf eine Rueckmeldung und gibt ihren Text zurueck.
 *
 * Rueckmeldungen sind `role="alert"` im Toast-Container. Verglichen werden die
 * TEXTE vor der Aktion, nicht ihre Anzahl.
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
    const alle = await seite.locator('.toast-container [role="alert"]').allInnerTexts();
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
  (await seite.locator('.toast-container [role="alert"]').allInnerTexts()).map(t =>
    t.replace(/\s+/g, ' ').trim()
  );

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1600, height: 1000 },
  ...(sitzungsZustand() ? { storageState: sitzungsZustand() } : {}),
});
const seite = await ctx.newPage();
let ordnerDa = false;

try {
  await seite.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const an = await anmeldenFallsNoetig(seite, ctx, { url: URL, benutzer: BENUTZER, passwort: PASSWORT });
  pruefe('Anmeldung', an.angemeldet, an.angemeldet ? (an.neu ? 'neu' : 'Sitzung wiederverwendet') : an.grund);
  if (!an.angemeldet) {
    throw new Error('abbruch');
  }
  await hinweisWeg(seite);
  await seite.goto(`${URL}/workspace`, { waitUntil: 'domcontentloaded' });
  await seite.waitForTimeout(5000);

  // --- 1. Ordner anlegen ----------------------------------------------------
  let vorher = await meldungsTexte(seite);
  await seite.locator('[aria-label="Neuer Ordner"]').first().click();
  const name = seite.locator('input[aria-label="Name"]');
  await name.waitFor({ state: 'visible', timeout: 10000 });
  await name.fill(ORDNER);
  await seite.getByRole('button', { name: 'Anlegen' }).click();
  const m1 = await rueckmeldung(seite, vorher);
  ordnerDa = Boolean(m1);
  pruefe('Ordner anlegen meldet sich', Boolean(m1), m1 || 'keine Rueckmeldung');

  // --- 2. Loeschen fragt vorher nach (J5) -----------------------------------
  //
  // IM DATEIBAUM suchen, nicht auf der ganzen Seite. Die Rueckmeldung von
  // Schritt 1 lautet „<Ordnername> angelegt" und enthaelt den Namen selbst.
  // `getByText(ORDNER).first()` traf deshalb den Toast, und ein Rechtsklick auf
  // einen Toast oeffnet kein Kontextmenue: die Abnahme brach am 23.08.2026 mit
  // „das Kontextmenue bietet Loeschen an" ab, obwohl am Geraet nichts fehlte.
  //
  // Ein selbst gebauter Wettlauf: die Meldung beim Anlegen gibt es erst seit
  // #560, und sie hat die naechste Pruefung derselben Abnahme erschlagen.
  const baum = seite.locator('[data-testid="explorer-tree"]');
  await baum.waitFor({ state: 'visible', timeout: 15000 });
  const eintrag = baum.getByText(ORDNER, { exact: false }).first();
  await eintrag.waitFor({ state: 'visible', timeout: 15000 });
  await eintrag.click({ button: 'right' });
  const loeschen = seite.getByRole('menuitem').filter({ hasText: /Löschen|Loeschen/ }).first();
  const kontextDa = (await loeschen.count()) > 0;
  pruefe('das Kontextmenue bietet Loeschen an', kontextDa);
  if (!kontextDa) {
    throw new Error('abbruch');
  }
  await loeschen.click();

  const dialogText = await seite
    .locator('[role="dialog"]')
    .last()
    .innerText()
    .catch(() => '');
  pruefe(
    'die zerstoerende Aktion fragt nach und nennt die Folge',
    /wirklich l/i.test(dialogText) && /Inhalt geht verloren/i.test(dialogText),
    dialogText.replace(/\s+/g, ' ').slice(0, 110)
  );

  vorher = await meldungsTexte(seite);
  await seite.getByRole('button', { name: /^Löschen$/ }).last().click();
  const m2 = await rueckmeldung(seite, vorher);
  pruefe('Ordner loeschen meldet sich', Boolean(m2), m2 || 'keine Rueckmeldung');
  if (m2) {
    ordnerDa = false;
  }

  // --- 3. Eine Erweiterung schalten -----------------------------------------
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
        await d2.getByRole('button').last().click().catch(() => {});
      }
      await seite.waitForTimeout(2000);
    }
  }
} catch (err) {
  if (err.message !== 'abbruch') {
    pruefe('Durchlauf', false, `Abbruch: ${String(err.message).slice(0, 200)}`);
  }
} finally {
  if (ordnerDa) {
    console.log(`\nHinweis: der Ordner „${ORDNER}" blieb liegen und muss von Hand weg.`);
  }
  await browser.close();
}

const rot = ergebnisse.filter(e => !e.ok).length;
console.log(`\n${ergebnisse.length - rot} von ${ergebnisse.length} gruen`);
process.exit(rot ? 1 : 0);
