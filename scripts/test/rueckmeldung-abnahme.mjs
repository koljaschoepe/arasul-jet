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
 * und ausschalten. Der Explorer ist mit B2 gefallen, der Store mit dem Umbau
 * vom 26.08.2026; sie suchte danach noch den Schalter „Beispiel-App
 * aktivieren" unter `/store`, den es nicht mehr gibt.
 *
 * Seit dem 06.10.2026 (M5, Auftrag app-protokoll-abrufen) schaltet sie in der
 * App-Ansicht der Verwaltung einen Flow aus und wieder an, und beide Male muss
 * eine Rueckmeldung kommen. Die App spielt sie sich SELBST ein, als
 * `probe-beispiel-<STEMPEL>` ueber den Weg des Kits, und entfernt sie am Ende
 * (`beispielapp-probe.sh`); eine vorhandene misst sie mit
 * `ARASUL_BEISPIELAPP=<id>`.
 *
 * Sie raeumt hinter sich auf.
 *
 * Aufruf (SSH-Tunnel auf 8443 vorausgesetzt, Konto aus der Umgebung):
 *   node scripts/test/rueckmeldung-abnahme.mjs
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  anmeldenFallsNoetig,
  hinweisWeg,
  sitzungsZustand,
  zugangAusUmgebung,
} from './anmeldung.mjs';

const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const { benutzer: BENUTZER, passwort: PASSWORT } = zugangAusUmgebung();
const HELFER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'beispielapp-probe.sh');
// Der Flow, der geschaltet wird; die Beispielapp bringt ihn mit.
const FLOW = 'freigabe';

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

/** Die Beispielapp einspielen; die letzte Zeile der Ausgabe ist JSON. */
function einspielen() {
  const aus = execFileSync('bash', [HELFER, 'einspielen'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    timeout: 20 * 60 * 1000,
  });
  return JSON.parse(aus.trim().split('\n').pop());
}

function entfernen(probe) {
  if (!probe || probe.eigen !== 'ja') {
    return;
  }
  execFileSync('bash', [HELFER, 'entfernen'], {
    stdio: ['ignore', 'inherit', 'inherit'],
    timeout: 10 * 60 * 1000,
    env: {
      ...process.env,
      BEISPIEL_APP: probe.app,
      BEISPIEL_KEY_ID: probe.key_id,
      BEISPIEL_SCHLUESSEL: probe.schluessel,
      BEISPIEL_EIGEN: 'ja',
    },
  });
}

let probe = null;
try {
  probe = einspielen();
  pruefe('die Beispielapp steht am Gerät', Boolean(probe?.app), probe?.app);
} catch (err) {
  pruefe('die Beispielapp steht am Gerät', false, String(err.message).slice(0, 200));
  process.exit(1);
}
const APP = probe.app;

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
  // Loeschen mit Rueckfrage), bis zum Umbau der Schalter einer Erweiterung im
  // Store. Was heute dieselbe Art Handgriff ist: ein Schalter in der
  // Verwaltung, der sofort wirkt.
  let vorher;

  // --- 1. Einen Flow der App aus- und wieder einschalten --------------------
  await seite.goto(`${URL}/workspace/settings?tab=apps`, { waitUntil: 'domcontentloaded' });
  const zeile = seite.locator(`[data-testid="app-oeffnen-${APP}"]`);
  const zeileDa = await zeile
    .waitFor({ timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  pruefe(`die Verwaltung nennt ${APP}`, zeileDa);
  if (zeileDa) {
    await zeile.click();
    const schalter = seite.locator(`[data-testid="flow-aktiv-${FLOW}"]`).first();
    const schalterDa = await schalter
      .waitFor({ timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    pruefe(`der Schalter für den Flow „${FLOW}" ist da`, schalterDa);
    if (schalterDa) {
      const zeileFlow = seite.locator(`[data-testid="flow-${FLOW}"]`).first();
      const warAn = (await zeileFlow.getAttribute('data-aktiv')) !== 'false';

      vorher = await meldungsTexte(seite);
      await schalter.click();
      const m1 = await rueckmeldung(seite, vorher, 15000);
      pruefe(
        warAn
          ? 'das Ausschalten eines Flows meldet sich'
          : 'das Einschalten eines Flows meldet sich',
        Boolean(m1),
        m1 || 'keine Rückmeldung'
      );

      // Zurück in den Ausgangszustand, und auch das meldet sich.
      await seite.waitForTimeout(1500);
      vorher = await meldungsTexte(seite);
      await schalter.click();
      const m2 = await rueckmeldung(seite, vorher, 15000);
      pruefe('das Zurückschalten meldet sich ebenso', Boolean(m2), m2 || 'keine Rückmeldung');
      await seite.waitForTimeout(1500);
      pruefe(
        'und der Flow steht wieder, wie er stand',
        ((await zeileFlow.getAttribute('data-aktiv')) !== 'false') === warAn
      );
    }
  }
} catch (err) {
  if (err.message !== 'abbruch') {
    pruefe('Durchlauf', false, `Abbruch: ${String(err.message).slice(0, 200)}`);
  }
} finally {
  await browser.close();
  try {
    entfernen(probe);
  } catch (err) {
    pruefe('die Beispielapp ist wieder entfernt', false, String(err.message).slice(0, 200));
  }
}

const rot = ergebnisse.filter(e => !e.ok).length;
console.log(`\n${ergebnisse.length - rot} von ${ergebnisse.length} gruen`);
process.exit(rot ? 1 : 0);
