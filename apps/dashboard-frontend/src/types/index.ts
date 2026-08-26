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
// Shared shape of the live metrics payload (`GET /metrics/live` and the
// `/metrics/live-stream` WebSocket). Consumed by useWebSocketMetrics and the
// dashboard shell in App.tsx; kept here so both agree on one precise type
// instead of an index-signature grab bag.

interface MetricsDisk {
  used: number;
  free: number;
  percent: number;
}

export interface Metrics {
  cpu: number;
  ram: number;
  swap: number;
  gpu: number;
  temperature: number;
  temp: number;
  disk: MetricsDisk;
  /** Optional network state from the metrics-collector (used for the offline banner). */
  network?: {
    online?: boolean;
  };
}
