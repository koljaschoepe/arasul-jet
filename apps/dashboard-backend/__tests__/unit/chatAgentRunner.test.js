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

describe('alleTodosErledigt (F-06: Todos beim echten Abschluss abhaken)', () => {
  const { alleTodosErledigt } = require('../../src/services/llm/chatAgentRunner');
  const { parseTodos } = require('../../src/services/llm/agentTodoTool');

  test('hakt offene und laufende Punkte ab, ohne den Text zu verändern', () => {
    const vorher = '- [x] Quellen lesen\n- [~] Entwurf schreiben\n- [ ] Prüfen';
    const nachher = alleTodosErledigt(vorher);
    expect(nachher).toBe('- [x] Quellen lesen\n- [x] Entwurf schreiben\n- [x] Prüfen');
    expect(parseTodos(nachher).every(t => t.status === 'fertig')).toBe(true);
  });

  test('erhält Einrückung und *-Bullets', () => {
    expect(alleTodosErledigt('  * [ ] Unterpunkt')).toBe('  * [x] Unterpunkt');
  });

  test('lässt Nicht-Checkbox-Zeilen unberührt', () => {
    const text = '# Überschrift\n- [ ] Aufgabe\nEinfacher Text';
    expect(alleTodosErledigt(text)).toBe('# Überschrift\n- [x] Aufgabe\nEinfacher Text');
  });

  test('kommt mit leerer/ungültiger Eingabe zurecht', () => {
    expect(alleTodosErledigt('')).toBe('');
    expect(alleTodosErledigt(null)).toBe('');
    expect(alleTodosErledigt(undefined)).toBe('');
  });
});

describe('berechneToolSignatur (F-06: Fortschritts-Wächter)', () => {
  const { berechneToolSignatur } = require('../../src/services/llm/chatAgentRunner');
  const call = (name, args) => ({ function: { name, arguments: args } });

  test('gleiche Werkzeuge mit gleichen Argumenten → gleiche Signatur (Stillstand)', () => {
    const a = [call('rag_suche', { frage: 'x' })];
    const b = [call('rag_suche', { frage: 'x' })];
    expect(berechneToolSignatur(a)).toBe(berechneToolSignatur(b));
  });

  test('gleiches Werkzeug, ANDERE Argumente → andere Signatur (kein Fehlalarm)', () => {
    const a = [call('dateien_anhaengen', { pfad: 'x.md', text: 'Abschnitt 1' })];
    const b = [call('dateien_anhaengen', { pfad: 'x.md', text: 'Abschnitt 2' })];
    expect(berechneToolSignatur(a)).not.toBe(berechneToolSignatur(b));
  });

  test('verträgt String-Argumente (Ollama liefert JSON-String) und Reihenfolge zählt', () => {
    const s = berechneToolSignatur([call('t', '{"a":1}')]);
    expect(typeof s).toBe('string');
    const ab = berechneToolSignatur([call('a', {}), call('b', {})]);
    const ba = berechneToolSignatur([call('b', {}), call('a', {})]);
    expect(ab).not.toBe(ba);
  });

  test('leere/ungültige Eingabe → leere Signatur', () => {
    expect(berechneToolSignatur([])).toBe('');
    expect(berechneToolSignatur(null)).toBe('');
    expect(berechneToolSignatur(undefined)).toBe('');
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

/**
 * Plan 023 E9: Werkzeug-Syntax gehoert nicht in die Anzeige, wohl aber in den
 * Text der Runde, denn genau daraus zieht der Nachparser die Aufrufe.
 */
describe('streamChatRound und die Werkzeug-Syntax (Plan 023 E9)', () => {
  test('zeigt kein rohes XML, behaelt es aber im Inhalt der Runde', async () => {
    // So kam es am 22.08.2026 auf dem Orin an, in Stuecken zerschnitten.
    axios.post.mockResolvedValueOnce({
      data: fakeStream([
        { message: { content: 'Ich erstelle nun die Datei notiz.md.\n\n' } },
        { message: { content: '<function=dateien_schrei' } },
        { message: { content: 'ben> <parameter=pfad> notiz.md </parameter>' } },
        { message: { content: ' </function>\n</tool_call>\n' } },
        { message: { content: 'Fertig.' } },
        { message: {}, done: true },
      ]),
    });

    const tokens = [];
    const { content } = await streamChatRound({
      model: 'qwen3-coder:30b',
      messages: [],
      tools: [],
      onToken: t => tokens.push(t),
    });

    expect(tokens.join('')).toBe('Ich erstelle nun die Datei notiz.md.\n\nFertig.');
    // Der Inhalt bleibt roh: der Nachparser im Aufrufer braucht ihn so.
    expect(content).toContain('<function=dateien_schreiben>');
  });

  test('laesst ein gewoehnliches Kleiner-Zeichen durch', async () => {
    axios.post.mockResolvedValueOnce({
      data: fakeStream([
        { message: { content: 'Wenn a < b, dann ' } },
        { message: { content: '3<4.' } },
        { message: {}, done: true },
      ]),
    });
    const tokens = [];
    await streamChatRound({ model: 'x', messages: [], tools: [], onToken: t => tokens.push(t) });
    expect(tokens.join('')).toBe('Wenn a < b, dann 3<4.');
  });
});

/**
 * Plan 023 E2: Der Stopp-Knopf soll sofort greifen, nicht am Ende der Runde.
 */
describe('streamChatRound und der Abbruch (Plan 023 E2)', () => {
  test('bricht ab, sobald das Signal ausgeloest wird', async () => {
    const stream = new PassThrough();
    axios.post.mockResolvedValueOnce({ data: stream });
    const abbruch = new AbortController();

    const lauf = streamChatRound({
      model: 'x',
      messages: [],
      tools: [],
      onToken: () => {},
      signal: abbruch.signal,
    });
    // Der Strom bleibt absichtlich offen: ohne die Abbruch-Behandlung wuerde
    // dieser Aufruf haengen, bis das Inaktivitaets-Zeitlimit greift. Erst ein
    // Token schicken, damit der Horcher sicher haengt, dann abbrechen.
    stream.write(`${JSON.stringify({ message: { content: 'Anfang' } })}\n`);
    await new Promise(r => setTimeout(r, 30));
    abbruch.abort();
    await expect(lauf).rejects.toThrow('Vom Nutzer abgebrochen');
  });

  test('bricht sofort ab, wenn das Signal schon vorher gesetzt war', async () => {
    const abbruch = new AbortController();
    abbruch.abort();
    await expect(
      streamChatRound({ model: 'x', messages: [], tools: [], onToken: () => {}, signal: abbruch.signal })
    ).rejects.toThrow('Vom Nutzer abgebrochen');
  });
});

/**
 * Plan 023 E2: Zwei Fehler, die derselbe Lauf am 22.08.2026 auf dem Orin
 * gezeigt hat, und die einander verdeckten.
 */
const {
  systemAnDenAnfang,
  istToolsNichtUnterstuetzt,
} = require('../../src/services/llm/chatAgentRunner');

describe('systemAnDenAnfang (Plan 023 E2)', () => {
  test('legt eine nachgestellte System-Nachricht mit der ersten zusammen', () => {
    // Das Standardmodell des Geraets antwortet sonst mit HTTP 500:
    // "Jinja Exception: System message must be at the beginning."
    const { nachrichten, verschoben } = systemAnDenAnfang([
      { role: 'system', content: 'Grundregeln' },
      { role: 'user', content: 'Schreib mir was' },
      { role: 'system', content: '## Aufgabenliste\n- [ ] etwas' },
    ]);
    expect(verschoben).toBe(1);
    expect(nachrichten).toHaveLength(2);
    expect(nachrichten[0].role).toBe('system');
    expect(nachrichten[0].content).toBe('Grundregeln\n\n## Aufgabenliste\n- [ ] etwas');
    expect(nachrichten[1]).toEqual({ role: 'user', content: 'Schreib mir was' });
  });

  test('laesst eine Liste ohne nachgestellte System-Nachricht unveraendert', () => {
    const eingabe = [
      { role: 'system', content: 'A' },
      { role: 'user', content: 'B' },
      { role: 'assistant', content: 'C' },
    ];
    const { nachrichten, verschoben } = systemAnDenAnfang(eingabe);
    expect(verschoben).toBe(0);
    expect(nachrichten).toBe(eingabe);
  });

  test('kommt ohne jede System-Nachricht zurecht', () => {
    const eingabe = [{ role: 'user', content: 'B' }];
    expect(systemAnDenAnfang(eingabe).verschoben).toBe(0);
  });

  test('legt mehrere nachgestellte in der richtigen Reihenfolge zusammen', () => {
    const { nachrichten, verschoben } = systemAnDenAnfang([
      { role: 'system', content: 'eins' },
      { role: 'user', content: 'u' },
      { role: 'system', content: 'zwei' },
      { role: 'system', content: 'drei' },
    ]);
    expect(verschoben).toBe(2);
    expect(nachrichten[0].content).toBe('eins\n\nzwei\n\ndrei');
    expect(nachrichten.filter(n => n.role === 'system')).toHaveLength(1);
  });

  test('behaelt die Reihenfolge der uebrigen Nachrichten', () => {
    const { nachrichten } = systemAnDenAnfang([
      { role: 'system', content: 's' },
      { role: 'user', content: '1' },
      { role: 'assistant', content: '2' },
      { role: 'system', content: 'ende' },
      { role: 'user', content: '3' },
    ]);
    expect(nachrichten.map(n => n.content)).toEqual(['s\n\nende', '1', '2', '3']);
  });
});

describe('istToolsNichtUnterstuetzt (Plan 023 E2)', () => {
  test('wirft nicht, wenn der Fehlerrumpf ein Strom ist', () => {
    // Vorher: JSON.stringify auf einem Node-Strom warf "Converting circular
    // structure to JSON", und weil der Aufruf in einem catch-Block steht,
    // ersetzte dieser Fehler den echten. Der Nutzer las danach "Der KI-Dienst
    // ist gerade nicht erreichbar", obwohl Ollama etwas ganz anderes gesagt
    // hatte.
    const err = { message: 'Request failed with status code 500' };
    err.response = { data: new PassThrough() };
    expect(() => istToolsNichtUnterstuetzt(err)).not.toThrow();
    expect(istToolsNichtUnterstuetzt(err)).toBe(false);
  });

  test('erkennt den Fall weiterhin, um den es geht', () => {
    expect(
      istToolsNichtUnterstuetzt({ message: 'x', response: { data: 'model does not support tools' } })
    ).toBe(true);
    expect(istToolsNichtUnterstuetzt({ message: 'does not support tools' })).toBe(true);
  });

  test('kommt mit einem ringfoermigen Objekt zurecht', () => {
    const ring = { a: 1 };
    ring.selbst = ring;
    expect(() => istToolsNichtUnterstuetzt({ message: 'x', response: { data: ring } })).not.toThrow();
  });
});

/**
 * Plan 023 E2: zwei Grenzen statt einer.
 *
 * Am 22.08.2026 auf dem Orin gemessen, Job 6153f7c8: ein Agent-Lauf starb nach
 * 15:39 Minuten daran, dass das Modell 121 Sekunden lang nichts schickte. Bei
 * 31 267 Token Zusammenhang ist das keine Stoerung, sondern die Rechenzeit der
 * Vorverarbeitung. Die eine gemeinsame Grenze von 120 Sekunden lag genau auf
 * der Kante des erlaubten Falls.
 */
describe('streamChatRound und die zwei Wartezeiten (Plan 023 E2)', () => {
  test('gibt vor dem ersten Wort mehr Zeit als zwischen zwei Woertern', async () => {
    jest.useFakeTimers();
    try {
      const stream = new PassThrough();
      axios.post.mockResolvedValueOnce({ data: stream });
      const lauf = streamChatRound({ model: 'x', messages: [], tools: [], onToken: () => {} });
      const gefangen = lauf.catch(err => err);

      // Ollama oeffnet den Strom sofort und schweigt dann, solange es den
      // Prompt verarbeitet. Ein leerer Block ist noch kein Wort.
      stream.write(`${JSON.stringify({ message: {} })}\n`);
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(150_000);
      // Nach 150 Sekunden ohne Wort laeuft der Lauf noch: die grosszuegige
      // Grenze gilt, weil die Runde ihr erstes Wort noch nicht hatte.
      let fertig = false;
      void gefangen.then(() => {
        fertig = true;
      });
      await Promise.resolve();
      expect(fertig).toBe(false);

      // Jetzt kommt das erste Wort. Ab hier gilt die strenge Grenze.
      stream.write(`${JSON.stringify({ message: { content: 'Hallo' } })}\n`);
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(130_000);
      const err = await gefangen;
      expect(String(err.message)).toMatch(/120s ohne Daten/);
    } finally {
      jest.useRealTimers();
    }
  }, 20000);

  test('bricht vor dem ersten Wort ab, wenn auch die grosse Grenze reisst', async () => {
    jest.useFakeTimers();
    try {
      const stream = new PassThrough();
      axios.post.mockResolvedValueOnce({ data: stream });
      const lauf = streamChatRound({ model: 'x', messages: [], tools: [], onToken: () => {} });
      const gefangen = lauf.catch(err => err);
      // In Schritten vorspulen: zwischen `haltezeit()` und dem Aufbau des
      // Stroms liegen mehrere Mikro-Aufgaben, und ein einziger grosser Sprung
      // laesst sie nicht dazwischen laufen.
      for (let i = 0; i < 32; i++) {
        await jest.advanceTimersByTimeAsync(10_000);
      }
      const err = await gefangen;
      expect(String(err.message)).toMatch(/300s ohne Daten/);
    } finally {
      jest.useRealTimers();
    }
  }, 20000);
});
