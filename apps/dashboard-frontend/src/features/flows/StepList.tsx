/**
 * StepList — der Editor der deterministischen Schritt-Kette (Plan 013, B7).
 *
 * Gibt der Flow-Datei eine feste, sichtbare Reihenfolge — „wer, mit welchem
 * Auftrag, in welcher Reihenfolge". Bewusst minimalistisch (à la n8n, aber ohne
 * Drag&Drop-Bibliothek): Karten mit Hoch/Runter-Umsortieren, Typ-Umschalter und
 * je Typ genau die relevanten Felder. Leer gelassen läuft der Flow wie bisher
 * modellgetrieben — die Kette ist ein Angebot, kein Zwang.
 *
 * Rein darstellend/kontrolliert: der Zustand liegt in `flowFormState`, jede
 * Änderung geht über `onChange`. Vorlagen in `auftrag`/`parameter` dürfen
 * {{argument}}, {{schrittname}} (Ausgabe eines früheren Schritts) und {{vorher}}
 * (vorige Iteration) verwenden — aufgelöst wird zur Laufzeit im Backend.
 */
import { useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Waypoints } from 'lucide-react';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { Button } from '@/components/ui/shadcn/button';
import type { FlowStep, FlowStepType, FlowTool, FlowToolInfo } from '@/types/flows';
import { leererSchritt, type FlowFormState } from './flowFormState';

const selectClass =
  'h-9 rounded-md border border-input bg-transparent px-2 text-[13px] shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** `parameter`-Objekt ⇄ „schluessel: wert"-Zeilen für das kompakte Textfeld. */
function paramsToText(parameter?: Record<string, string | number | boolean>): string {
  if (!parameter) return '';
  return Object.entries(parameter)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

function textToParams(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const zeile of text.split('\n')) {
    const idx = zeile.indexOf(':');
    if (idx <= 0) continue;
    const key = zeile.slice(0, idx).trim();
    const val = zeile.slice(idx + 1).trim();
    if (key) out[key] = val;
  }
  return out;
}

interface StepCardProps {
  step: FlowStep;
  index: number;
  total: number;
  rollen: string[];
  werkzeuge: FlowToolInfo[];
  onChange: (teil: Partial<FlowStep>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}

function StepCard({
  step,
  index,
  total,
  rollen,
  werkzeuge,
  onChange,
  onMove,
  onRemove,
}: StepCardProps) {
  // Roh-Text der Parameter lokal halten, damit der Cursor beim Tippen nicht
  // springt; die geparsten Werte fließen bei jeder Änderung nach oben.
  const [paramText, setParamText] = useState(() => paramsToText(step.parameter));

  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-border p-2.5"
      data-testid="schritt-row"
    >
      <div className="flex items-center gap-1.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium text-muted-foreground">
          {index + 1}
        </span>
        <Input
          value={step.name}
          onChange={e => onChange({ name: e.target.value })}
          placeholder="schrittname"
          aria-label={`Name von Schritt ${index + 1}`}
          className="flex-1 font-mono text-[13px]"
        />
        <select
          value={step.typ}
          onChange={e => onChange({ typ: e.target.value as FlowStepType })}
          aria-label={`Art von Schritt ${index + 1}`}
          className={selectClass}
        >
          <option value="subagent">Rolle</option>
          <option value="werkzeug">Werkzeug</option>
        </select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Schritt ${index + 1} nach oben`}
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          <ArrowUp className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Schritt ${index + 1} nach unten`}
          disabled={index === total - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDown className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Schritt ${index + 1} entfernen`}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {step.typ === 'subagent' ? (
        <>
          <select
            value={step.rolle ?? ''}
            onChange={e => onChange({ rolle: e.target.value })}
            aria-label={`Rolle von Schritt ${index + 1}`}
            className={selectClass}
          >
            <option value="">— Rolle wählen —</option>
            {rollen.map(r => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <Textarea
            value={step.auftrag ?? ''}
            onChange={e => onChange({ auftrag: e.target.value })}
            placeholder="Auftrag an die Rolle — Vorlagen: {{argument}}, {{vorheriger-schritt}}"
            aria-label={`Auftrag von Schritt ${index + 1}`}
            rows={2}
            className="resize-y text-[13px]"
          />
        </>
      ) : (
        <>
          <select
            value={step.werkzeug ?? ''}
            onChange={e =>
              onChange({ werkzeug: (e.target.value || undefined) as FlowTool | undefined })
            }
            aria-label={`Werkzeug von Schritt ${index + 1}`}
            className={selectClass}
          >
            <option value="">— Werkzeug wählen —</option>
            {werkzeuge
              .filter(w => w.name !== 'subagent')
              .map(w => (
                <option key={w.name} value={w.name}>
                  {w.name}
                </option>
              ))}
          </select>
          <Textarea
            value={paramText}
            onChange={e => {
              setParamText(e.target.value);
              onChange({ parameter: textToParams(e.target.value) });
            }}
            placeholder={'Parameter, je Zeile „schluessel: wert"\nz. B. query: {{thema}}'}
            aria-label={`Parameter von Schritt ${index + 1}`}
            rows={2}
            className="resize-y font-mono text-[13px]"
          />
        </>
      )}

      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground" htmlFor={`iter-${index}`}>
          Durchläufe
        </Label>
        <Input
          id={`iter-${index}`}
          type="number"
          min={1}
          max={10}
          value={step.iterationen}
          onChange={e => onChange({ iterationen: Math.max(1, Number(e.target.value) || 1) })}
          aria-label={`Durchläufe von Schritt ${index + 1}`}
          className="w-20 text-[13px]"
        />
      </div>
    </div>
  );
}

export default function StepList({
  value,
  onChange,
  werkzeuge,
}: {
  value: FlowFormState;
  onChange: (next: FlowFormState) => void;
  werkzeuge: FlowToolInfo[];
}) {
  const patch = (schritte: FlowStep[]) => onChange({ ...value, schritte });
  const rollenNamen = value.rollen.map(r => r.name).filter(Boolean);

  const setStep = (i: number, teil: Partial<FlowStep>) =>
    patch(value.schritte.map((s, j) => (j === i ? { ...s, ...teil } : s)));

  const moveStep = (i: number, dir: -1 | 1) => {
    const ziel = i + dir;
    if (ziel < 0 || ziel >= value.schritte.length) return;
    const next = [...value.schritte];
    const a = next[i];
    const b = next[ziel];
    if (!a || !b) return;
    next[i] = b;
    next[ziel] = a;
    patch(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <Waypoints className="size-4 text-muted-foreground" />
          Schritt-Kette{' '}
          <span className="font-normal text-muted-foreground text-xs">
            (optional, feste Reihenfolge)
          </span>
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => patch([...value.schritte, leererSchritt()])}
        >
          <Plus className="size-4" /> Schritt
        </Button>
      </div>

      {value.schritte.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
          Ohne Schritte läuft der Flow modellgetrieben — der Prompt unten entscheidet selbst, wann
          er welche Rolle ruft. Füge Schritte hinzu, um die Reihenfolge fest vorzugeben.
        </p>
      ) : (
        value.schritte.map((s, i) => (
          <StepCard
            key={i}
            step={s}
            index={i}
            total={value.schritte.length}
            rollen={rollenNamen}
            werkzeuge={werkzeuge}
            onChange={teil => setStep(i, teil)}
            onMove={dir => moveStep(i, dir)}
            onRemove={() => patch(value.schritte.filter((_, j) => j !== i))}
          />
        ))
      )}
    </div>
  );
}
