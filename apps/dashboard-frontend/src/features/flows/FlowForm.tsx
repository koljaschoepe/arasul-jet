/**
 * FlowForm — das Formular des Anlege-/Bearbeiten-Dialogs (Plan 011, Schritt 17).
 *
 * Links im Dialog: alle Felder eines Flows. Rein darstellend und kontrolliert —
 * der Dialog hält den Zustand (`flowFormState.ts`) und bekommt jede Änderung über
 * `onChange`. Die erzeugte Datei und ihre Prüfung liegen im Backend (rechte
 * Vorschau); das Formular sammelt nur.
 */
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { Button } from '@/components/ui/shadcn/button';
import { Checkbox } from '@/components/ui/Checkbox';
import { cn } from '@/lib/utils';
import type { FlowArgument, FlowArgumentType, FlowTool, FlowToolInfo } from '@/types/flows';
import { brauchtOrdner, leeresArgument, type FlowFormState } from './flowFormState';
import AblaufEditor from './AblaufEditor';

const ARG_TYP_LABEL: Record<FlowArgumentType, string> = {
  freitext: 'Freitext',
  datei: 'Datei',
  auswahl: 'Auswahlliste',
  wissensbasis: 'Wissensbasis',
};

/** Lesbare deutsche Labels für die Werkzeug-Checkboxen (statt roher Namen). */
const WERKZEUG_LABEL: Record<FlowTool, string> = {
  dateien_lesen: 'Dateien lesen',
  dateien_schreiben: 'Dateien schreiben',
  dateien_suchen: 'Dateien suchen',
  rag_suche: 'Wissens-Suche',
  web_suche: 'Web-Suche',
  web_lesen: 'Web lesen',
  terminal: 'Terminal',
  subagent: 'Subagenten',
};

const werkzeugLabel = (name: FlowTool): string => WERKZEUG_LABEL[name] ?? name;

interface FlowFormProps {
  value: FlowFormState;
  onChange: (next: FlowFormState) => void;
  /** Bearbeiten sperrt den Namen (er ist der Dateiname). */
  mode: 'create' | 'edit';
  /** Verfügbare Werkzeuge samt „schon nutzbar?" (aus /api/flows/werkzeuge). */
  werkzeuge: FlowToolInfo[];
}

export default function FlowForm({ value, onChange, mode, werkzeuge }: FlowFormProps) {
  const patch = (teil: Partial<FlowFormState>) => onChange({ ...value, ...teil });

  const toggleWerkzeug = (name: FlowTool) => {
    const drin = value.werkzeuge.includes(name);
    patch({
      werkzeuge: drin ? value.werkzeuge.filter(w => w !== name) : [...value.werkzeuge, name],
    });
  };

  const setArg = (i: number, teil: Partial<FlowArgument>) => {
    patch({ argumente: value.argumente.map((a, j) => (j === i ? { ...a, ...teil } : a)) });
  };

  const ordnerNoetig = brauchtOrdner(value.werkzeuge);

  return (
    <div className="flex flex-col gap-5" data-testid="flow-form">
      {/* Name + Beschreibung */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="flow-name">Name</Label>
        <Input
          id="flow-name"
          value={value.name}
          onChange={e => patch({ name: e.target.value })}
          placeholder="z. B. dokument-zusammenfassen"
          disabled={mode === 'edit'}
          maxLength={50}
        />
        <p className="text-ui-xs text-muted-foreground">
          Kleinbuchstaben, Ziffern, Bindestriche — wird zum Datei- und <code>/</code>-Befehlsnamen.
          {mode === 'edit' && ' Beim Bearbeiten nicht änderbar.'}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="flow-besch">Beschreibung</Label>
        <Input
          id="flow-besch"
          value={value.beschreibung}
          onChange={e => patch({ beschreibung: e.target.value })}
          placeholder="Was tut dieser Flow? (erscheint im Slash-Menü)"
          maxLength={300}
        />
      </div>

      {/* Prompt */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="flow-prompt">Prompt (Anweisung an das Modell)</Label>
        <Textarea
          id="flow-prompt"
          value={value.prompt}
          onChange={e => patch({ prompt: e.target.value })}
          placeholder={'Beschreibe die Aufgabe. Platzhalter wie {{argument}} werden eingesetzt.'}
          rows={6}
          className="resize-y font-mono text-[13px]"
        />
      </div>

      {/* Werkzeuge */}
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium text-foreground">Werkzeuge</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {werkzeuge.map(w => {
            const drin = value.werkzeuge.includes(w.name);
            return (
              <label
                key={w.name}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-ui-xs transition-colors',
                  drin
                    ? 'border-primary/40 bg-primary/5 text-foreground'
                    : 'border-border text-foreground hover:bg-accent/50'
                )}
              >
                <Checkbox checked={drin} onCheckedChange={() => toggleWerkzeug(w.name)} />
                <span className="flex-1 truncate">{werkzeugLabel(w.name)}</span>
                {!w.verfuegbar && <span className="shrink-0 text-warning">kommt noch</span>}
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Ordner */}
      <div className="flex flex-col gap-1.5">
        <Label>
          Erlaubte Ordner{' '}
          <span className="font-normal text-muted-foreground text-xs">
            (der erste ist das Arbeitsverzeichnis)
          </span>
        </Label>
        {value.ordner.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={o}
              onChange={e =>
                patch({ ordner: value.ordner.map((x, j) => (j === i ? e.target.value : x)) })
              }
              placeholder="projekt://aktiv/unterordner  oder  /arasul/sandbox/projects/mein-ordner"
              className="font-mono text-[13px]"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Ordner ${i + 1} entfernen`}
              onClick={() => patch({ ordner: value.ordner.filter((_, j) => j !== i) })}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => patch({ ordner: [...value.ordner, ''] })}
          >
            <Plus className="size-4" /> Ordner hinzufügen
          </Button>
          {!value.ordner.includes('projekt://aktiv') && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              title="Der Flow arbeitet in der Projektablage des jeweils aktiven Projekts — dort, wo auch Explorer und Sandbox arbeiten."
              onClick={() => patch({ ordner: [...value.ordner, 'projekt://aktiv'] })}
              data-testid="ordner-projektablage"
            >
              <Plus className="size-4" /> Projektablage (aktives Projekt)
            </Button>
          )}
        </div>
        <p className="text-ui-xs text-muted-foreground">
          `projekt://aktiv/unterordner` zielt auf einen Ordner der Projektablage; beim externen
          Trigger kann `ordner_ziel` das Arbeitsverzeichnis pro Lauf umlenken (z. B. Kundenordner).
        </p>
        {ordnerNoetig && value.ordner.filter(Boolean).length === 0 && (
          <p className="text-ui-xs text-warning" data-testid="ordner-hinweis">
            Datei- oder Terminal-Werkzeuge brauchen mindestens einen erlaubten Ordner.
          </p>
        )}
      </div>

      {/* Argumente */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Argumente</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => patch({ argumente: [...value.argumente, leeresArgument()] })}
          >
            <Plus className="size-4" /> Argument
          </Button>
        </div>
        {value.argumente.map((a, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-md border border-border p-2.5"
            data-testid="arg-row"
          >
            <div className="flex items-center gap-2">
              <Input
                value={a.name}
                onChange={e => setArg(i, { name: e.target.value })}
                placeholder="argumentname"
                aria-label={`Name von Argument ${i + 1}`}
                className="flex-1 font-mono text-[13px]"
              />
              <select
                value={a.typ}
                onChange={e => setArg(i, { typ: e.target.value as FlowArgumentType })}
                className="h-9 rounded-md border border-border bg-background px-2 text-ui-xs text-foreground"
                aria-label={`Typ von Argument ${i + 1}`}
              >
                {(Object.keys(ARG_TYP_LABEL) as FlowArgumentType[]).map(t => (
                  <option key={t} value={t}>
                    {ARG_TYP_LABEL[t]}
                  </option>
                ))}
              </select>
              <label className="flex cursor-pointer items-center gap-1.5 text-ui-xs text-muted-foreground">
                <Checkbox
                  checked={a.pflicht}
                  onCheckedChange={checked => setArg(i, { pflicht: checked })}
                  aria-label={`Argument ${i + 1} ist Pflicht`}
                />
                Pflicht
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Argument ${i + 1} entfernen`}
                onClick={() => patch({ argumente: value.argumente.filter((_, j) => j !== i) })}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <Input
              value={a.beschreibung}
              onChange={e => setArg(i, { beschreibung: e.target.value })}
              placeholder="Beschreibung (grauer Hinweis im Chat)"
              aria-label={`Beschreibung von Argument ${i + 1}`}
              className="text-[13px]"
            />
            {a.typ === 'auswahl' && (
              <Input
                value={(a.optionen ?? []).join(', ')}
                onChange={e =>
                  setArg(i, {
                    optionen: e.target.value
                      .split(',')
                      .map(s => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Optionen, mit Komma getrennt: kurz, mittel, lang"
                aria-label={`Optionen von Argument ${i + 1}`}
                className="text-[13px]"
              />
            )}
            {!a.pflicht && (
              <Input
                value={a.standard ?? ''}
                onChange={e => setArg(i, { standard: e.target.value })}
                placeholder="Standardwert (optional)"
                aria-label={`Standardwert von Argument ${i + 1}`}
                className="text-[13px]"
              />
            )}
          </div>
        ))}
      </div>

      {/* Ablauf: Rollen (Bausteine) + optional feste Reihenfolge — EIN Block,
          Rollen inline, Modus (modellgesteuert/fest) umschaltbar. */}
      <AblaufEditor value={value} onChange={onChange} werkzeuge={werkzeuge} />

      {/* Grenzen */}
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="mb-1 text-sm font-medium text-foreground">Grenzen</legend>
        <GrenzeFeld
          label="Aufrufe"
          value={value.grenzen.max_aufrufe}
          onChange={n => patch({ grenzen: { ...value.grenzen, max_aufrufe: n } })}
        />
        <GrenzeFeld
          label="Zeitlimit (s)"
          value={value.grenzen.zeitlimit_s}
          onChange={n => patch({ grenzen: { ...value.grenzen, zeitlimit_s: n } })}
        />
        <GrenzeFeld
          label="Werkzeug-Runden"
          value={value.grenzen.werkzeug_runden}
          onChange={n => patch({ grenzen: { ...value.grenzen, werkzeug_runden: n } })}
        />
        <GrenzeFeld
          label="Verschachtelungstiefe"
          value={value.grenzen.max_tiefe}
          onChange={n => patch({ grenzen: { ...value.grenzen, max_tiefe: n } })}
        />
      </fieldset>
    </div>
  );
}

function GrenzeFeld({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const id = `grenze-${label.replace(/[^a-z]/gi, '').toLowerCase()}`;
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-ui-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="text-[13px]"
      />
    </div>
  );
}
