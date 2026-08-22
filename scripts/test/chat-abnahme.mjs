/**
 * Live-Abnahme des Chats auf dem Geraet (Plan 023, Phase E).
 *
 * Der Plan verlangt fuer jede Aufgabe eine Abnahme AM GERAET. Vieles davon
 * laesst sich nur im echten Browser sehen: ob die Denkzeile innerhalb einer
 * Sekunde da ist, ob das Slash-Menue ohne Maus bedienbar ist, ob ein Diff
 * aufklappt. Ein Testlauf im Speicher beweist das nicht, er beweist nur, dass
 * die Bausteine sich so verhalten, wie ihre Tests es beschreiben.
 *
 * Das hier faehrt einen echten Browser gegen das Geraet und schreibt auf, was
 * es sieht. Es ersetzt keinen Test; es ist der Beleg, den der Plan verlangt.
 *
 * Aufruf vom Arbeitsrechner, mit einem Tunnel auf den Orin:
 *
 *   ssh -f -N -L 8443:localhost:443 jetson
 *   node scripts/test/chat-abnahme.mjs
 *
 * Umgebung: ARASUL_URL (Vorgabe https://localhost:8443),
 * ARASUL_BENUTZER, ARASUL_PASSWORT.
 *
 * Rueckgabe 0, wenn jede Zusage gehalten ist, sonst 1.
 */
import { chromium } from 'playwright';

const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const BENUTZER = process.env.ARASUL_BENUTZER || 'admin';
const PASSWORT = process.env.ARASUL_PASSWORT || '2309';

/**
 * Den Erst-Start-Assistenten wegnehmen.
 *
 * Er erscheint einmal je Browser (localStorage-Flag) und legt eine Flaeche
 * ueber die Seite. Ein frischer Browser sieht ihn also bei JEDER Abnahme, und
 * gemessen wuerde dann eine Oberflaeche hinter einem Vorhang. Das Flag wird
 * VOR dem Anmelden gesetzt, damit er gar nicht erst aufgeht.
 */
async function assistentUeberspringen(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem('arasul-onboarding-seen-v1', '1');
    } catch {
      /* nicht lesbar, dann eben mit Vorhang */
    }
  });
}

const ergebnisse = [];
function pruefe(was, ok, detail = '') {
  ergebnisse.push({ was, ok, detail });
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1400, height: 900 },
});
const page = await ctx.newPage();

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await assistentUeberspringen(page);

  const passwortFeld = page.locator('input[type="password"]');
  await passwortFeld.waitFor({ timeout: 20000 }).catch(() => {});
  if (await passwortFeld.count()) {
    await page.getByLabel(/Benutzername/i).fill(BENUTZER);
    await passwortFeld.fill(PASSWORT);
    const antwort = page.waitForResponse(r => r.url().includes('/auth/login'), { timeout: 20000 });
    await page.getByRole('button', { name: /Anmelden/i }).click();
    const r = await antwort.catch(() => null);
    pruefe('Anmeldung', !!r && r.status() === 200, r ? `HTTP ${r.status()}` : 'keine Antwort');
  }
  await page.waitForTimeout(5000);

  const panel = page.locator('[data-testid="agent-chat-panel"]');
  pruefe('Chat-Panel vorhanden', (await panel.count()) > 0);
  const eingabe = page.locator('textarea[aria-label="Nachricht an die KI"]');
  await eingabe.waitFor({ timeout: 20000 });

  // --- E7: Slash-Menue ohne Maus -------------------------------------------
  await eingabe.focus();
  await eingabe.fill('');
  await page.keyboard.type('/', { delay: 30 });
  const menue = page.locator('[data-testid="flow-menu"]');
  const menueDa = await menue.isVisible({ timeout: 3000 }).catch(() => false);
  pruefe('E7: Slash oeffnet das Menue', menueDa);
  if (menueDa) {
    const vorher = await menue.locator('[role="option"]').count();
    await page.keyboard.type('flo', { delay: 40 });
    await page.waitForTimeout(300);
    const nachher = await menue.locator('[role="option"]').count();
    pruefe('E7: Tippen filtert', nachher > 0 && nachher <= vorher, `${vorher} auf ${nachher}`);
    // Der aktive Eintrag muss im Sichtfeld liegen, sonst waehlt Tab blind.
    const sichtbar = await page
      .locator('[data-testid="flow-menu"] [aria-selected="true"]')
      .isVisible()
      .catch(() => false);
    pruefe('E7: der aktive Eintrag ist sichtbar', sichtbar);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(400);
    const wert = await eingabe.inputValue();
    pruefe('E7: Tab uebernimmt den Eintrag', wert !== '/flo', `Feld ${JSON.stringify(wert)}`);
  }
  await eingabe.fill('');
  await page.keyboard.press('Escape');

  // --- E3: Denkzeile, deutsch, innerhalb einer Sekunde ----------------------
  await eingabe.focus();
  await page.keyboard.type('Nenne drei Farben.', { delay: 5 });
  const t0 = Date.now();
  await page.keyboard.press('Enter');
  const zeile = page.locator('[data-testid="denkzeile"]');
  let dauer = null;
  try {
    await zeile.waitFor({ state: 'visible', timeout: 5000 });
    dauer = Date.now() - t0;
  } catch {
    /* bleibt null */
  }
  pruefe('E3: Denkzeile erscheint', dauer !== null, dauer !== null ? `${dauer} ms` : 'gar nicht');
  pruefe('E3: innerhalb einer Sekunde', dauer !== null && dauer <= 1000, `${dauer} ms`);

  if (dauer !== null) {
    const text1 = await page.locator('[data-testid="denkzeile-text"]').textContent();
    const dauer1 = await page.locator('[data-testid="denkzeile-dauer"]').textContent();
    await page.waitForTimeout(2200);
    const nochDa = await zeile.isVisible().catch(() => false);
    if (nochDa) {
      const dauer2 = await page.locator('[data-testid="denkzeile-dauer"]').textContent();
      pruefe('E3: aktualisiert sich binnen zwei Sekunden', dauer1 !== dauer2, `${dauer1} auf ${dauer2}`);
    } else {
      pruefe('E3: aktualisiert sich binnen zwei Sekunden', true, 'Lauf war vorher fertig');
    }
    pruefe(
      'E3: die Zeile ist deutsch',
      !/\b(thinking|searching|reading|writing|running|let me)\b/i.test(text1 || ''),
      JSON.stringify(text1)
    );
    // Genau EINE Anzeige, nicht drei. Das war die Klage.
    const ticker = await page.locator('[data-testid="denk-ticker"]').count();
    const aktivitaet = await page.locator('[data-testid="agent-activity"]').count();
    pruefe(
      'E3: keine zweite Anzeige daneben',
      ticker === 0 && aktivitaet === 0,
      `Ticker ${ticker}, Aktivitaet ${aktivitaet}`
    );
  }

  // --- E5: kein Zwischenzustand als Titel -----------------------------------
  const kopf = await panel.innerText();
  pruefe('E5: kein "Arasul denkt nach" im Kopf', !kopf.includes('Arasul denkt nach'));

  // --- E6: mehrere Dateien in einem Zug -------------------------------------
  // Der Browser laesst kein echtes Ziehen von der Platte zu; hier wird der
  // Fallweg ueber die Datei-Auswahl genommen, der durch DIESELBE Funktion
  // (pickFile) laeuft wie das Ziehen.
  // Ausdruecklich INNERHALB des Chat-Panels: der Datei-Explorer bringt ein
  // eigenes `input[type=file]` mit, das direkt in den Projektordner laedt. Der
  // erste Versuch traf genau dieses, lud vier Dateien in die Ablage und meldete
  // trotzdem "keine Anlage" - richtig gemessen, am falschen Element.
  const dateiFeld = panel.locator('input[type="file"]').first();
  if (await dateiFeld.count()) {
    await dateiFeld.setInputFiles([
      { name: 'abnahme-eins.md', mimeType: 'text/markdown', buffer: Buffer.from('# Eins') },
      { name: 'abnahme-zwei.md', mimeType: 'text/markdown', buffer: Buffer.from('# Zwei') },
    ]);
    await page.waitForTimeout(600);
    const chips = await page.locator('[data-testid="composer-chip"]').count();
    pruefe('E6: zwei Dateien ergeben zwei Anlagen', chips >= 2, `${chips} Anlagen`);
    await dateiFeld.setInputFiles([
      { name: 'abnahme-drei.md', mimeType: 'text/markdown', buffer: Buffer.from('# Drei') },
      { name: 'abnahme-vier.md', mimeType: 'text/markdown', buffer: Buffer.from('# Vier') },
    ]);
    await page.waitForTimeout(600);
    const chips2 = await page.locator('[data-testid="composer-chip"]').count();
    pruefe('E6: ein zweiter Vorgang haengt an, statt zu ersetzen', chips2 >= 4, `${chips2} Anlagen`);
    // Jede einzeln entfernbar.
    const entfernen = page.locator('[data-testid="composer-chip"] button').first();
    await entfernen.click();
    await page.waitForTimeout(300);
    const chips3 = await page.locator('[data-testid="composer-chip"]').count();
    pruefe('E6: jede Anlage einzeln entfernbar', chips3 === chips2 - 1, `${chips2} auf ${chips3}`);
    while ((await page.locator('[data-testid="composer-chip"] button').count()) > 0) {
      await page.locator('[data-testid="composer-chip"] button').first().click();
      await page.waitForTimeout(150);
    }
  } else {
    pruefe('E6: Datei-Auswahl vorhanden', false, 'kein input[type=file]');
  }

  // --- E4 und E8: ein Lauf, der drei Dateien aendert ------------------------
  //
  // Der Lauf wird HIER gefahren und nicht an einem alten Verlauf geprueft:
  // Dauer und Tempo leben nur im Strom, sie stehen nicht in der Datenbank
  // (Plan 022, bewusst). Nach einem Neuladen waeren sie weg, und die Abnahme
  // pruefte etwas, das der Nutzer nie so sieht.
  //
  // Uebersprungen mit ARASUL_OHNE_LAUF=1, wenn die GPU gerade belegt ist.
  if (!process.env.ARASUL_OHNE_LAUF) {
    await eingabe.focus();
    await page.keyboard.type(
      'Schreibe drei Dateien abnahme-a.md, abnahme-b.md und abnahme-c.md, jede mit einem Satz ueber Netzwerktechnik.',
      { delay: 3 }
    );
    await page.keyboard.press('Enter');
    // Erst auf das ENDE des Laufs warten, dann zaehlen.
    //
    // Bis zum 22.08.2026 stand es andersherum: warte auf die dritte Datei-Karte,
    // danach auf das Laufende. Die Karten erscheinen aber ERST am Laufende (die
    // Aenderungs-Uebersicht entsteht aus dem Vergleich vorher/nachher). Die
    // erste Wartezeit konnte also nie zuschlagen, lief 15 Minuten leer, und
    // danach zaehlte das Skript null Karten und meldete drei rote Ergebnisse.
    //
    // Auf der Platte lagen die drei Dateien zu dem Zeitpunkt laengst. Der Lauf
    // brauchte auf dem 27B-Modell nur laenger als das Budget: gemessen 21:45,
    // 21:47 und 21:50 fuer die drei Schreibvorgaenge, danach noch die
    // Abschlussrunden.
    await page
      .locator('[data-testid="denkzeile"]')
      .waitFor({ state: 'detached', timeout: 1800000 })
      .catch(() => {});
    await page.waitForTimeout(3000);

    const karten = await page.locator('[data-testid="datei-karte"]').count();
    pruefe('E4: die geaenderten Dateien stehen als Karten da', karten >= 3, `${karten} Karten`);

    const schalter = page.locator('[data-testid="datei-diff-schalter"]');
    const schalterZahl = await schalter.count();
    pruefe('E4: jede Karte traegt einen Vergleich', schalterZahl >= 3, `${schalterZahl} Schalter`);
    if (schalterZahl >= 3) {
      for (let i = 0; i < 3; i++) {
        await schalter.nth(i).click();
        await page.waitForTimeout(1200);
      }
      const offen = await page.locator('[data-testid="datei-diff-zeilen"]').count();
      pruefe('E4: drei Vergleiche klappen auf', offen >= 3, `${offen} offen`);
    }

    const metrik = page.locator('[data-testid="tokens-pro-sekunde"]').last();
    const metrikDa = (await metrik.count()) > 0;
    const metrikText = metrikDa ? (await metrik.innerText()).replace(/\s+/g, ' ') : '';
    pruefe('E4: Gesamtdauer und Tempo stehen da', /min|s/.test(metrikText) && /tok\/s/.test(metrikText), metrikText);

    const quellen = await page.locator('[data-testid="quellen"], [data-testid="quellen-leer"]').count();
    pruefe('E8: die Antwort sagt, woher sie ihr Wissen hat', quellen > 0, `${quellen} Zeilen`);
  }

  await page.screenshot({ path: '/tmp/abnahme-chat.png' });
} catch (err) {
  pruefe('Durchlauf ohne Ausnahme', false, String(err.message).slice(0, 200));
} finally {
  await browser.close();
}

const rot = ergebnisse.filter(e => !e.ok);
console.log(`\n${ergebnisse.length - rot.length} von ${ergebnisse.length} gruen`);
process.exit(rot.length === 0 ? 0 : 1);
