import { useState, useEffect, useRef, memo } from 'react';
import { Plus } from 'lucide-react';
import { useApi } from '../../../hooks/useApi';
import { FIELD_TYPES } from '../../../components/editor/GridEditor/FieldTypes';
import { FIELD_LABELS, columnNameInputCls } from '../utils';

interface InlineColumnCreatorProps {
  tableSlug: string;
  onColumnAdded: () => void;
}

const InlineColumnCreator = memo(function InlineColumnCreator({
  tableSlug,
  onColumnAdded,
}: InlineColumnCreatorProps) {
  const api = useApi();
  const [mode, setMode] = useState<'button' | 'name' | 'type' | 'unit'>('button');
  const [name, setName] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [unit, setUnit] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef<HTMLSelectElement>(null);
  const unitRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === 'name' && inputRef.current) inputRef.current.focus();
    if (mode === 'type' && typeRef.current) typeRef.current.focus();
    if (mode === 'unit' && unitRef.current) unitRef.current.focus();
  }, [mode]);

  const resetState = () => {
    setMode('button');
    setName('');
    setSelectedType('');
    setUnit('');
    setError(null);
  };

  const handleNameSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) {
      resetState();
      return;
    }
    setMode('type');
  };

  const handleTypeSelect = (type: string) => {
    setSelectedType(type);
    setMode('unit');
  };

  const handleCreateColumn = async (unitValue: string | null) => {
    setLoading(true);
    setError(null);
    try {
      await api.post(
        `/v1/datentabellen/tables/${tableSlug}/fields`,
        {
          name: name.trim(),
          field_type: selectedType,
          unit: unitValue || undefined,
          is_required: false,
          is_unique: false,
        },
        { showError: false }
      );
      onColumnAdded();
      resetState();
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      setError(e.data?.error || e.message || 'Unbekannter Fehler');
      setMode('name');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') resetState();
    else if (e.key === 'Enter' && mode === 'name') handleNameSubmit();
    else if (e.key === 'Enter' && mode === 'unit') handleCreateColumn(unit.trim());
  };

  if (mode === 'button') {
    return (
      <div className="w-10 min-w-10 flex items-center justify-center shrink-0">
        <button
          type="button"
          className="flex items-center justify-center w-full h-full bg-transparent border-none text-muted-foreground cursor-pointer transition-all hover:text-primary hover:bg-primary/10"
          onClick={() => setMode('name')}
          title="Neue Spalte hinzufügen"
        >
          <Plus className="size-4" />
        </button>
      </div>
    );
  }

  if (mode === 'name') {
    return (
      <div className="w-auto min-w-[140px] flex items-center justify-center shrink-0 py-1 px-2">
        <div className="flex flex-col gap-1">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (!name.trim()) resetState();
            }}
            placeholder="Spaltenname..."
            className={columnNameInputCls}
          />
          {error && <span className="text-[0.625rem] text-destructive">{error}</span>}
        </div>
      </div>
    );
  }

  if (mode === 'type') {
    return (
      <div className="w-auto min-w-[140px] flex items-center justify-center shrink-0 py-1 px-2">
        <div className="flex flex-col gap-1">
          <span className="text-[0.625rem] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
            {name}
          </span>
          <select
            ref={typeRef}
            onChange={e => e.target.value && handleTypeSelect(e.target.value)}
            onBlur={resetState}
            onKeyDown={e => {
              if (e.key === 'Escape') resetState();
            }}
            disabled={loading}
            className="w-[120px] py-1.5 px-2 bg-background border border-primary rounded text-foreground text-xs cursor-pointer"
          >
            <option value="">Typ wählen...</option>
            {(FIELD_TYPES as Array<{ value: string; label: string; icon?: string }>).map(t => (
              <option key={t.value} value={t.value}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  // mode === 'unit'
  return (
    <div className="w-auto min-w-[140px] flex items-center justify-center shrink-0 py-1 px-2">
      <div className="flex flex-col gap-1">
        <span className="text-[0.625rem] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
          {name} ({FIELD_LABELS[selectedType]})
        </span>
        <input
          ref={unitRef}
          type="text"
          value={unit}
          onChange={e => setUnit(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Einheit (z.B. kg, €, m)"
          className={columnNameInputCls}
        />
        <div className="flex gap-1">
          <button
            type="button"
            className="inline-flex items-center gap-1 py-1 px-2 bg-background border border-border rounded text-muted-foreground text-[0.6875rem] cursor-pointer"
            onClick={() => handleCreateColumn(null)}
            disabled={loading}
          >
            Überspringen
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 py-1 px-2 bg-secondary border border-border rounded text-primary text-[0.6875rem] cursor-pointer hover:bg-secondary/80"
            onClick={() => handleCreateColumn(unit.trim())}
            disabled={loading}
          >
            {loading ? '...' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
});

export default InlineColumnCreator;
