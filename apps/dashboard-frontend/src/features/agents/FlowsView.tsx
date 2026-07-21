/**
 * Flüsse-Ansicht (Plan 010, Schritt 5) — Liste + visueller Canvas + Lauf.
 *
 * Master-Detail: links die eigenen Flüsse, rechts der lazy geladene React-Flow-
 * Canvas zum Bauen, Speichern (Graph-JSON via /agents/flows) und Ausführen mit
 * Live-Status pro Knoten (SSE). Der Canvas wird lazy importiert, damit
 * @xyflow/react nicht das Haupt-Bundle vergrößert.
 */

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Clock, GitBranch, Plus, Play, Save, Square } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { runFlowStream, type FlowRunHandle } from './runFlowStream';
import type { Flow, FlowAgent, FlowGraph, FlowRunEvent, NodeRunStatus } from './types';

const FlowCanvas = lazy(() => import('./canvas/FlowCanvas'));

const EMPTY_GRAPH: FlowGraph = { nodes: [], edges: [] };

export default function FlowsView() {
  const api = useApi();
  const [flows, setFlows] = useState<Flow[]>([]);
  const [agents, setAgents] = useState<FlowAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Flow | null>(null);

  const [name, setName] = useState('');
  const graphRef = useRef<FlowGraph>(EMPTY_GRAPH);
  const [saving, setSaving] = useState(false);

  const [runInput, setRunInput] = useState('');
  const [running, setRunning] = useState(false);
  const [nodeStatus, setNodeStatus] = useState<Record<string, NodeRunStatus>>({});
  const [runResult, setRunResult] = useState('');
  const [runError, setRunError] = useState('');
  const runHandle = useRef<FlowRunHandle | null>(null);

  // Trigger (Plan 010, Schritt 7): Zeitplan + Webhook-Token.
  const [scheduleCron, setScheduleCron] = useState('');
  const [runToken, setRunToken] = useState('');
  const [showTrigger, setShowTrigger] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [f, a] = await Promise.all([
        api.get<{ data: Flow[] }>('/agents/flows', { showError: false }),
        api.get<{ data: FlowAgent[] }>('/agents', { showError: false }),
      ]);
      setFlows(f.data);
      setAgents(a.data);
    } catch {
      setFlows([]);
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => () => runHandle.current?.cancel(), []);

  // Lauf abbrechen UND den UI-Zustand zurücksetzen. Nötig, weil ein abgebrochener
  // Stream (controller.abort) keine flow_done/flow_error-Events mehr liefert —
  // ohne dieses explizite Reset bliebe der „Stopp"-Zustand hängen.
  const stopRun = () => {
    runHandle.current?.cancel();
    runHandle.current = null;
    setRunning(false);
  };

  const selectFlow = (flow: Flow) => {
    stopRun();
    setSelected(flow);
    setName(flow.name);
    graphRef.current = flow.graph ?? EMPTY_GRAPH;
    setNodeStatus({});
    setRunResult('');
    setRunError('');
    setRunInput('');
    setScheduleCron(flow.scheduleCron ?? '');
    setRunToken('');
  };

  const newFlow = async () => {
    const res = await api.post<{ data: Flow }>('/agents/flows', {
      name: 'Neuer Fluss',
      graph: EMPTY_GRAPH,
    });
    setFlows(prev => [res.data, ...prev]);
    selectFlow(res.data);
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await api.put<{ data: Flow }>(`/agents/flows/${selected.id}`, {
        name: name.trim() || 'Fluss',
        graph: graphRef.current,
        scheduleCron: scheduleCron.trim(),
      });
      setSelected(res.data);
      setScheduleCron(res.data.scheduleCron ?? '');
      setFlows(prev => prev.map(f => (f.id === res.data.id ? res.data : f)));
    } finally {
      setSaving(false);
    }
  };

  // Webhook-Token erzeugen/rotieren — Klartext wird nur EINMAL zurückgegeben.
  const generateToken = async () => {
    if (!selected) return;
    const res = await api.post<{ token: string }>(`/agents/flows/${selected.id}/token`);
    setRunToken(res.token);
    setSelected(prev => (prev ? { ...prev, hasRunToken: true } : prev));
  };

  const webhookUrl = selected
    ? `${window.location.origin}/api/agents/flows/${selected.id}/run`
    : '';

  const remove = async () => {
    if (!selected) return;
    await api.del(`/agents/flows/${selected.id}`);
    setFlows(prev => prev.filter(f => f.id !== selected.id));
    setSelected(null);
  };

  const onRunEvent = (e: FlowRunEvent) => {
    switch (e.type) {
      case 'node_start':
        if (e.node) setNodeStatus(s => ({ ...s, [e.node as string]: 'running' }));
        break;
      case 'node_condition':
      case 'node_done':
        if (e.node) setNodeStatus(s => ({ ...s, [e.node as string]: 'done' }));
        break;
      case 'node_skipped':
        if (e.node) setNodeStatus(s => ({ ...s, [e.node as string]: 'skipped' }));
        break;
      case 'node_error':
        if (e.node) setNodeStatus(s => ({ ...s, [e.node as string]: 'error' }));
        break;
      case 'flow_done':
        setRunResult(String((e as { result?: string }).result ?? ''));
        setRunning(false);
        break;
      case 'flow_error':
        setRunError(String((e as { message?: string }).message ?? 'Fehler'));
        setRunning(false);
        break;
    }
  };

  const run = async () => {
    if (!selected) return;
    // Erst speichern, damit der Lauf den aktuellen Canvas-Stand nutzt.
    await save();
    setNodeStatus({});
    setRunResult('');
    setRunError('');
    setRunning(true);
    const { handle } = runFlowStream(selected.id, runInput, onRunEvent);
    runHandle.current = handle;
  };

  return (
    <div className="flex h-full min-h-0 bg-background">
      {/* Liste */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <GitBranch className="h-4 w-4" /> Flüsse
          </span>
          <Button size="sm" variant="ghost" aria-label="Neuer Fluss" onClick={newFlow}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {loading ? (
            <div className="flex justify-center p-4">
              <LoadingSpinner />
            </div>
          ) : flows.length === 0 ? (
            <p className="px-2 py-4 text-xs text-muted-foreground">Noch keine Flüsse.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {flows.map(f => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => selectFlow(f)}
                    className={`w-full truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                      selected?.id === f.id
                        ? 'bg-accent text-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    {f.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Detail */}
      <section className="flex min-h-0 flex-1 flex-col">
        {!selected ? (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyState
              icon={<GitBranch className="h-8 w-8" />}
              title="Verzweigte Flüsse"
              description="Verkette Agenten im Canvas zu einem Fluss — mit Wenn/Sonst und parallelen Zweigen."
              action={
                <Button onClick={newFlow}>
                  <Plus className="mr-1 h-4 w-4" /> Neuer Fluss
                </Button>
              }
            />
          </div>
        ) : (
          <>
            {/* Kopf: Name + Aktionen */}
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                className="h-8 max-w-xs"
                placeholder="Fluss-Name"
              />
              <Button size="sm" onClick={save} disabled={saving}>
                <Save className="mr-1 h-4 w-4" /> {saving ? 'Speichert…' : 'Speichern'}
              </Button>
              <Button
                size="sm"
                variant={showTrigger ? 'secondary' : 'ghost'}
                onClick={() => setShowTrigger(v => !v)}
              >
                <Clock className="mr-1 h-4 w-4" /> Trigger
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={remove}>
                Löschen
              </Button>
            </div>

            {/* Trigger: Zeitplan (Cron) + Webhook-Token (n8n) */}
            {showTrigger && (
              <div className="flex flex-col gap-3 border-b border-border bg-card/40 p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="flow-cron" className="text-xs">
                      Zeitplan (Cron, 5 Felder) — z. B. <code>*/5 * * * *</code>
                    </Label>
                    <Input
                      id="flow-cron"
                      value={scheduleCron}
                      onChange={e => setScheduleCron(e.target.value)}
                      className="h-8 w-56 font-mono text-xs"
                      placeholder="leer = kein Zeitplan"
                    />
                  </div>
                  <Button size="sm" onClick={save} disabled={saving}>
                    Zeitplan speichern
                  </Button>
                </div>

                <div className="flex flex-col gap-1">
                  <Label className="text-xs">n8n-Webhook (HTTP-Node)</Label>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={webhookUrl} className="h-8 flex-1 font-mono text-xs" />
                    <Button size="sm" variant="outline" onClick={generateToken}>
                      {selected.hasRunToken ? 'Token neu' : 'Token erzeugen'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <code>POST</code> mit Header <code>Authorization: Bearer &lt;Token&gt;</code>,
                    Body <code>{'{ "input": "…" }'}</code>.
                  </p>
                  {runToken && (
                    <div className="mt-1 rounded-md border border-warning/40 bg-warning/10 p-2">
                      <p className="text-xs text-foreground">
                        Token (wird nur EINMAL angezeigt — jetzt kopieren):
                      </p>
                      <code className="mt-1 block break-all text-xs text-foreground">
                        {runToken}
                      </code>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Canvas */}
            <div className="min-h-0 flex-1">
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center">
                    <LoadingSpinner />
                  </div>
                }
              >
                <FlowCanvas
                  key={selected.id}
                  initialGraph={selected.graph ?? EMPTY_GRAPH}
                  agents={agents}
                  nodeStatus={nodeStatus}
                  onGraphChange={g => {
                    graphRef.current = g;
                  }}
                />
              </Suspense>
            </div>

            {/* Lauf */}
            <div className="flex flex-col gap-2 border-t border-border p-2">
              <div className="flex items-center gap-2">
                <Input
                  value={runInput}
                  onChange={e => setRunInput(e.target.value)}
                  className="h-8"
                  placeholder="Eingabe für den Fluss"
                />
                {running ? (
                  <Button size="sm" variant="outline" onClick={stopRun}>
                    <Square className="mr-1 h-4 w-4" /> Stopp
                  </Button>
                ) : (
                  <Button size="sm" onClick={run}>
                    <Play className="mr-1 h-4 w-4" /> Ausführen
                  </Button>
                )}
              </div>
              {runError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
                  {runError}
                </div>
              )}
              {runResult && (
                <div className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-card p-2 text-sm text-foreground">
                  {runResult}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
