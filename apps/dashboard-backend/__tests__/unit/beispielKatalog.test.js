/**
 * Beispiel-Flows als Katalog (Plan 023 B4).
 *
 * Bis zum 19.08.2026 kopierte der Start fünf Beispiel-Flows in den Flow-Ordner.
 * Entscheidung E6: ab Werk ist nichts enthalten. Aufgefallen ist die Lücke in
 * der Live-Abnahme des Werksresets: nach dem Reset war der Flow-Ordner leer,
 * nach dem Neustart standen wieder fünf Dateien darin.
 *
 * Diese Tests halten beides fest: der Katalog liefert die Vorlagen, und er legt
 * dabei keine Datei an.
 */

jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const {
  listeBeispiele,
  ladeBeispiel,
  BEISPIELE_DIR,
} = require('../../src/services/flows/beispielKatalog');

describe('Beispiel-Vorlagen', () => {
  it('sind gültige Flows (parsen gegen das Schema)', async () => {
    const beispiele = await listeBeispiele();
    const dateien = fs.readdirSync(BEISPIELE_DIR).filter(f => f.endsWith('.md'));

    expect(beispiele).toHaveLength(dateien.length);
    for (const beispiel of beispiele) {
      expect(beispiel.name).toMatch(/^[a-z0-9-]+$/);
      expect(beispiel.beschreibung.length).toBeGreaterThan(5);
      expect(beispiel.definition.systemPrompt.length).toBeGreaterThan(20);
    }
  });

  it('enthält die beiden Flows, die den Erweiterungs-Baukasten treiben', async () => {
    // Ohne die zwei hätte E6 wörtlich genommen den Zweck des Geräts getroffen:
    // der Baukasten ist der Grund, warum jemand es kauft.
    const namen = (await listeBeispiele()).map(b => b.name);
    expect(namen).toContain('erweiterung');
    expect(namen).toContain('execute');
  });

  it('liefert ein einzelnes Beispiel als fertige Definition', async () => {
    const definition = await ladeBeispiel('wissen');
    expect(definition.name).toBe('wissen');
    expect(definition.werkzeuge.length).toBeGreaterThan(0);
  });

  it('liefert null für einen unbekannten Namen', async () => {
    await expect(ladeBeispiel('gibtsnicht')).resolves.toBeNull();
  });
});

describe('Der Katalog legt nichts an', () => {
  let flowOrdner;

  beforeEach(async () => {
    flowOrdner = await fsp.mkdtemp(path.join(os.tmpdir(), 'flows-'));
    process.env.FLOWS_DIR = flowOrdner;
  });

  afterEach(async () => {
    await fsp.rm(flowOrdner, { recursive: true, force: true });
    delete process.env.FLOWS_DIR;
  });

  it('lässt den Flow-Ordner leer', async () => {
    // Der eigentliche Punkt von B4. Ein Werksreset stellt den
    // Auslieferungszustand her; würde hier wieder etwas angelegt, machte der
    // nächste Start ihn kaputt.
    await listeBeispiele();
    await ladeBeispiel('wissen');

    expect(await fsp.readdir(flowOrdner)).toEqual([]);
  });
});
