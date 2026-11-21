/**
 * `scripts/util/kit-schluessel.sh` kennt jeden Bereich, den es anlegt
 * (21.11.2026, J42, M7, Fund aus Kit-PR 120).
 *
 * Bis dahin suchten `liste` und `widerrufen` nur nach `app:deploy` und
 * `system:update`. Ein Schlüssel mit `feedback:agent` ließ sich anlegen, aber
 * über das Skript weder sehen noch widerrufen.
 *
 * Das Skript läuft hier echt: ein falsches `docker` auf dem PATH führt das
 * Programm, das sonst im Container liefe, mit Node am Rechner aus, und eine
 * Attrappe der Datenbank (über ARASUL_KIT_QUELLE) beantwortet die Abfragen so,
 * wie Postgres es mit `&&` täte.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SKRIPT = path.resolve(__dirname, '../../../../scripts/util/kit-schluessel.sh');

const SCHLUESSEL = [
  { id: 1, key_prefix: 'aras_dep1', name: 'Kit', allowed_endpoints: ['app:deploy'] },
  { id: 2, key_prefix: 'aras_upd2', name: 'Update', allowed_endpoints: ['system:update'] },
  { id: 3, key_prefix: 'aras_fbk3', name: 'Rückmeldungen', allowed_endpoints: ['feedback:agent'] },
  { id: 4, key_prefix: 'aras_flw4', name: 'Flow', allowed_endpoints: ['flow:run'] },
];

let ordner;

beforeAll(() => {
  ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-schluessel-'));
  const quelle = path.join(ordner, 'src');
  fs.mkdirSync(path.join(quelle, 'middleware'), { recursive: true });
  // Die Attrappe: `&&` heißt „mindestens ein Bereich gemeinsam".
  fs.writeFileSync(
    path.join(quelle, 'database.js'),
    `const zeilen = ${JSON.stringify(SCHLUESSEL)}.map(z => ({
       ...z, is_active: true, created_at: '2026-11-21T10:00:00Z', last_used_at: null }));
     const trifft = (z, b) => z.allowed_endpoints.some(e => b.includes(e));
     module.exports = { query: async (sql, p) => {
       if (sql.includes('UPDATE')) {
         return { rows: zeilen.filter(z => trifft(z, p[1]) && (z.key_prefix === p[0] || String(z.id) === p[0])) };
       }
       return { rows: zeilen.filter(z => trifft(z, p[0])) };
     } };`
  );
  fs.writeFileSync(path.join(quelle, 'middleware', 'apiKeyAuth.js'), 'module.exports = {};');
  // Das falsche docker: `inspect` gelingt, `exec -i -e K=V … <container> node -e <prog>`
  // setzt die -e-Werte und führt den Rest am Rechner aus.
  const bin = path.join(ordner, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(
    path.join(bin, 'docker'),
    `#!/bin/bash
[ "$1" = inspect ] && exit 0
shift; shift
while [ "$1" = -e ]; do export "$2"; shift 2; done
shift
exec "$@"
`,
    { mode: 0o755 }
  );
});

afterAll(() => fs.rmSync(ordner, { recursive: true, force: true }));

function lauf(...argumente) {
  return execFileSync('bash', [SKRIPT, ...argumente], {
    env: {
      ...process.env,
      PATH: `${path.join(ordner, 'bin')}:${process.env.PATH}`,
      ARASUL_KIT_QUELLE: path.join(ordner, 'src'),
    },
    encoding: 'utf8',
  });
}

describe('kit-schluessel.sh', () => {
  test('liste zeigt auch Schlüssel mit feedback:agent, aber keine fremden', () => {
    const aus = lauf('liste');
    expect(aus).toContain('aras_dep1');
    expect(aus).toContain('aras_upd2');
    expect(aus).toContain('aras_fbk3');
    expect(aus).toMatch(/aras_fbk3\s+feedback:agent/);
    expect(aus).toMatch(/aras_upd2\s+system:update/);
    // Ein Schlüssel für Flows ist kein Kit-Schlüssel.
    expect(aus).not.toContain('aras_flw4');
  });

  test('widerrufen trifft einen Schlüssel mit feedback:agent', () => {
    expect(lauf('widerrufen', 'aras_fbk3')).toContain('widerrufen  aras_fbk3');
    expect(lauf('widerrufen', '3')).toContain('aras_fbk3');
  });

  test('widerrufen lässt fremde Schlüssel stehen', () => {
    expect(() => lauf('widerrufen', 'aras_flw4')).toThrow();
  });

  test('ein unbekannter Bereich wird abgewiesen und die Liste der erlaubten genannt', () => {
    let aus = '';
    try {
      lauf('anlegen', 'X', 'flow:run');
    } catch (fehler) {
      aus = fehler.stdout;
    }
    expect(aus).toContain('app:deploy, system:update, feedback:agent');
  });
});
