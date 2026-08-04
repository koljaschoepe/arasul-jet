/**
 * Vorlagen-Updates (Plan 014, Phase 6).
 *
 * Kernzusagen: (1) Ein Projekt mit älterer Vorlagen-Version sieht die im
 * Projekt fehlenden Vorlagen-Dateien als Neuerungen. (2) Übernahme ist ADDITIV
 * (wx) — eine bestehende Nutzer-Datei wird NIE überschrieben. (3) Die Version
 * wird nur gehoben, wenn ALLE Neuerungen übernommen wurden. (4) Kein Update:
 * leeres Projekt, gleiche Version, entfernte Vorlage.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

jest.mock('../../src/database');
jest.mock('../../src/utils/logger');
jest.mock('../../src/services/projects/ordnerSyncService', () => ({ trigger: jest.fn() }));

const vorlagenUpdate = require('../../src/services/projects/vorlagenUpdate');

const PROJEKT = '11111111-2222-3333-4444-555555555555';

describe('vorlagenUpdate', () => {
  let vorlagenDir;
  let projektDir;

  beforeEach(async () => {
    vorlagenDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'arasul-vu-vorlagen-'));
    projektDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'arasul-vu-projekt-'));
  });
  afterEach(() => {
    fs.rmSync(vorlagenDir, { recursive: true, force: true });
    fs.rmSync(projektDir, { recursive: true, force: true });
  });

  async function vorlageMitInhalt(id, version, dateien) {
    const inhalt = path.join(vorlagenDir, id, 'inhalt');
    await fsp.mkdir(inhalt, { recursive: true });
    await fsp.writeFile(
      path.join(vorlagenDir, id, 'vorlage.json'),
      JSON.stringify({ id, name: id, version })
    );
    for (const [rel, txt] of Object.entries(dateien)) {
      const ziel = path.join(inhalt, rel);
      await fsp.mkdir(path.dirname(ziel), { recursive: true });
      await fsp.writeFile(ziel, txt);
    }
  }

  function deps(projektVersion, extra = {}) {
    return {
      database: {
        query: jest.fn(async sql => {
          if (sql.includes('SELECT vorlage_id')) {
            return { rows: [{ vorlage_id: 'crm', vorlage_version: projektVersion }] };
          }
          return { rows: [] };
        }),
      },
      projektOrdner: async () => projektDir,
      getVorlage: async () => {
        const meta = JSON.parse(await fsp.readFile(path.join(vorlagenDir, 'crm', 'vorlage.json')));
        return meta;
      },
      vorlagenDir,
      ...extra,
    };
  }

  test('neuere Version → fehlende Vorlagen-Dateien sind Neuerungen', async () => {
    await vorlageMitInhalt('crm', 2, {
      'Willkommen.md': 'alt',
      'flows/neu.md': 'neuer Flow',
      '_Vorlagen/Stil.md': 'neue Vorlage',
    });
    // Projekt hat Willkommen.md schon (aus v1), die anderen nicht.
    await fsp.writeFile(path.join(projektDir, 'Willkommen.md'), 'meine Version');

    const stand = await vorlagenUpdate.pruefeUpdate(PROJEKT, deps(1));
    expect(stand.update).toBe(true);
    expect(stand.neue_version).toBe(2);
    expect(stand.neuerungen.map(n => n.pfad).sort()).toEqual(['_Vorlagen/Stil.md', 'flows/neu.md']);
  });

  test('gleiche Version → kein Update', async () => {
    await vorlageMitInhalt('crm', 2, { 'x.md': 'x' });
    const stand = await vorlagenUpdate.pruefeUpdate(PROJEKT, deps(2));
    expect(stand.update).toBe(false);
    expect(stand.neue_version).toBe(2);
  });

  test('leer angelegtes Projekt (keine vorlage_id) → kein Update-Weg', async () => {
    const d = deps(null, {});
    d.database.query = jest.fn(async () => ({ rows: [{ vorlage_id: null, vorlage_version: null }] }));
    const stand = await vorlagenUpdate.pruefeUpdate(PROJEKT, d);
    expect(stand.update).toBe(false);
  });

  test('Übernahme ist additiv (wx): eigene Datei bleibt, Version steigt bei Voll-Übernahme', async () => {
    await vorlageMitInhalt('crm', 2, { 'flows/neu.md': 'FRISCH', 'A.md': 'A-Vorlage' });
    const d = deps(1);
    const stand = await vorlagenUpdate.pruefeUpdate(PROJEKT, d);
    const alle = stand.neuerungen.map(n => n.pfad);

    const res = await vorlagenUpdate.uebernehmeNeuerungen(PROJEKT, alle, d);
    expect(res.uebernommen.sort()).toEqual(['A.md', 'flows/neu.md']);
    expect(res.version).toBe(2);
    expect(fs.readFileSync(path.join(projektDir, 'flows/neu.md'), 'utf8')).toBe('FRISCH');
    // Version-Update wurde geschrieben.
    expect(d.database.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE projects SET vorlage_version'),
      [2, PROJEKT]
    );
  });

  test('Teil-Übernahme hebt die Version NICHT (Banner bleibt für den Rest)', async () => {
    await vorlageMitInhalt('crm', 2, { 'A.md': 'A', 'B.md': 'B' });
    const d = deps(1);
    const res = await vorlagenUpdate.uebernehmeNeuerungen(PROJEKT, ['A.md'], d);
    expect(res.uebernommen).toEqual(['A.md']);
    expect(res.version).toBe(1);
    expect(d.database.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE projects SET vorlage_version'),
      expect.anything()
    );
  });

  test('Pfad außerhalb der Vorlage (Angriff) wird abgewiesen', async () => {
    await vorlageMitInhalt('crm', 2, { 'A.md': 'A' });
    await expect(
      vorlagenUpdate.uebernehmeNeuerungen(PROJEKT, ['../ausbruch.md'], deps(1))
    ).rejects.toThrow(/keine Datei dieser Vorlage/);
  });

  test('ältere Image-Version als das Projekt (Downgrade) → kein Update', async () => {
    await vorlageMitInhalt('crm', 1, { 'x.md': 'x' });
    const stand = await vorlagenUpdate.pruefeUpdate(PROJEKT, deps(3));
    expect(stand.update).toBe(false);
    expect(stand.neue_version).toBe(1);
  });

  test('benigner Race: inzwischen selbst angelegte Datei wird übersprungen, Batch läuft weiter', async () => {
    await vorlageMitInhalt('crm', 2, { 'A.md': 'A-Vorlage', 'B.md': 'B-Vorlage' });
    // Der Nutzer hat A.md in der Zwischenzeit selbst angelegt.
    await fsp.writeFile(path.join(projektDir, 'A.md'), 'MEINE Version');
    const d = deps(1);
    // pruefeUpdate sieht A.md als vorhanden → nur B.md ist Neuerung; der Client
    // schickt beide (veralteter Dialog-Stand) — A.md wird per wx übersprungen.
    const res = await vorlagenUpdate.uebernehmeNeuerungen(PROJEKT, ['A.md', 'B.md'], d);
    expect(res.uebernommen).toEqual(['B.md']);
    expect(fs.readFileSync(path.join(projektDir, 'A.md'), 'utf8')).toBe('MEINE Version');
    // Alle angebotenen Neuerungen (nur B.md) waren gewählt → Version steigt.
    expect(res.version).toBe(2);
  });
});
