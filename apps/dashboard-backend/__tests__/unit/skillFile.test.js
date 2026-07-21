/**
 * Skill-Format: Parser, Serialisierer und Prüfschema (Plan 011, Schritt 4).
 *
 * Schwerpunkt liegt auf dem, was das Schema ABWEISEN muss. Ein Skill, der
 * ungültig gespeichert werden könnte, würde erst zur Laufzeit auffallen — und
 * zwar als Modell, das etwas Unmögliches tun soll.
 */

const {
  parseSkillFile,
  serializeSkillFile,
  splitFrontmatter,
  extractPlaceholders,
  fillPlaceholders,
} = require('../../src/services/skills/skillFile');

/** Kleinster gültiger Skill. */
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

describe('parseSkillFile — gültige Definitionen', () => {
  it('parst den minimalen Skill und setzt Voreinstellungen', () => {
    const s = parseSkillFile(MINIMAL);
    expect(s.name).toBe('notiz');
    expect(s.systemPrompt).toBe('Fasse zusammen.');
    expect(s.argumente).toEqual([]);
    expect(s.werkzeuge).toEqual([]);
    // Grenzen kommen aus dem Schema, nicht aus der Datei.
    expect(s.grenzen).toEqual({ max_aufrufe: 20, zeitlimit_s: 900, werkzeug_runden: 10 });
  });

  it('nimmt den Dateinamen, wenn die Kopfdaten keinen Namen tragen', () => {
    const s = parseSkillFile('---\nbeschreibung: X\n---\nTu was.', { name: 'aus-dateiname' });
    expect(s.name).toBe('aus-dateiname');
  });

  it('parst Argumente, Ordner, Werkzeuge und Rollen', () => {
    const s = parseSkillFile(`---
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
ordner: [/arasul/sandbox/projects/demo]
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
    expect(s.grenzen).toEqual({ max_aufrufe: 8, zeitlimit_s: 300, werkzeug_runden: 10 });
  });
});

describe('parseSkillFile — was abgewiesen werden muss', () => {
  const bad = (text, muster) => {
    expect(() => parseSkillFile(text)).toThrow(muster);
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

  it('laesst eine Rolle nicht mehr duerfen als den Skill selbst', () => {
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

describe('serializeSkillFile', () => {
  it('erzeugt eine Datei, die sich wieder identisch parsen laesst (Rundreise)', () => {
    const original = parseSkillFile(`---
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
    const text = serializeSkillFile(original);
    expect(text.startsWith('---\n')).toBe(true);
    expect(parseSkillFile(text)).toEqual(original);
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
