/**
 * Automatischer Chat-Titel aus der ersten Nachricht (Plan 011, Schritt 20).
 */

jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

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
