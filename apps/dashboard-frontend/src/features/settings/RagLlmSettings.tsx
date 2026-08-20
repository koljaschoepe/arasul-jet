import { useState, useEffect, useCallback } from 'react';
import { Save, AlertCircle } from 'lucide-react';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { Button } from '@/components/ui/shadcn/button';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { extractIssues } from './validationIssues';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';

/**
 * LLM-Standardwerte — raw column values as returned by GET /rag/settings.
 * Bounds mirror UpdateRagSettingsBody in apps/dashboard-backend/src/schemas/rag.js.
 *
 * Plan 021 (agentic RAG): Die semantische Vektor-Suche (Qdrant + Embeddings) ist
 * abgelöst — der Agent findet sich per dateien_suchen/symbol_suche selbst durch
 * die Projektdateien. Die früheren Retrieval-/Rerank-/Space-Routing-Regler haben
 * deshalb keine Wirkung mehr und sind aus dieser Oberfläche entfernt; nur die
 * LLM-Standardwerte bleiben. Die zugehörigen Backend-Spalten verschwinden mit
 * dem Ausbau des klassischen RAG (Schritt 8).
 */
interface LlmSettings {
  llm_num_ctx_default: number | null;
  llm_keep_alive_seconds: number;
  llm_num_predict_default: number;
  llm_base_system_prompt: string | null;
}

/** GET /rag/settings envelope (liefert weiterhin alle Spalten; wir lesen nur die LLM-Werte). */
interface RagSettingsResponse {
  data: LlmSettings;
}

type NumberFieldKey = 'llm_num_predict_default' | 'llm_num_ctx_default' | 'llm_keep_alive_seconds';

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

// Bounds are copied verbatim from UpdateRagSettingsBody (Zod schema).
const LLM_FIELDS: NumberFieldMeta[] = [
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

type NumberValues = Record<NumberFieldKey, string>;

function toInputString(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function buildNumberValues(settings: LlmSettings): NumberValues {
  const values = {} as NumberValues;
  for (const meta of LLM_FIELDS) {
    values[meta.key] = toInputString(settings[meta.key]);
  }
  return values;
}

interface RagLlmSettingsProps {
  onDirtyChange?: (dirty: boolean) => void;
}

export function RagLlmSettings({ onDirtyChange }: RagLlmSettingsProps = {}) {
  const api = useApi();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  // Field-level validation errors keyed by column name (e.g. 'llm_num_predict_default').
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [numberValues, setNumberValues] = useState<NumberValues | null>(null);
  const [basePrompt, setBasePrompt] = useState('');

  const [originalNumberValues, setOriginalNumberValues] = useState<NumberValues | null>(null);
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
        const prompt = settings.llm_base_system_prompt ?? '';

        setNumberValues(nums);
        setBasePrompt(prompt);
        setOriginalNumberValues(nums);
        setOriginalBasePrompt(prompt);
      } catch (error) {
        if (signal.aborted) return;
        console.error('Error fetching LLM settings:', error);
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

  const buildPatchBody = useCallback((): Record<string, number | string | null> => {
    const body: Record<string, number | string | null> = {};
    if (!numberValues || !originalNumberValues) return body;

    for (const meta of LLM_FIELDS) {
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

    if (basePrompt !== originalBasePrompt) {
      // Empty string tells the backend to reset llm_base_system_prompt to NULL.
      body.llm_base_system_prompt = basePrompt;
    }

    return body;
  }, [numberValues, originalNumberValues, basePrompt, originalBasePrompt]);

  const patchBody = buildPatchBody();
  const hasChanges = Object.keys(patchBody).length > 0;

  useEffect(() => {
    onDirtyChange?.(hasChanges);
  }, [hasChanges, onDirtyChange]);

  const clearFieldError = (key: string) => {
    setFieldErrors(prev => {
      if (!prev[key]) return prev;
      const { [key]: _omit, ...rest } = prev;
      return rest;
    });
  };

  const handleNumberChange = (key: NumberFieldKey, value: string) => {
    setNumberValues(prev => (prev ? { ...prev, [key]: value } : prev));
    setMessage(null);
    clearFieldError(key);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    setFieldErrors({});

    try {
      await api.patch<RagSettingsResponse>('/rag/settings', patchBody, { showError: false });

      if (numberValues) setOriginalNumberValues({ ...numberValues });
      setOriginalBasePrompt(basePrompt);

      toast.success('LLM-Einstellungen erfolgreich gespeichert');
    } catch (error: unknown) {
      // Surface field-level validation issues next to the offending inputs.
      // Issue paths mirror the column names (e.g. 'llm_num_predict_default').
      const issues = extractIssues(error);
      const nextFieldErrors: Record<string, string> = {};
      for (const issue of issues) {
        if (issue.path) nextFieldErrors[issue.path] = issue.message;
      }
      setFieldErrors(nextFieldErrors);

      const err = error as { message?: string };
      const detail = issues[0]?.message || err.message || 'Fehler beim Speichern';
      toast.error(detail);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !numberValues) {
    return (
      <div className="animate-in fade-in">
        <PageHeader title="Sprachmodell" />
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
        aria-invalid={Boolean(fieldErrors[meta.key])}
      />
      {fieldErrors[meta.key] ? (
        <p className="text-xs text-destructive">{fieldErrors[meta.key]}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {meta.hint ? `${meta.hint} ` : ''}
          Bereich: {meta.min}–{meta.max}
        </p>
      )}
    </div>
  );

  return (
    <div className="animate-in fade-in">
      <PageHeader
        title="Sprachmodell"
        description="Standardwerte für das Sprachmodell. Werte außerhalb der angegebenen Grenzen werden vom Backend abgelehnt. Die Wissenssuche läuft agentisch (der Agent durchsucht die Projektdateien selbst), es gibt keine Retrieval-Regler mehr zu stellen."
      />

      <div className="flex flex-col gap-8">
        <Section title="LLM-Standardwerte">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {LLM_FIELDS.map(renderNumberField)}
          </div>
        </Section>

        <Section
          title="Basis-System-Prompt"
          description="Wird jedem LLM-Aufruf vorangestellt. Ein leeres Feld bedeutet: eingebauter Standard-Prompt."
          divider={false}
        >
          <div className="space-y-4">
            <Textarea
              id="llm_base_system_prompt"
              aria-label="Basis-System-Prompt"
              className="min-h-40 font-mono text-sm"
              value={basePrompt}
              onChange={e => {
                setBasePrompt(e.target.value);
                setMessage(null);
                clearFieldError('llm_base_system_prompt');
              }}
              placeholder="Leer lassen für den eingebauten Standard-Prompt..."
              spellCheck={false}
              maxLength={4000}
              aria-invalid={Boolean(fieldErrors.llm_base_system_prompt)}
            />
            {fieldErrors.llm_base_system_prompt && (
              <p className="text-xs text-destructive">{fieldErrors.llm_base_system_prompt}</p>
            )}
          </div>
        </Section>

        {/* Load error (save feedback goes through toasts) */}
        {message && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
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
          <Button onClick={handleSave} loading={saving} disabled={!hasChanges}>
            <Save className="size-4" />
            Speichern
          </Button>
        </div>
      </div>
    </div>
  );
}
