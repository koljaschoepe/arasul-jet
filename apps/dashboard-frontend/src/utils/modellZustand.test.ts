import { describe, it, expect } from 'vitest';
import { modellage, kiRamZeile, wechselGrund, zuGb } from './modellZustand';
import type { MemoryBudget } from '@/types';

function budget(over: Partial<MemoryBudget> = {}): MemoryBudget {
  return {
    totalBudgetMb: 32768,
    usedMb: 0,
    availableMb: 30720,
    safetyBufferMb: 2048,
    loadedModels: [],
    canLoadMore: true,
    ...over,
  };
}

describe('modellage (Plan 023 D3)', () => {
  it('nennt das Modell im Speicher', () => {
    const lage = modellage(
      budget({
        loadedModels: [{ id: 'a', ollamaName: 'a', name: 'Gemma 4 Kompakt', ramMb: 8000 }],
      })
    );
    expect(lage.zustand).toBe('geladen');
    expect(lage.text).toBe('Gemma 4 Kompakt im Speicher');
    expect(lage.weitere).toBe(0);
  });

  it('zaehlt weitere Modelle im Speicher mit', () => {
    const lage = modellage(
      budget({
        loadedModels: [
          { id: 'a', ollamaName: 'a', name: 'Gemma 4 Kompakt', ramMb: 8000 },
          { id: 'b', ollamaName: 'b', name: 'Qwen 3 8B', ramMb: 6000 },
        ],
      })
    );
    expect(lage.text).toBe('Gemma 4 Kompakt und 1 weitere im Speicher');
  });

  /**
   * Der Kern von D3. Bis zum 21.08.2026 sagte das Modellraster hier
   * "kein Modell geladen", waehrend die Statusleiste "X, bereit" sagte.
   * Beide lasen dieselbe Antwort.
   */
  it('unterscheidet bereit von gar nichts', () => {
    const bereit = modellage(budget({ installedModel: { id: 'a', name: 'Qwen 3.8 27B' } }));
    expect(bereit.zustand).toBe('bereit');
    expect(bereit.text).toBe('Qwen 3.8 27B, bereit');

    const nichts = modellage(budget());
    expect(nichts.zustand).toBe('keins');
    expect(nichts.text).toBe('kein Modell installiert');
  });

  it('saeubert eine rohe Kennung ueber das Namensregister', () => {
    const lage = modellage(
      budget({
        loadedModels: [
          {
            id: 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS',
            ollamaName: 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS',
            name: 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS',
            ramMb: 15500,
          },
        ],
      })
    );
    expect(lage.name).toBe('Qwen 3.8 27B');
  });

  it('kommt ohne Budget zurecht', () => {
    expect(modellage(undefined).zustand).toBe('keins');
  });
});

describe('kiRamZeile (Plan 023 D4)', () => {
  /**
   * Bis zum 21.08.2026 stand da "0.0 / 32.0 GB belegt · frei 30.0 GB", und
   * die Rechnung ging nicht auf. Falsch gerechnet war sie trotzdem nicht:
   * das Backend zieht MODEL_MEMORY_SAFETY_BUFFER_MB vom freien Speicher ab,
   * und dieser Posten stand nirgends.
   */
  it('nennt die Reserve, damit die Zeile aufgeht', () => {
    expect(kiRamZeile(budget())).toBe('0,0 von 32,0 GB belegt, 2,0 GB Reserve, frei 30,0 GB');
  });

  it('belegt plus Reserve plus frei ergibt den Gesamtwert', () => {
    const b = budget({ usedMb: 15872, availableMb: 32768 - 15872 - 2048 });
    expect(kiRamZeile(b)).toBe('15,5 von 32,0 GB belegt, 2,0 GB Reserve, frei 14,5 GB');
    expect(15872 + 2048 + (32768 - 15872 - 2048)).toBe(32768);
  });

  it('ohne Reserve entfaellt der Posten, statt 0,0 GB zu schreiben', () => {
    expect(kiRamZeile(budget({ safetyBufferMb: 0, availableMb: 32768 }))).toBe(
      '0,0 von 32,0 GB belegt, frei 32,0 GB'
    );
  });

  it('auch eine Reserve, die auf 0,0 gerundet dastuende, entfaellt', () => {
    // 32 MB sind gerundet 0,0 GB. Stuenden sie da, ginge die Zeile wieder
    // nicht auf, nur an einer anderen Schwelle.
    expect(kiRamZeile(budget({ safetyBufferMb: 32, availableMb: 32768 - 32 }))).toBe(
      '0,0 von 32,0 GB belegt, frei 32,0 GB'
    );
  });

  it('ohne Budget bleibt sie leer statt NaN zu zeigen', () => {
    expect(kiRamZeile(undefined)).toBe('');
  });
});

describe('zuGb', () => {
  it('rundet auf eine Nachkommastelle mit Komma', () => {
    expect(zuGb(32768)).toBe('32,0');
    expect(zuGb(0)).toBe('0,0');
  });
});

describe('wechselGrund', () => {
  /**
   * Die Kennungen stammen aus `ollamaReadiness.unloadModelWithTracking`
   * (`auto_unload_adaptive_<phase>`). Die Phase entscheidet nur, WIE LANGE ein
   * Modell ungenutzt bleiben darf, nicht warum es geht.
   */
  it('uebersetzt die automatische Entladung, unabhaengig von der Phase', () => {
    for (const phase of ['idle', 'normal', 'peak']) {
      expect(wechselGrund(`auto_unload_adaptive_${phase}`)).toBe(
        'automatisch aus dem Speicher genommen, weil es eine Weile nicht gebraucht wurde'
      );
    }
  });

  // Das Laden erklaert sich von selbst, das Modell steht danach in der Leiste.
  // Erklaerungsbeduerftig ist nur das Verschwinden. Das Backend liefert
  // deshalb gar keine anderen Wechsel mehr.
  it('sagt zum Laden nichts', () => {
    expect(wechselGrund('activated')).toBeNull();
  });

  it('erfindet nichts fuer eine unbekannte Kennung', () => {
    expect(wechselGrund('irgendwas_neues')).toBeNull();
    expect(wechselGrund(null)).toBeNull();
    expect(wechselGrund(undefined)).toBeNull();
  });
});
