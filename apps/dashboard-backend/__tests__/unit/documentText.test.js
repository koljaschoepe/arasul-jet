/**
 * Dokument-Text für `datei`-Argumente (Plan 011, Schritt 18).
 *
 * Der Runner speist bei einem `datei`-Argument den indexierten Text des
 * Dokuments in den Kontext ein. Hier steht die reine Lade-Logik im Fokus:
 * Bruchstücke in Reihenfolge zusammensetzen, am Budget kürzen, auf die
 * Zusammenfassung ausweichen, und niemals werfen.
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { ladeDokumentText } = require('../../src/services/flows/documentText');

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

  // F-07: optionaler Wissensraum-Zuschnitt gegen Namenskollisionen über Projekte.
  describe('Space-Zuschnitt (F-07)', () => {
    it('schränkt die Suche auf die übergebenen spaceIds ein', async () => {
      const query = fakeQuery({
        doc: { rows: [{ id: 'd1', title: 'Bericht' }] },
        chunks: { rows: [{ chunk_text: 'Inhalt.' }] },
      });
      await ladeDokumentText({ filename: 'bericht.pdf', spaceIds: ['s1', 's2'] }, { query });
      const docCall = query.calls.find(c => /FROM documents/i.test(c.sql));
      expect(docCall.sql).toMatch(/space_id = ANY\(\$2::uuid\[\]\)/i);
      // Regression (Review-Critical): space_id ist UUID — KEIN `= ''`-Vergleich,
      // der die Query am Typ-Coercion scheitern ließe.
      expect(docCall.sql).not.toMatch(/space_id = ''/);
      expect(docCall.params).toEqual(['bericht.pdf', ['s1', 's2']]);
    });

    it('sucht ohne spaceIds projektübergreifend (kein space-Filter, ein Parameter)', async () => {
      const query = fakeQuery({
        doc: { rows: [{ id: 'd1', title: 'Bericht' }] },
        chunks: { rows: [{ chunk_text: 'Inhalt.' }] },
      });
      await ladeDokumentText({ filename: 'bericht.pdf' }, { query });
      const docCall = query.calls.find(c => /FROM documents/i.test(c.sql));
      expect(docCall.sql).not.toMatch(/space_id = ANY/i);
      expect(docCall.params).toEqual(['bericht.pdf']);
    });

    it('behandelt eine leere spaceIds-Liste wie „kein Zuschnitt"', async () => {
      const query = fakeQuery({
        doc: { rows: [{ id: 'd1', title: 'Bericht' }] },
        chunks: { rows: [{ chunk_text: 'Inhalt.' }] },
      });
      await ladeDokumentText({ filename: 'bericht.pdf', spaceIds: [] }, { query });
      const docCall = query.calls.find(c => /FROM documents/i.test(c.sql));
      expect(docCall.sql).not.toMatch(/space_id = ANY/i);
      expect(docCall.params).toEqual(['bericht.pdf']);
    });

    // Plan 021 (live gefunden): eine explizit benannte, aber in einem anderen
    // Raum indexierte Datei war unauffindbar → das Modell spekulierte aus dem
    // Namen. Fallback: findet der Zuschnitt nichts, wird raumübergreifend gesucht.
    it('fällt raumübergreifend zurück, wenn der Zuschnitt die benannte Datei nicht findet', async () => {
      const query = jest.fn(async sql => {
        if (/FROM documents/i.test(sql)) {
          return /space_id = ANY/i.test(sql) ? { rows: [] } : { rows: [{ id: 'd9', title: 'Bericht' }] };
        }
        if (/FROM document_chunks/i.test(sql)) return { rows: [{ chunk_text: 'Echter Inhalt.' }] };
        return { rows: [] };
      });
      const res = await ladeDokumentText({ filename: 'bericht.pdf', spaceIds: ['s1'] }, { query });
      expect(res.gefunden).toBe(true);
      expect(res.text).toContain('Echter Inhalt.');
      const docCalls = query.mock.calls.filter(c => /FROM documents/i.test(c[0]));
      expect(docCalls.length).toBe(2);
      expect(/space_id = ANY/i.test(docCalls[0][0])).toBe(true); // zuerst scoped
      expect(/space_id = ANY/i.test(docCalls[1][0])).toBe(false); // dann unscoped
    });

    it('KEIN Fallback, wenn der Zuschnitt schon trifft (F-07 bleibt bevorzugt)', async () => {
      const query = jest.fn(async sql => {
        if (/FROM documents/i.test(sql)) return { rows: [{ id: 'd1', title: 'Bericht' }] };
        if (/FROM document_chunks/i.test(sql)) return { rows: [{ chunk_text: 'Inhalt.' }] };
        return { rows: [] };
      });
      await ladeDokumentText({ filename: 'bericht.pdf', spaceIds: ['s1'] }, { query });
      const docCalls = query.mock.calls.filter(c => /FROM documents/i.test(c[0]));
      expect(docCalls.length).toBe(1); // nur die scoped Suche, kein Fallback
    });
  });
});
