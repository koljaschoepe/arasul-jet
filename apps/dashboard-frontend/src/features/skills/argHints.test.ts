/**
 * Tests der reinen Argument-Eingabe-Logik (Plan 011, Schritt 14).
 *
 * Hier steckt die eigentliche Schwierigkeit des Schritts: grauer Hinweis,
 * Tab-Sprung, Backspace-Rücksprung, Picker füllt mit getrenntem Wert/Label.
 * Direkt geprüft, ohne React/DOM.
 */
import { describe, expect, test } from 'vitest';
import type { Skill } from '@/types/skills';
import {
  advanceState,
  beginState,
  buildFieldValue,
  collectValues,
  fillState,
  ghostSuffix,
  placeholderFor,
  reconcileState,
} from './argHints';

const freitext: Skill = {
  name: 'recherche',
  beschreibung: '',
  argumente: [{ name: 'thema', typ: 'freitext', beschreibung: '', pflicht: true }],
};
const multi: Skill = {
  name: 'wissen',
  beschreibung: '',
  argumente: [
    { name: 'frage', typ: 'freitext', beschreibung: '', pflicht: true },
    { name: 'raum', typ: 'wissensbasis', beschreibung: '', pflicht: true },
  ],
};
const optional: Skill = {
  name: 'x',
  beschreibung: '',
  argumente: [
    { name: 'a', typ: 'freitext', beschreibung: '', pflicht: true },
    { name: 'b', typ: 'freitext', beschreibung: '', pflicht: false },
  ],
};

describe('placeholderFor / buildFieldValue', () => {
  test('Pflicht in spitzen, optional in eckigen Klammern', () => {
    expect(placeholderFor(freitext.argumente[0]!)).toBe('<thema>');
    expect(placeholderFor(optional.argumente[1]!)).toBe('[b]');
  });

  test('Feldwert: Befehl, gefüllte Labels, aktives Label', () => {
    expect(buildFieldValue('recherche', [{ value: '', label: '' }], 0)).toBe('/recherche ');
    expect(buildFieldValue('recherche', [{ value: 'foo', label: 'foo' }], 0)).toBe(
      '/recherche foo'
    );
    expect(
      buildFieldValue(
        'wissen',
        [
          { value: 'was', label: 'was' },
          { value: '', label: '' },
        ],
        1
      )
    ).toBe('/wissen was ');
  });
});

describe('ghostSuffix', () => {
  test('zeigt das aktive leere Argument plus die folgenden', () => {
    expect(ghostSuffix(freitext, [{ value: '', label: '' }], 0, '/recherche ')).toBe('<thema>');
    expect(ghostSuffix(multi, [{ value: '', label: '' }], 0, '/wissen ')).toBe('<frage> <raum>');
    expect(ghostSuffix(optional, [{ value: '', label: '' }], 0, '/x ')).toBe('<a> [b]');
  });

  test('verschwindet für das aktive Argument, sobald getippt wird', () => {
    expect(ghostSuffix(freitext, [{ value: 'foo', label: 'foo' }], 0, '/recherche foo')).toBe('');
  });

  test('zeigt nur noch das zweite Argument, wenn das erste steht', () => {
    expect(
      ghostSuffix(
        multi,
        [
          { value: 'was', label: 'was' },
          { value: '', label: '' },
        ],
        1,
        '/wissen was '
      )
    ).toBe('<raum>');
  });
});

describe('reconcileState', () => {
  test('Tippen füllt das aktive Freitext-Argument', () => {
    const s = beginState(freitext);
    const r = reconcileState(s, '/recherche Klimawandel 2026');
    expect(r.value).toBe('/recherche Klimawandel 2026');
    expect(r.state?.slots[0]).toEqual({ value: 'Klimawandel 2026', label: 'Klimawandel 2026' });
  });

  test('Freitext darf Leerzeichen enthalten (ein Argument, nicht mehrere)', () => {
    const s = beginState(freitext);
    const r = reconcileState(s, '/recherche was kostet strom');
    expect(collectValues(r.state!)).toEqual({ thema: 'was kostet strom' });
  });

  test('in ein Auswahl-Argument getippter Text wird verworfen', () => {
    // frage gefüllt, raum (wissensbasis) aktiv & leer
    const s = {
      skill: multi,
      slots: [
        { value: 'was', label: 'was' },
        { value: '', label: '' },
      ],
      active: 1,
    };
    const r = reconcileState(s, '/wissen was hallo');
    expect(r.value).toBe('/wissen was '); // „hallo" verworfen
    expect(r.state).toBe(s);
  });

  test('Backspace unter die Grenze springt zum vorigen Argument zurück', () => {
    const s = {
      skill: multi,
      slots: [
        { value: 'was', label: 'was' },
        { value: '', label: '' },
      ],
      active: 1,
    };
    const r = reconcileState(s, '/wissen was'); // Leerzeichen weggelöscht
    expect(r.state?.active).toBe(0);
    expect(r.value).toBe('/wissen was');
  });

  test('Backspace unter das erste Argument verlässt die Eingabe', () => {
    const s = beginState(freitext);
    const r = reconcileState(s, '/recherch');
    expect(r.state).toBeNull();
    expect(r.value).toBe('/recherch');
  });

  test('eine Änderung MITTEN im Festgelegten wird verworfen, nicht als Rücksprung gewertet', () => {
    // frage="was" steht, raum aktiv. Der Nutzer klickt in „was" und tippt ein
    // Zeichen → „wass". Das ist KEIN Backspace über die Grenze und darf weder das
    // zweite Argument poppen noch die Eingabe verlieren.
    const s = {
      skill: multi,
      slots: [
        { value: 'was', label: 'was' },
        { value: '', label: '' },
      ],
      active: 1,
    };
    const r = reconcileState(s, '/wissen wass ');
    expect(r.state).toBe(s); // Zustand unangetastet
    expect(r.value).toBe('/wissen was '); // Feld auf den erwarteten Wert zurück
  });
});

describe('advanceState (Tab)', () => {
  test('springt zum nächsten Argument und öffnet dessen Picker', () => {
    const s = { skill: multi, slots: [{ value: 'was', label: 'was' }], active: 0 };
    const r = advanceState(s);
    expect(r.state.active).toBe(1);
    expect(r.value).toBe('/wissen was ');
    expect(r.openPicker).toBe(true); // raum ist wissensbasis
    expect(r.advanced).toBe(true);
  });

  test('am letzten Argument passiert nichts (advanced=false → Tab wirkt normal)', () => {
    const s = { skill: freitext, slots: [{ value: 'foo', label: 'foo' }], active: 0 };
    const r = advanceState(s);
    expect(r.state.active).toBe(0);
    expect(r.openPicker).toBe(false);
    expect(r.advanced).toBe(false);
  });
});

describe('fillState (Picker) & collectValues', () => {
  test('Label steht im Feld, Wert geht an den Lauf', () => {
    const s = {
      skill: multi,
      slots: [
        { value: 'was kostet x', label: 'was kostet x' },
        { value: '', label: '' },
      ],
      active: 1,
    };
    const r = fillState(s, 'space-id-42', 'Marketing');
    expect(r.value).toBe('/wissen was kostet x Marketing'); // Label im Feld
    expect(collectValues(r.state)).toEqual({ frage: 'was kostet x', raum: 'space-id-42' }); // Wert (ID)
  });

  test('leere optionale Argumente fallen aus der Sammlung', () => {
    const s = {
      skill: optional,
      slots: [
        { value: 'hallo', label: 'hallo' },
        { value: '', label: '' },
      ],
      active: 1,
    };
    expect(collectValues(s)).toEqual({ a: 'hallo' });
  });
});
