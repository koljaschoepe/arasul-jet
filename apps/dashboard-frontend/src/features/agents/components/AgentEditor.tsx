/**
 * Editor für einen einzelnen Flow-Agenten (Plan 010, Schritt 2).
 * Prompt, Provider-/Modellwahl (lokal: Liste installierter Modelle; extern:
 * freie Eingabe) und das Admin-Recht „externe Tools". Speichern legt an bzw.
 * aktualisiert; alles über useApi, Theme-Tokens, TypeScript.
 */

import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { Label } from '@/components/ui/shadcn/label';
import { Switch } from '@/components/ui/shadcn/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/shadcn/select';
import type { AgentDraft, AgentProvider, FlowAgent } from '../types';
import { PROVIDER_LABELS, FLOW_TOOLS } from '../types';

const EXTERNAL_TOOL_NAMES = FLOW_TOOLS.filter(t => t.external).map(t => t.name);

/**
 * Shape aus GET /api/models/installed: `id` ist der Katalog-Schlüssel,
 * `effective_ollama_name` der tatsächliche Ollama-Tag (den bekommt das Modell),
 * `model_type` trennt Chat-Modelle ('llm') von OCR o. Ä.
 */
interface InstalledModel {
  id: string;
  name?: string;
  effective_ollama_name?: string;
  model_type?: string;
}
interface InstalledModelsResponse {
  models: InstalledModel[];
}
interface ModelOption {
  value: string;
  label: string;
}

interface Props {
  /** Vorhandener Agent (Bearbeiten) oder null (Neuanlage). */
  agent: FlowAgent | null;
  onSaved: (agent: FlowAgent) => void;
  onDeleted: (id: number) => void;
  onCancel: () => void;
}

function toDraft(agent: FlowAgent | null): AgentDraft {
  return {
    name: agent?.name ?? '',
    description: agent?.description ?? '',
    systemPrompt: agent?.systemPrompt ?? '',
    provider: agent?.provider ?? 'ollama',
    model: agent?.model ?? '',
    tools: agent?.tools ?? [],
    allowExternal: agent?.allowExternal ?? false,
  };
}

export function AgentEditor({ agent, onSaved, onDeleted, onCancel }: Props) {
  const api = useApi();
  const { user } = useAuth();
  const isAdmin = (user?.role as string | undefined) === 'admin';

  const [draft, setDraft] = useState<AgentDraft>(() => toDraft(agent));
  const [localModels, setLocalModels] = useState<ModelOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(toDraft(agent));
  }, [agent]);

  // Installierte lokale Modelle für den Ollama-Modell-Picker laden.
  useEffect(() => {
    let cancelled = false;
    api
      .get<InstalledModelsResponse>('/models/installed', { showError: false })
      .then(res => {
        if (cancelled) return;
        // Nur Chat-Modelle (kein OCR); Wert = Ollama-Tag, Label = Anzeigename.
        const opts = (res.models ?? [])
          .filter(m => (m.model_type ?? 'llm') === 'llm')
          .map(m => ({ value: m.effective_ollama_name || m.id, label: m.name || m.id }))
          .filter(o => o.value);
        setLocalModels(opts);
      })
      .catch(() => {
        /* Picker fällt auf freie Eingabe zurück */
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const set = <K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) =>
    setDraft(d => ({ ...d, [key]: value }));

  const canSave = draft.name.trim().length > 0 && draft.model.trim().length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      // Externe Tools nie mitspeichern, wenn die Freigabe fehlt (UI/Backend deckungsgleich).
      const tools = draft.allowExternal
        ? draft.tools
        : draft.tools.filter(t => !EXTERNAL_TOOL_NAMES.includes(t));
      const body = { ...draft, tools };
      const res = agent
        ? await api.put<{ data: FlowAgent }>(`/agents/${agent.id}`, body)
        : await api.post<{ data: FlowAgent }>('/agents', body);
      onSaved(res.data);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!agent) return;
    await api.del(`/agents/${agent.id}`);
    onDeleted(agent.id);
  };

  const isLocal = draft.provider === 'ollama';
  const modelOptions = localModels;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="agent-name">Name</Label>
        <Input
          id="agent-name"
          value={draft.name}
          onChange={e => set('name', e.target.value)}
          placeholder="z. B. Recherche-Assistent"
          maxLength={120}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="agent-desc">Beschreibung</Label>
        <Input
          id="agent-desc"
          value={draft.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Kurz: wofür ist dieser Agent?"
          maxLength={2000}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="agent-prompt">System-Prompt</Label>
        <Textarea
          id="agent-prompt"
          value={draft.systemPrompt}
          onChange={e => set('systemPrompt', e.target.value)}
          placeholder="Die Rolle und Anweisung des Agenten…"
          rows={6}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Provider</Label>
          <Select value={draft.provider} onValueChange={v => set('provider', v as AgentProvider)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PROVIDER_LABELS) as AgentProvider[]).map(p => (
                <SelectItem key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="agent-model">Modell</Label>
          {isLocal && modelOptions.length > 0 ? (
            <Select value={draft.model} onValueChange={v => set('model', v)}>
              <SelectTrigger id="agent-model">
                <SelectValue placeholder="Modell wählen" />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map(m => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="agent-model"
              value={draft.model}
              onChange={e => set('model', e.target.value)}
              placeholder={isLocal ? 'z. B. qwen2.5:3b' : 'z. B. gpt-4o-mini'}
              maxLength={200}
            />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Tools</Label>
        <p className="-mt-1 text-xs text-muted-foreground">
          Werkzeuge, die der Agent während eines Laufs nutzen darf.
        </p>
        <div className="flex flex-col gap-2">
          {FLOW_TOOLS.map(t => {
            // Externe Tools sind nur nutzbar, wenn „externe Tools" freigeschaltet ist.
            const blocked = Boolean(t.external) && !draft.allowExternal;
            const checked = draft.tools.includes(t.name) && !blocked;
            return (
              <div
                key={t.name}
                className="flex items-center justify-between rounded-md border border-border p-2.5"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">
                    {t.label}
                    {t.external && (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                        extern
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {blocked
                      ? `${t.description} — benötigt „Externe Tools erlauben"`
                      : t.description}
                  </span>
                </div>
                <Switch
                  checked={checked}
                  disabled={blocked}
                  aria-label={t.label}
                  onCheckedChange={on =>
                    set(
                      'tools',
                      on ? [...draft.tools, t.name] : draft.tools.filter(x => x !== t.name)
                    )
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      {isAdmin && (
        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">Externe Tools erlauben</span>
            <span className="text-xs text-muted-foreground">
              Erlaubt Netz-/Cloud-Zugriff (Web/HTTP). Nur für Admins.
            </span>
          </div>
          <Switch
            checked={draft.allowExternal}
            onCheckedChange={v =>
              setDraft(d => ({
                ...d,
                allowExternal: v,
                // Externe Tools abwählen, wenn die Freigabe zurückgenommen wird.
                tools: v ? d.tools : d.tools.filter(x => !EXTERNAL_TOOL_NAMES.includes(x)),
              }))
            }
            aria-label="Externe Tools erlauben"
          />
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button onClick={save} disabled={!canSave}>
          {saving ? 'Speichert…' : agent ? 'Speichern' : 'Anlegen'}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Abbrechen
        </Button>
        {agent && (
          <Button variant="ghost" className="ml-auto text-destructive" onClick={remove}>
            Löschen
          </Button>
        )}
      </div>
    </div>
  );
}
