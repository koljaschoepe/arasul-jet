/**
 * Visueller Fluss-Canvas (Plan 010, Schritt 5) — React Flow (@xyflow/react),
 * lazy geladen (siehe FlowsView). Bauen: Agenten-/Bedingungs-Knoten hinzufügen,
 * Kanten ziehen (Bedingung = zwei Quell-Handles ja/nein). Der aktuelle Graph
 * wird nach oben gemeldet (Speichern übernimmt FlowsView), Live-Status pro
 * Knoten wird per `nodeStatus` hereingereicht. Theming über unsere Tokens.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/shadcn/select';
import { Plus, Trash2 } from 'lucide-react';
import { AgentNode } from './nodes/AgentNode';
import { ConditionNode } from './nodes/ConditionNode';
import {
  CONDITION_LABELS,
  type ConditionMode,
  type FlowAgent,
  type FlowGraph,
  type NodeRunStatus,
} from '../types';

const nodeTypes = { agent: AgentNode, condition: ConditionNode };

function stripStatus(data: Record<string, unknown>): Record<string, unknown> {
  const { status: _drop, ...rest } = data;
  void _drop;
  return rest;
}

function graphToNodes(graph: FlowGraph): Node[] {
  return (graph.nodes ?? []).map(n => ({
    id: n.id,
    type: n.type,
    position: n.position ?? { x: 0, y: 0 },
    data: { ...n.data },
  }));
}
function graphToEdges(graph: FlowGraph): Edge[] {
  return (graph.edges ?? []).map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
  }));
}

interface Props {
  initialGraph: FlowGraph;
  agents: FlowAgent[];
  nodeStatus: Record<string, NodeRunStatus>;
  onGraphChange: (graph: FlowGraph) => void;
}

let nodeSeq = 0;
const newId = (p: string) => `${p}_${Date.now().toString(36)}_${nodeSeq++}`;

export default function FlowCanvas({ initialGraph, agents, nodeStatus, onGraphChange }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState(graphToNodes(initialGraph));
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphToEdges(initialGraph));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Aktuellen Graphen nach oben melden (Status wird nicht mitgespeichert).
  // WICHTIG: onGraphChange MUSS beim Aufrufer in eine ref schreiben (nicht in
  // State) — die Status-Injektion unten erzeugt bei jedem SSE-Tick ein neues
  // nodes-Array, was diesen Effekt erneut auslöst; ein setState hier würde eine
  // Render-Schleife bauen.
  useEffect(() => {
    onGraphChange({
      nodes: nodes.map(n => ({
        id: n.id,
        type: n.type as 'agent' | 'condition',
        position: n.position,
        data: stripStatus(n.data as Record<string, unknown>),
      })),
      edges: edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
      })),
    });
  }, [nodes, edges, onGraphChange]);

  // Live-Status in die Knoten-Daten spiegeln.
  useEffect(() => {
    setNodes(nds =>
      nds.map(n => {
        const s = nodeStatus[n.id] ?? 'idle';
        return (n.data as { status?: string }).status === s
          ? n
          : { ...n, data: { ...n.data, status: s } };
      })
    );
  }, [nodeStatus, setNodes]);

  const onConnect = useCallback(
    (c: Connection) =>
      setEdges(eds =>
        addEdge({ ...c, id: newId(`e_${c.source}_${c.sourceHandle ?? ''}_${c.target}`) }, eds)
      ),
    [setEdges]
  );

  const addAgentNode = (agent: FlowAgent) =>
    setNodes(nds => [
      ...nds,
      {
        id: newId('a'),
        type: 'agent',
        position: { x: 80 + nds.length * 20, y: 80 + nds.length * 20 },
        data: { agentId: agent.id, label: agent.name },
      },
    ]);

  const addConditionNode = () =>
    setNodes(nds => [
      ...nds,
      {
        id: newId('c'),
        type: 'condition',
        position: { x: 120 + nds.length * 20, y: 120 + nds.length * 20 },
        data: { mode: 'contains' as ConditionMode, value: '' },
      },
    ]);

  const deleteSelected = () => {
    if (!selectedId) return;
    setNodes(nds => nds.filter(n => n.id !== selectedId));
    setEdges(eds => eds.filter(e => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  };

  const patchSelectedData = (patch: Record<string, unknown>) =>
    setNodes(nds =>
      nds.map(n => (n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n))
    );

  const selected = useMemo(() => nodes.find(n => n.id === selectedId) ?? null, [nodes, selectedId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Werkzeugleiste */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
        <Select
          onValueChange={id => {
            const a = agents.find(x => String(x.id) === id);
            if (a) addAgentNode(a);
          }}
        >
          <SelectTrigger className="h-8 w-48">
            <SelectValue placeholder="+ Agent hinzufügen" />
          </SelectTrigger>
          <SelectContent>
            {agents.length === 0 ? (
              <SelectItem value="none" disabled>
                Erst einen Agenten anlegen
              </SelectItem>
            ) : (
              agents.map(a => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={addConditionNode}>
          <Plus className="mr-1 h-4 w-4" /> Bedingung
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          disabled={!selectedId}
          onClick={deleteSelected}
        >
          <Trash2 className="mr-1 h-4 w-4" /> Knoten löschen
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          Ziehen zum Verbinden · Knoten anklicken zum Bearbeiten
        </span>
      </div>

      {/* Canvas */}
      <div className="relative min-h-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => setSelectedId(n.id)}
          onPaneClick={() => setSelectedId(null)}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background className="bg-background" />
          <Controls />
        </ReactFlow>
      </div>

      {/* Inspektor für den gewählten Bedingungs-Knoten */}
      {selected?.type === 'condition' && (
        <div className="grid grid-cols-1 gap-3 border-t border-border p-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Bedingung</Label>
            <Select
              value={String((selected.data as { mode?: ConditionMode }).mode ?? 'contains')}
              onValueChange={v => patchSelectedData({ mode: v as ConditionMode })}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CONDITION_LABELS) as ConditionMode[]).map(m => (
                  <SelectItem key={m} value={m}>
                    Text {CONDITION_LABELS[m]}…
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cond-value">Wert</Label>
            <Input
              id="cond-value"
              value={String((selected.data as { value?: string }).value ?? '')}
              onChange={e => patchSelectedData({ value: e.target.value })}
              placeholder="z. B. dringend"
            />
          </div>
        </div>
      )}
    </div>
  );
}
