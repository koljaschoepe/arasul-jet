/**
 * Misst ALLE Faehigkeiten der KI-Bruecke so, wie eine Erweiterung sie benutzt:
 * aus dem Rahmen einer laufenden App, mit ihrem eigenen Token.
 *
 * Warum das eine eigene Abnahme ist. Die Bruecke ist die Zusage, auf der der
 * Erweiterungs-Baukasten steht, und sie war am 23.08.2026 auf sechs Ebenen
 * unbenutzbar, ohne dass ein Test das gesagt haette:
 *
 *   1. CORP blockierte `arasul-bruecke.js` im Rahmen (#548).
 *   2. Das Sitzungs-Cookie ist `SameSite=Strict`, aus einem opaken Rahmen kam
 *      es nie mit; keine Unterdatei konnte nachladen (#548).
 *   3. Der globale CORS-Waechter beantwortete den Vorabflug mit 403 (#548).
 *   4. `POST .../bruecke/llm` streamt, stand aber hinter Traefiks Puffer (#548).
 *   5. `netz`, `tabellen` und `zeitplan` fehlten in der Client-Datei (#549).
 *   6. Der Modellaufruf starb nach fuenf Sekunden an Nodes globalem
 *      HTTP-Agenten (#550).
 *
 * Jede einzelne Schicht war gruen in den Tests und rot auf dem Geraet. Deshalb
 * baut dieses Skript eine echte Erweiterung, schaltet sie ein, oeffnet ihren
 * Tab und ruft aus DEM RAHMEN heraus jede Faehigkeit auf. Danach raeumt es sie
 * wieder ab, damit das Geraet bleibt, wie es war.
 *
 * Aufruf (SSH-Tunnel auf 8443 vorausgesetzt):
 *   node scripts/test/bruecke-abnahme.mjs
 */

import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
import { angemeldeteSeite, hinweisWeg } from './anmeldung.mjs';

const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const BENUTZER = process.env.ARASUL_BENUTZER || 'admin';
const PASSWORT = process.env.ARASUL_PASSWORT || '2309';
const HOST = process.env.ARASUL_SSH || 'jetson';
const ID = 'bruecke-abnahme';
const NAME = 'Bruecke-Abnahme';
const WERKSTATT = '/arasul/sandbox/projects/werkstatt';
const ZIEL = 'https://example.com/';

const befunde = [];
const merke = (ok, text) => {
  befunde.push({ ok, text });
  console.log(`${ok ? 'OK  ' : 'ROT '} ${text}`);
};

const aufGeraet = (befehl) =>
  execFileSync('ssh', [HOST, befehl], { encoding: 'utf8', timeout: 120000 });

const MANIFEST = JSON.stringify(
  {
    id: ID,
    name: NAME,
    description: 'Temporaere Erweiterung der Bruecken-Abnahme.',
    type: 'app',
    accessTier: 'internet',
    version: '0.1.0',
    arasulExtensionVersion: 1,
    entry: 'index.html',
    faehigkeiten: ['llm', 'rag', 'dateien', 'flows', 'netz', 'tabellen', 'zeitplan'],
    netz: { ziele: [ZIEL] },
  },
  null,
  2
);

function anlegen() {
  // Genau der Weg, den ein Kunde geht: der Geruest-Befehl im Terminal.
  aufGeraet(
    `docker exec -w ${WERKSTATT} -e ARASUL_VORLAGEN_DIR=${WERKSTATT} arasul-flows-sandbox ` +
      `erweiterung neu ${ID} --typ app --name '${NAME}'`
  );
  // Base64, weil der Text durch drei Shells muss (ssh, Geraete-Shell,
  // `docker exec sh -c`). Ein Heredoc verliert dabei die Anfuehrungszeichen,
  // und im Manifest landete JSON ohne sie, das niemand mehr lesen kann.
  const b64 = Buffer.from(MANIFEST, 'utf8').toString('base64');
  aufGeraet(
    `docker exec arasul-flows-sandbox sh -c 'echo ${b64} | base64 -d > ${WERKSTATT}/${ID}/manifest.json'`
  );
}

function abraeumen() {
  try {
    aufGeraet(`docker exec arasul-flows-sandbox rm -rf ${WERKSTATT}/${ID}`);
  } catch {
    console.log('Hinweis: Werkstatt-Ordner blieb liegen.');
  }
}

const browser = await chromium.launch({ headless: true });
const bau = (zustand) =>
  browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1600, height: 1000 },
    ...(zustand ? { storageState: zustand } : {}),
  });

const sitzung = await angemeldeteSeite(bau, { url: URL, benutzer: BENUTZER, passwort: PASSWORT });
const seite = sitzung.seite;

try {
  anlegen();

  merke(sitzung.angemeldet, sitzung.angemeldet ? 'angemeldet' : sitzung.grund);
  if (!sitzung.angemeldet) {
    throw new Error('abbruch');
  }
  await hinweisWeg(seite);
  await seite.goto(`${URL}/workspace`, { waitUntil: 'domcontentloaded' });
  await seite.waitForTimeout(3000);

  // Der Watcher braucht bis zu einem Takt (15 s), bis er den Ordner sieht.
  let registriert = false;
  for (let i = 0; i < 20; i++) {
    registriert = await seite.evaluate(async (id) => {
      const r = await fetch('/api/extensions', { credentials: 'include' });
      const j = await r.json();
      return (j.data || j).some((e) => e.id === id);
    }, ID);
    if (registriert) break;
    await seite.waitForTimeout(3000);
  }
  merke(registriert, registriert ? 'der Watcher hat die Erweiterung von selbst registriert' : 'nicht registriert');
  if (!registriert) {
    throw new Error('abbruch');
  }

  const ein = await seite.evaluate(async (id) => {
    const csrf = (document.cookie.match(/arasul_csrf=([^;]+)/) || [])[1] || '';
    const r = await fetch(`/api/extensions/${id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ enabled: true, faehigkeitenFreigeben: true }),
    });
    return r.status;
  }, ID);
  merke(ein === 200, `eingeschaltet samt Freigabe (HTTP ${ein})`);

  await seite.goto(`${URL}/workspace`, { waitUntil: 'domcontentloaded' });
  const knopf = seite.locator(`[aria-label="${NAME}"]`).first();
  await knopf.waitFor({ state: 'attached', timeout: 25000 });
  await knopf.click();
  await seite.locator('[data-testid="extension-frame"]').waitFor({ state: 'visible', timeout: 20000 });

  // Die Adresse des Rahmens entsteht erst, nachdem die Seite den Lese-Token
  // geholt hat. Wer direkt nach dem Klick sucht, findet nichts.
  let rahmen = null;
  for (let i = 0; i < 30; i++) {
    rahmen = seite.frames().find((f) => f.url().includes('/app/t/'));
    if (rahmen) break;
    await seite.waitForTimeout(1000);
  }
  merke(Boolean(rahmen), rahmen ? 'der Rahmen laedt die App ueber den Lese-Token' : 'kein Rahmen');
  if (!rahmen) {
    throw new Error('abbruch');
  }
  await rahmen.waitForFunction(
    () => window.ArasulBruecke && ArasulBruecke.faehigkeiten().length > 0,
    null,
    { timeout: 30000 }
  );

  // Einen Dateinamen holen, der auf DIESEM Geraet wirklich indexiert ist.
  // Ein fest verdrahteter Name war nach dem naechsten Aufraeumen weg, und die
  // Abnahme meldete dann das Geraet als kaputt (23.08.2026).
  const indexiert = await seite.evaluate(async () => {
    const r = await fetch('/api/documents?limit=20', { credentials: 'include' });
    if (!r.ok) {
      return null;
    }
    const j = await r.json();
    const liste = j.data?.documents || j.documents || j.data || [];
    const treffer = (Array.isArray(liste) ? liste : []).find(
      (d) => (d.status || '') === 'indexed' && d.filename
    );
    return treffer ? treffer.filename : null;
  });
  merke(Boolean(indexiert), indexiert ? `indexierte Datei fuer den rag-Test: ${indexiert}` : 'keine indexierte Datei gefunden');

  const jetzt = new Date(Date.now() + 70000);
  const hhmm = `${String(jetzt.getHours()).padStart(2, '0')}:${String(jetzt.getMinutes()).padStart(2, '0')}`;

  const e = await rahmen.evaluate(async ({ ziel, uhrzeit, datei }) => {
    const raus = {};
    const nimm = async (name, fn) => {
      try {
        raus[name] = { ok: true, wert: await fn() };
      } catch (err) {
        raus[name] = { ok: false, fehler: String(err.message).slice(0, 180) };
      }
    };
    raus.faehigkeiten = ArasulBruecke.faehigkeiten();
    await nimm('llm', () => ArasulBruecke.llm('Antworte mit genau einem Wort: Hauptstadt von Frankreich?'));
    await nimm('rag', () => ArasulBruecke.rag('Wartungsvertrag', { anzahl: 2 }));
    if (datei) {
      await nimm('rag_datei', () => ArasulBruecke.rag('Worum geht es?', { dateiname: datei }));
    }
    await nimm('dateien_schreiben', () => ArasulBruecke.dateien.schreiben('probe.txt', 'hallo'));
    await nimm('dateien_lesen', () => ArasulBruecke.dateien.lesen('probe.txt'));
    await nimm('dateien_liste', () => ArasulBruecke.dateien.liste('.'));
    await nimm('flows_liste', () => ArasulBruecke.flows.liste());
    await nimm('netz', async () => {
      const a = await ArasulBruecke.netz(ziel);
      return { status: a.status, laenge: (a.rumpf || '').length };
    });
    await nimm('netz_fremd', () => ArasulBruecke.netz('https://nicht-erlaubt.example/'));
    await nimm('tabellen_anlegen', () => ArasulBruecke.tabellen.anlegen('messwerte', [{ name: 'wert', typ: 'text' }]));
    await nimm('tabellen_schreiben', () => ArasulBruecke.tabellen.schreiben('messwerte', { wert: 'Paris' }));
    await nimm('tabellen_lesen', () => ArasulBruecke.tabellen.lesen('messwerte', { anzahl: 5 }));
    await nimm('zeitplan_anlegen', () => ArasulBruecke.zeitplan.anlegen('dokument-zusammenfassen', uhrzeit, { datei: 'gibt-es-nicht.md' }));
    await nimm('zeitplan_liste', () => ArasulBruecke.zeitplan.liste());
    return raus;
  }, { ziel: ZIEL, uhrzeit: hhmm, datei: indexiert });

  merke(e.faehigkeiten.length === 7, `sieben Faehigkeiten freigegeben (${e.faehigkeiten.join(', ')})`);
  merke(e.llm.ok && /paris/i.test(e.llm.wert || ''), `llm: „${String(e.llm.wert || e.llm.fehler).trim().slice(0, 60)}"`);
  // `rag` sucht ueber Qdrant, und Qdrant liegt seit Plan 021 Schritt 8 im
  // Profil `classic-rag` und laeuft auf einem normalen Geraet nicht. Das ist
  // eine Entscheidung, kein Defekt — die Abnahme darf deswegen nicht dauerhaft
  // rot stehen. Rot ist sie erst, wenn `rag` aus einem ANDEREN Grund scheitert
  // oder die Meldung nicht mehr erklaert, was zu tun ist.
  const ragAus = !e.rag.ok && /dateiname/i.test(e.rag.fehler || '');
  merke(
    e.rag.ok || ragAus,
    e.rag.ok
      ? `rag: ${(e.rag.wert || []).length} Treffer`
      : ragAus
        ? 'rag ohne Dateiname: Vektorsuche ist aus, und die Meldung nennt den Weg'
        : `rag: ${e.rag.fehler}`
  );
  // Der Weg, der auf diesem Geraet wirklich traegt: eine benannte Datei aus dem
  // Textlayer. Ohne diese Zeile pruefte die Abnahme nur, dass die Faehigkeit
  // ordentlich scheitert.
  if (indexiert) {
    const text = String(e.rag_datei?.wert?.[0]?.text || '');
    merke(
      Boolean(e.rag_datei?.ok) && text.length > 0,
      e.rag_datei?.ok
        ? `rag mit Dateiname: ${text.replace(/\s+/g, ' ').slice(0, 70)}`
        : `rag mit Dateiname: ${e.rag_datei?.fehler}`
    );
  }
  merke(
    e.dateien_schreiben.ok && e.dateien_lesen.ok && e.dateien_lesen.wert?.inhalt === 'hallo',
    'dateien: geschrieben und unveraendert zurueckgelesen'
  );
  merke(e.dateien_liste.ok, e.dateien_liste.ok ? 'dateien: Liste kommt' : `dateien: ${e.dateien_liste.fehler}`);
  merke(e.flows_liste.ok, e.flows_liste.ok ? `flows: ${(e.flows_liste.wert || []).length} verfuegbar` : `flows: ${e.flows_liste.fehler}`);
  merke(e.netz.ok && e.netz.wert?.status === 200, `netz: ${JSON.stringify(e.netz.wert || e.netz.fehler)}`);
  merke(!e.netz_fremd.ok && /nicht in den Zielen/i.test(e.netz_fremd.fehler || ''), `netz, fremdes Ziel: ${e.netz_fremd.fehler || 'ging durch!'}`);
  merke(
    e.tabellen_anlegen.ok && e.tabellen_schreiben.ok && e.tabellen_lesen.wert?.zeilen?.[0]?.wert === 'Paris',
    'tabellen: angelegt, geschrieben, dieselbe Zeile zurueck'
  );
  merke(e.zeitplan_anlegen.ok && e.zeitplan_liste.ok, `zeitplan: eingetragen fuer ${hhmm}`);

  // Der Zeitplan ist erst dann eine Zusage, wenn er auch feuert.
  let lief = null;
  for (let i = 0; i < 30; i++) {
    const roh = aufGeraet(
      `docker exec postgres-db psql -U arasul -d arasul_db -t -A -F'|' -c ` +
        `"SELECT coalesce(zuletzt_lauf::text,''), coalesce(letzter_fehler,'') FROM public.extension_zeitplaene WHERE extension_id='${ID}';"`
    ).trim();
    const [lauf, fehler] = roh.split('|');
    if (lauf || fehler) {
      lief = { lauf, fehler };
      break;
    }
    await seite.waitForTimeout(6000);
  }
  merke(
    Boolean(lief?.lauf) && !lief.fehler,
    lief ? `zeitplan lief von selbst: Lauf ${lief.lauf || '-'} ${lief.fehler ? `Fehler: ${lief.fehler}` : ''}` : 'zeitplan feuerte nicht'
  );
} catch (err) {
  if (err.message !== 'abbruch') {
    merke(false, `Abbruch: ${err.message.slice(0, 200)}`);
  }
} finally {
  abraeumen();
  try {
    const weg = await seite.evaluate(async (id) => {
      const csrf = (document.cookie.match(/arasul_csrf=([^;]+)/) || [])[1] || '';
      const r = await fetch(`/api/extensions/${id}`, { method: 'DELETE', credentials: 'include', headers: { 'X-CSRF-Token': csrf } });
      return r.status;
    }, ID);
    console.log(`\nabgeraeumt: deinstalliert (HTTP ${weg})`);
  } catch {
    console.log('\nHinweis: Erweiterung konnte nicht deinstalliert werden.');
  }
  await browser.close();
}

const rot = befunde.filter((b) => !b.ok).length;
console.log(`\n${befunde.length - rot}/${befunde.length} gruen`);
process.exit(rot ? 1 : 0);
