/**
 * useHardwareCompatibility — does this model fit on this Jetson?
 *
 * Phase 2.1 of LLM_RAG_N8N_HARDENING. Audit found `canLoadModel()` defined
 * but never used in Store cards — users could click Download on a 70B model
 * on a 32GB Orin and only find out 5h later. This hook answers the question
 * once, from the shared memory-budget cache, so every card / modal /
 * pre-download dialog sees the same verdict.
 *
 * Two distinct dimensions:
 *
 *   `fit`         — *static* — does the model fit at all on this hardware?
 *                   Based on `totalBudgetMb` (RAM_LIMIT_LLM minus safety
 *                   buffer). Decides green/yellow/red badge per card.
 *
 *   `canLoadNow`  — *live*   — does it fit *right now* given what's
 *                   currently loaded? Based on `availableMb`. Decides
 *                   whether the activate button must first evict an LRU
 *                   model.
 *
 * fit thresholds:
 *   fits     → required ≤ 80% of total budget    (≥20% headroom)
 *   tight    → 80% < required ≤ 100% of total
 *   too_big  → required > total
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../useApi';
import { modelKeys, MODEL_POLL_INTERVAL_MS } from './modelKeys';
import type { MemoryBudget } from '../../types';

export type HardwareFit = 'fits' | 'tight' | 'too_big' | 'unknown';

export interface HardwareCompatibility {
  /** Static fit on this hardware (ignoring currently-loaded models). */
  fit: HardwareFit;
  /** Live: enough free RAM right now without unloading anything. */
  canLoadNow: boolean;
  /** Live: would activation force LRU eviction of another model? */
  wouldEvict: boolean;
  /** Required RAM in MB (model.ram_required_gb * 1024). */
  requiredMb: number;
  /** Total LLM RAM budget in MB. */
  totalMb: number;
  /** Free RAM right now in MB. */
  availableMb: number;
  /** Whether the budget query has data. False during first fetch / errors. */
  hasBudget: boolean;
}

interface ModelLike {
  ram_required_gb?: number | null;
}

export function useHardwareCompatibility(
  model: ModelLike | null | undefined
): HardwareCompatibility {
  const api = useApi();
  const budgetQuery = useQuery({
    queryKey: modelKeys.memoryBudget(),
    queryFn: ({ signal }) =>
      api.get<MemoryBudget>('/models/memory-budget', { showError: false, signal }),
    refetchInterval: MODEL_POLL_INTERVAL_MS,
  });

  return useMemo<HardwareCompatibility>(() => {
    const budget = budgetQuery.data;
    const required = (model?.ram_required_gb ?? 0) * 1024;
    const total = budget?.totalBudgetMb ?? 0;
    const available = budget?.availableMb ?? 0;
    const hasBudget = Boolean(budget && total > 0);

    if (!hasBudget || required <= 0) {
      return {
        fit: 'unknown',
        canLoadNow: true,
        wouldEvict: false,
        requiredMb: required,
        totalMb: total,
        availableMb: available,
        hasBudget,
      };
    }

    const fit: HardwareFit =
      required > total ? 'too_big' : required > total * 0.8 ? 'tight' : 'fits';

    const canLoadNow = required <= available;
    const wouldEvict = !canLoadNow && fit !== 'too_big';

    return {
      fit,
      canLoadNow,
      wouldEvict,
      requiredMb: required,
      totalMb: total,
      availableMb: available,
      hasBudget,
    };
  }, [budgetQuery.data, model?.ram_required_gb]);
}

/**
 * formatMb — small helper for UI strings ("12.4 GB"). Centralized so badge,
 * modal, and confirmation dialog never disagree on rounding.
 */
export function formatMb(mb: number): string {
  if (!isFinite(mb) || mb <= 0) return '0 GB';
  if (mb < 1024) return `${Math.round(mb)} MB`;
  const gb = mb / 1024;
  return gb < 10 ? `${gb.toFixed(1)} GB` : `${Math.round(gb)} GB`;
}
