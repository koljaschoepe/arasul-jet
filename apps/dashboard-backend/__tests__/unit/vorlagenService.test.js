/**
 * Projekt-Vorlagen (Plan 014, Phase 1).
 *
 * Kernzusagen: (1) Die Galerie listet nur gültige Vorlagen und scheitert nie an
 * einer kaputten. (2) `wendeVorlageAn` kopiert den inhalt/-Baum mit `wx` —
 * vorhandene Nutzer-Dateien werden NIE überschrieben — und merkt Herkunft +
 * Version am Projekt. (3) Die mitgelieferte Vorlage „kunden-auftraege" ist
 * vollständig gültig (inkl. parsebarem Projekt-Flow).
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

jest.mock('../../src/database');
jest.mock('../../src/utils/logger');

const vorlagenService = require('../../src/services/projects/vorlagenService');
const { parseFlowFile } = require('../../src/services/flows/flowFile');

describe('vorlagenService', () => {
  let vorlagenDir;
  let projektDir;

  beforeEach(async () => {
    vorlagenDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'arasul-vorlagen-'));
    projektDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'arasul-projekt-'));
  });

  afterEach(() => {
    fs.rmSync(vorlagenDir, { recursive: true, force: true });
    fs.rmSync(projektDir, { recursive: true, force: true });
  });

  async function schreibeVorlage(id, meta, dateien = {}) {
    const wurzel = path.join(vorlagenDir, id);
    await fsp.mkdir(path.join(wurzel, 'inhalt'), { recursive: true });
    await fsp.writeFile(
      path.join(wurzel, 'vorlage.json'),
      JSON.stringify({ id, name: id, version: 1, ...meta })
    );
    for (const [rel, inhalt] of Object.entries(dateien)) {
      const ziel = path.join(wurzel, 'inhalt', rel);
      await fsp.mkdir(path.dirname(ziel), { recursive: true });
      await fsp.writeFile(ziel, inhalt);
    }
  }

  test('listet gültige Vorlagen und überspringt kaputte', async () => {
    await schreibeVorlage('crm', { name: 'Kunden & Aufträge', version: 3 });
    // Kaputt: id passt nicht zum Ordnernamen.
    await schreibeVorlage('defekt', { id: 'anders' });

    const vorlagen = await vorlagenService.listeVorlagen({ dir: vorlagenDir });
    expect(vorlagen.map(v => v.id)).toEqual(['crm']);
    expect(vorlagen[0]).toMatchObject({ name: 'Kunden & Aufträge', version: 3 });
    // Internes Kopier-Detail bleibt draußen.
    expect(vorlagen[0].ordner).toBeUndefined();
  });

  test('kopiert den inhalt-Baum, legt deklarierte Ordner an und merkt die Version', async () => {
    await schreibeVorlage(
      'crm',
      { version: 2, ordner: ['Kunden/Beispiel/Meetings'] },
      { 'Willkommen.md': 'Hallo', 'flows/angebot.md': 'x' }
    );
    const db = { query: jest.fn(async () => ({ rows: [] })) };

    const ergebnis = await vorlagenService.wendeVorlageAn('11111111-2222-3333-4444-555555555555', 'crm', {
      database: db,
      projektOrdner: async () => projektDir,
      vorlagenDir,
    });

    expect(ergebnis.kopiert.sort()).toEqual(['Willkommen.md', 'flows/angebot.md']);
    expect(fs.readFileSync(path.join(projektDir, 'Willkommen.md'), 'utf8')).toBe('Hallo');
    expect(fs.statSync(path.join(projektDir, 'Kunden/Beispiel/Meetings')).isDirectory()).toBe(true);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE projects SET vorlage_id'),
      ['crm', 2, '11111111-2222-3333-4444-555555555555']
    );
  });

  test('überschreibt NIE eine vorhandene Nutzer-Datei (wx)', async () => {
    await schreibeVorlage('crm', {}, { 'Willkommen.md': 'Vorlage' });
    await fsp.writeFile(path.join(projektDir, 'Willkommen.md'), 'MEINS');

    const ergebnis = await vorlagenService.wendeVorlageAn('11111111-2222-3333-4444-555555555555', 'crm', {
      database: { query: jest.fn(async () => ({ rows: [] })) },
      projektOrdner: async () => projektDir,
      vorlagenDir,
    });

    expect(ergebnis.kopiert).toEqual([]);
    expect(ergebnis.uebersprungen).toEqual(['Willkommen.md']);
    expect(fs.readFileSync(path.join(projektDir, 'Willkommen.md'), 'utf8')).toBe('MEINS');
  });

  test('unbekannte Vorlage → NotFound; unsaubere ID → Validation', async () => {
    await expect(
      vorlagenService.wendeVorlageAn('11111111-2222-3333-4444-555555555555', 'gibtsnicht', {
        database: { query: jest.fn() },
        projektOrdner: async () => projektDir,
        vorlagenDir,
      })
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(vorlagenService.getVorlage('../boese')).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  test('die mitgelieferte Vorlage „kunden-auftraege" ist gültig', async () => {
    const vorlagen = await vorlagenService.listeVorlagen();
    const crm = vorlagen.find(v => v.id === 'kunden-auftraege');
    expect(crm).toBeDefined();
    expect(crm.version).toBeGreaterThanOrEqual(1);

    // Der mitgelieferte Projekt-Flow muss parsebar sein — sonst landet ein
    // kaputter Flow in jedem neu angelegten CRM-Projekt.
    const flowDatei = path.join(
      vorlagenService.VORLAGEN_DIR,
      'kunden-auftraege',
      'inhalt',
      'flows',
      'angebot.md'
    );
    const text = fs.readFileSync(flowDatei, 'utf8');
    const flow = parseFlowFile(text, { name: 'angebot' });
    expect(flow.name).toBe('angebot');
    expect(flow.ausgabe.format).toBe('pdf');
  });
});
