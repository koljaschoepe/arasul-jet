/**
 * Das englische Wörterbuch der Demo (J46, M7): die Sätze, die der Weg der
 * Demo zeigt, kommen englisch heraus, und Englisch bleibt Englisch.
 */
import { describe, expect, it } from 'vitest';
import { uebersetzeText } from './uebersetzung';
import { WOERTER } from './woerterbuch';

describe('Wörterbuch', () => {
  it('übersetzt feste Sätze und behält den Rand', () => {
    expect(uebersetzeText('  Test nach Live ')).toBe('  Test to live ');
    expect(uebersetzeText('Rückmeldung zu dieser Seite')).toBe('Feedback on this page');
  });

  it('übersetzt Sätze mit Zahlen und Namen', () => {
    expect(uebersetzeText('Guten Tag, Beispiel-Mitarbeiter')).toBe('Hello, Sample employee');
    expect(uebersetzeText('Freitag, 20. November 2026')).toBe('Friday, 20 November 2026');
    expect(uebersetzeText('1\u00a0Meldung umgesetzt')).toBe('1 feedback item done');
    expect(uebersetzeText('Angebote live schalten?')).toBe('Switch Quotes live?');
    expect(uebersetzeText('Es läuft jetzt Fassung 1.5.0.')).toBe('Version 1.5.0 is now running.');
    expect(
      uebersetzeText(
        'Was in den Apps über das Icon oben rechts gemeldet wurde. 3 Meldungen sind offen.'
      )
    ).toBe('What was reported in the apps via the icon at the top right. 3 items are open.');
  });

  it('lässt Englisches und Unbekanntes stehen', () => {
    for (const englisch of Object.values(WOERTER)) {
      const wieder = uebersetzeText(englisch);
      // Einige Wörter sind in beiden Sprachen gleich (App, Live, Test).
      expect(wieder === null || wieder === englisch).toBe(true);
    }
    expect(uebersetzeText('Hotel Seeblick')).toBeNull();
  });

  it('jeder Weg der Demo ist erfasst', () => {
    // Gemessen am Bau (`demo/abnahme.mjs --sammeln`, 20.11.2026).
    const gemessen = [
      'Aktivitätsleiste',
      'Alles erledigt',
      'Für Sie',
      'Keine Freigabe liegt bei Ihnen.',
      'Keine offene Freigabe',
      'Was fehlt oder stimmt nicht?',
      'Bildschirmfoto mitschicken',
      'Ihre Rückmeldung ist angekommen. Wer die App weiterbaut, sieht sie jetzt.',
      'Offen (neu und angenommen)',
      'Wer gemeldet hat, erfährt davon nichts.',
      'Stand speichern',
      'Was in der Testfassung neuer ist als live. Ein Klick schaltet live, mit Sicherung vorher und Rückweg.',
      'Keine App hat im Test eine Fassung, die live noch fehlt.',
      'Zuletzt live geschaltet',
      'Erscheinungsbild',
    ];
    for (const satz of gemessen) expect(uebersetzeText(satz), satz).not.toBeNull();
  });
});
