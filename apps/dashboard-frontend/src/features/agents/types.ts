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

/** Wählbare Tools (muss mit dem Backend flowToolRegistry übereinstimmen). */
export interface ToolMeta {
  name: string;
  label: string;
  description: string;
  /** Verlässt das lokale Netz → nur mit allow_external nutzbar. */
  external?: boolean;
}

export const FLOW_TOOLS: ToolMeta[] = [
  { name: 'rag', label: 'Wissensbasis (RAG)', description: 'Lokale Dokumente durchsuchen' },
  { name: 'minio', label: 'Dateien (MinIO)', description: 'Dateien lesen/schreiben' },
  { name: 'n8n', label: 'n8n auslösen', description: 'Einen n8n-Workflow per Webhook starten' },
  {
    name: 'web',
    label: 'Web/HTTP',
    description: 'Öffentliche URL abrufen (extern)',
    external: true,
  },
];
