/**
 * Welches Modell ein Bild liest (Plan 023 D5).
 *
 * Bis zum 21.08.2026 entschied allein `supports_vision_input`, und das war zu
 * eng: `llava-phi3` traegt `model_type = 'vision'`, aber die Spalte steht auf
 * false, obwohl Ollama ihm die Faehigkeit `vision` bescheinigt. Auf dem Orin
 * blieb dadurch GENAU EIN Bewerber uebrig, `gemma4:e4b-q4`, und der wird
 * ausgeschlossen, sobald er selbst das Chatmodell ist. Dann gab es fuer ein
 * Foto gar nichts.
 *
 * Geprueft wird hier die Abfrage: welche Zeilen sie zulaesst und in welcher
 * Reihenfolge. Die Rangfolge selbst rechnet Postgres, deshalb steht sie im
 * SQL und wird hier auf ihre Bestandteile geprueft.
 */

const { findVisionFallbackModel } = require('../../src/services/llm/llmJobProcessor');

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

function datenbank(zeilen) {
  return { query: jest.fn().mockResolvedValue({ rows: zeilen }) };
}

describe('findVisionFallbackModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('nimmt, was die Abfrage zuerst liefert', async () => {
    const db = datenbank([{ id: 'minicpm-v:8b', ollama_name: 'minicpm-v:8b', ram_required_gb: 7 }]);

    await expect(findVisionFallbackModel(db, 'qwen3-coder:30b', logger)).resolves.toEqual({
      id: 'minicpm-v:8b',
      ollama_name: 'minicpm-v:8b',
      ram_required_gb: 7,
    });
  });

  test('laesst die Aufgabe zu, nicht nur die alte Faehigkeitsspalte', async () => {
    // Genau der Fall llava-phi3: task = vision, supports_vision_input = false.
    const db = datenbank([]);
    await findVisionFallbackModel(db, 'x', logger);

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("c.task = 'vision' OR c.supports_vision_input = true");
  });

  test('der Standard der Aufgabe steht vorn, dann die Aufgabe, dann die Groesse', async () => {
    const db = datenbank([]);
    await findVisionFallbackModel(db, 'x', logger);

    const [sql] = db.query.mock.calls[0];
    const rang = sql.slice(sql.indexOf('ORDER BY'));
    expect(rang.indexOf('is_task_default')).toBeLessThan(rang.indexOf("(c.task = 'vision') DESC"));
    expect(rang.indexOf("(c.task = 'vision') DESC")).toBeLessThan(rang.indexOf('ram_required_gb'));
  });

  test('schliesst das Chatmodell aus, sonst waere der Wechsel keiner', async () => {
    const db = datenbank([]);
    await findVisionFallbackModel(db, 'gemma4:e4b-q4', logger);

    const [sql, werte] = db.query.mock.calls[0];
    expect(sql).toContain('c.id <> $1');
    expect(werte).toEqual(['gemma4:e4b-q4']);
  });

  test('fragt nur nach installierten Modellen', async () => {
    const db = datenbank([]);
    await findVisionFallbackModel(db, 'x', logger);

    expect(db.query.mock.calls[0][0]).toContain("i.status = 'available'");
  });

  test('gibt null, wenn nichts uebrig bleibt, statt zu raten', async () => {
    const db = datenbank([]);
    await expect(findVisionFallbackModel(db, 'x', logger)).resolves.toBeNull();
  });

  test('ohne Chatmodell wird die leere Zeichenkette gebunden, nicht undefined', async () => {
    const db = datenbank([]);
    await findVisionFallbackModel(db, null, logger);
    expect(db.query.mock.calls[0][1]).toEqual(['']);
  });

  test('ein Datenbankfehler gibt null und eine Warnung, nicht einen Absturz', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('keine Verbindung')) };

    await expect(findVisionFallbackModel(db, 'x', logger)).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('keine Verbindung'));
  });
});
