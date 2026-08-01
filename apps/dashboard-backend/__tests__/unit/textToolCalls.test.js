/**
 * Text-Tool-Call-Fallback (Sweep 2026-08-01): Modelle geben Werkzeug-Aufrufe
 * gelegentlich als Text aus (fehlendes <tool_call>-Tag → Ollamas Parser greift
 * nicht). Der Parser zieht sie nachträglich aus dem content.
 */
const { parseTextToolCalls, enthaeltToolSyntax } = require('../../src/services/llm/textToolCalls');

describe('textToolCalls', () => {
  test('parst den XML-Dialekt (Live-Repro: fehlendes öffnendes tool_call-Tag)', () => {
    const content =
      'Ich werde die .md-Dateien zählen.\n\n' +
      '<function=dateien_lesen>\n<parameter=aktion>\nlist\n</parameter>\n' +
      '<parameter=pfad>\ntests/baeume\n</parameter>\n</function>\n</tool_call>';
    const { calls, rest, hatSyntax } = parseTextToolCalls(content);
    expect(hatSyntax).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].function.name).toBe('dateien_lesen');
    expect(calls[0].function.arguments).toEqual({ aktion: 'list', pfad: 'tests/baeume' });
    expect(rest).toBe('Ich werde die .md-Dateien zählen.');
    expect(rest).not.toContain('tool_call');
  });

  test('parst mehrere Aufrufe und mehrzeilige Parameterwerte', () => {
    const content =
      '<function=dateien_schreiben><parameter=pfad>a.md</parameter>' +
      '<parameter=inhalt>Zeile 1\nZeile 2</parameter></function>' +
      '<function=todo_liste><parameter=liste>- [ ] eins</parameter></function>';
    const { calls } = parseTextToolCalls(content);
    expect(calls.map(c => c.function.name)).toEqual(['dateien_schreiben', 'todo_liste']);
    expect(calls[0].function.arguments.inhalt).toBe('Zeile 1\nZeile 2');
  });

  test('parst die JSON-Variante im tool_call-Tag', () => {
    const content =
      'Kurz vorweg.\n<tool_call>\n{"name": "web_suche", "arguments": {"query": "Eichen"}}\n</tool_call>';
    const { calls, rest } = parseTextToolCalls(content);
    expect(calls).toHaveLength(1);
    expect(calls[0].function).toEqual({ name: 'web_suche', arguments: { query: 'Eichen' } });
    expect(rest).toBe('Kurz vorweg.');
  });

  test('normale Antworten bleiben unangetastet', () => {
    const content = 'Die Funktion <code>foo()</code> macht nichts Böses.';
    const { calls, rest, hatSyntax } = parseTextToolCalls(content);
    expect(hatSyntax).toBe(false);
    expect(calls).toHaveLength(0);
    expect(rest).toBe(content);
  });

  test('kaputte Syntax: hatSyntax true, aber keine Calls (→ Nachfass-Runde)', () => {
    const content = 'Ich rufe jetzt auf: <tool_call>{kein json hier}</tool_call>';
    const { calls, hatSyntax } = parseTextToolCalls(content);
    expect(hatSyntax).toBe(true);
    expect(calls).toHaveLength(0);
  });

  test('enthaeltToolSyntax erkennt auch verwaiste End-Tags', () => {
    expect(enthaeltToolSyntax('bla </tool_call>')).toBe(true);
    expect(enthaeltToolSyntax('bla <function=x>')).toBe(true);
    expect(enthaeltToolSyntax('bla')).toBe(false);
  });
});
