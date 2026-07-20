/**
 * Canvas-Knoten „Agent" (Plan 010, Schritt 5).
 * Zeigt den Agentennamen + Live-Status; Ziel-Handle oben, Quell-Handle unten.
 * Vollständig über Theme-Tokens gestylt (kein React-Flow-Default-Look).
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Bot } from 'lucide-react';
import type { NodeRunStatus } from '../../types';

const STATUS_RING: Record<NodeRunStatus, string> = {
  idle: 'border-border',
  running: 'border-primary ring-2 ring-primary/40',
  done: 'border-success',
  error: 'border-destructive',
  skipped: 'border-dashed border-muted-foreground/50 opacity-60',
};

const STATUS_DOT: Record<NodeRunStatus, string> = {
  idle: 'bg-muted-foreground/40',
  running: 'bg-primary animate-pulse',
  done: 'bg-success',
  error: 'bg-destructive',
  skipped: 'bg-muted-foreground/40',
};

export function AgentNode({ data }: NodeProps) {
  const d = data as { label?: string; status?: NodeRunStatus };
  const status: NodeRunStatus = d.status ?? 'idle';
  return (
    <div
      className={`min-w-40 rounded-md border-2 bg-card px-3 py-2 text-foreground shadow-sm ${STATUS_RING[status]}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{d.label || 'Agent'}</span>
        <span className={`ml-auto h-2.5 w-2.5 rounded-full ${STATUS_DOT[status]}`} />
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-primary" />
    </div>
  );
}
