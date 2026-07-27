/**
 * Beispiel-Flows bei der Einrichtung (Plan 011, Schritt 18).
 *
 * Prüft: die mitgelieferten Vorlagen parsen sauber, werden in einen leeren
 * Ordner kopiert, und ein zweiter Lauf überschreibt eine vorhandene (evtl. vom
 * Nutzer bearbeitete) Datei NICHT.
 */

jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const { seedBeispielFlows, BEISPIELE_DIR } = require('../../src/services/flows/beispielSeed');
const { parseFlowFile } = require('../../src/services/flows/flowFile');

describe('Beispiel-Vorlagen', () => {
  it('sind gültige Flows (parsen gegen das Schema)', () => {
    const dateien = fs.readdirSync(BEISPIELE_DIR).filter(f => f.endsWith('.md'));
    expect(dateien.sort()).toEqual(
      ['dokument-zusammenfassen.md', 'erweiterung.md', 'execute.md', 'recherche.md', 'wissen.md'].sort()
    );
    for (const f of dateien) {
      const text = fs.readFileSync(path.join(BEISPIELE_DIR, f), 'utf8');
      expect(() => parseFlowFile(text, { name: f.replace(/\.md$/, '') })).not.toThrow();
    }
  });
});

describe('seedBeispielFlows', () => {
  let ziel;
  beforeEach(async () => {
    ziel = await fsp.mkdtemp(path.join(os.tmpdir(), 'flows-seed-'));
  });
  afterEach(async () => {
    await fsp.rm(ziel, { recursive: true, force: true });
  });

  it('legt alle Beispiele in einem leeren Ordner an', async () => {
    const angelegt = await seedBeispielFlows({ ziel });
    expect(angelegt.sort()).toEqual(
      ['dokument-zusammenfassen', 'erweiterung', 'execute', 'recherche', 'wissen'].sort()
    );
    expect(fs.readdirSync(ziel).sort()).toEqual(
      ['dokument-zusammenfassen.md', 'erweiterung.md', 'execute.md', 'recherche.md', 'wissen.md'].sort()
    );
  });

  it('überschreibt eine vorhandene Datei nicht (Nutzer-Bearbeitung bleibt)', async () => {
    await fsp.writeFile(path.join(ziel, 'wissen.md'), 'meine version', 'utf8');
    const angelegt = await seedBeispielFlows({ ziel });
    expect(angelegt).not.toContain('wissen');
    expect(fs.readFileSync(path.join(ziel, 'wissen.md'), 'utf8')).toBe('meine version');
    // Die anderen beiden kamen trotzdem dazu.
    expect(angelegt.sort()).toEqual(
      ['dokument-zusammenfassen', 'erweiterung', 'execute', 'recherche'].sort()
    );
  });

  it('legt den Zielordner an, wenn er fehlt', async () => {
    const tief = path.join(ziel, 'gibt', 'es', 'noch', 'nicht');
    await seedBeispielFlows({ ziel: tief });
    expect(fs.existsSync(path.join(tief, 'recherche.md'))).toBe(true);
  });
});
