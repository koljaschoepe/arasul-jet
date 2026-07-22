/**
 * Beispiel-Skills bei der Einrichtung (Plan 011, Schritt 18).
 *
 * Prüft: die drei mitgelieferten Vorlagen parsen sauber, werden in einen leeren
 * Ordner kopiert, und ein zweiter Lauf überschreibt eine vorhandene (evtl. vom
 * Nutzer bearbeitete) Datei NICHT.
 */

jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const { seedBeispielSkills, BEISPIELE_DIR } = require('../../src/services/skills/beispielSeed');
const { parseSkillFile } = require('../../src/services/skills/skillFile');

describe('Beispiel-Vorlagen', () => {
  it('sind gültige Skills (parsen gegen das Schema)', () => {
    const dateien = fs.readdirSync(BEISPIELE_DIR).filter(f => f.endsWith('.md'));
    expect(dateien.sort()).toEqual(
      ['dokument-zusammenfassen.md', 'recherche.md', 'wissen.md'].sort()
    );
    for (const f of dateien) {
      const text = fs.readFileSync(path.join(BEISPIELE_DIR, f), 'utf8');
      expect(() => parseSkillFile(text, { name: f.replace(/\.md$/, '') })).not.toThrow();
    }
  });
});

describe('seedBeispielSkills', () => {
  let ziel;
  beforeEach(async () => {
    ziel = await fsp.mkdtemp(path.join(os.tmpdir(), 'skills-seed-'));
  });
  afterEach(async () => {
    await fsp.rm(ziel, { recursive: true, force: true });
  });

  it('legt alle drei Beispiele in einem leeren Ordner an', async () => {
    const angelegt = await seedBeispielSkills({ ziel });
    expect(angelegt.sort()).toEqual(['dokument-zusammenfassen', 'recherche', 'wissen'].sort());
    expect(fs.readdirSync(ziel).sort()).toEqual(
      ['dokument-zusammenfassen.md', 'recherche.md', 'wissen.md'].sort()
    );
  });

  it('überschreibt eine vorhandene Datei nicht (Nutzer-Bearbeitung bleibt)', async () => {
    await fsp.writeFile(path.join(ziel, 'wissen.md'), 'meine version', 'utf8');
    const angelegt = await seedBeispielSkills({ ziel });
    expect(angelegt).not.toContain('wissen');
    expect(fs.readFileSync(path.join(ziel, 'wissen.md'), 'utf8')).toBe('meine version');
    // Die anderen beiden kamen trotzdem dazu.
    expect(angelegt.sort()).toEqual(['dokument-zusammenfassen', 'recherche'].sort());
  });

  it('legt den Zielordner an, wenn er fehlt', async () => {
    const tief = path.join(ziel, 'gibt', 'es', 'noch', 'nicht');
    await seedBeispielSkills({ ziel: tief });
    expect(fs.existsSync(path.join(tief, 'recherche.md'))).toBe(true);
  });
});
