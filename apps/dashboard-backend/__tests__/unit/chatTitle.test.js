/**
 * Automatischer Chat-Titel aus der ersten Nachricht (Plan 011, Schritt 20).
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { ableitenTitel, setzeAutoTitel } = require('../../src/services/chat/chatTitle');

describe('ableitenTitel', () => {
  it('nimmt die erste nicht-leere Zeile und normalisiert Leerraum', () => {
    expect(ableitenTitel('\n\n  Wie   geht es dir?  \nzweite Zeile')).toBe('Wie geht es dir?');
  });

  it('kürzt lange Titel mit einem Auslassungszeichen', () => {
    const lang = 'A'.repeat(80);
    const t = ableitenTitel(lang);
    expect(t.length).toBe(60);
    expect(t.endsWith('…')).toBe(true);
  });

  it('gibt leer zurück, wenn nichts Sinnvolles übrig bleibt', () => {
    expect(ableitenTitel('   \n  \n')).toBe('');
    expect(ableitenTitel('')).toBe('');
  });
});

describe('setzeAutoTitel', () => {
  it('titelt nur Nutzer-Nachrichten', async () => {
    const query = jest.fn();
    const r = await setzeAutoTitel(
      { conversationId: 1, role: 'assistant', content: 'Hallo' },
      { query }
    );
    expect(r).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('setzt den Titel, wenn die Unterhaltung noch den Vorgabetitel trägt', async () => {
    const query = jest.fn(async () => ({ rowCount: 1 }));
    const r = await setzeAutoTitel(
      { conversationId: 7, role: 'user', content: 'Fasse den Vertrag zusammen' },
      { query }
    );
    expect(r).toBe('Fasse den Vertrag zusammen');
    // Die Titel-Bedingung steckt in der WHERE-Klausel (nur Vorgabetitel).
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/title = ANY/i);
    expect(params[1]).toBe('Fasse den Vertrag zusammen');
  });

  it('ändert nichts, wenn der Titel schon vergeben ist (rowCount 0)', async () => {
    const query = jest.fn(async () => ({ rowCount: 0 }));
    const r = await setzeAutoTitel({ conversationId: 7, role: 'user', content: 'Zweite Frage' }, { query });
    expect(r).toBeNull();
  });

  it('wirft nie — ein Datenbankfehler wird geschluckt', async () => {
    const query = jest.fn(async () => {
      throw new Error('DB weg');
    });
    const r = await setzeAutoTitel({ conversationId: 7, role: 'user', content: 'x' }, { query });
    expect(r).toBeNull();
  });
});

/**
 * Plan 023 E5: der Chat heisst nach dem, was darin getan wurde.
 *
 * Bis zum 22.08.2026 war der Titel die erste Zeile der ersten Frage. Bei zehn
 * Chats aus zehn Auftraegen stehen dann zehn Fragen untereinander, und wer
 * zurueckspringt, sucht nach dem, was herauskam.
 */
const {
  titelSaeubern,
  titelFaellig,
  benenneNachLauf,
  TITEL_ANWEISUNG,
} = require('../../src/services/chat/chatTitle');

describe('titelSaeubern (Plan 023 E5)', () => {
  it.each([
    ['"Handbuch Netzwerktechnik"', 'Handbuch Netzwerktechnik'],
    ['Titel: Zehn Kapitel geschrieben.', 'Zehn Kapitel geschrieben'],
    ['Überschrift: Rechnung geprüft', 'Rechnung geprüft'],
    ['„Drei Dateien angelegt"', 'Drei Dateien angelegt'],
    ['Bericht   erstellt\n', 'Bericht erstellt'],
  ])('macht aus %s den Titel %s', (roh, erwartet) => {
    expect(titelSaeubern(roh)).toBe(erwartet);
  });

  it('wirft den Gedankengang eines denkenden Modells weg', () => {
    expect(titelSaeubern('<think>Hmm, was passt?</think>\nDrei Dateien angelegt')).toBe(
      'Drei Dateien angelegt'
    );
  });

  it('nimmt die LETZTE Zeile, wenn das Modell Vorrede macht', () => {
    expect(titelSaeubern('Gerne! Hier ist der Titel:\nRechnung geprüft')).toBe('Rechnung geprüft');
  });

  it('gibt nichts zurück, wenn nichts Brauchbares übrig bleibt', () => {
    expect(titelSaeubern('')).toBe('');
    expect(titelSaeubern('ab')).toBe('');
    expect(titelSaeubern('   ')).toBe('');
  });

  it('kürzt einen zu langen Titel', () => {
    const lang = titelSaeubern('Wort '.repeat(40));
    expect(lang.length).toBeLessThanOrEqual(60);
    expect(lang.endsWith('…')).toBe(true);
  });
});

describe('titelFaellig (Plan 023 E5)', () => {
  it('lässt einen von Hand vergebenen Titel in Ruhe', () => {
    // Genau dafür ist titel_quelle da: NULL heisst, der Mensch hat entschieden.
    expect(titelFaellig({ titel_quelle: null, message_count: 99, titel_bei_nachrichten: 1 })).toBe(
      false
    );
  });

  it('benennt einen Vorgabetitel und einen Fragetitel', () => {
    expect(titelFaellig({ titel_quelle: 'vorgabe', message_count: 2 })).toBe(true);
    expect(titelFaellig({ titel_quelle: 'frage', message_count: 2 })).toBe(true);
  });

  it('benennt einen Lauf-Titel erst wieder bei doppelter Nachrichtenzahl', () => {
    expect(titelFaellig({ titel_quelle: 'lauf', message_count: 3, titel_bei_nachrichten: 2 })).toBe(
      false
    );
    expect(titelFaellig({ titel_quelle: 'lauf', message_count: 4, titel_bei_nachrichten: 2 })).toBe(
      true
    );
  });

  it('kommt ohne Zeile zurecht', () => {
    expect(titelFaellig(null)).toBe(false);
  });
});

describe('benenneNachLauf (Plan 023 E5)', () => {
  const zeile = (teil = {}) => ({
    rows: [{ title: 'Neuer Chat', message_count: 2, titel_quelle: 'vorgabe', ...teil }],
  });

  it('fragt das Modell und schreibt den gesäuberten Titel', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce(zeile())
      .mockResolvedValueOnce({ rowCount: 1 });
    const post = jest
      .fn()
      .mockResolvedValue({ data: { message: { content: '"Handbuch in zehn Kapiteln"' } } });
    const withGpuLock = fn => fn();

    const titel = await benenneNachLauf(
      {
        conversationId: 7,
        modell: 'qwen3-coder:30b',
        frage: 'Schreib ein Handbuch',
        antwort: 'Zehn Kapitel angelegt',
        dateien: ['kapitel-01.md'],
      },
      { query, post, withGpuLock }
    );

    expect(titel).toBe('Handbuch in zehn Kapiteln');
    expect(post.mock.calls[0][1].model).toBe('qwen3-coder:30b');
    // Dasselbe Modell wie der Lauf: es liegt schon im Speicher.
    expect(post.mock.calls[0][1].options.num_predict).toBeLessThanOrEqual(32);
    expect(query.mock.calls[1][0]).toContain("titel_quelle = 'lauf'");
  });

  it('fragt gar nicht erst, wenn kein Titel fällig ist', async () => {
    const query = jest.fn().mockResolvedValueOnce(zeile({ titel_quelle: null }));
    const post = jest.fn();
    const ergebnis = await benenneNachLauf(
      { conversationId: 7, modell: 'x', frage: 'f', antwort: 'a' },
      { query, post, withGpuLock: fn => fn() }
    );
    expect(ergebnis).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('lässt den alten Titel stehen, wenn das Modell Unbrauchbares liefert', async () => {
    const query = jest.fn().mockResolvedValueOnce(zeile());
    const post = jest.fn().mockResolvedValue({ data: { message: { content: '..' } } });
    const ergebnis = await benenneNachLauf(
      { conversationId: 7, modell: 'x', frage: 'f', antwort: 'a' },
      { query, post, withGpuLock: fn => fn() }
    );
    expect(ergebnis).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('wirft nie, auch wenn das Modell nicht erreichbar ist', async () => {
    // Ein Titel ist eine Bequemlichkeit. Er darf nichts gefaehrden, schon gar
    // nicht den Abschluss eines Laufs, der gerade fertig geworden ist.
    const query = jest.fn().mockResolvedValueOnce(zeile());
    const post = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(
      benenneNachLauf(
        { conversationId: 7, modell: 'x', frage: 'f', antwort: 'a' },
        { query, post, withGpuLock: fn => fn() }
      )
    ).resolves.toBeNull();
  });

  it('schreibt nicht, wenn der Mensch inzwischen selbst benannt hat', async () => {
    // Die Bedingung im UPDATE ist der Schutz gegen das Wettrennen.
    const query = jest
      .fn()
      .mockResolvedValueOnce(zeile())
      .mockResolvedValueOnce({ rowCount: 0 });
    const post = jest.fn().mockResolvedValue({ data: { message: { content: 'Etwas getan' } } });
    const ergebnis = await benenneNachLauf(
      { conversationId: 7, modell: 'x', frage: 'f', antwort: 'a' },
      { query, post, withGpuLock: fn => fn() }
    );
    expect(ergebnis).toBeNull();
    expect(query.mock.calls[1][0]).toContain('titel_quelle IS NOT NULL');
  });

  it('verlangt vom Modell, das Getane zu benennen, nicht das Gefragte', () => {
    expect(TITEL_ANWEISUNG).toMatch(/WAS GETAN wurde/);
    expect(TITEL_ANWEISUNG).toMatch(/sechs Woertern/);
  });
});
