/**
 * Eine Einheit im ganzen Produkt (Plan 023 D4).
 *
 * Am 21.08.2026 am Geraet gemessen, alles auf einer Kachel: Kopfzeile
 * `261 MB`, Text darunter `~274 MB`, Detailseite noch einmal `261 MB`. Der
 * Katalogwert ist 274000000 Bytes. Die 261 entstanden, weil durch 1024³
 * geteilt und trotzdem "MB" darueber geschrieben wurde.
 */
import { describe, it, expect } from 'vitest';
import { formatBytes, formatBytesBinaer, formatDate } from '../formatting';

describe('formatBytes', () => {
  it('nennt 274000000 Bytes 274 MB, nicht 261', () => {
    // Genau der Wert von nomic-embed-text im Katalog. Der Beschreibungstext
    // derselben Kachel sagt "~274 MB" und hatte damit immer recht.
    expect(formatBytes(274_000_000)).toBe('274 MB');
  });

  it('nennt 5000000000 Bytes 5 GB, nicht 4,7', () => {
    expect(formatBytes(5_000_000_000)).toBe('5 GB');
  });

  it('schreibt deutsch, mit Komma', () => {
    expect(formatBytes(16_400_000_000)).toBe('16,4 GB');
  });

  it('faellt unter einem Megabyte auf Kilobyte', () => {
    // Der Anfang eines Downloads. "0 MB" neben einem Balken, der sich bewegt,
    // sieht nach Stillstand aus.
    expect(formatBytes(480_000)).toBe('480 KB');
  });

  it('unterscheidet null Bytes von keiner Angabe', () => {
    // Null ist eine bekannte Groesse: am Anfang eines Downloads ist noch
    // nichts geladen. "N/A von 16,4 GB" waere Unsinn.
    // Dieselbe Einheit wie bei der Schwesterfunktion. Zwei Funktionen in
    // einem PR ueber Einheiten, die bei derselben Zahl verschieden schreiben,
    // waeren das falsche Vorbild.
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(null)).toBe('N/A');
    expect(formatBytes(undefined)).toBe('N/A');
  });

  it('die Grenzen liegen bei glatten Tausenderschritten', () => {
    expect(formatBytes(999_999)).toBe('1.000 KB');
    expect(formatBytes(1_000_000)).toBe('1 MB');
    expect(formatBytes(999_999_999)).toBe('1.000 MB');
    expect(formatBytes(1_000_000_000)).toBe('1 GB');
  });

  it('unter einem Kilobyte bleibt es bei Bytes', () => {
    expect(formatBytes(12)).toBe('12 B');
  });
});

describe('formatBytesBinaer', () => {
  /**
   * Die zweite Zaehlweise, und sie ist Absicht. `df -h` nennt die Platte
   * dieses Geraets (1966310756352 Bytes) "1,8T". Wer im Terminal nachsieht,
   * soll dieselbe Zahl finden. Mit Tausenderschritten hiesse sie 2,0 TB.
   */
  it('rechnet in 1024er-Schritten wie das Betriebssystem', () => {
    expect(formatBytesBinaer(1024 ** 3)).toBe('1 GB');
    expect(formatBytesBinaer(5 * 1024 ** 3)).toBe('5 GB');
    // Dieselbe Zahl, die formatBytes 5 GB nennt.
    expect(formatBytesBinaer(5_000_000_000)).toBe('4,7 GB');
    expect(formatBytes(5_000_000_000)).toBe('5 GB');
  });

  it('unter einem Kilobyte bleibt es bei Bytes', () => {
    expect(formatBytesBinaer(12)).toBe('12 B');
    expect(formatBytesBinaer(0)).toBe('0 B');
  });

  it('ohne Angabe steht N/A da', () => {
    expect(formatBytesBinaer(null)).toBe('N/A');
    expect(formatBytesBinaer(undefined)).toBe('N/A');
  });
});

describe('formatDate', () => {
  /**
   * Ein Zeitpunkt steht in Ortszeit da, nicht in UTC (28.08.2026).
   *
   * Die Zone der Testreihe ist in `vite.config.ts` auf `Europe/Berlin`
   * festgenagelt — die des Geraets. Ohne diese Festlegung schrieb derselbe
   * Zeitpunkt auf dem Laptop „04:00" und in der CI „02:00", und der
   * Sicherungs-Test war rot (Lauf 33163888736). Bricht dieser Test hier, ist
   * die Zone verstellt und nicht die Funktion kaputt.
   */
  it('schreibt einen Zeitpunkt deutsch und in Ortszeit', () => {
    expect(formatDate('2026-08-27T02:00:00.000Z')).toBe('27.08.2026, 04:00');
  });

  it('ohne Zeitpunkt steht ein Strich da', () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDate(undefined)).toBe('-');
    expect(formatDate('')).toBe('-');
  });
});
