/**
 * Kunden-Steckbrief-Index (Plan 014, Phase 3).
 *
 * Kernzusagen: (1) Die Übersicht liest die Kernfelder direkt aus den
 * Steckbrief-Tabellen von der Platte. (2) Ein Kunde ohne (oder mit kaputtem)
 * Steckbrief erscheint trotzdem — mit dem Ordnernamen als Firma. (3) Leere
 * Platzhalter-Werte ([…], —, …) zählen nicht als Daten.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

jest.mock('../../src/database');
jest.mock('../../src/utils/logger');

const { listeKunden, parseSteckbrief } = require('../../src/services/projects/steckbriefIndex');

describe('parseSteckbrief', () => {
  test('liest die Kernfelder aus der Markdown-Tabelle', () => {
    const text = [
      '# Steckbrief: Beispiel GmbH',
      '',
      '| Feld            | Wert                    |',
      '| --------------- | ----------------------- |',
      '| Firma           | Beispiel GmbH           |',
      '| Webseite        | https://www.beispiel.de |',
      '| E-Mail          | max@beispiel.de         |',
      '| Status          | Interessent             |',
      '| Letzter Kontakt | 2026-08-01              |',
    ].join('\n');
    expect(parseSteckbrief(text)).toEqual({
      firma: 'Beispiel GmbH',
      webseite: 'https://www.beispiel.de',
      email: 'max@beispiel.de',
      status: 'Interessent',
      letzter_kontakt: '2026-08-01',
    });
  });

  test('Platzhalter-Werte ([…], —, …) zählen nicht als Daten', () => {
    const text = ['| Firma | [Firmenname] |', '| Status | — |', '| Telefon | … |'].join('\n');
    expect(parseSteckbrief(text)).toEqual({});
  });
});

describe('listeKunden', () => {
  let wurzel;

  beforeEach(async () => {
    wurzel = await fsp.mkdtemp(path.join(os.tmpdir(), 'arasul-kunden-'));
  });
  afterEach(() => {
    fs.rmSync(wurzel, { recursive: true, force: true });
  });

  const deps = () => ({ projektOrdner: async () => wurzel });

  test('listet Kunden mit und ohne Steckbrief, sortiert nach Firma', async () => {
    await fsp.mkdir(path.join(wurzel, 'Kunden', 'Zeta AG'), { recursive: true });
    await fsp.mkdir(path.join(wurzel, 'Kunden', 'Alpha GmbH'), { recursive: true });
    await fsp.writeFile(
      path.join(wurzel, 'Kunden', 'Alpha GmbH', 'Steckbrief.md'),
      '| Firma | Alpha GmbH |\n| Status | Kunde |\n| Letzter Kontakt | 2026-07-30 |'
    );

    const { kunden } = await listeKunden('p1', deps());
    expect(kunden.map(k => k.firma)).toEqual(['Alpha GmbH', 'Zeta AG']);
    expect(kunden[0]).toMatchObject({
      status: 'Kunde',
      letzter_kontakt: '2026-07-30',
      steckbrief_pfad: 'Kunden/Alpha GmbH/Steckbrief.md',
    });
    // Ohne Steckbrief: Ordnername als Firma, kein steckbrief_pfad.
    expect(kunden[1]).toMatchObject({ firma: 'Zeta AG', steckbrief_pfad: null, status: null });
  });

  test('ohne Kunden-Ordner: leere Liste (kein Fehler)', async () => {
    const { kunden } = await listeKunden('p1', deps());
    expect(kunden).toEqual([]);
  });

  test('Dateien und Punkt-Ordner unter Kunden/ werden übersprungen', async () => {
    await fsp.mkdir(path.join(wurzel, 'Kunden', '.versteckt'), { recursive: true });
    await fsp.writeFile(path.join(wurzel, 'Kunden', 'notiz.md'), 'x');
    await fsp.mkdir(path.join(wurzel, 'Kunden', 'Echt GmbH'), { recursive: true });

    const { kunden } = await listeKunden('p1', deps());
    expect(kunden.map(k => k.ordner)).toEqual(['Echt GmbH']);
  });
});
