/**
 * Typen des Agenten-Bereichs (Plan 010, Schritt 2).
 */

export type AgentProvider = 'ollama' | 'openai' | 'anthropic';

export interface FlowAgent {
  id: number;
  name: string;
  description: string;
  systemPrompt: string;
  provider: AgentProvider;
  model: string;
  tools: string[];
  allowExternal: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Felder, die der Editor an POST/PUT schickt. */
export interface AgentDraft {
  name: string;
  description: string;
  systemPrompt: string;
  provider: AgentProvider;
  model: string;
  tools: string[];
  allowExternal: boolean;
}

/** SSE-Event eines Agent-Laufs (Backend runFlowAgent). */
export type RunEvent =
  | { type: 'status'; status: string; agent?: string; model?: string }
  | { type: 'text'; content: string }
  | { type: 'done'; result: string }
  | { type: 'error'; message: string };

export const PROVIDER_LABELS: Record<AgentProvider, string> = {
  ollama: 'Lokal (Ollama)',
  openai: 'OpenAI-kompatibel',
  anthropic: 'Anthropic',
};
