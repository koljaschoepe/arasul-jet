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

/**
 * Dieselbe Pruefung fuer die Mehrfach-Fassung. Sie wird beim Passwortwechsel
 * benutzt (routes/admin/settings.js) und hatte denselben Fehler: nur das erste
 * Vorkommen ersetzt. Ein Passwortwechsel haette Erfolg gemeldet, waehrend das
 * alte Passwort nach dem naechsten Neustart weiter gilt.
 */
describe('updateEnvVariables', () => {
  const { updateEnvVariables } = require('../../src/utils/envManager');

  test('ersetzt jedes Vorkommen jedes Schluessels', async () => {
    fs.readFile.mockResolvedValue(
      ['ADMIN_PASSWORD=alt', 'ADMIN_HASH=alt-hash', 'ADMIN_PASSWORD=auch-alt'].join('\n')
    );

    await updateEnvVariables({ ADMIN_PASSWORD: 'neu', ADMIN_HASH: 'neu-hash' });

    const datei = geschriebeneDatei();
    expect(datei).not.toMatch(/alt(-hash)?$/m);
    expect(datei.match(/^ADMIN_PASSWORD=neu$/gm)).toHaveLength(2);
    expect(datei).toContain('ADMIN_HASH=neu-hash');
  });

  test('haengt fehlende Schluessel an, ohne vorhandene zu verlieren', async () => {
    fs.readFile.mockResolvedValue('VORHANDEN=ja\n');

    await updateEnvVariables({ VORHANDEN: 'immer-noch', NEU: 'dazu' });

    const datei = geschriebeneDatei();
    expect(datei).toContain('VORHANDEN=immer-noch');
    expect(datei).toContain('NEU=dazu');
  });
});

describe('Sicherung im Speicher statt auf der Platte (23.08.2026)', () => {
  const { backupEnvFile, envZurueckrollen } = require('../../src/utils/envManager');

  /**
   * `.env` ist als EINZELNE Datei eingehaengt. `/arasul/config` gibt es im
   * Container nur als Halterung dafuer, gehoert `root` und ist fuer das
   * Backend nicht beschreibbar. Eine Sicherung als NACHBARDATEI kann dort nie
   * entstehen, und der Passwortwechsel rief genau das als ERSTES auf:
   *
   *   EACCES: permission denied, copyfile
   *   '/arasul/config/.env' -> '/arasul/config/.env.backup.…'
   *
   * Jeder Passwortwechsel endete deshalb mit HTTP 500. Am Geraet nachgesehen:
   * die einzigen zwei `.env.backup.*` stammen vom 14.03.2026 und aus einem
   * Host-Skript, an der Namensform erkennbar. Diese Funktion hat nie eine
   * Sicherung erzeugt.
   */
  test('backupEnvFile liefert den Inhalt und schreibt NICHTS', async () => {
    fs.readFile.mockResolvedValue('A=1\nB=2\n');
    const inhalt = await backupEnvFile();
    expect(inhalt).toBe('A=1\nB=2\n');
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  test('es gibt kein copyFile mehr, das an einer Halterung scheitern koennte', () => {
    // Die Attrappe kennt nur readFile und writeFile. Ein `fs.copyFile` im
    // Modul wuerde hier als "is not a function" auffallen, und genau das war
    // der Fehler.
    expect(fs.copyFile).toBeUndefined();
  });

  test('envZurueckrollen schreibt den gesicherten Stand zurueck', async () => {
    expect(await envZurueckrollen('A=1\n')).toBe(true);
    expect(fs.writeFile.mock.calls[0][1]).toBe('A=1\n');
  });

  test('envZurueckrollen wirft nie, auch nicht ohne Inhalt', async () => {
    await expect(envZurueckrollen('')).resolves.toBe(false);
    await expect(envZurueckrollen(null)).resolves.toBe(false);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  test('envZurueckrollen schluckt einen Schreibfehler, statt den ersten zu verdecken', async () => {
    fs.writeFile.mockRejectedValueOnce(new Error('Platte voll'));
    await expect(envZurueckrollen('A=1\n')).resolves.toBe(false);
  });
});
