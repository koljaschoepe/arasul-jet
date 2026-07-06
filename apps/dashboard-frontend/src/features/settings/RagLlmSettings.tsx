import { useState, useEffect, useCallback } from 'react';
import { Save, Check, AlertCircle } from 'lucide-react';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { useApi } from '../../hooks/useApi';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { Button } from '@/components/ui/shadcn/button';
import { Switch } from '@/components/ui/shadcn/switch';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';

/**
 * RAG & LLM tunables — raw column values as returned by GET /rag/settings.
 * Bounds mirror UpdateRagSettingsBody in apps/dashboard-backend/src/schemas/rag.js.
 * Defined locally (not in src/types) since it is a settings-feature concern only.
 */
interface RagSettings {
  rag_temperature: number;
  rag_num_predict: number;
  rag_top_k: number;
  rag_final_k: number;
  rag_score_threshold: number;
  rag_relevance_threshold: number;
  rag_mmr_lambda: number;
  rag_dedup_max_per_doc: number;
  rag_hybrid_search: boolean;
  rag_rerank_enabled: boolean;
  rag_timeout_rerank_ms: number;
  rag_space_routing_threshold: number;
  rag_space_routing_max_spaces: number;
  llm_num_ctx_default: number | null;
  llm_keep_alive_seconds: number;
  llm_num_predict_default: number;
  llm_base_system_prompt: string | null;
}

/** GET /rag/settings envelope. */
interface RagSettingsResponse {
  data: RagSettings;
}

type NumberFieldKey =
  | 'rag_temperature'
  | 'rag_num_predict'
  | 'rag_top_k'
  | 'rag_final_k'
  | 'rag_score_threshold'
  | 'rag_relevance_threshold'
  | 'rag_mmr_lambda'
  | 'rag_dedup_max_per_doc'
  | 'rag_timeout_rerank_ms'
  | 'rag_space_routing_threshold'
  | 'rag_space_routing_max_spaces'
  | 'llm_num_ctx_default'
  | 'llm_keep_alive_seconds'
  | 'llm_num_predict_default';

type BoolFieldKey = 'rag_hybrid_search' | 'rag_rerank_enabled';

interface NumberFieldMeta {
  key: NumberFieldKey;
  label: string;
  min: number;
  max: number;
  step: number;
  hint?: string;
  /** Empty input clears the value to NULL (backend default) instead of skipping. */
  nullable?: boolean;
}

interface BoolFieldMeta {
  key: BoolFieldKey;
  label: string;
  hint?: string;
}

// Bounds are copied verbatim from UpdateRagSettingsBody (Zod schema).
const GENERATION_FIELDS: NumberFieldMeta[] = [
  { key: 'rag_temperature', label: 'Temperatur (RAG)', min: 0, max: 2, step: 0.1 },
  { key: 'rag_num_predict', label: 'Max. Tokens (RAG)', min: 64, max: 16384, step: 1 },
  {
    key: 'llm_num_predict_default',
    label: 'Max. Tokens (LLM-Default)',
    min: 64,
    max: 16384,
    step: 1,
  },
  {
    key: 'llm_num_ctx_default',
    label: 'Kontextfenster (LLM-Default)',
    min: 512,
    max: 131072,
    step: 1,
    nullable: true,
    hint: 'Leer lassen für den Modell-Default.',
  },
  { key: 'llm_keep_alive_seconds', label: 'Keep-Alive (Sekunden)', min: 0, max: 86400, step: 1 },
];

const RETRIEVAL_FIELDS: NumberFieldMeta[] = [
  { key: 'rag_top_k', label: 'Top-K (Kandidaten)', min: 1, max: 50, step: 1 },
  { key: 'rag_final_k', label: 'Final-K (finale Treffer)', min: 1, max: 20, step: 1 },
  { key: 'rag_score_threshold', label: 'Score-Schwelle', min: 0, max: 1, step: 0.01 },
  { key: 'rag_relevance_threshold', label: 'Relevanz-Schwelle', min: 0, max: 1, step: 0.01 },
  { key: 'rag_mmr_lambda', label: 'MMR-Lambda', min: 0, max: 1, step: 0.01 },
  { key: 'rag_dedup_max_per_doc', label: 'Max. Chunks pro Dokument', min: 1, max: 10, step: 1 },
  { key: 'rag_timeout_rerank_ms', label: 'Rerank-Timeout (ms)', min: 1000, max: 120000, step: 1 },
];

const RETRIEVAL_SWITCHES: BoolFieldMeta[] = [
  { key: 'rag_hybrid_search', label: 'Hybride Suche' },
  { key: 'rag_rerank_enabled', label: 'Reranking aktiv' },
];

const ROUTING_FIELDS: NumberFieldMeta[] = [
  { key: 'rag_space_routing_threshold', label: 'Routing-Schwelle', min: 0, max: 1, step: 0.01 },
  {
    key: 'rag_space_routing_max_spaces',
    label: 'Max. Spaces beim Routing',
    min: 1,
    max: 10,
    step: 1,
  },
];

const ALL_NUMBER_FIELDS: NumberFieldMeta[] = [
  ...GENERATION_FIELDS,
  ...RETRIEVAL_FIELDS,
  ...ROUTING_FIELDS,
];
const BOOL_FIELD_KEYS: BoolFieldKey[] = RETRIEVAL_SWITCHES.map(f => f.key);

type NumberValues = Record<NumberFieldKey, string>;
type BoolValues = Record<BoolFieldKey, boolean>;

function toInputString(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function buildNumberValues(settings: RagSettings): NumberValues {
  const values = {} as NumberValues;
  for (const meta of ALL_NUMBER_FIELDS) {
    values[meta.key] = toInputString(settings[meta.key]);
  }
  return values;
}

function buildBoolValues(settings: RagSettings): BoolValues {
  const values = {} as BoolValues;
  for (const key of BOOL_FIELD_KEYS) {
    values[key] = Boolean(settings[key]);
  }
  return values;
}

interface RagLlmSettingsProps {
  onDirtyChange?: (dirty: boolean) => void;
}

export function RagLlmSettings({ onDirtyChange }: RagLlmSettingsProps = {}) {
  const api = useApi();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  const [numberValues, setNumberValues] = useState<NumberValues | null>(null);
  const [boolValues, setBoolValues] = useState<BoolValues | null>(null);
  const [basePrompt, setBasePrompt] = useState('');

  const [originalNumberValues, setOriginalNumberValues] = useState<NumberValues | null>(null);
  const [originalBoolValues, setOriginalBoolValues] = useState<BoolValues | null>(null);
  const [originalBasePrompt, setOriginalBasePrompt] = useState('');

  const fetchSettings = useCallback(
    async (signal: AbortSignal) => {
      try {
        const res = await api.get<RagSettingsResponse>('/rag/settings', {
          signal,
          showError: false,
        });
        const settings = res.data;
        const nums = buildNumberValues(settings);
        const bools = buildBoolValues(settings);
        const prompt = settings.llm_base_system_prompt ?? '';

        setNumberValues(nums);
        setBoolValues(bools);
        setBasePrompt(prompt);
        setOriginalNumberValues(nums);
        setOriginalBoolValues(bools);
        setOriginalBasePrompt(prompt);
      } catch (error) {
        if (signal.aborted) return;
        console.error('Error fetching RAG settings:', error);
        setMessage({ type: 'error', text: 'Einstellungen konnten nicht geladen werden.' });
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchSettings(controller.signal);
    return () => controller.abort();
  }, [fetchSettings]);

  const buildPatchBody = useCallback((): Record<string, number | boolean | string | null> => {
    const body: Record<string, number | boolean | string | null> = {};
    if (!numberValues || !originalNumberValues || !boolValues || !originalBoolValues) return body;

    for (const meta of ALL_NUMBER_FIELDS) {
      const raw = numberValues[meta.key];
      if (raw === originalNumberValues[meta.key]) continue;
      if (raw.trim() === '') {
        if (meta.nullable) body[meta.key] = null;
        continue;
      }
      const num = Number(raw);
      if (Number.isNaN(num)) continue;
      body[meta.key] = num;
    }

    for (const key of BOOL_FIELD_KEYS) {
      if (boolValues[key] !== originalBoolValues[key]) body[key] = boolValues[key];
    }

    if (basePrompt !== originalBasePrompt) {
      // Empty string tells the backend to reset llm_base_system_prompt to NULL.
      body.llm_base_system_prompt = basePrompt;
    }

    return body;
  }, [
    numberValues,
    originalNumberValues,
    boolValues,
    originalBoolValues,
    basePrompt,
    originalBasePrompt,
  ]);

  const patchBody = buildPatchBody();
  const hasChanges = Object.keys(patchBody).length > 0;

  useEffect(() => {
    onDirtyChange?.(hasChanges);
  }, [hasChanges, onDirtyChange]);

  const handleNumberChange = (key: NumberFieldKey, value: string) => {
    setNumberValues(prev => (prev ? { ...prev, [key]: value } : prev));
    setMessage(null);
  };

  const handleBoolChange = (key: BoolFieldKey, value: boolean) => {
    setBoolValues(prev => (prev ? { ...prev, [key]: value } : prev));
    setMessage(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      await api.patch<RagSettingsResponse>('/rag/settings', patchBody, { showError: false });

      if (numberValues) setOriginalNumberValues({ ...numberValues });
      if (boolValues) setOriginalBoolValues({ ...boolValues });
      setOriginalBasePrompt(basePrompt);

      setMessage({ type: 'success', text: 'RAG- & LLM-Einstellungen erfolgreich gespeichert' });
    } catch (error: unknown) {
      const err = error as { message?: string };
      setMessage({ type: 'error', text: err.message || 'Fehler beim Speichern' });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !numberValues || !boolValues) {
    return (
      <div className="animate-in fade-in">
        <div className="mb-8 pb-6 border-b border-border">
          <h1 className="text-2xl font-bold text-foreground mb-2">RAG &amp; LLM</h1>
        </div>
        <SkeletonCard hasAvatar={false} lines={6} />
      </div>
    );
  }

  const renderNumberField = (meta: NumberFieldMeta) => (
    <div key={meta.key} className="space-y-2">
      <Label htmlFor={meta.key}>{meta.label}</Label>
      <Input
        id={meta.key}
        type="number"
        min={meta.min}
        max={meta.max}
        step={meta.step}
        value={numberValues[meta.key]}
        onChange={e => handleNumberChange(meta.key, e.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        {meta.hint ? `${meta.hint} ` : ''}
        Bereich: {meta.min}–{meta.max}
      </p>
    </div>
  );

  return (
    <div className="animate-in fade-in">
      <div className="mb-8 pb-6 border-b border-border">
        <h1 className="text-2xl font-bold text-foreground mb-2">RAG &amp; LLM</h1>
        <p className="text-sm text-muted-foreground">
          Feineinstellungen für die RAG-Pipeline und das Sprachmodell. Werte außerhalb der
          angegebenen Grenzen werden vom Backend abgelehnt.
        </p>
      </div>

      <div className="flex flex-col gap-8">
        {/* Generation */}
        <section className="space-y-5">
          <h3 className="text-sm font-semibold text-foreground">Generierung</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {GENERATION_FIELDS.map(renderNumberField)}
          </div>
        </section>

        <div className="border-t border-border" />

        {/* Retrieval */}
        <section className="space-y-5">
          <h3 className="text-sm font-semibold text-foreground">Retrieval</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {RETRIEVAL_FIELDS.map(renderNumberField)}
          </div>
          <div className="flex flex-col gap-4 pt-1">
            {RETRIEVAL_SWITCHES.map(meta => (
              <div key={meta.key} className="flex items-center justify-between gap-4">
                <Label htmlFor={meta.key} className="cursor-pointer font-normal">
                  {meta.label}
                </Label>
                <Switch
                  id={meta.key}
                  checked={boolValues[meta.key]}
                  onCheckedChange={value => handleBoolChange(meta.key, value)}
                />
              </div>
            ))}
          </div>
        </section>

        <div className="border-t border-border" />

        {/* Routing */}
        <section className="space-y-5">
          <h3 className="text-sm font-semibold text-foreground">Space-Routing</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {ROUTING_FIELDS.map(renderNumberField)}
          </div>
        </section>

        <div className="border-t border-border" />

        {/* Base system prompt */}
        <section className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">Basis-System-Prompt</h3>
            <p className="text-xs text-muted-foreground">
              Wird jedem LLM-Aufruf vorangestellt. Leeres Feld = eingebauter Standard-Prompt.
            </p>
          </div>
          <Textarea
            id="llm_base_system_prompt"
            aria-label="Basis-System-Prompt"
            className="min-h-40 font-mono text-sm"
            value={basePrompt}
            onChange={e => {
              setBasePrompt(e.target.value);
              setMessage(null);
            }}
            placeholder="Leer lassen für den eingebauten Standard-Prompt..."
            spellCheck={false}
            maxLength={4000}
          />
        </section>

        {/* Message */}
        {message && (
          <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
            {message.type === 'success' ? (
              <Check className="size-4" />
            ) : (
              <AlertCircle className="size-4" />
            )}
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        {/* Save Footer */}
        <div className="flex items-center justify-between py-2">
          <div>
            {hasChanges && (
              <span className="text-xs text-warning font-medium">Ungespeicherte Änderungen</span>
            )}
          </div>
          <Button onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? (
              'Speichern...'
            ) : (
              <>
                <Save className="size-4" />
                Speichern
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
