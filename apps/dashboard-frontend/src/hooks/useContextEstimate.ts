/**
 * Phase 4.4 — client-side context-window estimate.
 *
 * Backend has full context-budget management with compaction
 * (services/context/contextBudgetManager.js). The user just needs
 * a heads-up signal that the conversation is approaching the model's
 * context limit so the auto-compaction is expected, not surprising.
 *
 * Heuristic mirrors the backend: chars/4 per role, +4 per message for
 * role/formatting overhead (matches contextBudgetManager.windowMessages).
 */

import { useMemo } from 'react';
import type { ChatMessage, InstalledModel } from '../types';

const FALLBACK_CONTEXT_WINDOW = 8192;
const PER_MESSAGE_OVERHEAD = 4;

export interface ContextEstimate {
  /** Estimated total tokens for the visible conversation. */
  estimatedTokens: number;
  /** Model's max context window (or fallback). */
  contextWindow: number;
  /** estimatedTokens / contextWindow, clamped to [0, ~1.5]. */
  utilization: number;
  /** True when utilization > 0.8 — UI should warn. */
  exceedsThreshold: boolean;
  /** Whether the contextWindow value is real (vs fallback). */
  hasModelInfo: boolean;
}

function estimateMessageTokens(content: string): number {
  if (!content) return 0;
  return Math.ceil(content.length / 4);
}

export function useContextEstimate(
  messages: ChatMessage[] | undefined,
  modelId: string | null | undefined,
  installedModels: InstalledModel[] | undefined
): ContextEstimate {
  return useMemo(() => {
    const model = modelId
      ? installedModels?.find(m => m.id === modelId || m.name === modelId)
      : undefined;
    const contextWindow = model?.max_context_window ?? FALLBACK_CONTEXT_WINDOW;
    const hasModelInfo = !!model?.max_context_window;

    let estimatedTokens = 0;
    if (messages && messages.length > 0) {
      for (const msg of messages) {
        // Skip system compaction banners — the backend strips these before
        // sending to the LLM (contextBudgetManager.pruneMessages).
        if ((msg as { type?: string }).type === 'compaction') continue;
        estimatedTokens += estimateMessageTokens(msg.content || '');
        const thinking = (msg as { thinking?: string }).thinking;
        if (thinking) estimatedTokens += estimateMessageTokens(thinking);
        estimatedTokens += PER_MESSAGE_OVERHEAD;
      }
    }

    const utilization = contextWindow > 0 ? estimatedTokens / contextWindow : 0;
    const exceedsThreshold = utilization > 0.8;

    return {
      estimatedTokens,
      contextWindow,
      utilization,
      exceedsThreshold,
      hasModelInfo,
    };
  }, [messages, modelId, installedModels]);
}

// Exported for test reuse — keeps the heuristic in one place.
export const __internals = {
  estimateMessageTokens,
  PER_MESSAGE_OVERHEAD,
  FALLBACK_CONTEXT_WINDOW,
};
