/**
 * Prüfschritt für Dokument-Flows (Plan 014, Phase 2).
 *
 * Kernzusagen: (1) Die deterministischen Checks erkennen Platzhalter-Reste,
 * offene [Stellen] (ohne Markdown-Links zu treffen), fehlende Gliederung und
 * grobe Längenabweichungen. (2) Der Orchestrator führt HÖCHSTENS eine
 * Korrekturrunde aus und protokolliert Annahmen. (3) Eine kaputte Prüfrunde
 * kippt nie den Lauf — der Entwurf läuft unverändert weiter.
 */

jest.mock('../../src/utils/logger');

const {
  deterministischeChecks,
  sammleOffeneStellen,
  parsePruefJson,
  pruefeUndKorrigiere,
} = require('../../src/services/flows/pruefung');

function checkVon(checks, name) {
  return checks.find(c => c.name === name);
}

describe('deterministischeChecks', () => {
  test('sauberer Entwurf besteht alle Checks', () => {
    const checks = deterministischeChecks('# Angebot\n\nAlles klar und vollständig beschrieben.', {});
    expect(checks.every(c => c.ok)).toBe(true);
  });

  test('erkennt {{Platzhalter}}-Reste und offene [Stellen]', () => {
    const checks = deterministischeChecks(
      'Sehr geehrter {{ ansprechpartner }}, der Preis beträgt [Preis ergänzen].',
      {}
    );
    expect(checkVon(checks, 'platzhalter').ok).toBe(false);
    expect(checkVon(checks, 'platzhalter').detail).toContain('ansprechpartner');
    expect(checkVon(checks, 'offene_stellen').ok).toBe(false);
    expect(checkVon(checks, 'offene_stellen').detail).toContain('Preis ergänzen');
  });

  test('Markdown-Links, Bilder, Fußnoten und Task-Listen sind KEINE offenen Stellen', () => {
    const text =
      'Siehe [unsere Webseite](https://beispiel.de) und ![Logo](logo.png).\n' +
      'Fußnote[^1] und Aufgaben: [x] erledigt, [ ] offen.\n\n[^1]: Quelle.';
    expect(sammleOffeneStellen(text)).toEqual([]);
  });

  test('Referenz-Links samt Definition sind KEINE offenen Stellen', () => {
    const text =
      'Details in [unserem Angebot][ref], echte Lücke: [Preis ergänzen].\n\n' +
      '[ref]: https://beispiel.de/angebot';
    expect(sammleOffeneStellen(text)).toEqual(['Preis ergänzen']);
  });

  test('prüft die deklarierte Gliederung und die Ziel-Wortzahl', () => {
    const checks = deterministischeChecks('# Ausgangslage\n\nKurz.', {
      gliederung: ['Ausgangslage', 'Investition'],
      laenge: { stufe: 'mittel', wortzahl: 500 },
    });
    expect(checkVon(checks, 'gliederung').ok).toBe(false);
    expect(checkVon(checks, 'gliederung').detail).toContain('Investition');
    expect(checkVon(checks, 'wortzahl').ok).toBe(false);
  });
});

describe('parsePruefJson', () => {
  test('liest sauberes JSON und JSON mit Text drumherum', () => {
    expect(parsePruefJson('{"bestanden": false, "probleme": ["x"], "annahmen": []}')).toEqual({
      bestanden: false,
      probleme: ['x'],
      annahmen: [],
    });
    expect(
      parsePruefJson('Hier mein Ergebnis:\n{"bestanden": true, "probleme": [], "annahmen": ["a"]}\nFertig.')
    ).toEqual({ bestanden: true, probleme: [], annahmen: ['a'] });
  });

  test('liefert null bei Unlesbarem', () => {
    expect(parsePruefJson('Alles gut, keine Probleme!')).toBeNull();
  });
});

describe('pruefeUndKorrigiere', () => {
  function stepRecorderMock() {
    let id = 0;
    return {
      schritte: [],
      beginnen: jest.fn(async function ({ kind, name, input }) {
        id += 1;
        this.schritte.push({ id, kind, name, input });
        return { id };
      }),
      abschliessen: jest.fn(async () => {}),
    };
  }

  const flow = { ausgabe: { format: 'pdf' }, grenzen: { zeitlimit_s: 600 } };

  test('bestandener Entwurf: keine Korrektur, Annahmen aus der Prüfrunde', async () => {
    const runLoop = jest
      .fn()
      .mockResolvedValueOnce({ result: '{"bestanden": true, "probleme": [], "annahmen": ["Lieferzeit 2 Wochen angenommen"]}' });
    const rec = stepRecorderMock();

    const out = await pruefeUndKorrigiere({
      markdown: 'Ein sauberer, ausreichend langer Angebotsentwurf ohne Mängel.',
      flow,
      userInput: 'Erstelle ein Angebot',
      model: 'test',
      context: {},
      stepRecorder: rec,
      runLoop,
    });

    expect(runLoop).toHaveBeenCalledTimes(1);
    expect(out.korrigiert).toBe(false);
    expect(out.annahmen).toEqual(['Lieferzeit 2 Wochen angenommen']);
    // Protokoll-Schritt „pruefung" wurde geschrieben.
    expect(rec.schritte.map(s => s.name)).toEqual(['pruefung']);
    const protokoll = rec.abschliessen.mock.calls[0][0].output;
    expect(protokoll).toContain('✓ Prüfrunde gegen den Auftrag');
  });

  test('Platzhalter-Rest: genau EINE Korrekturrunde, Text wird ersetzt', async () => {
    const runLoop = jest
      .fn()
      // Prüfrunde
      .mockResolvedValueOnce({ result: '{"bestanden": true, "probleme": [], "annahmen": []}' })
      // Korrekturrunde
      .mockResolvedValueOnce({ result: 'Sehr geehrte Frau Beispiel, hier unser vollständiges Angebot.' });
    const rec = stepRecorderMock();

    const out = await pruefeUndKorrigiere({
      markdown: 'Sehr geehrte {{anrede}}, hier unser Angebot mit allen Details dazu.',
      flow,
      userInput: 'Erstelle ein Angebot',
      model: 'test',
      context: {},
      stepRecorder: rec,
      runLoop,
    });

    expect(runLoop).toHaveBeenCalledTimes(2);
    expect(out.korrigiert).toBe(true);
    expect(out.text).toContain('Frau Beispiel');
    expect(rec.schritte.map(s => s.name)).toEqual(['pruefung', 'korrektur']);
  });

  test('nach der Korrektur verbliebene [offene Stellen] landen im Annahmen-Protokoll', async () => {
    const runLoop = jest
      .fn()
      .mockResolvedValueOnce({ result: '{"bestanden": false, "probleme": ["Preis fehlt"], "annahmen": []}' })
      .mockResolvedValueOnce({ result: 'Unser Angebot: Der Gesamtpreis beträgt [Preis ergänzen], zahlbar in 14 Tagen.' });
    const rec = stepRecorderMock();

    const out = await pruefeUndKorrigiere({
      markdown: 'Unser Angebot über den Betrag [Preis ergänzen] mit allen Leistungen.',
      flow,
      userInput: 'Angebot',
      model: 'test',
      context: {},
      stepRecorder: rec,
      runLoop,
    });

    expect(out.korrigiert).toBe(true);
    expect(out.annahmen).toContain('Offen geblieben: [Preis ergänzen]');
  });

  test('kaputte Prüfrunde kippt nichts: Entwurf bleibt, Protokoll benennt es', async () => {
    const runLoop = jest.fn().mockResolvedValueOnce({ result: 'Sieht doch alles gut aus!' });
    const rec = stepRecorderMock();

    const out = await pruefeUndKorrigiere({
      markdown: 'Ein ordentlicher Entwurf ohne deterministische Mängel und genug Text.',
      flow,
      userInput: 'Auftrag',
      model: 'test',
      context: {},
      stepRecorder: rec,
      runLoop,
    });

    expect(out.text).toContain('ordentlicher Entwurf');
    expect(out.korrigiert).toBe(false);
    const protokoll = rec.abschliessen.mock.calls[0][0].output;
    expect(protokoll).toContain('Prüfrunde nicht auswertbar');
  });

  test('eine ZEITLIMIT-abgebrochene Korrektur wird NIE zum Dokument (truncated ohne error)', async () => {
    const runLoop = jest
      .fn()
      .mockResolvedValueOnce({ result: '{"bestanden": false, "probleme": ["zu knapp"], "annahmen": []}' })
      // toolLoop-Zeitlimit: Platzhalter-Text OHNE .error, aber truncated: true.
      .mockResolvedValueOnce({ result: 'Abgebrochen: Zeitlimit von 600s erreicht.', truncated: true });
    const rec = stepRecorderMock();

    const out = await pruefeUndKorrigiere({
      markdown: 'Der ursprüngliche Entwurf mit ausreichend vielen Wörtern für den Check.',
      flow,
      userInput: 'Auftrag',
      model: 'test',
      context: {},
      stepRecorder: rec,
      runLoop,
    });

    expect(out.text).toContain('ursprüngliche Entwurf');
    expect(out.text).not.toContain('Abgebrochen');
    expect(out.korrigiert).toBe(false);
  });

  test('vom Modell stehen gelassene {{Reste}} löst Code deterministisch auf (Live-Befund)', async () => {
    const runLoop = jest
      .fn()
      .mockResolvedValueOnce({ result: '{"bestanden": true, "probleme": [], "annahmen": []}' })
      // Korrektur lässt den Platzhalter stur stehen — wie qwen3-coder im Live-Verify.
      .mockResolvedValueOnce({
        result: 'Sehr geehrter {{ansprechpartner}}, hier unser vollständiges Angebot dazu.',
      });
    const rec = stepRecorderMock();

    const out = await pruefeUndKorrigiere({
      markdown: 'Sehr geehrter {{ansprechpartner}}, hier unser Angebot mit allen Details.',
      flow,
      userInput: 'Angebot',
      model: 'test',
      context: {},
      stepRecorder: rec,
      runLoop,
    });

    expect(out.text).not.toMatch(/\{\{/);
    expect(out.text).toContain('[ansprechpartner]');
    expect(out.annahmen).toContain('Offen geblieben: [ansprechpartner] (Platzhalter war unersetzt)');
    // Kein Doppel-Eintrag durch die [offene-Stellen]-Sammlung.
    expect(out.annahmen.filter(a => a.includes('ansprechpartner'))).toHaveLength(1);
  });

  test('scheiternde Korrektur lässt den Entwurf unverändert (Schritt als Fehler)', async () => {
    const runLoop = jest
      .fn()
      .mockResolvedValueOnce({ result: '{"bestanden": false, "probleme": ["zu knapp"], "annahmen": []}' })
      .mockResolvedValueOnce({ result: '', error: 'Modell nicht erreichbar' });
    const rec = stepRecorderMock();

    const out = await pruefeUndKorrigiere({
      markdown: 'Der ursprüngliche Entwurf mit ausreichend vielen Wörtern für den Check.',
      flow,
      userInput: 'Auftrag',
      model: 'test',
      context: {},
      stepRecorder: rec,
      runLoop,
    });

    expect(out.text).toContain('ursprüngliche Entwurf');
    expect(out.korrigiert).toBe(false);
    const korrekturAbschluss = rec.abschliessen.mock.calls.find(
      c => c[0].status === 'fehler'
    );
    expect(korrekturAbschluss[0].output).toContain('Korrektur fehlgeschlagen');
  });
});
