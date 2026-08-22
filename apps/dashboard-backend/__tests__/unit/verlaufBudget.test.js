/**
 * Plan 023 D7, Schritt 2: der Verlauf hat ein eigenes Token-Budget.
 *
 * Warum das eigene Tests braucht: der Kontext-Haushalt im Runner greift erst
 * bei NUM_CTX * 0.7, also rund 22900 Token, und ein Verlauf von 12060 Token
 * laeuft dort nie hinein. Das Budget hier ist die einzige Stelle, die die Zeit
 * bis zum ersten Wort begrenzt. Faellt es still auf einen zu grossen Wert
 * zurueck oder kuerzt es die falsche Nachricht, merkt das niemand an einer
 * Fehlermeldung, sondern nur an einer Vorfuehrung, die haengt.
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';

const {
  verlaufAufBudget,
  VERLAUF_TOKEN_BUDGET,
} = require('../../src/services/llm/chatAgentRunner');

/** Dieselbe Schaetzung wie im Runner. */
const kosten = text => Math.ceil(String(text || '').length / 3.2) + 8;
const summe = liste => liste.reduce((n, m) => n + kosten(m.content), 0);

const nachricht = (rolle, zeichen) => ({ role: rolle, content: 'x'.repeat(zeichen) });

describe('verlaufAufBudget (Plan 023 D7)', () => {
  test('ein kurzer Verlauf bleibt unangetastet', () => {
    const roh = [
      { role: 'user', content: 'Was kostet die Lizenz?' },
      { role: 'assistant', content: 'Neunhundert Euro im Jahr.' },
      { role: 'user', content: 'Und mit Wartung?' },
    ];
    const { verlauf, weggelassen, gekuerzt } = verlaufAufBudget(roh);
    expect(verlauf).toEqual(roh);
    expect(weggelassen).toBe(0);
    expect(gekuerzt).toBe(0);
  });

  test('der schlimmste Fall aus dem Plan faellt unter das Budget', () => {
    // Zwoelf Nachrichten an der Kappungsgrenze MAX_MESSAGE_CHARS: gemessen
    // 12060 Token, die vorher vollstaendig mitgingen.
    const roh = Array.from({ length: 12 }, (_, i) =>
      nachricht(i % 2 === 0 ? 'user' : 'assistant', 8000)
    );
    expect(summe(roh)).toBeGreaterThan(12000);

    const { verlauf, weggelassen } = verlaufAufBudget(roh);
    // Die geschuetzten juengsten Nachrichten duerfen das Budget sprengen, der
    // Rest nicht. Geprueft wird deshalb gegen alles ausser dem Schutz.
    const ohneSchutz = verlauf.slice(0, Math.max(0, verlauf.length - 2));
    expect(summe(ohneSchutz)).toBeLessThanOrEqual(VERLAUF_TOKEN_BUDGET);
    expect(weggelassen).toBeGreaterThan(0);
    expect(verlauf.length).toBeLessThan(roh.length);
  });

  test('die juengste Nachricht bleibt vollstaendig, auch wenn sie riesig ist', () => {
    const frage = nachricht('user', 20000);
    const roh = [...Array.from({ length: 6 }, () => nachricht('assistant', 4000)), frage];
    const { verlauf } = verlaufAufBudget(roh);
    expect(verlauf[verlauf.length - 1].content).toBe(frage.content);
    expect(verlauf[verlauf.length - 1].content).toHaveLength(20000);
  });

  test('was weggelassen wurde, sagt eine Zeile, statt still zu verschwinden', () => {
    const roh = Array.from({ length: 12 }, (_, i) =>
      nachricht(i % 2 === 0 ? 'user' : 'assistant', 8000)
    );
    const { verlauf, weggelassen } = verlaufAufBudget(roh);
    expect(verlauf[0].content).toContain('ausgelassen');
    expect(verlauf[0].content).toContain(String(weggelassen));
  });

  test('ohne Weglassen steht auch keine Hinweiszeile da', () => {
    const roh = [
      { role: 'user', content: 'kurz' },
      { role: 'assistant', content: 'auch kurz' },
    ];
    const { verlauf } = verlaufAufBudget(roh);
    expect(verlauf.some(m => m.content.includes('ausgelassen'))).toBe(false);
  });

  test('ein leerer Verlauf bleibt leer', () => {
    expect(verlaufAufBudget([])).toEqual({ verlauf: [], weggelassen: 0, gekuerzt: 0 });
  });

  test('eine mittelgrosse Nachricht wird gekuerzt statt weggeworfen', () => {
    // Der Schutz deckt die zwei juengsten ab; die dritte ist gross genug, um
    // das Budget zu sprengen (5000 Zeichen sind rund 1570 Token bei einem
    // Budget von 1200), auf VERLAUF_KURZ_CHARS gekuerzt passt sie hinein.
    const roh = [
      nachricht('user', 5000),
      nachricht('assistant', 200),
      nachricht('user', 200),
    ];
    const { verlauf, gekuerzt } = verlaufAufBudget(roh);
    expect(gekuerzt).toBe(1);
    expect(verlauf[0].content.length).toBeLessThan(5000);
    expect(verlauf).toHaveLength(3);
  });
});
