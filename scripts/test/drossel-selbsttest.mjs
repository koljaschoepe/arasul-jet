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
pruefe('die Sitzungsprobe wird als sitzung gemerkt', s?.name === 'sitzung' && s.rest === 1, JSON.stringify(s));
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
  Object.keys(alles).sort().join() === 'anmeldung,auth,sitzung',
  Object.keys(alles).join()
);
pruefe('sitzung: fuer einen Versuch ist Platz', d.drosselRestzeit('sitzung', 1) === 0);
pruefe(
  'sitzung: fuer zwei nicht, hoechstens ein Fenster',
  d.drosselRestzeit('sitzung', 2) > 0 && d.drosselRestzeit('sitzung', 2) <= 60000,
  String(d.drosselRestzeit('sitzung', 2))
);
pruefe('auth: zu', d.drosselRestzeit('auth') > 0);
pruefe('anmeldung: neun uebrig, zwei gebraucht, frei', d.drosselRestzeit('anmeldung', 2) === 0);
fs.writeFileSync(DATEI, JSON.stringify({ rest: 0, reset: Date.now() + 5000 }));
pruefe(
  'die alte flache Form wird als anmeldung gelesen',
  d.drosselLesen().anmeldung?.rest === 0 && d.drosselRestzeit('anmeldung', 1) > 0
);
const t0 = Date.now();
await d.drosselSchlafen('sitzung', 200);
pruefe(
  'drosselSchlafen wartet und zaehlt',
  Date.now() - t0 >= 190 && d.gewartet.sitzung === 1,
  d.drosselBilanz()
);
fs.writeFileSync(
  DATEI,
  JSON.stringify({
    auth: { rest: 0, reset: Date.now() + 1500 },
    sitzung: { rest: 5, reset: Date.now() + 50000 },
  })
);
const t1 = Date.now();
await d.seitenladungAbwarten();
pruefe(
  'seitenladungAbwarten wartet auf auth und nicht auf sitzung',
  Date.now() - t1 >= 1400 && Date.now() - t1 < 4000,
  `${Date.now() - t1} ms`
);
fs.rmSync(DATEI, { force: true });
console.log(fehler ? `${fehler} rot` : 'alles gruen');
process.exit(fehler ? 1 : 0);
