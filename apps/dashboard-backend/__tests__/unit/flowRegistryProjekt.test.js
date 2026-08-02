/**
 * Projektgebundene Flows in der Registry (Plan 014, Phase 1).
 *
 * Kernzusagen: (1) Ein Flow im `flows/`-Ordner eines Projekts wird über
 * `{ projektId }` gefunden und ist sauber vom globalen Namensraum getrennt
 * (gleicher Name, verschiedene Definitionen). (2) Das bloße Auflisten legt
 * KEINEN `flows/`-Ordner im Projekt an. (3) Eine unsaubere Projekt-ID wird
 * abgewiesen, bevor sie Teil eines Pfads wird.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

// Beide Wurzeln müssen VOR dem Laden der Registry stehen — FLOWS_DIR wird beim
// Import gelesen; PROJECT_GIT_DIR bewusst erst pro Aufruf (dirFor).
const TMP_FLOWS = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-flows-'));
const TMP_PROJECTS = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-projects-'));
process.env.FLOWS_DIR = TMP_FLOWS;
process.env.PROJECT_GIT_DIR = TMP_PROJECTS;

jest.mock('../../src/utils/logger');

const registry = require('../../src/services/flows/flowRegistry');

const PROJEKT = '11111111-2222-3333-4444-555555555555';

function flowDatei(beschreibung) {
  return `---\nname: angebot\nbeschreibung: ${beschreibung}\n---\nTu etwas.\n`;
}

describe('flowRegistry — projektgebundene Flows', () => {
  beforeEach(() => {
    registry.clearCache();
    for (const wurzel of [TMP_FLOWS, TMP_PROJECTS]) {
      for (const f of fs.readdirSync(wurzel)) {
        fs.rmSync(path.join(wurzel, f), { recursive: true, force: true });
      }
    }
  });

  afterAll(() => {
    fs.rmSync(TMP_FLOWS, { recursive: true, force: true });
    fs.rmSync(TMP_PROJECTS, { recursive: true, force: true });
  });

  test('lädt einen Projekt-Flow getrennt vom globalen gleichen Namens', async () => {
    fs.writeFileSync(path.join(TMP_FLOWS, 'angebot.md'), flowDatei('global'));
    const projektFlows = path.join(TMP_PROJECTS, PROJEKT, 'flows');
    fs.mkdirSync(projektFlows, { recursive: true });
    fs.writeFileSync(path.join(projektFlows, 'angebot.md'), flowDatei('projekt'));

    const global = await registry.loadFlow('angebot');
    const projekt = await registry.loadFlow('angebot', { projektId: PROJEKT });
    expect(global.beschreibung).toBe('global');
    expect(projekt.beschreibung).toBe('projekt');

    const liste = await registry.listFlows({ projektId: PROJEKT });
    expect(liste.flows.map(f => f.name)).toEqual(['angebot']);
    expect(liste.flows[0].beschreibung).toBe('projekt');
  });

  test('fehlender Projekt-Flow → NotFound, auch wenn er global existiert', async () => {
    fs.writeFileSync(path.join(TMP_FLOWS, 'angebot.md'), flowDatei('global'));
    await expect(registry.loadFlow('angebot', { projektId: PROJEKT })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  test('Auflisten legt keinen flows/-Ordner im Projekt an', async () => {
    fs.mkdirSync(path.join(TMP_PROJECTS, PROJEKT), { recursive: true });
    const liste = await registry.listFlows({ projektId: PROJEKT });
    expect(liste.flows).toEqual([]);
    expect(fs.existsSync(path.join(TMP_PROJECTS, PROJEKT, 'flows'))).toBe(false);
  });

  test('speichert und löscht im Projekt, ohne den globalen Flow zu berühren', async () => {
    fs.writeFileSync(path.join(TMP_FLOWS, 'angebot.md'), flowDatei('global'));
    await registry.saveFlow(
      { name: 'angebot', beschreibung: 'projekt', systemPrompt: 'Tu etwas.' },
      { projektId: PROJEKT }
    );
    expect(fs.existsSync(path.join(TMP_PROJECTS, PROJEKT, 'flows', 'angebot.md'))).toBe(true);

    await registry.deleteFlow('angebot', { projektId: PROJEKT });
    expect(fs.existsSync(path.join(TMP_PROJECTS, PROJEKT, 'flows', 'angebot.md'))).toBe(false);
    // Der globale Namensvetter lebt noch.
    await expect(registry.loadFlow('angebot')).resolves.toMatchObject({ beschreibung: 'global' });
  });

  test('weist eine unsaubere Projekt-ID ab (Pfad-Sperre)', async () => {
    await expect(registry.loadFlow('angebot', { projektId: '../../etc' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
