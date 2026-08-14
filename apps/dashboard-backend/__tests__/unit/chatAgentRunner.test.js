/**
 * Chat-Agent (2026-07-28): Streaming-Runde über /api/chat.
 *
 * Getestet wird der NDJSON-Parser der Runde: Antwort-Token fließen über
 * onToken, tool_calls werden gesammelt, ein `error`-Frame bricht ab. Der
 * Ollama-Stream ist ein PassThrough — kein echtes Netz, keine GPU.
 */

const { PassThrough } = require('stream');

jest.mock('axios');
const axios = require('axios');

const { streamChatRound } = require('../../src/services/llm/chatAgentRunner');

function fakeStream(lines) {
  const stream = new PassThrough();
  process.nextTick(() => {
    for (const line of lines) {
      stream.write(`${JSON.stringify(line)}\n`);
    }
    stream.end();
  });
  return stream;
}

describe('chatAgentRunner.streamChatRound', () => {
  test('streamt Antwort-Token und liefert den Gesamt-Inhalt', async () => {
    axios.post.mockResolvedValueOnce({
      data: fakeStream([
        { message: { content: 'Hallo ' } },
        { message: { content: 'Welt' } },
        { message: {}, done: true },
      ]),
    });

    const tokens = [];
    const { content, toolCalls } = await streamChatRound({
      model: 'qwen3:8b',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      onToken: t => tokens.push(t),
    });

    expect(content).toBe('Hallo Welt');
    expect(tokens).toEqual(['Hallo ', 'Welt']);
    expect(toolCalls).toEqual([]);
  });

  test('sammelt tool_calls aus dem Stream', async () => {
    const call = { function: { name: 'rag_suche', arguments: { frage: 'Bachelorarbeit' } } };
    axios.post.mockResolvedValueOnce({
      data: fakeStream([{ message: { tool_calls: [call] } }, { message: {}, done: true }]),
    });

    const { content, toolCalls } = await streamChatRound({
      model: 'qwen3:8b',
      messages: [],
      tools: [{ type: 'function', function: { name: 'rag_suche' } }],
      onToken: () => {},
    });

    expect(content).toBe('');
    expect(toolCalls).toEqual([call]);
  });

  test('ein error-Frame bricht die Runde mit Fehler ab', async () => {
    axios.post.mockResolvedValueOnce({
      data: fakeStream([{ error: 'model "x" does not support tools' }]),
    });

    await expect(
      streamChatRound({ model: 'x', messages: [], tools: [], onToken: () => {} })
    ).rejects.toThrow(/does not support tools/);
  });
});

describe('verstaendlicherFehler (Agent-UX 2026-08-02)', () => {
  const { verstaendlicherFehler } = require('../../src/services/llm/chatAgentRunner');

  test('übersetzt Timeout, Verbindungs-, Modell- und Speicherfehler in Alltagssprache', () => {
    expect(verstaendlicherFehler(new Error('Modell-Stream 120s ohne Daten — abgebrochen'))).toMatch(
      /zu lange nicht geantwortet/
    );
    expect(verstaendlicherFehler(new Error('connect ECONNREFUSED 127.0.0.1:11434'))).toMatch(
      /nicht erreichbar/
    );
    expect(verstaendlicherFehler(new Error('model "qwen9" not found'))).toMatch(/nicht geladen/);
    expect(verstaendlicherFehler(new Error('CUDA out of memory'))).toMatch(/Speicher/);
  });

  test('unbekannte Fehler behalten eine gekürzte technische Spur', () => {
    const text = verstaendlicherFehler(new Error('irgendwas Exotisches'));
    expect(text).toMatch(/unerwartet gescheitert/);
    expect(text).toContain('irgendwas Exotisches');
  });
});

describe('aktiveTaskIndexAus (Plan 019: Schritte gruppiert unter der Aufgabe)', () => {
  const { aktiveTaskIndexAus } = require('../../src/services/llm/chatAgentRunner');

  test('bevorzugt die laufende Aufgabe', () => {
    expect(
      aktiveTaskIndexAus([
        { text: 'A', status: 'fertig' },
        { text: 'B', status: 'laeuft' },
        { text: 'C', status: 'offen' },
      ])
    ).toBe(1);
  });

  test('fällt auf die erste offene Aufgabe zurück, wenn keine läuft', () => {
    expect(
      aktiveTaskIndexAus([
        { text: 'A', status: 'fertig' },
        { text: 'B', status: 'offen' },
        { text: 'C', status: 'offen' },
      ])
    ).toBe(1);
  });

  test('liefert null, wenn alles fertig oder die Liste leer/ungültig ist', () => {
    expect(aktiveTaskIndexAus([{ text: 'A', status: 'fertig' }])).toBeNull();
    expect(aktiveTaskIndexAus([])).toBeNull();
    expect(aktiveTaskIndexAus(undefined)).toBeNull();
    expect(aktiveTaskIndexAus(null)).toBeNull();
  });
});

describe('deriveRoots (Plan 019 · Phase 2: strenge Ordner-Bindung)', () => {
  const path = require('path');
  const { deriveRoots } = require('../../src/services/llm/chatAgentRunner');
  const WURZEL = path.join('/arasul', 'projects', 'p1');

  test('ohne Anhang: Projektablage bleibt die (einzige) Wurzel', () => {
    const r = deriveRoots(WURZEL, undefined);
    expect(r).toEqual({ arbeitsOrdner: WURZEL, zielPrefix: '', roots: [WURZEL], scoped: false });
  });

  test('mit Anhang: der Ordner IST die Wurzel — kein Ausweichen aufs Projekt', () => {
    const r = deriveRoots(WURZEL, 'UNIT IX GmbH');
    const ziel = path.join(WURZEL, 'UNIT IX GmbH');
    expect(r.arbeitsOrdner).toBe(ziel);
    expect(r.zielPrefix).toBe('UNIT IX GmbH');
    expect(r.scoped).toBe(true);
    // STRENG: genau der eine Ordner, die Projektwurzel ist NICHT erreichbar.
    expect(r.roots).toEqual([ziel]);
    expect(r.roots).not.toContain(WURZEL);
  });

  test('verschachtelter Zielordner + abschließender Slash', () => {
    const r = deriveRoots(WURZEL, 'Kunden/Acme/');
    expect(r.arbeitsOrdner).toBe(path.join(WURZEL, 'Kunden', 'Acme'));
    expect(r.zielPrefix).toBe('Kunden/Acme');
    expect(r.roots).toEqual([path.join(WURZEL, 'Kunden', 'Acme')]);
  });

  test('Ausbruchsversuch (..) fällt sicher auf die Projektwurzel zurück', () => {
    for (const boese of ['../../etc', '..', '/etc/passwd', '../geheim']) {
      const r = deriveRoots(WURZEL, boese);
      expect(r.arbeitsOrdner).toBe(WURZEL);
      expect(r.scoped).toBe(false);
      expect(r.roots).toEqual([WURZEL]);
    }
  });

  test('leerer/whitespace Anhang bleibt Projektwurzel', () => {
    expect(deriveRoots(WURZEL, '').scoped).toBe(false);
    expect(deriveRoots(WURZEL, '   ').scoped).toBe(false);
    expect(deriveRoots(WURZEL, null).scoped).toBe(false);
  });
});
