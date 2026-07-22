/**
 * SkillForm — das Formular des Anlege-/Bearbeiten-Dialogs (Plan 011, Schritt 17).
 *
 * Links im Dialog: alle Felder eines Skills. Rein darstellend und kontrolliert —
 * der Dialog hält den Zustand (`skillFormState.ts`) und bekommt jede Änderung über
 * `onChange`. Die erzeugte Datei und ihre Prüfung liegen im Backend (rechte
 * Vorschau); das Formular sammelt nur.
 */
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { Button } from '@/components/ui/shadcn/button';
import type {
  SkillArgument,
  SkillArgumentType,
  SkillRole,
  SkillTool,
  SkillToolInfo,
} from '@/types/skills';
import { brauchtOrdner, leeresArgument, leereRolle, type SkillFormState } from './skillFormState';

const ARG_TYP_LABEL: Record<SkillArgumentType, string> = {
  freitext: 'Freitext',
  datei: 'Datei',
  auswahl: 'Auswahlliste',
  wissensbasis: 'Wissensbasis',
};

interface SkillFormProps {
  value: SkillFormState;
  onChange: (next: SkillFormState) => void;
  /** Bearbeiten sperrt den Namen (er ist der Dateiname). */
  mode: 'create' | 'edit';
  /** Verfügbare Werkzeuge samt „schon nutzbar?" (aus /api/skills/werkzeuge). */
  werkzeuge: SkillToolInfo[];
}

export default function SkillForm({ value, onChange, mode, werkzeuge }: SkillFormProps) {
  const patch = (teil: Partial<SkillFormState>) => onChange({ ...value, ...teil });

  const toggleWerkzeug = (name: SkillTool) => {
    const drin = value.werkzeuge.includes(name);
    patch({
      werkzeuge: drin ? value.werkzeuge.filter(w => w !== name) : [...value.werkzeuge, name],
    });
  };

  const setArg = (i: number, teil: Partial<SkillArgument>) => {
    patch({ argumente: value.argumente.map((a, j) => (j === i ? { ...a, ...teil } : a)) });
  };

  const ordnerNoetig = brauchtOrdner(value.werkzeuge);

  return (
    <div className="flex flex-col gap-5" data-testid="skill-form">
      {/* Name + Beschreibung */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="skill-name">Name</Label>
        <Input
          id="skill-name"
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
        <Label htmlFor="skill-besch">Beschreibung</Label>
        <Input
          id="skill-besch"
          value={value.beschreibung}
          onChange={e => patch({ beschreibung: e.target.value })}
          placeholder="Was tut dieser Skill? (erscheint im Slash-Menü)"
          maxLength={300}
        />
      </div>

      {/* Prompt */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="skill-prompt">Prompt (Anweisung an das Modell)</Label>
        <Textarea
          id="skill-prompt"
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
          {werkzeuge.map(w => (
            <label
              key={w.name}
              className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-ui-xs hover:bg-accent/50"
            >
              <input
                type="checkbox"
                className="size-3.5 accent-[var(--primary)]"
                checked={value.werkzeuge.includes(w.name)}
                onChange={() => toggleWerkzeug(w.name)}
              />
              <span className="flex-1 truncate text-foreground">{w.name}</span>
              {!w.verfuegbar && <span className="shrink-0 text-warning">kommt noch</span>}
            </label>
          ))}
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
              placeholder="/arasul/sandbox/projects/mein-ordner"
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => patch({ ordner: [...value.ordner, ''] })}
        >
          <Plus className="size-4" /> Ordner hinzufügen
        </Button>
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
                onChange={e => setArg(i, { typ: e.target.value as SkillArgumentType })}
                className="h-9 rounded-md border border-border bg-background px-2 text-ui-xs text-foreground"
                aria-label={`Typ von Argument ${i + 1}`}
              >
                {(Object.keys(ARG_TYP_LABEL) as SkillArgumentType[]).map(t => (
                  <option key={t} value={t}>
                    {ARG_TYP_LABEL[t]}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-ui-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="size-3.5 accent-[var(--primary)]"
                  checked={a.pflicht}
                  onChange={e => setArg(i, { pflicht: e.target.checked })}
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

      {/* Subagent-Rollen */}
      <RollenEditor value={value} onChange={onChange} werkzeuge={werkzeuge} />

      {/* Grenzen */}
      <fieldset className="grid grid-cols-3 gap-2">
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

/** Die Subagent-Rollen — nur relevant, wenn das Werkzeug „subagent" gewählt ist. */
function RollenEditor({
  value,
  onChange,
  werkzeuge,
}: {
  value: SkillFormState;
  onChange: (next: SkillFormState) => void;
  werkzeuge: SkillToolInfo[];
}) {
  const patch = (teil: Partial<SkillFormState>) => onChange({ ...value, ...teil });
  const setRolle = (i: number, teil: Partial<SkillRole>) =>
    patch({ rollen: value.rollen.map((r, j) => (j === i ? { ...r, ...teil } : r)) });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>
          Subagent-Rollen{' '}
          <span className="font-normal text-muted-foreground text-xs">
            {'(nur mit Werkzeug „subagent")'}
          </span>
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => patch({ rollen: [...value.rollen, leereRolle()] })}
        >
          <Plus className="size-4" /> Rolle
        </Button>
      </div>
      {value.rollen.map((r, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 rounded-md border border-border p-2.5"
          data-testid="rolle-row"
        >
          <div className="flex items-center gap-2">
            <Input
              value={r.name}
              onChange={e => setRolle(i, { name: e.target.value })}
              placeholder="rollenname"
              aria-label={`Name von Rolle ${i + 1}`}
              className="flex-1 font-mono text-[13px]"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Rolle ${i + 1} entfernen`}
              onClick={() => patch({ rollen: value.rollen.filter((_, j) => j !== i) })}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          <Textarea
            value={r.prompt}
            onChange={e => setRolle(i, { prompt: e.target.value })}
            placeholder="Anweisung an die Rolle"
            aria-label={`Prompt von Rolle ${i + 1}`}
            rows={2}
            className="resize-y text-[13px]"
          />
          <div className="flex items-center gap-2">
            <Input
              value={(r.ergebnis.felder ?? []).join(', ')}
              onChange={e =>
                setRolle(i, {
                  ergebnis: {
                    ...r.ergebnis,
                    felder: e.target.value
                      .split(',')
                      .map(s => s.trim())
                      .filter(Boolean),
                  },
                })
              }
              placeholder="Ergebnis-Felder, Komma-getrennt: fazit, quelle"
              aria-label={`Ergebnis-Felder von Rolle ${i + 1}`}
              className="flex-1 text-[13px]"
            />
            <Input
              type="number"
              value={r.ergebnis.max_zeichen}
              onChange={e =>
                setRolle(i, { ergebnis: { ...r.ergebnis, max_zeichen: Number(e.target.value) } })
              }
              aria-label={`Max. Zeichen von Rolle ${i + 1}`}
              className="w-24 text-[13px]"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {werkzeuge
              .filter(w => w.name !== 'subagent')
              .map(w => {
                const drin = r.werkzeuge.includes(w.name);
                return (
                  <label
                    key={w.name}
                    className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground"
                  >
                    <input
                      type="checkbox"
                      className="size-3 accent-[var(--primary)]"
                      checked={drin}
                      onChange={() =>
                        setRolle(i, {
                          werkzeuge: drin
                            ? r.werkzeuge.filter(x => x !== w.name)
                            : [...r.werkzeuge, w.name],
                        })
                      }
                    />
                    {w.name}
                  </label>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
