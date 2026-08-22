/**
 * Plan 023 F4: der Dateibaum lädt nach, solange das Terminal offen ist.
 *
 * Am 22.08.2026 am Gerät gemessen: eine im Terminal geschriebene Datei tauchte
 * auch nach **neunzig Sekunden** nicht im Baum auf, erst nach einem Neuladen
 * der Seite. Der Baum kommt aus einer Abfrage, und niemand sagte ihr, dass sich
 * auf der Platte etwas geändert hat.
 *
 * Die Regel steht als eigene Funktion da und nicht als Ausdruck in der
 * Abfrage, damit sie sich prüfen lässt, ohne den ganzen Explorer zu zeichnen.
 */
import { describe, it, expect } from 'vitest';
import { nachladeTakt } from '../ExplorerPanel';

describe('nachladeTakt (Plan 023 F4)', () => {
  it('lädt nach, solange das Terminal offen ist', () => {
    expect(nachladeTakt({ laufendeIndexierung: false, terminalOffen: true })).toBe(15_000);
  });

  it('lädt gar nicht nach, wenn nichts passiert', () => {
    // Ein Dauertakt fuer alle Faelle waere auf einem Geraet, das nebenher ein
    // Modell rechnet, eine schlechte Voreinstellung.
    expect(nachladeTakt({ laufendeIndexierung: false, terminalOffen: false })).toBe(false);
  });

  it('lädt bei laufender Indexierung nach, auch ohne Terminal', () => {
    expect(nachladeTakt({ laufendeIndexierung: true, terminalOffen: false })).toBe(20_000);
  });

  it('nimmt bei beidem den Indexierungs-Takt', () => {
    // Der eine Grund schliesst den anderen nicht aus; zwei Takten gleichzeitig
    // waere aber Unsinn, und der Indexierungs-Takt ist der aeltere.
    expect(nachladeTakt({ laufendeIndexierung: true, terminalOffen: true })).toBe(20_000);
  });
});
