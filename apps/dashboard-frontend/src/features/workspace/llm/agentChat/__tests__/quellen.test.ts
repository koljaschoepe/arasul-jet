/**
 * Plan 023 E8: woher eine Antwort ihr Wissen hat.
 *
 * Die Auskunft wird deterministisch aus den Schritten gelesen, nicht vom
 * Modell erbeten. Ein Modell zu bitten, seine Quellen zu nennen, ist eine
 * Bitte; eine Schrittliste ist ein Protokoll. Und der Fall, um den es E8
 * eigentlich geht, ist der, in dem das Modell nichts zu nennen hat.
 */
import { describe, it, expect } from 'vitest';
import { quellenAusSchritten, istLeerErgebnis, fundstelle } from '../quellen';
import type { AgentToolStep } from '@/contexts/ChatContext';

const schritt = (t: Partial<AgentToolStep>): AgentToolStep => ({
  tool: 'rag_suche',
  status: 'done',
  ...t,
});

describe('istLeerErgebnis (Plan 023 E8)', () => {
  it.each([
    'Nichts gefunden, die Wissensbasis enthaelt keine passenden Stellen.',
    'Die Datei "x.pdf" wurde im Wissensraum nicht gefunden oder ist noch nicht indexiert.',
    'Keine Treffer.',
  ])('erkennt "%s" als leer', text => {
    expect(istLeerErgebnis(text)).toBe(true);
  });

  it('haelt ein echtes Ergebnis nicht faelschlich fuer leer', () => {
    expect(istLeerErgebnis('Gefundene Stellen:\n1. [handbuch.md] Ein Switch verbindet …')).toBe(
      false
    );
  });

  it('haelt ein fehlendes Ergebnis nicht fuer eine Leermeldung', () => {
    // Ein Schritt ohne Ergebnis ist unbekannt, nicht ergebnislos.
    expect(istLeerErgebnis(undefined)).toBe(false);
    expect(istLeerErgebnis('')).toBe(false);
  });
});

describe('fundstelle (Plan 023 E8)', () => {
  it('zieht Datei und Ausschnitt aus dem Ergebnis', () => {
    const f = fundstelle('Gefundene Stellen:\n1. [handbuch.md] Ein Switch verbindet Geräte …');
    expect(f).toEqual({ datei: 'handbuch.md', stelle: 'Ein Switch verbindet Geräte …' });
  });

  it('gibt null, wenn das Ergebnis keine Fundstelle hat', () => {
    expect(fundstelle('Nichts gefunden.')).toBeNull();
    expect(fundstelle(undefined)).toBeNull();
  });
});

describe('quellenAusSchritten (Plan 023 E8)', () => {
  it('nennt Datei UND Stelle bei einem Treffer', () => {
    // Genau die erste Haelfte der Abnahme.
    const lage = quellenAusSchritten([
      schritt({
        id: 1,
        params: { frage: 'Switch' },
        result: 'Gefundene Stellen:\n1. [handbuch.md] Ein Switch verbindet Geräte im LAN.',
      }),
    ]);
    expect(lage.gesucht).toBe(true);
    expect(lage.quellen).toEqual([
      { datei: 'handbuch.md', stelle: 'Ein Switch verbindet Geräte im LAN.' },
    ]);
    expect(lage.ohneTreffer).toEqual([]);
  });

  it('sagt bei einer erfolglosen Suche, wonach gesucht wurde', () => {
    // Die zweite Haelfte, und der eigentliche Grund fuer E8.
    const lage = quellenAusSchritten([
      schritt({
        id: 1,
        params: { frage: 'Quartalszahlen' },
        result: 'Nichts gefunden, die Wissensbasis enthaelt keine passenden Stellen.',
      }),
    ]);
    expect(lage.gesucht).toBe(true);
    expect(lage.quellen).toEqual([]);
    expect(lage.ohneTreffer).toEqual(['Quartalszahlen']);
  });

  it('schweigt, wenn der Lauf gar nicht in Dokumenten gesucht hat', () => {
    // Ein "keine Quellen" unter jeder Plauderei waere Laerm.
    const lage = quellenAusSchritten([
      schritt({ id: 1, tool: 'terminal', params: { befehl: 'ls' }, result: 'Exit-Code: 0' }),
    ]);
    expect(lage.gesucht).toBe(false);
    expect(lage.quellen).toEqual([]);
  });

  it('nimmt eine gelesene Datei als Quelle', () => {
    const lage = quellenAusSchritten([
      schritt({
        id: 1,
        tool: 'dateien_lesen',
        params: { aktion: 'read', pfad: 'notiz.md' },
        result: 'Hallo Arasul',
      }),
    ]);
    expect(lage.quellen).toEqual([{ datei: 'notiz.md' }]);
  });

  it('zaehlt Schreiben und Auflisten NICHT als Quelle', () => {
    // Geschrieben wird kein Wissen, und eine Ordnerliste ist keine Stelle.
    const lage = quellenAusSchritten([
      schritt({
        id: 1,
        tool: 'dateien_lesen',
        params: { aktion: 'write', pfad: 'neu.md' },
        result: 'ok',
      }),
      schritt({
        id: 2,
        tool: 'dateien_lesen',
        params: { aktion: 'list', pfad: '/' },
        result: 'a\nb',
      }),
    ]);
    expect(lage.quellen).toEqual([]);
  });

  it('nennt dieselbe Datei nur einmal', () => {
    const lage = quellenAusSchritten([
      schritt({
        id: 1,
        tool: 'dateien_lesen',
        params: { aktion: 'read', pfad: 'a.md' },
        result: 'x',
      }),
      schritt({
        id: 2,
        tool: 'dateien_lesen',
        params: { aktion: 'read', pfad: 'a.md' },
        result: 'x',
      }),
    ]);
    expect(lage.quellen).toHaveLength(1);
  });

  it('ueberspringt Schritte, die noch laufen', () => {
    const lage = quellenAusSchritten([
      schritt({ id: 1, status: 'running', params: { frage: 'x' } }),
    ]);
    expect(lage.gesucht).toBe(false);
  });

  it('kommt mit einer Antwort ohne Schritte zurecht', () => {
    expect(quellenAusSchritten(undefined)).toEqual({
      quellen: [],
      ohneTreffer: [],
      gesucht: false,
    });
  });

  it('haelt Treffer und Fehlschlaege im selben Lauf auseinander', () => {
    const lage = quellenAusSchritten([
      schritt({ id: 1, params: { frage: 'Umsatz' }, result: 'Nichts gefunden.' }),
      schritt({
        id: 2,
        params: { frage: 'Switch' },
        result: '1. [handbuch.md] Ein Switch verbindet Geräte.',
      }),
    ]);
    expect(lage.quellen).toHaveLength(1);
    expect(lage.ohneTreffer).toEqual(['Umsatz']);
  });
});
