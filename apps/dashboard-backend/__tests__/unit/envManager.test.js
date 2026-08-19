/**
 * envManager (Plan 023 B5, Nacharbeit aus der Live-Abnahme).
 *
 * Am 19.08.2026 auf dem Geraet: die .env enthielt ADMIN_PASSWORD zweimal, in
 * Zeile 19 und noch einmal in Zeile 169. dotenv laesst das spaetere Vorkommen
 * gewinnen, ersetzt wurde aber nur das erste. Der Werksreset hat das
 * Erstpasswort damit zu entwerten geglaubt, und der naechste Start hat den
 * alten Zugang mit dem alten Passwort wieder angelegt. Aufgefallen ist es nur,
 * weil die Abnahme nach dem Neustart nachgesehen hat.
 */

const fs = require('fs').promises;

jest.mock('fs', () => ({ promises: { readFile: jest.fn(), writeFile: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { updateEnvVariable } = require('../../src/utils/envManager');

function geschriebeneDatei() {
  return fs.writeFile.mock.calls[0][1];
}

beforeEach(() => {
  fs.readFile.mockReset();
  fs.writeFile.mockReset();
  fs.writeFile.mockResolvedValue(undefined);
});

test('ersetzt JEDES Vorkommen, nicht nur das erste', async () => {
  fs.readFile.mockResolvedValue(
    ['ADMIN_USERNAME=arasul', 'ADMIN_PASSWORD=geheim', '', '# spaeter angehaengt', 'ADMIN_PASSWORD=auch-geheim', ''].join('\n')
  );

  await updateEnvVariable('ADMIN_PASSWORD', 'REDACTED_AFTER_BOOTSTRAP');

  const datei = geschriebeneDatei();
  expect(datei).not.toContain('geheim');
  expect(datei.match(/^ADMIN_PASSWORD=REDACTED_AFTER_BOOTSTRAP$/gm)).toHaveLength(2);
});

test('laesst andere Schluessel und Kommentare in Ruhe', async () => {
  fs.readFile.mockResolvedValue(
    ['# Kopf', 'ADMIN_PASSWORD=geheim', 'POSTGRES_PASSWORD=anders', 'MEIN_ADMIN_PASSWORD=fremd'].join('\n')
  );

  await updateEnvVariable('ADMIN_PASSWORD', 'neu');

  const datei = geschriebeneDatei();
  expect(datei).toContain('POSTGRES_PASSWORD=anders');
  expect(datei).toContain('MEIN_ADMIN_PASSWORD=fremd');
  expect(datei).toContain('# Kopf');
  expect(datei).toContain('ADMIN_PASSWORD=neu');
});

test('haengt einen fehlenden Schluessel an', async () => {
  fs.readFile.mockResolvedValue('ADMIN_USERNAME=arasul\n');

  await updateEnvVariable('NEUER_SCHLUESSEL', 'wert');

  expect(geschriebeneDatei()).toContain('NEUER_SCHLUESSEL=wert');
});
