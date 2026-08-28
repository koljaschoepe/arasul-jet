/**
 * Selbsttest von `scripts/test/drossel.mjs`, ohne Geraet (28.08.2026).
 *
 * Die Drossel-Logik entscheidet, ob eine Abnahme am Orin wartet oder rot
 * wird, und sie laesst sich dort nur messen, indem man die Drossel wirklich
 * fuellt: zehn Anmeldungen, eine Viertelstunde. Hier stattdessen mit
 * gefaelschten Kopfzeilen, in Sekunden, bei jedem Zug.
 *
 * Aufruf: node scripts/test/drossel-selbsttest.mjs
 * Rueckgabe 0, wenn jede Frage gruen war.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.ARASUL_DROSSEL_DATEI = path.join(os.tmpdir(), `arasul-drossel-selbsttest-${process.pid}`);
const DATEI = process.env.ARASUL_DROSSEL_DATEI;
// Nach dem Setzen der Umgebung, weil das Modul die Datei beim Laden festlegt.
const d = await import('./drossel.mjs');

let fehler = 0;
const pruefe = (was, ok, detail = '') => {
  fehler += ok ? 0 : 1;
  console.log(`${ok ? 'gruen' : 'ROT  '}  ${was}${detail ? `  (${detail})` : ''}`);
};

pruefe(
  'ein Weg ohne Drossel wird nicht gemerkt',
  d.drosselMerken('GET', '/api/apps', { 'ratelimit-remaining': '3' }, 200) === null
);
const s = d.drosselMerken(
  'GET',
  '/api/auth/session',
  { 'ratelimit-remaining': '1', 'ratelimit-reset': '30' },
  200
);
pruefe(
  'die Sitzungsprobe wird als probe gemerkt',
  s?.name === 'probe' && s.rest === 1,
  JSON.stringify(s)
);
const n = d.drosselMerken(
  'GET',
  '/api/auth/needs-setup',
  { 'ratelimit-remaining': '1', 'ratelimit-reset': '30' },
  200
);
pruefe(
  'needs-setup traegt seit dem 28.08.2026 dieselbe Drossel wie die Sitzungsprobe',
  n?.name === 'probe',
  JSON.stringify(n)
);
const a = d.drosselMerken('POST', '/api/auth/logout', {}, 429);
pruefe(
  'ein 429 ohne Zahlen heisst: nichts uebrig, ein Fenster lang',
  a?.name === 'auth' && a.rest === 0 && a.reset > Date.now() + 50000,
  JSON.stringify(a)
);
const l = d.drosselMerken(
  'POST',
  '/api/auth/login',
  { ratelimit: 'limit=10, remaining=9, reset=880' },
  200
);
pruefe('die gebuendelte Kopfzeile wird gelesen', l?.name === 'anmeldung' && l.rest === 9, JSON.stringify(l));
const alles = d.drosselLesen();
pruefe(
  'alle drei stehen in einer Datei',
  Object.keys(alles).sort().join() === 'anmeldung,auth,probe',
  Object.keys(alles).join()
);
pruefe('probe: fuer einen Versuch ist Platz', d.drosselRestzeit('probe', 1) === 0);
pruefe(
  'probe: fuer zwei nicht, hoechstens ein Fenster',
  d.drosselRestzeit('probe', 2) > 0 && d.drosselRestzeit('probe', 2) <= 60000,
  String(d.drosselRestzeit('probe', 2))
);
pruefe('auth: zu', d.drosselRestzeit('auth') > 0);
pruefe('anmeldung: neun uebrig, zwei gebraucht, frei', d.drosselRestzeit('anmeldung', 2) === 0);
fs.writeFileSync(DATEI, JSON.stringify({ rest: 0, reset: Date.now() + 5000 }));
pruefe(
  'die alte flache Form wird als anmeldung gelesen',
  d.drosselLesen().anmeldung?.rest === 0 && d.drosselRestzeit('anmeldung', 1) > 0
);
const t0 = Date.now();
await d.drosselSchlafen('probe', 200);
pruefe(
  'drosselSchlafen wartet und zaehlt',
  Date.now() - t0 >= 190 && d.gewartet.probe === 1,
  d.drosselBilanz()
);
// Eine Seitenladung kostet ZWEI aus `probe`, und gewartet wird auf Platz fuer
// zwei Ladungen: drei uebrig reichen nicht, das Abmelden geht es nichts an.
fs.writeFileSync(
  DATEI,
  JSON.stringify({
    probe: { rest: 3, reset: Date.now() + 1500 },
    auth: { rest: 0, reset: Date.now() + 50000 },
  })
);
const t1 = Date.now();
await d.seitenladungAbwarten();
pruefe(
  'seitenladungAbwarten wartet auf probe und nicht auf auth',
  Date.now() - t1 >= 1400 && Date.now() - t1 < 4000,
  `${Date.now() - t1} ms`
);

// Ein 429 wird gezaehlt, auch wenn er keine Zahlen mitbringt -- daran erkennt
// ein Handgriff, dass sein Scheitern dem Messaufbau gehoert und nicht dem
// Geraet.
const vorher = d.drossel429Stand();
pruefe('ohne 429 seit dem Stand: nichts', d.drossel429Seit(vorher) === null);
d.drosselMerken('GET', '/api/auth/session', {}, 429);
pruefe(
  'ein 429 der Sitzungsprobe wird als probe gezaehlt',
  d.drossel429Seit(vorher) === 'probe',
  String(d.drossel429Seit(vorher))
);
pruefe(
  'die Bilanz nennt den kleinsten Rest',
  /kleinster Rest/.test(d.drosselBilanz()),
  d.drosselBilanz()
);
fs.rmSync(DATEI, { force: true });
console.log(fehler ? `${fehler} rot` : 'alles gruen');
process.exit(fehler ? 1 : 0);
