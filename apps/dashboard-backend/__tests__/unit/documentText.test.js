/**
 * Dokument-Text für `datei`-Argumente (Plan 011, Schritt 18).
 *
 * Der Runner speist bei einem `datei`-Argument den indexierten Text des
 * Dokuments in den Kontext ein. Hier steht die reine Lade-Logik im Fokus:
 * Bruchstücke in Reihenfolge zusammensetzen, am Budget kürzen, auf die
 * Zusammenfassung ausweichen, und niemals werfen.
 */

jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { ladeDokumentText } = require('../../src/services/skills/documentText');

/** Baut ein query-Doppel, das die Aufrufe der Reihe nach beantwortet. */
function fakeQuery(antworten) {
  const calls = [];
  const q = jest.fn(async (sql, params) => {
    calls.push({ sql, params });
    // Nach dem SQL entscheiden, welche Antwort dran ist.
    if (/FROM documents\s+WHERE/i.test(sql) && /filename/i.test(sql)) return antworten.doc;
    if (/FROM document_chunks/i.test(sql)) return antworten.chunks;
    if (/summary/i.test(sql)) return antworten.summary;
    return { rows: [] };
  });
  q.calls = calls;
  return q;
}

describe('ladeDokumentText', () => {
  it('setzt die Bruchstücke in Reihenfolge zusammen', async () => {
    const query = fakeQuery({
      doc: { rows: [{ id: 'd1', title: 'Vertrag' }] },
      chunks: { rows: [{ chunk_text: 'Teil eins.' }, { chunk_text: 'Teil zwei.' }] },
    });
    const r = await ladeDokumentText({ filename: 'vertrag.pdf' }, { query });
    expect(r.gefunden).toBe(true);
    expect(r.titel).toBe('Vertrag');
    expect(r.text).toBe('Teil eins.\nTeil zwei.');
    expect(r.gekuerzt).toBe(false);
  });

  it('kürzt am Zeichen-Budget und meldet die Kürzung', async () => {
    const query = fakeQuery({
      doc: { rows: [{ id: 'd1', title: null }] },
      chunks: { rows: [{ chunk_text: 'x'.repeat(50) }] },
    });
    const r = await ladeDokumentText({ filename: 'gross.txt', maxZeichen: 10 }, { query });
    expect(r.text).toHaveLength(10);
    expect(r.gekuerzt).toBe(true);
  });

  it('weicht auf die gespeicherte Zusammenfassung aus, wenn keine Bruchstücke da sind', async () => {
    const query = fakeQuery({
      doc: { rows: [{ id: 'd1', title: 'Doc' }] },
      chunks: { rows: [] },
      summary: { rows: [{ summary: 'Kurzfassung.' }] },
    });
    const r = await ladeDokumentText({ filename: 'neu.pdf' }, { query });
    expect(r.text).toBe('Kurzfassung.');
    expect(r.gefunden).toBe(true);
  });

  it('meldet „nicht gefunden" für einen unbekannten Dateinamen', async () => {
    const query = fakeQuery({ doc: { rows: [] } });
    const r = await ladeDokumentText({ filename: 'gibtsnicht.pdf' }, { query });
    expect(r.gefunden).toBe(false);
    expect(r.text).toBe('');
  });

  it('liefert leer bei leerem Dateinamen — ohne die Datenbank zu fragen', async () => {
    const query = fakeQuery({});
    const r = await ladeDokumentText({ filename: '  ' }, { query });
    expect(r.gefunden).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('wirft nie — ein Datenbankfehler wird zu „nicht gefunden"', async () => {
    const query = jest.fn(async () => {
      throw new Error('DB weg');
    });
    const r = await ladeDokumentText({ filename: 'x.pdf' }, { query });
    expect(r.gefunden).toBe(false);
    expect(r.text).toBe('');
  });
});
