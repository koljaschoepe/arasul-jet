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
      'Kurz vorweg.\n<tool_call>\n{"name": "dateien_suchen", "arguments": {"query": "Eichen"}}\n</tool_call>';
    const { calls, rest } = parseTextToolCalls(content);
    expect(calls).toHaveLength(1);
    expect(calls[0].function).toEqual({ name: 'dateien_suchen', arguments: { query: 'Eichen' } });
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

/**
 * Plan 023 E9: Werkzeug-Syntax darf nicht in der Anzeige landen, und ein als
 * Text geschriebener Aufruf darf nicht verschwinden, nur weil in derselben
 * Runde ein anderer Aufruf richtig formatiert war.
 *
 * Beide Faelle sind am 22.08.2026 auf dem Orin gemessen, mit qwen3-coder:30b:
 * im Chat stand rohes XML, in `chat_messages` ebenfalls, die Schritt-Liste
 * kannte kein `dateien_schreiben`, und die Antwort behauptete trotzdem, die
 * Datei sei erstellt.
 */
const { ToolSyntaxFilter, wertBereinigen } = require('../../src/services/llm/textToolCalls');

/** Schickt einen Text in Stuecken der Groesse n durch den Filter. */
function durchFilter(roh, n) {
  const f = new ToolSyntaxFilter();
  let sichtbar = '';
  for (let i = 0; i < roh.length; i += n) {
    sichtbar += f.durch(roh.slice(i, i + n));
  }
  return sichtbar + f.rest();
}

describe('ToolSyntaxFilter', () => {
  const GEMESSEN =
    'Ich erstelle nun die Datei notiz.md.\n\n' +
    '<function=dateien_schreiben> <parameter=pfad> notiz.md </parameter>' +
    ' <parameter=inhalt> Hallo </parameter> </function>\n</tool_call>\nFertig.';

  it('haelt den gemessenen Fall vollstaendig zurueck', () => {
    expect(durchFilter(GEMESSEN, 1000)).toBe('Ich erstelle nun die Datei notiz.md.\n\nFertig.');
  });

  it('liefert dasselbe, egal wie der Strom zerschnitten ist', () => {
    // Das ist der Kern: eine Marke kommt regelmaessig mitten durchgeschnitten
    // an. Wer erst am Blockende prueft, hat `<function=` schon zur Haelfte
    // ausgeliefert, und die Zahl der Leerzeilen haengt am Zufall.
    const erwartet = 'Ich erstelle nun die Datei notiz.md.\n\nFertig.';
    for (const n of [1, 2, 3, 5, 7, 11, 13, 64, 1000]) {
      expect(durchFilter(GEMESSEN, n)).toBe(erwartet);
    }
  });

  it('laesst gewoehnliche Kleiner-Zeichen und HTML in Ruhe', () => {
    const text = 'Wenn a < b und 3<4, dann <div>x</div> und a <= b.';
    for (const n of [1, 4, 1000]) {
      expect(durchFilter(text, n)).toBe(text);
    }
  });

  it('gibt einen abgebrochenen Halbsatz am Ende wieder frei', () => {
    // Endet die Runde mitten in etwas, das eine Marke sein koennte, gehoert
    // der Rest dem Nutzer. Sonst verschwaende der Filter echten Text.
    expect(durchFilter('Text <func', 3)).toBe('Text <func');
    expect(durchFilter('Ende <', 2)).toBe('Ende <');
  });

  it('verschluckt einen angefangenen Aufruf dagegen ganz', () => {
    // Ein halber Aufruf ist kein halber Satz. Er war nie fuer Augen bestimmt.
    expect(durchFilter('Text <function=dateien_schreiben> <parameter=pfad> a.md', 5)).toBe('Text ');
  });

  it('raeumt auch verwaiste Schluss-Tags weg', () => {
    expect(durchFilter('Fertig.\n</tool_call>\nDanach.', 4)).toBe('Fertig.\nDanach.');
  });

  it('kommt mit mehreren Aufrufen hintereinander zurecht', () => {
    const roh =
      'Erst<function=a><parameter=x>1</parameter></function>dann' +
      '<function=b><parameter=y>2</parameter></function>fertig';
    for (const n of [1, 6, 1000]) {
      expect(durchFilter(roh, n)).toBe('Erstdannfertig');
    }
  });

  it('haelt den Puffer klein, auch bei einem sehr langen Aufruf', () => {
    // Ein `inhalt` mit einem ganzen Dokument darf den Filter nicht anschwellen
    // lassen; er braucht nur so viel Gedaechtnis wie das laengste Schluss-Tag.
    const f = new ToolSyntaxFilter();
    f.durch('<function=dateien_schreiben><parameter=inhalt>');
    for (let i = 0; i < 50; i++) {
      f.durch('x'.repeat(2000));
    }
    expect(f.geschluckt.length).toBeLessThan(20);
  });
});

describe('wertBereinigen (Plan 023 E9)', () => {
  it('nimmt die Fuellzeichen der einzeiligen Form', () => {
    expect(wertBereinigen(' notiz.md ')).toBe('notiz.md');
  });

  it('nimmt die Fuellzeichen der mehrzeiligen Form', () => {
    expect(wertBereinigen('\nHallo Arasul\n')).toBe('Hallo Arasul');
  });

  it('laesst den Inhalt in der Mitte unberuehrt', () => {
    expect(wertBereinigen('\nZeile 1\n\nZeile 2\n')).toBe('Zeile 1\n\nZeile 2');
  });

  it('nimmt hoechstens einen Umbruch je Ende', () => {
    // Eine Datei darf mit einer Leerzeile enden, wenn sie das soll.
    expect(wertBereinigen('\nA\n\n')).toBe('A\n');
  });

  it('kommt mit leer und mit null zurecht', () => {
    expect(wertBereinigen('')).toBe('');
    expect(wertBereinigen(null)).toBe('');
  });
});
