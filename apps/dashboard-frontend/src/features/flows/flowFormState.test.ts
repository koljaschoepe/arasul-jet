/**
 * flowFormState Tests (Plan 011, Schritt 17).
 * Die reine Umwandlung Formular ⇄ API-Body: leere Zeilen verwerfen, Standard nur
 * bei optionalen Argumenten, Auswahl-Optionen, Grenzen als Zahlen, Rundreise.
 */
import { describe, it, expect } from 'vitest';
import {
  toBody,
  fromDefinition,
  brauchtOrdner,
  LEER_FORM,
  type FlowFormState,
} from './flowFormState';
import type { FlowDefinition } from '@/types/flows';

function form(overrides: Partial<FlowFormState> = {}): FlowFormState {
  return { ...LEER_FORM, argumente: [], werkzeuge: [], ordner: [], rollen: [], ...overrides };
}

describe('toBody', () => {
  it('verwirft leere Ordner-Zeilen und trimmt', () => {
    const body = toBody(form({ ordner: ['  /a  ', '', '   '] }));
    expect(body.ordner).toEqual(['/a']);
  });

  it('verwirft Argumente ohne Namen', () => {
    const body = toBody(
      form({
        argumente: [
          { name: '', typ: 'freitext', beschreibung: '', pflicht: false },
          { name: 'thema', typ: 'freitext', beschreibung: 'x', pflicht: true },
        ],
      })
    );
    expect(body.argumente).toHaveLength(1);
    expect((body.argumente as unknown[])[0]!).toMatchObject({ name: 'thema', pflicht: true });
  });

  it('schickt den Standard nur bei optionalen Argumenten mit', () => {
    const opt = toBody(
      form({
        argumente: [
          { name: 'stil', typ: 'freitext', beschreibung: '', pflicht: false, standard: 'kurz' },
        ],
      })
    );
    expect((opt.argumente as { standard?: string }[])[0]!.standard).toBe('kurz');

    const pflicht = toBody(
      form({
        argumente: [
          { name: 'stil', typ: 'freitext', beschreibung: '', pflicht: true, standard: 'kurz' },
        ],
      })
    );
    expect((pflicht.argumente as { standard?: string }[])[0]!.standard).toBeUndefined();
  });

  it('übernimmt Auswahl-Optionen nur bei typ=auswahl und trimmt', () => {
    const body = toBody(
      form({
        argumente: [
          {
            name: 'stil',
            typ: 'auswahl',
            beschreibung: '',
            pflicht: false,
            optionen: [' kurz ', 'lang', ''],
          },
        ],
      })
    );
    expect((body.argumente as { optionen?: string[] }[])[0]!.optionen).toEqual(['kurz', 'lang']);
  });

  it('führt die Grenzen als Zahlen', () => {
    const body = toBody(
      form({ grenzen: { max_aufrufe: 5, zeitlimit_s: 60, werkzeug_runden: 3, max_tiefe: 3 } })
    );
    expect(body.grenzen).toEqual({
      max_aufrufe: 5,
      zeitlimit_s: 60,
      werkzeug_runden: 3,
      max_tiefe: 3,
    });
  });

  it('verwirft Rollen ohne Namen', () => {
    const body = toBody(
      form({
        werkzeuge: ['subagent'],
        rollen: [
          { name: '', werkzeuge: [], ergebnis: { felder: [], max_zeichen: 2000 }, prompt: '' },
          {
            name: 'leser',
            werkzeuge: [],
            ergebnis: { felder: ['fazit'], max_zeichen: 1000 },
            prompt: 'lies',
          },
        ],
      })
    );
    expect(body.rollen).toHaveLength(1);
    expect((body.rollen as { name: string }[])[0]!.name).toBe('leser');
  });
});

describe('fromDefinition / Rundreise', () => {
  it('füllt das Formular aus einer Definition und ergänzt fehlende Grenzen', () => {
    const def: FlowDefinition = {
      name: 'recherche',
      beschreibung: 'sucht',
      argumente: [{ name: 'thema', typ: 'freitext', beschreibung: '', pflicht: true }],
      ordner: ['/a'],
      werkzeuge: ['web_suche'],
      rollen: [],
      schritte: [],
      grenzen: { max_aufrufe: 30, zeitlimit_s: 600, werkzeug_runden: 8, max_tiefe: 2 },
      prompt: '# Titel',
    };
    const state = fromDefinition(def);
    expect(state.name).toBe('recherche');
    expect(state.prompt).toBe('# Titel');
    expect(state.grenzen.max_aufrufe).toBe(30);
    // toBody(fromDefinition(def)) enthält dieselben Kernfelder.
    const body = toBody(state);
    expect(body).toMatchObject({
      name: 'recherche',
      werkzeuge: ['web_suche'],
      ordner: ['/a'],
      prompt: '# Titel',
    });
  });
});

describe('brauchtOrdner', () => {
  it('ist wahr für Datei-/Terminal-Werkzeuge', () => {
    expect(brauchtOrdner(['rag_suche'])).toBe(false);
    expect(brauchtOrdner(['web_suche', 'dateien_lesen'])).toBe(true);
    expect(brauchtOrdner(['terminal'])).toBe(true);
  });
});

describe('Schritt-Kette (B7)', () => {
  it('nimmt Schritte in den API-Body und verwirft namenlose', () => {
    const body = toBody(
      form({
        schritte: [
          {
            name: 'suchen',
            typ: 'subagent',
            rolle: 'sucher',
            auftrag: 'Finde {{q}}',
            iterationen: 1,
          },
          { name: '', typ: 'subagent', rolle: 'x', auftrag: 'y', iterationen: 1 },
        ],
      })
    );
    const schritte = body.schritte as Record<string, unknown>[];
    expect(schritte).toHaveLength(1);
    expect(schritte[0]).toMatchObject({ name: 'suchen', typ: 'subagent', rolle: 'sucher' });
  });

  it('werkzeug-Schritt: nur Werkzeug + gefüllte Parameter, keine Rollen-Felder', () => {
    const body = toBody(
      form({
        schritte: [
          {
            name: 'w',
            typ: 'werkzeug',
            werkzeug: 'web_suche',
            parameter: { query: '{{q}}', leer: '' },
            iterationen: 2,
          },
        ],
      })
    );
    const step = (body.schritte as Record<string, unknown>[])[0]!;
    expect(step).toMatchObject({
      name: 'w',
      typ: 'werkzeug',
      werkzeug: 'web_suche',
      iterationen: 2,
    });
    expect(step.parameter).toEqual({ query: '{{q}}' });
    expect(step.rolle).toBeUndefined();
  });

  it('Rundreise: fromDefinition übernimmt Schritte', () => {
    const state = fromDefinition({
      name: 'k',
      beschreibung: '',
      argumente: [],
      ordner: [],
      werkzeuge: ['subagent'],
      rollen: [],
      schritte: [{ name: 's', typ: 'subagent', rolle: 'r', auftrag: 'a', iterationen: 3 }],
      grenzen: { max_aufrufe: 20, zeitlimit_s: 900, werkzeug_runden: 10, max_tiefe: 2 },
      prompt: 'P',
    });
    expect(state.schritte).toHaveLength(1);
    expect(state.schritte[0]).toMatchObject({ name: 's', iterationen: 3 });
  });
});
