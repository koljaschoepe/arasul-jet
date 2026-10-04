/**
 * Der Bereich Daten der Verwaltung im Browser, am Geraet (M5, Auftrag
 * verwaltung-daten). Bilder und die Fragen, die ein Bild nicht beantwortet:
 *
 *   1. In der Leiste der Verwaltung steht Daten; Datenschutz gibt es nicht mehr,
 *      und unter System fehlen Sicherung und Werksreset.
 *   2. Die alten Adressen (`verwaltung/privacy`, `system/sicherung`,
 *      `system/werksreset`, `?tab=privacy`) landen in Daten.
 *   3. Die Seite zeigt Sicherung, Auskunft und abgesetzt Löschen und Werksreset.
 *   4. Rot ist im Ruhezustand NUR der abgesetzte Teil (gemessen an den
 *      berechneten Farben aller sichtbaren Elemente).
 *   5. Die Auskunft über die gewählte Person lädt eine Datei, die diese Person
 *      nennt.
 *   6. Person löschen: nur an einer Person, die dieses Skript selbst mit Stempel
 *      anlegt (`probe-daten-1004-<Stempel>`); der Knopf bleibt gesperrt, bis der
 *      Name genau getippt ist; das eigene Konto steht nicht in der Liste.
 *   7. Werksreset: NUR bis in die Bestätigung. Er wird NIE ausgelöst: der Knopf
 *      bleibt bei falschem Wort gesperrt, und das Skript klickt ihn nicht.
 *   8. Unter Personen gibt es keinen Löschen-Knopf mehr; die Einstellungen
 *      (Zahnrad) kennen weder Datenschutz noch Export.
 *   9. Bei 390 px steht dieselbe Seite untereinander.
 *
 * Aufruf (Tunnel: ssh -f -N -L 8443:localhost:443 jetson):
 *   ARASUL_URL=https://localhost:8443 ARASUL_BENUTZER=probe-admin \
 *   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
 *     node scripts/test/verwaltung-daten-bilder.mjs
 *
 * Playwright steht nicht im Lockfile (Regel 7); die Pakete aus einem anderen
 * Checkout als Symlink nach node_modules legen und danach wieder entfernen.
 * Rueckgabe 0, wenn jede Frage gruen war, sonst 1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { angemeldeteSeite, hinweisWeg } from './anmeldung.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const BENUTZER = process.env.ARASUL_BENUTZER || 'probe-admin';
const PASSWORT = process.env.ARASUL_PASSWORT || '';
const STEMPEL =
  process.env.ARASUL_STEMPEL || new Date().toISOString().slice(11, 19).replaceAll(':', '') + 'b';
const EMAIL = `probe-daten-1004-${STEMPEL}@probe.example`;
const NAME = `Probe Daten-1004-${STEMPEL}`;
const ZIEL =
  process.env.ARASUL_BILDER ||
  path.join(WURZEL, 'docs/plans/audits/2026-10-04-verwaltung-daten-m5');

if (!PASSWORT) {
  console.error('ARASUL_PASSWORT fehlt (zur Laufzeit aus Bitwarden, nie in eine Datei).');
  process.exit(1);
}
if (BENUTZER === 'admin') {
  console.error('Nie das Konto admin: das ist ein echtes Konto. probe-admin nehmen.');
  process.exit(1);
}
fs.mkdirSync(ZIEL, { recursive: true });

let rot = 0;
const pruefe = (was, ok, detail = '') => {
  if (!ok) rot += 1;
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch();
const { seite, kontext, angemeldet, grund } = await angemeldeteSeite(
  speicher =>
    browser.newContext({
      ignoreHTTPSErrors: true,
      acceptDownloads: true,
      storageState: speicher,
      viewport: { width: 1440, height: 900 },
    }),
  { url: URL, benutzer: BENUTZER, passwort: PASSWORT }
);

let personId = null;
const csrf = async () => (await kontext.cookies()).find(c => c.name === 'arasul_csrf')?.value || '';

/** Ein Weg der API mit der Anmeldung dieses Browsers (CSRF je Anfrage frisch). */
async function api(verb, pfad, data) {
  const antwort = await kontext.request.fetch(`${URL}${pfad}`, {
    method: verb,
    headers: { 'X-CSRF-Token': await csrf() },
    ...(data ? { data } : {}),
  });
  let rumpf = null;
  try {
    rumpf = await antwort.json();
  } catch {
    rumpf = null;
  }
  return { status: antwort.status(), rumpf };
}

const zeigeDaten = async () => {
  await seite.goto(`${URL}/workspace/verwaltung/daten`);
  await seite.getByTestId('daten-seite').waitFor({ timeout: 30000 });
  await hinweisWeg(seite);
};

try {
  pruefe(`Anmeldung als ${BENUTZER}`, angemeldet, grund || '');
  if (!angemeldet) process.exit(1);
  await hinweisWeg(seite);

  // --- 1. Leiste und System ---------------------------------------------------------
  await seite.getByTestId('leiste-verwaltung').click();
  await seite.getByTestId('verwaltung-bereiche').waitFor({ timeout: 30000 });
  pruefe(
    'Die Leiste der Verwaltung nennt Daten, nicht mehr Datenschutz',
    (await seite.getByTestId('verwaltung-daten').count()) === 1 &&
      (await seite.getByTestId('verwaltung-privacy').count()) === 0
  );
  await seite.getByTestId('verwaltung-system').click();
  await seite.getByRole('button', { name: 'Auslastung' }).waitFor({ timeout: 30000 });
  pruefe(
    'Unter System gibt es weder Sicherung noch Werksreset',
    (await seite.getByRole('button', { name: 'Sicherung', exact: true }).count()) === 0 &&
      (await seite.getByRole('button', { name: 'Werksreset', exact: true }).count()) === 0
  );

  // --- 2. Alte Adressen -------------------------------------------------------------
  for (const alt of [
    '/workspace/verwaltung/privacy',
    '/workspace/verwaltung/system/sicherung',
    '/workspace/verwaltung/system/werksreset',
    '/workspace/verwaltung?tab=privacy',
    '/settings?tab=werksreset',
  ]) {
    await seite.goto(`${URL}${alt}`);
    await seite.getByTestId('daten-seite').waitFor({ timeout: 30000 });
    pruefe(
      `${alt} landet in Daten`,
      seite.url().endsWith('/workspace/verwaltung/daten'),
      seite.url().replace(URL, '')
    );
  }

  // --- 3. Die Seite -----------------------------------------------------------------
  await zeigeDaten();
  await seite.getByTestId('sicherung-seite').waitFor({ timeout: 60000 });
  await seite.getByTestId('auskunft').waitFor({ timeout: 30000 });
  const gefahr = seite.getByTestId('daten-gefahr');
  pruefe(
    'Sicherung, Auskunft und abgesetzt Löschen und Werksreset stehen auf einer Seite',
    (await gefahr.getByTestId('person-loeschen').count()) === 1 &&
      (await gefahr.getByTestId('werksreset').count()) === 1 &&
      (await gefahr.getByTestId('auskunft').count()) === 0 &&
      (await gefahr.getByTestId('sicherung-seite').count()) === 0
  );
  const seitentext = (await seite.getByTestId('daten-seite').innerText()) || '';
  pruefe(
    'Die Sicherung zeigt letzte Sicherung, jetzt sichern, Stände und Zurückholen',
    /Letzte Sicherung/.test(seitentext) &&
      (await seite.getByTestId('sicherung-ausloesen').count()) === 1 &&
      /Stände/.test(seitentext) &&
      (await seite.getByTestId('zurueckholen').count()) === 1
  );

  // --- 4. Rot nur im abgesetzten Teil -------------------------------------------------
  const rotBefund = await seite.evaluate(() => {
    // Die Farbe des Tokens, aufgeloest wie der Browser sie sieht.
    const probe = document.createElement('span');
    probe.style.color = 'var(--destructive)';
    document.body.appendChild(probe);
    const rotFarbe = getComputedStyle(probe).color;
    probe.remove();
    const gefahrKasten = document.querySelector('[data-testid="daten-gefahr"]');
    const seiteKasten = document.querySelector('[data-testid="daten-seite"]');
    const aussen = [];
    let innen = 0;
    for (const el of seiteKasten.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const s = getComputedStyle(el);
      const rotig = [
        s.color,
        s.backgroundColor,
        s.borderTopColor,
        s.borderBottomColor,
        s.borderLeftColor,
      ].some(f => f === rotFarbe);
      // Farbe nur zählen, wo sie etwas färbt: Text mit Inhalt, Fläche, sichtbarer Rand.
      const faerbt =
        (s.color === rotFarbe && (el.textContent || el.querySelector('svg'))) ||
        (s.backgroundColor === rotFarbe && s.backgroundColor !== 'rgba(0, 0, 0, 0)') ||
        (['Top', 'Bottom', 'Left'].some(
          k => s[`border${k}Color`] === rotFarbe && parseFloat(s[`border${k}Width`]) > 0
        ) &&
          s.borderTopStyle !== 'none');
      if (!rotig || !faerbt) continue;
      if (gefahrKasten.contains(el)) innen += 1;
      else
        aussen.push(
          `${el.tagName.toLowerCase()}[${el.getAttribute('data-testid') || ''}] ${(el.textContent || '').trim().slice(0, 40)}`
        );
    }
    return { rotFarbe, innen, aussen };
  });
  pruefe(
    'Im Ruhezustand ist nur der abgesetzte Teil rot',
    rotBefund.innen > 0 && rotBefund.aussen.length === 0,
    `rot ${rotBefund.rotFarbe}; innen ${rotBefund.innen}, außen ${rotBefund.aussen.length} ${rotBefund.aussen.slice(0, 3).join(' | ')}`
  );

  // --- 5. Auskunft --------------------------------------------------------------------
  await seite.getByTestId('auskunft-kategorien').waitFor({ timeout: 30000 });
  const kategorien = (await seite.getByTestId('auskunft-kategorien').innerText()) || '';
  pruefe(
    'Die Auskunft zählt je Kategorie (Profil, Läufe)',
    /Profil/.test(kategorien) && /Flow-Läufe/.test(kategorien),
    kategorien.replace(/\s+/g, ' ').slice(0, 100)
  );
  const [datei] = await Promise.all([
    seite.waitForEvent('download', { timeout: 60000 }),
    seite.getByTestId('auskunft-herunterladen').click(),
  ]);
  const gespeichert = path.join(ZIEL, '.auskunft-probe.json');
  await datei.saveAs(gespeichert);
  const inhalt = JSON.parse(fs.readFileSync(gespeichert, 'utf8'));
  fs.unlinkSync(gespeichert);
  pruefe(
    'Die Auskunft über die gewählte Person lädt eine Datei, die sie nennt',
    datei.suggestedFilename().includes(`arasul-auskunft-${BENUTZER}`) &&
      inhalt._meta?.username === BENUTZER,
    datei.suggestedFilename()
  );
  await seite.screenshot({ path: path.join(ZIEL, 'daten-uebersicht.png'), fullPage: true });

  // --- 6. Person löschen (an einer Person, die wir selbst anlegen) ------------------------
  const neu = await api('POST', '/api/benutzer', {
    vorname: 'Probe',
    nachname: `Daten-1004-${STEMPEL}`,
    email: EMAIL,
  });
  personId = neu.rumpf?.data?.id ?? null;
  pruefe(
    `Probe-Person ${EMAIL} angelegt`,
    neu.status === 201 && personId !== null,
    `HTTP ${neu.status}`
  );
  if (personId === null) process.exit(1);

  await zeigeDaten();
  await seite.getByTestId('loeschen-person').click();
  const optionen = await seite.getByRole('option').allInnerTexts();
  pruefe(
    'Das eigene Konto steht nicht in der Löschliste, die Probe-Person schon',
    !optionen.some(t => t.includes(`(${BENUTZER})`) || t.trim() === BENUTZER) &&
      optionen.some(t => t.includes(EMAIL)),
    `${optionen.length} Einträge`
  );
  await seite.getByRole('option', { name: new RegExp(EMAIL.replace('.', '\\.')) }).click();
  await seite.getByTestId('loeschen-oeffnen').click();
  const bestaetigen = seite.getByTestId('loeschen-bestaetigen');
  await bestaetigen.waitFor({ timeout: 15000 });
  pruefe('Ohne Eintippen ist „Endgültig löschen“ gesperrt', await bestaetigen.isDisabled());
  await seite.getByTestId('loeschen-eingabe').fill(NAME.slice(0, -1));
  pruefe('Mit einem Tippfehler im Namen bleibt es gesperrt', await bestaetigen.isDisabled());
  await seite.getByTestId('loeschen-eingabe').fill(NAME);
  pruefe('Mit dem genauen Namen ist es frei', await bestaetigen.isEnabled());
  await seite.screenshot({ path: path.join(ZIEL, 'person-loeschen-bestaetigung.png') });
  await bestaetigen.click();
  await seite.getByTestId('loeschen-bestaetigen').waitFor({ state: 'detached', timeout: 30000 });
  const danach = await api('GET', '/api/benutzer');
  pruefe(
    'Danach ist die Probe-Person gelöscht',
    danach.status === 200 && !(danach.rumpf?.data || []).some(b => b.username === EMAIL)
  );
  personId = null;

  // --- 7. Werksreset: bis in die Bestätigung, NIE ausgelöst ----------------------------------
  await zeigeDaten();
  const reset = seite.getByTestId('werksreset');
  await reset.scrollIntoViewIfNeeded();
  await reset.getByRole('button', { name: /Vorschau anzeigen/ }).click();
  const feldReset = seite.locator('#werksreset-bestaetigung');
  await feldReset.waitFor({ timeout: 60000 });
  const ausloeser = reset.getByRole('button', { name: /Werksreset jetzt ausführen/ });
  pruefe('Ohne Eintippen ist der Auslöser des Werksresets gesperrt', await ausloeser.isDisabled());
  await feldReset.fill('falsches-wort');
  pruefe('Mit einem falschen Wort bleibt er gesperrt', await ausloeser.isDisabled());
  await seite.screenshot({ path: path.join(ZIEL, 'werksreset-bestaetigung.png'), fullPage: true });
  await feldReset.fill('');
  // Der Auslöser wird nicht angeklickt, auch nicht bei richtigem Wort.

  // --- 8. Personen und Einstellungen ----------------------------------------------------------
  await seite.goto(`${URL}/workspace/verwaltung/benutzer`);
  await seite.getByTestId('personen-liste').waitFor({ timeout: 30000 });
  pruefe(
    'Unter Personen gibt es keinen Löschen-Knopf mehr',
    (await seite.locator('[data-testid^="loeschen-"]').count()) === 0
  );
  await seite.getByTestId('leiste-einstellungen').click();
  await seite.waitForTimeout(1500);
  const einstellungen =
    (await seite
      .locator('main, [data-testid="einstellungen"]')
      .first()
      .innerText()
      .catch(() => '')) || (await seite.locator('body').innerText());
  pruefe(
    'Die Einstellungen kennen weder Datenschutz noch Export',
    !/Datenschutz/.test(einstellungen) && !/exportieren|Datenexport|Auskunft/i.test(einstellungen)
  );

  // --- 9. Schmal ------------------------------------------------------------------------------
  await seite.setViewportSize({ width: 390, height: 844 });
  await zeigeDaten();
  await seite.getByTestId('daten-gefahr').scrollIntoViewIfNeeded();
  const breite = await seite.evaluate(() => document.documentElement.scrollWidth);
  pruefe('Bei 390 px läuft nichts über den Rand', breite <= 392, `${breite} px`);
  await seite.screenshot({ path: path.join(ZIEL, 'daten-schmal.png'), fullPage: true });
} finally {
  // Die Probe-Person, falls das Skript vor dem Löschen abgebrochen ist. Nur sie.
  if (personId !== null) {
    await api('DELETE', `/api/benutzer/${personId}`).catch(() => null);
  }
  await kontext.close();
  await browser.close();
}

console.log(`\nBilder in ${path.relative(WURZEL, ZIEL)}`);
process.exit(rot === 0 ? 0 : 1);
