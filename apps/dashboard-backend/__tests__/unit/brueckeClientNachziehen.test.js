/**
 * Die Bruecken-Bibliothek erreicht auch eine Werkstatt, die es schon gibt
 * (23.08.2026).
 *
 * `seedWerkstattTemplates` kopiert mit `force: false` und ueberschreibt nie.
 * Das ist fuer alles richtig, was der Nutzer anfasst, und war fuer genau eine
 * Datei falsch: `arasul-bruecke.js` ist unsere Bibliothek. Als H1 der Bruecke
 * `netz`, `tabellen` und `zeitplan` gab, blieb in jeder bestehenden Werkstatt
 * die alte Fassung liegen. Und weil ein gebautes Paket seine Kopie IN SICH
 * traegt, waere der Fehler in jede dort gebaute App mitgewandert.
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-minimum-32-chars';

const os = require('os');
const fs = require('fs');
const path = require('path');

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/database', () => ({ query: jest.fn(), transaction: jest.fn() }));

const VORLAGEN = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-vorlagen-'));
process.env.SANDBOX_DEV_TEMPLATES_DIR = VORLAGEN;

const sandboxService = require('../../src/services/sandbox/sandboxService');

const NEU = 'window.ArasulBruecke = { netz: 1 };';
let werkstatt;

beforeAll(() => {
  fs.writeFileSync(path.join(VORLAGEN, 'arasul-bruecke.js'), NEU);
  fs.writeFileSync(path.join(VORLAGEN, 'ANLEITUNG.md'), '# neu');
});

beforeEach(() => {
  werkstatt = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-werkstatt-'));
});

afterEach(() => {
  fs.rmSync(werkstatt, { recursive: true, force: true });
});

afterAll(() => {
  fs.rmSync(VORLAGEN, { recursive: true, force: true });
});

describe('aktualisiereBrueckeClient', () => {
  it('ersetzt eine alte Fassung in der Werkstatt', () => {
    fs.writeFileSync(path.join(werkstatt, 'arasul-bruecke.js'), 'alt');
    sandboxService.aktualisiereBrueckeClient(werkstatt);
    expect(fs.readFileSync(path.join(werkstatt, 'arasul-bruecke.js'), 'utf8')).toBe(NEU);
  });

  it('erreicht auch die Beispielordner darin', () => {
    // Ein Paket traegt seine Kopie in sich — die Vorlage muss deshalb mit.
    const bsp = path.join(werkstatt, 'beispiel-app');
    fs.mkdirSync(bsp);
    fs.writeFileSync(path.join(bsp, 'arasul-bruecke.js'), 'alt');
    sandboxService.aktualisiereBrueckeClient(werkstatt);
    expect(fs.readFileSync(path.join(bsp, 'arasul-bruecke.js'), 'utf8')).toBe(NEU);
  });

  it('legt die Datei in einem Ordner OHNE sie nicht an', () => {
    // Sonst laege die Bibliothek in jedem selbst gebauten Unterordner, auch in
    // solchen, die gar keine Erweiterung sind.
    const eigen = path.join(werkstatt, 'meine-notizen');
    fs.mkdirSync(eigen);
    sandboxService.aktualisiereBrueckeClient(werkstatt);
    expect(fs.existsSync(path.join(eigen, 'arasul-bruecke.js'))).toBe(false);
  });

  it('laesst andere Dateien unangetastet', () => {
    fs.writeFileSync(path.join(werkstatt, 'ANLEITUNG.md'), 'meine eigene Fassung');
    fs.writeFileSync(path.join(werkstatt, 'arasul-bruecke.js'), 'alt');
    sandboxService.aktualisiereBrueckeClient(werkstatt);
    expect(fs.readFileSync(path.join(werkstatt, 'ANLEITUNG.md'), 'utf8')).toBe('meine eigene Fassung');
  });

  it('bricht nicht, wenn es die Vorlage nicht gibt, und laesst dann alles stehen', () => {
    // `SANDBOX_DEV_TEMPLATES_DIR` wird beim Modul-Load in eine Konstante
    // gelesen; ein Umsetzen der Variablen im Test wuerde nichts pruefen.
    // Deshalb die Vorlage selbst wegnehmen.
    const quelle = path.join(VORLAGEN, 'arasul-bruecke.js');
    fs.writeFileSync(path.join(werkstatt, 'arasul-bruecke.js'), 'alt');
    fs.rmSync(quelle);
    expect(() => sandboxService.aktualisiereBrueckeClient(werkstatt)).not.toThrow();
    expect(fs.readFileSync(path.join(werkstatt, 'arasul-bruecke.js'), 'utf8')).toBe('alt');
    fs.writeFileSync(quelle, NEU);
  });
});
