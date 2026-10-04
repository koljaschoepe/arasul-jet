/**
 * Shared Type Definitions - Arasul Dashboard Frontend
 *
 * Core domain types used across multiple components and contexts.
 * File-local types that appear only once should remain in their respective files.
 */

// --- Models ---

// `CatalogModel` stand bis Plan 023 D3 hier UND in `hooks/useStoreCatalog.ts`.
// Zwei Beschreibungen derselben Antwort, und sie liefen bereits auseinander:
// D2 gab der einen sechs Felder, die der anderen fehlten. Der Kontext las die
// hiesige, alles andere die aus dem Hook. Massgeblich ist der Hook, weil dort
// auch die Abfrage steht.

// --- Model Lifecycle ---

interface LoadedModelInfo {
  id: string;
  ollamaName: string;
  name: string;
  ramMb: number;
  expiresAt?: string;
}

export interface MemoryBudget {
  totalBudgetMb: number;
  usedMb: number;
  availableMb: number;
  safetyBufferMb: number;
  loadedModels: LoadedModelInfo[];
  /**
   * Plan 009: installiertes (heruntergeladenes) Standard-/zuletzt-genutztes
   * Modell — auch wenn es gerade NICHT im RAM geladen ist. Damit unterscheidet
   * die Statusleiste „installiert, bereit" von „gar nichts installiert".
   */
  installedModel?: { id: string; name: string } | null;
  installedCount?: number;
  /**
   * Plan 023 D3: der letzte Wechsel, den das System selbst ausgeloest hat, aus
   * `llm_model_switches`. Nur die letzten zwei Stunden; aelter erklaert nichts
   * mehr, was gerade zu sehen ist. `null`, wenn in dieser Zeit nichts war.
   */
  lastSwitch?: { model: string; reason: string | null; at: string } | null;
  canLoadMore: boolean;
}

// --- System Metrics ---
// Hier stand bis zum 04.10.2026 die Form der Live-Metriken
// (`/metrics/live`, `/metrics/live-stream`). Gelesen hat sie zuletzt nur die
// Auslastung im Bereich System; seit dem stehen dort drei Zahlen aus
// `/api/ops/overview` (`features/system/SystemSettings.tsx`).
