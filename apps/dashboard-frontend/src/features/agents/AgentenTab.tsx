/**
 * Agenten-Bereich (Plan 010, Schritt 2) — der vierte Top-Level-Bereich.
 *
 * Master-Detail: links die Liste der eigenen Flow-Agenten, rechts der Editor
 * plus die Lauf-Ansicht des gewählten Agenten. Erste sichtbare, live nutzbare
 * Scheibe der Orchestrierungs-Plattform. Alles über useApi, Theme-Tokens.
 */

import { useCallback, useEffect, useState } from 'react';
import { Bot, Plus } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { Button } from '@/components/ui/shadcn/button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { AgentEditor } from './components/AgentEditor';
import { AgentRunPanel } from './components/AgentRunPanel';
import { PROVIDER_LABELS, type FlowAgent } from './types';

type Selection = { mode: 'none' } | { mode: 'new' } | { mode: 'edit'; agent: FlowAgent };

export default function AgentenTab() {
  const api = useApi();
  const [agents, setAgents] = useState<FlowAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<Selection>({ mode: 'none' });

  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: FlowAgent[] }>('/agents', { showError: false });
      setAgents(res.data);
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const handleSaved = (saved: FlowAgent) => {
    setAgents(prev => {
      const idx = prev.findIndex(a => a.id === saved.id);
      if (idx === -1) return [saved, ...prev];
      const next = [...prev];
      next[idx] = saved;
      return next;
    });
    setSelection({ mode: 'edit', agent: saved });
  };

  const handleDeleted = (id: number) => {
    setAgents(prev => prev.filter(a => a.id !== id));
    setSelection({ mode: 'none' });
  };

  const selectedId = selection.mode === 'edit' ? selection.agent.id : null;

  return (
    <div className="flex h-full min-h-0 bg-background">
      {/* Liste */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Bot className="h-4 w-4" /> Agenten
          </span>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Neuer Agent"
            onClick={() => setSelection({ mode: 'new' })}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {loading ? (
            <div className="flex justify-center p-4">
              <LoadingSpinner />
            </div>
          ) : agents.length === 0 ? (
            <p className="px-2 py-4 text-xs text-muted-foreground">
              Noch keine Agenten. Lege den ersten an.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {agents.map(a => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setSelection({ mode: 'edit', agent: a })}
                    className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                      selectedId === a.id
                        ? 'bg-accent text-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    <span className="block truncate font-medium">{a.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {PROVIDER_LABELS[a.provider]} · {a.model || 'kein Modell'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Detail */}
      <section className="min-h-0 flex-1 overflow-auto">
        {selection.mode === 'none' ? (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyState
              icon={<Bot className="h-8 w-8" />}
              title="Agenten-Orchestrierung"
              description="Wähle links einen Agenten oder lege einen neuen an: Prompt, Modell und Rechte — lokal oder Cloud."
              action={
                <Button onClick={() => setSelection({ mode: 'new' })}>
                  <Plus className="mr-1 h-4 w-4" /> Neuer Agent
                </Button>
              }
            />
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
            <div>
              <h2 className="mb-3 text-base font-semibold text-foreground">
                {selection.mode === 'new' ? 'Neuer Agent' : selection.agent.name}
              </h2>
              <AgentEditor
                agent={selection.mode === 'edit' ? selection.agent : null}
                onSaved={handleSaved}
                onDeleted={handleDeleted}
                onCancel={() => setSelection({ mode: 'none' })}
              />
            </div>

            {selection.mode === 'edit' && (
              <div className="border-t border-border pt-6">
                <h3 className="mb-3 text-sm font-semibold text-foreground">Ausführen</h3>
                <AgentRunPanel agent={selection.agent} />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
