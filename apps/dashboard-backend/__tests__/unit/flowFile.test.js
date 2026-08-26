/**
 * Flow-Format: Parser, Serialisierer und Prüfschema (Plan 011, Schritt 4).
 *
 * Schwerpunkt liegt auf dem, was das Schema ABWEISEN muss. Ein Flow, der
 * ungültig gespeichert werden könnte, würde erst zur Laufzeit auffallen — und
 * zwar als Modell, das etwas Unmögliches tun soll.
 */

const {
  parseFlowFile,
  serializeFlowFile,
  splitFrontmatter,
  extractPlaceholders,
  fillPlaceholders,
} = require('../../src/services/flows/flowFile');

/** Kleinster gültiger Flow. */
const MINIMAL = `---
name: notiz
---
Fasse zusammen.
`;

describe('splitFrontmatter', () => {
  it('trennt Kopfdaten und Rumpf', () => {
    const { front, body } = splitFrontmatter('---\nname: a\n---\nHallo\n');
    expect(front).toBe('name: a');
    expect(body).toBe('Hallo');
  });

  it('kommt ohne Kopfdaten aus (alles ist Rumpf)', () => {
    const { front, body } = splitFrontmatter('Nur Text');
    expect(front).toBe('');
    expect(body).toBe('Nur Text');
  });

  it('verkraftet BOM und CRLF', () => {
    const { front, body } = splitFrontmatter('﻿---\r\nname: a\r\n---\r\nHallo\r\n');
    expect(front).toBe('name: a');
    expect(body).toBe('Hallo');
  });
});

describe('parseFlowFile — gültige Definitionen', () => {
  it('parst den minimalen Flow und setzt Voreinstellungen', () => {
    const s = parseFlowFile(MINIMAL);
    expect(s.name).toBe('notiz');
    expect(s.systemPrompt).toBe('Fasse zusammen.');
    expect(s.argumente).toEqual([]);
    expect(s.werkzeuge).toEqual([]);
    // Grenzen kommen aus dem Schema, nicht aus der Datei.
    expect(s.grenzen).toEqual({ max_aufrufe: 20, zeitlimit_s: 900, werkzeug_runden: 10, max_tiefe: 2 });
  });

  it('nimmt den Dateinamen, wenn die Kopfdaten keinen Namen tragen', () => {
    const s = parseFlowFile('---\nbeschreibung: X\n---\nTu was.', { name: 'aus-dateiname' });
    expect(s.name).toBe('aus-dateiname');
  });

  it('parst Argumente, Ordner, Werkzeuge und Rollen', () => {
    const s = parseFlowFile(`---
name: recherche
beschreibung: Recherchiert im Web.
argumente:
  - name: thema
    typ: freitext
    pflicht: true
  - name: tiefe
    typ: auswahl
    optionen: [kurz, lang]
    standard: kurz
ordner: [/arasul/flows/demo]
werkzeuge: [web_suche, web_lesen, subagent, dateien_schreiben]
rollen:
  - name: leser
    werkzeuge: [web_lesen]
    ergebnis:
      felder: [fakten, quellen]
      max_zeichen: 1500
    prompt: Lies die Seite und gib nur belegte Fakten zurueck.
grenzen:
  max_aufrufe: 8
  zeitlimit_s: 300
---
Recherchiere {{thema}} in der Tiefe {{tiefe}}.
`);
    expect(s.argumente).toHaveLength(2);
    expect(s.argumente[1]).toMatchObject({ typ: 'auswahl', optionen: ['kurz', 'lang'] });
    expect(s.rollen[0].ergebnis).toEqual({ felder: ['fakten', 'quellen'], max_zeichen: 1500 });
    // Nicht gesetzte Grenze faellt auf die Voreinstellung zurueck.
    expect(s.grenzen).toEqual({ max_aufrufe: 8, zeitlimit_s: 300, werkzeug_runden: 10, max_tiefe: 2 });
  });
});

describe('parseFlowFile — was abgewiesen werden muss', () => {
  const bad = (text, muster) => {
    expect(() => parseFlowFile(text)).toThrow(muster);
  };

  it('weist kaputtes YAML ab', () => {
    bad('---\nname: [unbalanced\n---\nX', /kein gültiges YAML/);
  });

  it('verlangt einen Prompt', () => {
    bad('---\nname: leer\n---\n', /Prompt/);
  });

  it('weist Namen mit Pfadtrennern ab', () => {
    bad('---\nname: ../boese\n---\nX', /ungültig|Kleinbuchstaben/i);
    bad('---\nname: Gross\n---\nX', /ungültig|Kleinbuchstaben/i);
  });

  it('weist unbekannte Werkzeuge ab', () => {
    bad('---\nname: a\nwerkzeuge: [zauberstab]\n---\nX', /ungültig/i);
  });

  it('weist unbekannte Felder in den Kopfdaten ab (Tippfehler-Schutz)', () => {
    bad('---\nname: a\nwerkzuege: [terminal]\n---\nX', /ungültig/i);
  });

  it('weist einen Platzhalter ohne passendes Argument ab', () => {
    bad('---\nname: a\n---\nSchreibe ueber {{thema}}.', /unbekannte Platzhalter.*thema/s);
  });

  it('weist typ=auswahl ohne Optionen ab', () => {
    bad('---\nname: a\nargumente:\n  - name: x\n    typ: auswahl\n---\nX {{x}}', /optionen/i);
  });

  it('weist einen Standardwert ausserhalb der Optionen ab', () => {
    bad(
      '---\nname: a\nargumente:\n  - name: x\n    typ: auswahl\n    optionen: [a, b]\n    standard: c\n---\nX {{x}}',
      /standard/i
    );
  });

  it('weist pflicht=true zusammen mit einem Standardwert ab', () => {
    bad(
      '---\nname: a\nargumente:\n  - name: x\n    typ: freitext\n    pflicht: true\n    standard: y\n---\nX {{x}}',
      /schließen sich aus/i
    );
  });

  it('weist doppelte Argumentnamen ab', () => {
    bad(
      '---\nname: a\nargumente:\n  - name: x\n    typ: freitext\n  - name: x\n    typ: freitext\n---\nX {{x}}',
      /doppelt/i
    );
  });

  it('weist Rollen ohne das Werkzeug subagent ab', () => {
    bad(
      '---\nname: a\nrollen:\n  - name: r\n    ergebnis: {felder: [f]}\n    prompt: P\n---\nX',
      /subagent/i
    );
  });

  it('weist das Werkzeug subagent ohne Rollen ab', () => {
    bad('---\nname: a\nwerkzeuge: [subagent]\n---\nX', /keine Rollen/i);
  });

  it('laesst eine Rolle nicht mehr duerfen als den Flow selbst', () => {
    bad(
      `---
name: a
werkzeuge: [subagent]
rollen:
  - name: r
    werkzeuge: [terminal]
    ergebnis: {felder: [f]}
    prompt: P
---
X`,
      /terminal.*nicht/is
    );
  });

  it('verlangt einen Ordner, wenn Datei- oder Terminal-Werkzeuge genutzt werden', () => {
    bad('---\nname: a\nwerkzeuge: [dateien_schreiben]\n---\nX', /ordner/i);
    bad('---\nname: a\nwerkzeuge: [terminal]\n---\nX', /ordner/i);
  });

  it('weist einen leeren Ergebnis-Vertrag ab (Kontext-Sperre darf nicht fehlen)', () => {
    bad(
      `---
name: a
werkzeuge: [subagent]
rollen:
  - name: r
    ergebnis: {felder: []}
    prompt: P
---
X`,
      /mindestens ein Feld/i
    );
  });
});

describe('serializeFlowFile', () => {
  it('erzeugt eine Datei, die sich wieder identisch parsen laesst (Rundreise)', () => {
    const original = parseFlowFile(`---
name: recherche
beschreibung: Recherchiert im Web.
argumente:
  - name: thema
    typ: freitext
    pflicht: true
werkzeuge: [web_suche, subagent]
rollen:
  - name: leser
    werkzeuge: [web_suche]
    ergebnis: {felder: [fakten], max_zeichen: 1200}
    prompt: Lies und verdichte.
---
Recherchiere {{thema}}.
`);
    const text = serializeFlowFile(original);
    expect(text.startsWith('---\n')).toBe(true);
    expect(parseFlowFile(text)).toEqual(original);
  });
});

describe('Platzhalter', () => {
  it('sammelt Platzhalter dedupliziert in Reihenfolge', () => {
    expect(extractPlaceholders('{{b}} {{a}} {{ b }}')).toEqual(['b', 'a']);
  });

  it('setzt Werte ein und laesst unbekannte stehen', () => {
    expect(fillPlaceholders('Hallo {{name}}, {{rest}}', { name: 'Welt' })).toBe(
      'Hallo Welt, {{rest}}'
    );
  });

  it('behandelt einen leeren String als Wert (nicht als fehlend)', () => {
    expect(fillPlaceholders('[{{x}}]', { x: '' })).toBe('[]');
  });
});

describe('parseFlowFile — Schritt-Ketten (B7)', () => {
  const KETTE = `---
name: kette
argumente:
  - name: q
    typ: freitext
werkzeuge: [subagent, web_suche]
rollen:
  - name: sucher
    werkzeuge: [web_suche]
    ergebnis: { felder: [treffer] }
    prompt: Suche.
schritte:
  - name: s1
    typ: subagent
    rolle: sucher
    auftrag: Finde {{q}}.
  - name: s2
    typ: werkzeug
    werkzeug: web_suche
    parameter: { query: "{{q}}" }
---
Antwort aus {{q}}.
`;

  it('parst eine gültige Schritt-Kette und setzt Voreinstellungen je Schritt', () => {
    const flow = parseFlowFile(KETTE);
    expect(flow.schritte).toHaveLength(2);
    expect(flow.schritte[0]).toMatchObject({ name: 's1', typ: 'subagent', rolle: 'sucher' });
    expect(flow.schritte[0].iterationen).toBe(1);
    expect(flow.schritte[1]).toMatchObject({ name: 's2', typ: 'werkzeug', werkzeug: 'web_suche' });
    // Serialisierung nimmt die Schritte mit (Datei bleibt die Wahrheit).
    expect(serializeFlowFile(flow)).toContain('schritte:');
  });

  it('weist einen subagent-Schritt mit unbekannter Rolle ab', () => {
    const bad = KETTE.replace('rolle: sucher', 'rolle: gibtsnicht');
    expect(() => parseFlowFile(bad)).toThrow(/gibtsnicht/);
  });

  it('weist einen werkzeug-Schritt mit nicht freigegebenem Werkzeug ab', () => {
    const bad = KETTE.replace('werkzeug: web_suche', 'werkzeug: terminal');
    expect(() => parseFlowFile(bad)).toThrow(/terminal/);
  });

  it('weist einen subagent-Schritt ohne Auftrag ab', () => {
    const bad = KETTE.replace('    auftrag: Finde {{q}}.\n', '');
    expect(() => parseFlowFile(bad)).toThrow(/auftrag/);
  });
});

/**
 * Plan 023 I2: die Betriebsart steht in der Datei, aber nur wenn sie vom
 * Standard abweicht.
 */
describe('Betriebsart (Plan 023 I2)', () => {
  const basis = {
    name: 'test',
    beschreibung: '',
    argumente: [],
    ordner: [],
    werkzeuge: [],
    rollen: [],
    schritte: [],
    grenzen: {},
    systemPrompt: 'Tu etwas.',
  };

  it('schreibt autonom NICHT in die Datei', () => {
    // Sonst bekaemen alle vorhandenen Flow-Dateien beim naechsten Speichern
    // eine Zeile dazu, die nichts aendert.
    const text = serializeFlowFile({ ...basis, betriebsart: 'autonom' });
    expect(text).not.toContain('betriebsart');
  });

  it('schreibt rueckfragen in die Datei', () => {
    const text = serializeFlowFile({ ...basis, betriebsart: 'rueckfragen' });
    expect(text).toContain('betriebsart: rueckfragen');
  });

  it('eine Datei ohne Angabe bleibt autonom', () => {
    const text = serializeFlowFile(basis);
    expect(text).not.toContain('betriebsart');
    expect(parseFlowFile(text).betriebsart).toBe('autonom');
  });

  it('liest die Betriebsart wieder ein', () => {
    const text = serializeFlowFile({ ...basis, betriebsart: 'rueckfragen' });
    expect(parseFlowFile(text).betriebsart).toBe('rueckfragen');
  });
});

/**
 * Plan 023 I4: die Angebots-Vorlage, nachgebaut nach dem Muster aus dem
 * Entwicklungsordner (zwei Phasen, Kundendaten lesen, Ergebnis als Dokument).
 *
 * Sie ist der Beleg, dass die vereinfachte Oberflaeche einen echten Ablauf
 * traegt: drei Schritte, zwei Rollen, eine Rueckfrage mit Optionen.
 */
describe('Beispiel-Flow "angebot" (Plan 023 I4)', () => {
  const fs = require('fs');
  const path = require('path');
  const datei = path.join(
    __dirname,
    '../../src/services/flows/beispiele/angebot.md'
  );
  const flow = parseFlowFile(fs.readFileSync(datei, 'utf8'));

  it('laeuft mit Rueckfragen, nicht autonom', () => {
    expect(flow.betriebsart).toBe('rueckfragen');
    expect(flow.werkzeuge).toContain('frage_nutzer');
  });

  it('hat die drei Schritte des Musters', () => {
    expect(flow.schritte.map(s => `${s.name}:${s.typ}`)).toEqual([
      'unterlagen:subagent',
      'umfang:werkzeug',
      'schreiben:subagent',
    ]);
  });

  it('stellt die Rueckfrage mit hoechstens vier Optionen', () => {
    const frage = flow.schritte[1];
    expect(frage.werkzeug).toBe('frage_nutzer');
    expect(Array.isArray(frage.parameter.optionen)).toBe(true);
    expect(frage.parameter.optionen.length).toBeLessThanOrEqual(4);
    expect(frage.parameter.frage).toMatch(/\?/);
  });

  it('reicht die Antwort an den schreibenden Schritt weiter', () => {
    // Ohne den Platzhalter waere die Rueckfrage Zierde: gefragt, gehoert,
    // nicht benutzt.
    expect(flow.schritte[2].auftrag).toContain('{{umfang}}');
    expect(flow.schritte[2].auftrag).toContain('{{unterlagen}}');
  });

  it('erfindet keine Preise: der Autor bekommt es ausdruecklich gesagt', () => {
    const autor = flow.rollen.find(r => r.name === 'autor');
    expect(autor.prompt).toMatch(/Erfinde KEINE Preise/);
    expect(autor.prompt).toMatch(/\[offene Stelle\]/);
  });

  it('schreibt in den Kundenordner, nicht in die Antwort', () => {
    const autor = flow.rollen.find(r => r.name === 'autor');
    expect(autor.werkzeuge).toEqual(['dateien_schreiben']);
    expect(flow.schritte[2].auftrag).toContain('{{kunde}}/angebot.md');
  });
});
