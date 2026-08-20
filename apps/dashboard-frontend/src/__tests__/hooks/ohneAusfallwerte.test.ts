/**
 * Null heißt bei der Temperatur nicht null Grad, sondern kein Messwert.
 * Der Beweis dafür steht nicht hier, sondern im Kopfkommentar der Funktion:
 * collector.py gibt 0.0 bei fehlendem Sensor zurück, metrics.js macht mit
 * `parseFloat(...) || 0` aus jedem NULL und jedem NaN ebenfalls eine Null.
 *
 * Dieser Test gab es beim ersten Anlauf von Plan 023 C1 nicht. Der alte
 * TempSparkline hatte den Filter (`v > 0`), der neue Sparkline nicht, und
 * die Gegenprobe hat es nicht gemerkt, weil sie nur den Weg über null prüfte.
 */

import { ohneAusfallwerte } from '@/hooks/useDashboardData';

describe('ohneAusfallwerte', () => {
  it('macht aus der Ausfallkennung eine Lücke', () => {
    expect(ohneAusfallwerte([47, 0, 48])).toEqual([47, null, 48]);
  });

  it('lässt echte Messwerte unberührt', () => {
    expect(ohneAusfallwerte([47.5, 48.2, 49])).toEqual([47.5, 48.2, 49]);
  });

  it('behält vorhandene Lücken als Lücken', () => {
    expect(ohneAusfallwerte([47, null, 49])).toEqual([47, null, 49]);
  });

  it('verwirft auch negative Werte, die kein Sensor liefert', () => {
    expect(ohneAusfallwerte([-1, 47])).toEqual([null, 47]);
  });

  it('kommt mit fehlendem Verlauf zurecht', () => {
    expect(ohneAusfallwerte(undefined)).toEqual([]);
  });
});
