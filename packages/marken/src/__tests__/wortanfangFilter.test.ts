/**
 * Die scharfe Suche der Befehlspalette (5.11.0): jedes Wort der Eingabe
 * beginnt ein Wort des Eintrags, ab drei Zeichen genügt ein Stück mitten im
 * Wort. Vorher suchte `cmdk` unscharf, und „Ab“ fand auch „Belege“.
 */
import { wortanfangFilter } from '../primitive/command';

describe('wortanfangFilter', () => {
  it('findet am Wortanfang, nicht verstreute Buchstaben', () => {
    expect(wortanfangFilter('Abschluss abschluss', 'Ab')).toBeGreaterThan(0);
    expect(wortanfangFilter('Belege Test Testfassung belege', 'Ab')).toBe(0);
    expect(wortanfangFilter('Verwaltung Benutzer', 'ben')).toBeGreaterThan(0);
    expect(wortanfangFilter('Verwaltung Benutzer', 'vb')).toBe(0);
  });

  it('jedes Wort der Eingabe muss passen', () => {
    expect(wortanfangFilter('Verwaltung Benutzer', 'verw ben')).toBeGreaterThan(0);
    expect(wortanfangFilter('Verwaltung Benutzer', 'verw apps')).toBe(0);
  });

  it('ab drei Zeichen auch mitten im Wort, mit niedrigerem Rang', () => {
    const mitte = wortanfangFilter('Reisekosten reisekosten', 'kosten');
    expect(mitte).toBeGreaterThan(0);
    expect(mitte).toBeLessThan(wortanfangFilter('Reisekosten reisekosten', 'reise'));
    expect(wortanfangFilter('Reisekosten reisekosten', 'ko')).toBe(0);
  });

  it('ein Eintrag, der mit der Eingabe beginnt, steht oben', () => {
    expect(wortanfangFilter('Urlaub urlaub', 'url')).toBe(1);
    expect(wortanfangFilter('Einstellungen Urlaub', 'url')).toBeLessThan(1);
  });

  it('ohne Rücksicht auf Groß- und Kleinschreibung und Akzente', () => {
    expect(wortanfangFilter('Übersicht', 'ub')).toBeGreaterThan(0);
    expect(wortanfangFilter('Ubersicht', 'Üb')).toBeGreaterThan(0);
  });

  it('auch die Schlüsselwörter zählen, und leer passt alles', () => {
    expect(wortanfangFilter('Startseite', 'home', ['Home'])).toBeGreaterThan(0);
    expect(wortanfangFilter('Belege', '  ')).toBe(1);
  });
});
