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

// --- Flüsse (Schritt 4/5) ---

export type FlowNodeType = 'agent' | 'condition';
export type ConditionMode = 'contains' | 'not_contains' | 'equals';

export interface FlowGraphNode {
  id: string;
  type: FlowNodeType;
  position: { x: number; y: number };
  data: {
    agentId?: number;
    label?: string;
    mode?: ConditionMode;
    value?: string;
    [k: string]: unknown;
  };
}
export interface FlowGraphEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}
export interface FlowGraph {
  nodes: FlowGraphNode[];
  edges: FlowGraphEdge[];
}

export interface Flow {
  id: number;
  name: string;
  description: string;
  graph: FlowGraph;
  scheduleCron: string | null;
  hasRunToken: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Live-Status eines Knotens während eines Fluss-Laufs. */
export type NodeRunStatus = 'idle' | 'running' | 'done' | 'error' | 'skipped';

/** SSE-Event eines Fluss-Laufs (Backend runFlow/flowEngine). Frames tragen `node`. */
export type FlowRunEvent =
  | { type: 'flow_start'; flow?: string }
  | { type: 'node_start'; node: string; agentId?: number }
  | { type: 'node_condition'; node: string; result: 'true' | 'false' }
  | { type: 'node_skipped'; node: string }
  | { type: 'node_done'; node: string }
  | { type: 'node_error'; node: string; message: string }
  | { type: 'flow_done'; result: string }
  | { type: 'flow_error'; message: string }
  | { type: string; node?: string; [k: string]: unknown };

export const CONDITION_LABELS: Record<ConditionMode, string> = {
  contains: 'enthält',
  not_contains: 'enthält nicht',
  equals: 'ist gleich',
};

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
