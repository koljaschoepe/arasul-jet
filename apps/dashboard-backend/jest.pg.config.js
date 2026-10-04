/**
 * Jest fuer die Reihe gegen ein ECHTES Postgres (`__tests__/pg/`, M5).
 *
 * Dieselbe Einrichtung wie die normale Reihe (`jest` in package.json: Setup,
 * Umgebung, Modul-Zuordnungen), aber nur diese Dateien, ohne die
 * Abdeckungsschwellen -- eine Handvoll Wege erreicht sie nie, und darum geht
 * es hier nicht. Die normale Reihe schliesst `__tests__/pg/` aus
 * (`testPathIgnorePatterns`), weil dort keine Datenbank steht.
 *
 * Aufruf: `npm run test:pg` mit `ARASUL_PG_TEST_URL`, oder alles in einem
 * mit `bash scripts/test/migrationskette.sh --reihe`.
 */
// eslint-disable-next-line no-unused-vars
const { coverageThreshold, testPathIgnorePatterns, ...basis } = require('./package.json').jest;

module.exports = {
  ...basis,
  testMatch: ['<rootDir>/__tests__/pg/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  // Die Tests bauen aufeinander auf. Wird einer rot, koennen die folgenden
  // mitten im Aufbau einer Anfrage scheitern, und supertest laesst dann seinen
  // Lauscher offen: Jest wartete ewig, und der CI-Job mit ihm (gemessen beim
  // Rot-Beweis am 05.10.2026). Ein roter Lauf soll rot ENDEN.
  forceExit: true,
};
