/**
 * Canvas-Knoten „Bedingung" (Plan 010, Schritt 5).
 * Zeigt Modus + Wert; Ziel-Handle oben, ZWEI Quell-Handles unten:
 * `true` (links) und `false` (rechts) — das ist die If/Else-Verzweigung.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { GitBranch } from 'lucide-react';
import { CONDITION_LABELS, type ConditionMode, type NodeRunStatus } from '../../types';

export function ConditionNode({ data }: NodeProps) {
  const d = data as { mode?: ConditionMode; value?: string; status?: NodeRunStatus };
  const status: NodeRunStatus = d.status ?? 'idle';
  const ring =
    status === 'running'
      ? 'border-primary ring-2 ring-primary/40'
      : status === 'skipped'
        ? 'border-dashed border-muted-foreground/50 opacity-60'
        : status === 'done'
          ? 'border-success'
          : 'border-warning';
  return (
    <div
      className={`min-w-44 rounded-md border-2 bg-card px-3 py-2 text-foreground shadow-sm ${ring}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-muted-foreground" />
        <span className="truncate text-sm font-medium">
          Wenn Text {CONDITION_LABELS[d.mode ?? 'contains']}
        </span>
      </div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">{`„${d.value || '…'}“`}</div>
      <div className="mt-1 flex justify-between text-[10px] font-semibold">
        <span className="text-success">ja ↙</span>
        <span className="text-destructive">↘ nein</span>
      </div>
      <Handle
        id="true"
        type="source"
        position={Position.Bottom}
        style={{ left: '25%' }}
        className="!bg-success"
      />
      <Handle
        id="false"
        type="source"
        position={Position.Bottom}
        style={{ left: '75%' }}
        className="!bg-destructive"
      />
    </div>
  );
}
