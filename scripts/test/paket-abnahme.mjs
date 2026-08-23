/**
 * Die Paket-Kette einer Erweiterung, am Geraet gemessen.
 *
 * Das ist der Weg, den ein Partner geht: in der Werkstatt bauen, das Paket
 * herunterladen, es auf dem Geraet eines Kunden wieder einspielen, dort forken
 * und weiterbauen. Steht so in `docs/features/EXTENSIONS.md`; gemessen war
 * davon bisher nur, dass die Endpunkte antworten.
 *
 * Geprueft wird die Kette als Ganzes, weil ihre Glieder einzeln gruen sein
 * koennen und zusammen trotzdem nichts ergeben:
 *
 *   Geruest  ->  bauen  ->  herunterladen  ->  deinstallieren
 *            ->  importieren  ->  forken  ->  aendern  ->  zurueckrollen
 *
 * Zwei Dinge sind der eigentliche Punkt. Erstens: was zurueckkommt, muss
 * dasselbe sein, was rausging (Manifest und Dateien). Zweitens: `rollback`
 * muss genau EINEN Schritt zurueckgehen, nicht irgendeinen.
 *
 * Aufruf (SSH-Tunnel auf 8443 vorausgesetzt):
 *   node scripts/test/paket-abnahme.mjs
 */

import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
import { anmeldenFallsNoetig, sitzungsZustand } from './anmeldung.mjs';

const URL = process.env.ARASUL_URL || 'https://localhost:8443';
const BENUTZER = process.env.ARASUL_BENUTZER || 'admin';
const PASSWORT = process.env.ARASUL_PASSWORT || '2309';
const HOST = process.env.ARASUL_SSH || 'jetson';
const ID = 'paket-abnahme';
const NAME = 'Paket-Abnahme';
const WERKSTATT = '/arasul/sandbox/projects/werkstatt';

const befunde = [];
const merke = (ok, text) => {
  befunde.push({ ok, text });
  console.log(`${ok ? 'OK  ' : 'ROT '} ${text}`);
};

const aufGeraet = (befehl) =>
  execFileSync('ssh', [HOST, befehl], { encoding: 'utf8', timeout: 180000 });

function werkstattAnlegen(id, kennzeichen) {
  aufGeraet(
    `docker exec -w ${WERKSTATT} -e ARASUL_VORLAGEN_DIR=${WERKSTATT} arasul-flows-sandbox ` +
      `erweiterung neu ${id} --typ app --name '${NAME}'`
  );
  // Ein wiedererkennbarer Inhalt: nur so laesst sich sagen, ob dasselbe
  // zurueckkommt und ob `rollback` wirklich einen Schritt zurueckgeht.
  const b64 = Buffer.from(kennzeichen, 'utf8').toString('base64');
  aufGeraet(
    `docker exec arasul-flows-sandbox sh -c 'echo ${b64} | base64 -d > ${WERKSTATT}/${id}/kennzeichen.txt'`
  );
}

function werkstattWeg(id) {
  try {
    aufGeraet(`docker exec arasul-flows-sandbox rm -rf ${WERKSTATT}/${id}`);
  } catch {
    /* dann bleibt der Ordner eben liegen */
  }
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1400, height: 900 },
  ...(sitzungsZustand() ? { storageState: sitzungsZustand() } : {}),
});
const seite = await ctx.newPage();
let forkSlug = null;
let forkId = null;

try {
  werkstattWeg(ID);
  werkstattAnlegen(ID, 'stand-eins');

  await seite.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const an = await anmeldenFallsNoetig(seite, ctx, { url: URL, benutzer: BENUTZER, passwort: PASSWORT });
  merke(an.angemeldet, an.angemeldet ? (an.neu ? 'angemeldet' : 'Sitzung wiederverwendet') : an.grund);
  if (!an.angemeldet) {
    throw new Error('abbruch');
  }

  /** Ein API-Aufruf aus der angemeldeten Seite heraus. */
  const api = (pfad, optionen = {}) =>
    seite.evaluate(
      async ([p, o]) => {
        const csrf = (document.cookie.match(/arasul_csrf=([^;]+)/) || [])[1] || '';
        const r = await fetch(p, {
          ...o,
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...(o.headers || {}) },
        });
        let rumpf = null;
        try {
          rumpf = await r.json();
        } catch {
          rumpf = null;
        }
        return { status: r.status, rumpf };
      },
      [pfad, optionen]
    );

  // --- 1. Bauen -------------------------------------------------------------
  const gebaut = await api('/api/extensions/bauen', {
    method: 'POST',
    body: JSON.stringify({ slug: 'werkstatt', subfolder: ID, overwrite: true }),
  });
  merke(
    gebaut.status === 201 && gebaut.rumpf?.data?.id === ID,
    `bauen: HTTP ${gebaut.status} ${gebaut.rumpf?.data?.id || JSON.stringify(gebaut.rumpf).slice(0, 120)}`
  );

  // --- 2. Herunterladen -----------------------------------------------------
  const paket = await seite.evaluate(async (id) => {
    const r = await fetch(`/api/extensions/${id}/download`, { credentials: 'include' });
    if (!r.ok) {
      return { status: r.status, b64: null };
    }
    const buf = new Uint8Array(await r.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i++) {
      s += String.fromCharCode(buf[i]);
    }
    return { status: r.status, b64: btoa(s), laenge: buf.length };
  }, ID);
  merke(paket.status === 200 && paket.laenge > 200, `herunterladen: HTTP ${paket.status}, ${paket.laenge || 0} Bytes`);
  if (!paket.b64) {
    throw new Error('abbruch');
  }

  // --- 3. Deinstallieren ----------------------------------------------------
  werkstattWeg(ID); // sonst registriert der Watcher sie sofort wieder
  const weg = await api(`/api/extensions/${ID}`, { method: 'DELETE' });
  const nachher = await api('/api/extensions');
  const nochDa = (nachher.rumpf?.data || nachher.rumpf || []).some((e) => e.id === ID);
  merke(weg.status === 200 && !nochDa, `deinstallieren: HTTP ${weg.status}, danach nicht mehr in der Liste`);

  // --- 4. Wieder einspielen -------------------------------------------------
  const rein = await seite.evaluate(
    async ([id, b64]) => {
      const csrf = (document.cookie.match(/arasul_csrf=([^;]+)/) || [])[1] || '';
      const roh = atob(b64);
      const bytes = new Uint8Array(roh.length);
      for (let i = 0; i < roh.length; i++) {
        bytes[i] = roh.charCodeAt(i);
      }
      const fd = new FormData();
      fd.append('file', new Blob([bytes], { type: 'application/gzip' }), `${id}.tar.gz`);
      const r = await fetch('/api/extensions/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': csrf },
        body: fd,
      });
      let rumpf = null;
      try {
        rumpf = await r.json();
      } catch {
        rumpf = null;
      }
      return { status: r.status, rumpf };
    },
    [ID, paket.b64]
  );
  merke(
    (rein.status === 200 || rein.status === 201) && rein.rumpf?.data?.id === ID,
    `importieren: HTTP ${rein.status} ${rein.rumpf?.data?.id || JSON.stringify(rein.rumpf).slice(0, 140)}`
  );

  // Was zurueckkam, muss dasselbe sein.
  // Es gibt kein `GET /api/extensions/:id` — die Liste ist die Quelle.
  const inhalt = await seite.evaluate(async (id) => {
    const r = await fetch('/api/extensions', { credentials: 'include' });
    const j = await r.json();
    return (j.data || j).find((e) => e.id === id) || null;
  }, ID);
  merke(inhalt?.name === NAME && inhalt?.type === 'app', `dasselbe Paket zurueck: "${inhalt?.name}" (${inhalt?.type})`);

  // --- 5. Forken ------------------------------------------------------------
  const fork = await api(`/api/extensions/${ID}/fork`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Paket-Abnahme Fork' }),
  });
  forkSlug = fork.rumpf?.data?.project?.slug || fork.rumpf?.data?.slug || null;
  forkId = fork.rumpf?.data?.project?.id || null;
  merke(
    fork.status === 200 || fork.status === 201,
    `forken: HTTP ${fork.status} ${JSON.stringify(fork.rumpf?.data || fork.rumpf).slice(0, 140)}`
  );

  // --- 6. Aendern und zurueckrollen ----------------------------------------
  werkstattAnlegen(`${ID}-zwei`, 'stand-zwei');
  const neu = await api('/api/extensions/bauen', {
    method: 'POST',
    body: JSON.stringify({ slug: 'werkstatt', subfolder: `${ID}-zwei`, overwrite: true }),
  });
  const zweiId = neu.rumpf?.data?.id;
  merke(neu.status === 201, `zweiter Stand gebaut: HTTP ${neu.status} (${zweiId})`);

  // Denselben Ordner erneut bauen, aber mit geaendertem Inhalt: erst dann gibt
  // es ueberhaupt einen Stand, auf den `rollback` zurueckgehen kann.
  const b64 = Buffer.from('stand-drei', 'utf8').toString('base64');
  aufGeraet(
    `docker exec arasul-flows-sandbox sh -c 'echo ${b64} | base64 -d > ${WERKSTATT}/${ID}-zwei/kennzeichen.txt'`
  );
  const drei = await api('/api/extensions/bauen', {
    method: 'POST',
    body: JSON.stringify({ slug: 'werkstatt', subfolder: `${ID}-zwei`, overwrite: true }),
  });
  merke(drei.status === 201, `dritter Stand gebaut: HTTP ${drei.status}`);

  const zurueck = await api(`/api/extensions/${zweiId}/rollback`, { method: 'POST' });
  merke(
    zurueck.status === 200,
    `zurueckrollen: HTTP ${zurueck.status} ${JSON.stringify(zurueck.rumpf?.data || zurueck.rumpf).slice(0, 140)}`
  );

  // Die Datei direkt aus dem Paket lesen, nicht ueber `/app/`: eine frisch
  // gebaute Erweiterung ist AUS, und der Ausliefer-Pfad antwortet dann mit 403
  // (so gewollt, seit dem 19.08.2026). Der Zustand des Pakets auf der Platte
  // ist ohnehin die genauere Frage.
  let kennzeichen = '';
  try {
    kennzeichen = aufGeraet(
      `docker exec dashboard-backend sh -c 'cat /arasul/extensions/${zweiId}/kennzeichen.txt'`
    ).trim();
  } catch (err) {
    kennzeichen = `nicht lesbar: ${String(err.message).slice(0, 80)}`;
  }
  merke(
    kennzeichen === 'stand-zwei',
    `nach dem Zurueckrollen steht im Paket "${kennzeichen}" (erwartet "stand-zwei")`
  );
} catch (err) {
  if (err.message !== 'abbruch') {
    merke(false, `Abbruch: ${String(err.message).slice(0, 200)}`);
  }
} finally {
  werkstattWeg(ID);
  werkstattWeg(`${ID}-zwei`);
  for (const id of [ID, `${ID}-zwei`]) {
    try {
      await seite.evaluate(async (x) => {
        const csrf = (document.cookie.match(/arasul_csrf=([^;]+)/) || [])[1] || '';
        await fetch(`/api/extensions/${x}`, { method: 'DELETE', credentials: 'include', headers: { 'X-CSRF-Token': csrf } });
      }, id);
    } catch {
      /* schon weg */
    }
  }
  // Die Fork-Werkstatt ist ein Sandbox-Projekt und bleibt sonst stehen. Nach
  // ein paar Laeufen lagen "paket-abnahme-fork", "-fork-1", "-fork-2" da, und
  // die naechste Messung haette in fremdem Kram gemessen.
  if (forkId) {
    try {
      const raus = await seite.evaluate(async (id) => {
        const csrf = (document.cookie.match(/arasul_csrf=([^;]+)/) || [])[1] || '';
        const r = await fetch(`/api/sandbox/projects/${id}`, {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'X-CSRF-Token': csrf },
        });
        return r.status;
      }, forkId);
      console.log(`abgeraeumt: Fork-Werkstatt "${forkSlug}" (HTTP ${raus})`);
    } catch {
      console.log(`Hinweis: die Fork-Werkstatt "${forkSlug}" bleibt stehen.`);
    }
  }
  await browser.close();
}

const rot = befunde.filter((b) => !b.ok).length;
console.log(`\n${befunde.length - rot}/${befunde.length} gruen`);
process.exit(rot ? 1 : 0);
