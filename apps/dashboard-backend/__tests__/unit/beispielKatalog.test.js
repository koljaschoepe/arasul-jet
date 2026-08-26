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
  /**
   * Der eigentliche Punkt von B4, und er muss auch dann noch greifen, wenn
   * jemand hier spaeter wieder etwas schreiben laesst. Ein Test, der einen
   * fremden Ordner leer findet, waere keiner: er ginge auch durch, wenn das
   * Modul nach /arasul/flows schriebe.
   *
   * Deshalb an der Quelle: waehrend die beiden Lesefunktionen laufen, darf
   * keine schreibende fs-Funktion aufgerufen werden.
   */
  const SCHREIBENDE = ['writeFile', 'mkdir', 'appendFile', 'rm', 'unlink', 'copyFile', 'rename'];

  it('ruft keine einzige schreibende Dateifunktion auf', async () => {
    const spione = SCHREIBENDE.map(name => jest.spyOn(fsp, name));

    await listeBeispiele();
    await ladeBeispiel('wissen');
    await ladeBeispiel('gibtsnicht');

    for (const spion of spione) {
      expect(spion).not.toHaveBeenCalled();
      spion.mockRestore();
    }
  });

  it('liest fuer ein einzelnes Beispiel nur dessen Datei', async () => {
    const spion = jest.spyOn(fsp, 'readFile');

    await ladeBeispiel('wissen');

    expect(spion).toHaveBeenCalledTimes(1);
    expect(spion.mock.calls[0][0]).toMatch(/wissen\.md$/);
    spion.mockRestore();
  });

  it('faellt nicht auf einen Namen herein, der aus dem Ordner fuehrt', async () => {
    await expect(ladeBeispiel('../../../etc/passwd')).resolves.toBeNull();
    await expect(ladeBeispiel('../beispielKatalog')).resolves.toBeNull();
  });
});
