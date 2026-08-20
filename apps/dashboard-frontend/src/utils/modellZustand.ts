/**
 * Ein Zustand, ueberall gleich (Plan 023 D3).
 *
 * Am 19.08.2026 im Rundgang gesehen: der Kopfbereich im Modellraster sagte
 * „kein Modell geladen", waehrend die Statusleiste gleichzeitig ein bereites
 * Modell nannte. Beide lesen dieselbe Antwort von `/models/memory-budget`. Der
 * Unterschied entstand nicht aus den Daten, sondern daraus, dass jede der
 * beiden Stellen ihren Satz selbst formuliert hat: die Statusleiste
 * unterscheidet drei Zustaende, das Raster nur zwei.
 *
 * Dieselbe KI-RAM-Zeile stand wortgleich in beiden Dateien, mit zwei eigenen
 * Kopien von `toGb` daneben. Das ist derselbe Fehler wie in D1, nur an einer
 * anderen Angabe: eine Aussage, zwei Herleitungen.
 *
 * Hier steht die eine Herleitung. Die Zahlen selbst aendert D4, nicht D3; wer
 * die Einheiten anfasst, findet sie ab jetzt an einer Stelle.
 */

import type { MemoryBudget } from '@/types';
import { modellAnzeigeName } from './modelDisplay';

/** MB zu GB, eine Nachkommastelle, deutsches Komma. */
export function zuGb(mb: number): string {
  return (mb / 1024).toLocaleString('de-DE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/**
 * Die drei Zustaende, die ein Geraet kennen kann. `bereit` heisst: ein Modell
 * ist heruntergeladen, liegt aber gerade nicht im Speicher. Ollama entlaedt
 * Modelle nach einer Ruhezeit von selbst; das ist kein Fehler und darf nicht
 * wie einer aussehen.
 */
export type Modellzustand = 'geladen' | 'bereit' | 'keins';

export interface Modellage {
  zustand: Modellzustand;
  /** Der Name des Modells, um das es geht. Leer, wenn es keins gibt. */
  name: string;
  /** Ein Satz, der ueberall gleich lautet. */
  text: string;
  /** Wie viele weitere Modelle ausserdem im Speicher liegen. */
  weitere: number;
}

/**
 * Der Modellzustand aus dem Speicherbudget.
 *
 * Bewusst ohne die KI-RAM-Zahlen: die Statusleiste haengt sie an, das
 * Modellraster zeigt sie als Balken. Der Zustand ist gemeinsam, die Form nicht.
 */
export function modellage(budget: MemoryBudget | undefined): Modellage {
  const geladen = budget?.loadedModels ?? [];
  const erstes = geladen[0];
  if (erstes) {
    const name = modellAnzeigeName(erstes.name);
    const weitere = geladen.length - 1;
    return {
      zustand: 'geladen',
      name,
      weitere,
      text: weitere > 0 ? `${name} und ${weitere} weitere im Speicher` : `${name} im Speicher`,
    };
  }
  const installiert = budget?.installedModel;
  if (installiert) {
    const name = modellAnzeigeName(installiert.name);
    return { zustand: 'bereit', name, weitere: 0, text: `${name}, bereit` };
  }
  return { zustand: 'keins', name: '', weitere: 0, text: 'kein Modell installiert' };
}

/**
 * Die KI-RAM-Zeile.
 *
 * Bis zum 21.08.2026 stand hier "0.0 / 32.0 GB belegt · frei 30.0 GB", und die
 * Rechnung ging nicht auf: 32 minus 0 sind nicht 30. Falsch gerechnet war sie
 * trotzdem nicht, sie verschwieg einen Posten. Das Backend zieht
 * `MODEL_MEMORY_SAFETY_BUFFER_MB` (Vorgabe 2048) vom freien Speicher ab, damit
 * ein Modell nicht bis auf das letzte Megabyte geladen wird und die Box
 * anfaengt zu tauschen. Diese Reserve stand nirgends.
 *
 * Jetzt steht sie da, und die Zeile geht auf: belegt plus Reserve plus frei
 * ergibt den Gesamtwert. Ist keine Reserve gesetzt, entfaellt der mittlere
 * Posten, statt "0,0 GB Reserve" zu schreiben.
 *
 * Gerechnet wird in 1024er-Schritten, anders als bei Dateigroessen
 * (`formatBytes`). Das ist kein Versehen: `RAM_LIMIT_LLM=32G` bedeutet fuer
 * Docker 32 GiB, und genau diese Zahl steht hier. Wer hier in
 * Tausenderschritten rechnete, bekaeme aus demselben Grenzwert 34,4 GB.
 */
export function kiRamZeile(budget: MemoryBudget | undefined): string {
  if (!budget) {
    return '';
  }
  // Gepruetft wird die ANGEZEIGTE Reserve, nicht die rohe. `zuGb` rundet auf
  // eine Nachkommastelle; ein Puffer unter etwa 50 MB stuende sonst als
  // "0,0 GB Reserve" da, und das waere genau die Zeile, die nicht aufgeht.
  const reserve = zuGb(budget.safetyBufferMb ?? 0);
  const teile = [
    `${zuGb(budget.usedMb ?? 0)} von ${zuGb(budget.totalBudgetMb ?? 0)} GB belegt`,
    Number(reserve.replace(',', '.')) > 0 ? `${reserve} GB Reserve` : null,
    `frei ${zuGb(budget.availableMb ?? 0)} GB`,
  ].filter(Boolean);
  return teile.join(', ');
}

/**
 * Warum das System ein Modell von sich aus entladen hat.
 *
 * Bewusst nur das Entladen. Das Laden erklaert sich von selbst: das Modell
 * steht danach in der Leiste. Erklaerungsbeduerftig ist das Gegenteil, wenn es
 * ohne Zutun verschwindet. Das Backend liefert deshalb gar keine anderen
 * Wechsel mehr.
 *
 * Die Gruende stehen als Kennung in `llm_model_switches.reason`, gesetzt in
 * `ollamaReadiness.unloadModelWithTracking` als `auto_unload_adaptive_<phase>`.
 * Die Phase kommt aus dem Nutzungsprofil der Stunde und entscheidet nur, WIE
 * LANGE ein Modell ungenutzt bleiben darf, bevor es geht:
 * `MODEL_PEAK_KEEP_ALIVE_MINUTES` (Vorgabe 30), `..._NORMAL...` (10) und
 * `..._IDLE...` (2). Der Grund ist also immer derselbe, nur die Frist wechselt.
 *
 * Am 20.08.2026 standen 1024 Wechsel im Protokoll, 877 davon automatische
 * Entladungen. Angezeigt wurde keiner.
 */
export function wechselGrund(grund: string | null | undefined): string | null {
  if (!grund) {
    return null;
  }
  if (grund.startsWith('auto_unload_adaptive_')) {
    return 'automatisch aus dem Speicher genommen, weil es eine Weile nicht gebraucht wurde';
  }
  if (grund.startsWith('auto_unload_')) {
    return 'automatisch aus dem Speicher genommen';
  }
  return null;
}
