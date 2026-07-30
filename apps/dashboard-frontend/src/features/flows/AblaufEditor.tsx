/**
 * AblaufEditor — EIN Block für den Ablauf eines Flows (Plan 013, 2026-07-28).
 *
 * Löst die frühere Verwirrung „separate Rollen-Sektion + separate Schrittfolge"
 * ab: es gibt nur noch DIESEN Block mit einem Modus-Umschalter, und die Rollen
 * werden in beiden Modi INLINE definiert — keine losgelöste Rollen-Sektion mehr.
 *
 *  • Modellgesteuert (keine feste Reihenfolge): eine Liste von Bausteinen
 *    (Rollen), die das Modell je nach Bedarf ruft — auch mehrfach. So bleiben
 *    Flows wie /recherche (leser wird pro Fundstelle erneut gerufen) erhalten.
 *  • Feste Reihenfolge: eine geordnete Schrittkette. Jeder Rollen-Schritt
 *    definiert seine Rolle direkt inline (Prompt/Werkzeuge/Ergebnis); Werkzeug-
 *    Schritte rufen ein Werkzeug direkt.
 *
 * Das Datenmodell (rollen[] + schritte[]) und damit die Flow-Datei bleiben
 * unverändert — nur die Bedienung ist vereinheitlicht. Rollen-Schritte werden
 * 1:1 mit einer gleichnamigen Rolle in rollen[] gespiegelt.
 */
import { useState } from 'react';
import { ArrowDown, ArrowUp, Bot, Plus, Trash2, Waypoints, Wrench } from 'lucide-react';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { Button } from '@/components/ui/shadcn/button';
import { Checkbox } from '@/components/ui/Checkbox';
import { cn } from '@/lib/utils';
import type { FlowRole, FlowStep, FlowTool, FlowToolInfo } from '@/types/flows';
import { leereRolle, type FlowFormState } from './flowFormState';

const WERKZEUG_LABEL: Record<string, string> = {
  dateien_lesen: 'Dateien lesen',
  dateien_schreiben: 'Dateien schreiben',
  dateien_suchen: 'Dateien suchen',
  rag_suche: 'Wissens-Suche',
  web_suche: 'Web-Suche',
  web_lesen: 'Web lesen',
  terminal: 'Terminal',
};
const werkzeugLabel = (n: string) => WERKZEUG_LABEL[n] ?? n;

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

/** Ein eindeutiger Rollen-/Schrittname `rolle_N` — Unterstrich, kein
 *  Bindestrich: das Backend-Schema erlaubt nur `[a-z][a-z0-9_]`. */
function neuerName(vorhandene: string[]): string {
  let i = vorhandene.length + 1;
  const set = new Set(vorhandene);
  while (set.has(`rolle_${i}`)) i++;
  return `rolle_${i}`;
}

/** Die Inline-Rollen-Felder (Prompt/Werkzeuge/Ergebnis) — geteilt von beiden Modi. */
function RolleFelder({
  rolle,
  werkzeuge,
  onChange,
  idPrefix,
}: {
  rolle: FlowRole;
  werkzeuge: FlowToolInfo[];
  onChange: (teil: Partial<FlowRole>) => void;
  idPrefix: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={rolle.prompt}
        onChange={e => onChange({ prompt: e.target.value })}
        placeholder="Anweisung an die Rolle (Prompt/Persona)"
        aria-label={`Prompt von ${idPrefix}`}
        rows={2}
        className="resize-y text-[13px]"
      />
      <div className="flex items-center gap-2">
        <Input
          value={(rolle.ergebnis?.felder ?? []).join(', ')}
          onChange={e =>
            onChange({
              ergebnis: {
                felder: e.target.value
                  .split(',')
                  .map(s => s.trim())
                  .filter(Boolean),
                max_zeichen: rolle.ergebnis?.max_zeichen ?? 2000,
              },
            })
          }
          placeholder="Ergebnis-Felder, Komma-getrennt: fazit, quelle"
          aria-label={`Ergebnis-Felder von ${idPrefix}`}
          className="flex-1 text-[13px]"
        />
        <Input
          type="number"
          value={rolle.ergebnis?.max_zeichen ?? 2000}
          onChange={e =>
            onChange({
              ergebnis: {
                felder: rolle.ergebnis?.felder ?? [],
                max_zeichen: Number(e.target.value),
              },
            })
          }
          aria-label={`Max. Zeichen von ${idPrefix}`}
          className="w-24 text-[13px]"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {werkzeuge
          .filter(w => w.name !== 'subagent')
          .map(w => {
            const drin = rolle.werkzeuge.includes(w.name);
            return (
              <label
                key={w.name}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] transition-colors',
                  drin
                    ? 'border-primary/40 bg-primary/5 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-accent/50'
                )}
              >
                <Checkbox
                  checked={drin}
                  aria-label={`${idPrefix}: Werkzeug ${w.name}`}
                  onCheckedChange={() =>
                    onChange({
                      werkzeuge: drin
                        ? rolle.werkzeuge.filter(x => x !== w.name)
                        : [...rolle.werkzeuge, w.name],
                    })
                  }
                />
                {werkzeugLabel(w.name)}
              </label>
            );
          })}
      </div>
    </div>
  );
}

export default function AblaufEditor({
  value,
  onChange,
  werkzeuge,
}: {
  value: FlowFormState;
  onChange: (next: FlowFormState) => void;
  werkzeuge: FlowToolInfo[];
}) {
  // Modus aus dem Zustand ableiten: eine feste Kette liegt vor, sobald es
  // Schritte gibt. Sonst modellgesteuert (Rollen als Bausteine, ggf. leer).
  const [modus, setModus] = useState<'fest' | 'modell'>(
    value.schritte.length > 0 ? 'fest' : 'modell'
  );

  const rollenNamen = value.rollen.map(r => r.name);

  // ---- Modellgesteuert: Rollen als Bausteine ----
  const setRolle = (i: number, teil: Partial<FlowRole>) =>
    onChange({ ...value, rollen: value.rollen.map((r, j) => (j === i ? { ...r, ...teil } : r)) });
  const addRolle = () =>
    onChange({
      ...value,
      rollen: [...value.rollen, { ...leereRolle(), name: neuerName(rollenNamen) }],
    });
  const removeRolle = (i: number) =>
    onChange({ ...value, rollen: value.rollen.filter((_, j) => j !== i) });

  // ---- Feste Reihenfolge: Schritte, Rollen-Schritte spiegeln eine Rolle ----
  const rolleFuer = (step: FlowStep): FlowRole =>
    value.rollen.find(r => r.name === step.rolle) ?? { ...leereRolle(), name: step.rolle ?? '' };

  const setSchritt = (i: number, teil: Partial<FlowStep>) =>
    onChange({
      ...value,
      schritte: value.schritte.map((s, j) => (j === i ? { ...s, ...teil } : s)),
    });

  // Eine Rolle eines Rollen-Schritts inline ändern (gespiegelt in rollen[]).
  const setSchrittRolle = (step: FlowStep, teil: Partial<FlowRole>) => {
    const name = step.rolle ?? '';
    const vorhanden = value.rollen.some(r => r.name === name);
    const rollen = vorhanden
      ? value.rollen.map(r => (r.name === name ? { ...r, ...teil } : r))
      : [...value.rollen, { ...rolleFuer(step), ...teil, name }];
    onChange({ ...value, rollen });
  };

  const addSchritt = () => {
    const name = neuerName([...rollenNamen, ...value.schritte.map(s => s.name)]);
    onChange({
      ...value,
      schritte: [
        ...value.schritte,
        { name, typ: 'subagent', rolle: name, auftrag: '', iterationen: 1 },
      ],
      rollen: [...value.rollen, { ...leereRolle(), name }],
    });
  };

  // Art wechseln: die gespiegelte Inline-Rolle folgt dem Schritt — beim Wechsel
  // zu „Werkzeug" verschwindet sie wieder (sonst schickte der Editor eine
  // verwaiste, leere Rolle mit und das Speichern scheiterte am Schema).
  const setSchrittTyp = (i: number, typ: FlowStep['typ']) => {
    const step = value.schritte[i];
    if (!step || step.typ === typ) return;
    if (typ === 'werkzeug') {
      const nochGenutzt = value.schritte.some(
        (s, j) => j !== i && s.typ === 'subagent' && s.rolle === step.rolle
      );
      onChange({
        ...value,
        schritte: value.schritte.map((s, j) =>
          j === i ? { ...s, typ, rolle: undefined, auftrag: undefined } : s
        ),
        rollen: nochGenutzt ? value.rollen : value.rollen.filter(r => r.name !== step.rolle),
      });
      return;
    }
    const name = step.name;
    const vorhanden = value.rollen.some(r => r.name === name);
    onChange({
      ...value,
      schritte: value.schritte.map((s, j) =>
        j === i ? { ...s, typ, rolle: name, auftrag: s.auftrag ?? '' } : s
      ),
      rollen: vorhanden ? value.rollen : [...value.rollen, { ...leereRolle(), name }],
    });
  };

  // Schritt-Name ändern: bei Rollen-Schritten die gespiegelte Rolle mit-umbenennen.
  const renameSchritt = (i: number, neu: string) => {
    const step = value.schritte[i];
    if (!step) return;
    const alteRolle = step.rolle;
    const schritte = value.schritte.map((s, j) =>
      j === i ? { ...s, name: neu, ...(s.typ === 'subagent' ? { rolle: neu } : {}) } : s
    );
    const rollen =
      step.typ === 'subagent'
        ? value.rollen.map(r => (r.name === alteRolle ? { ...r, name: neu } : r))
        : value.rollen;
    onChange({ ...value, schritte, rollen });
  };

  const removeSchritt = (i: number) => {
    const step = value.schritte[i];
    if (!step) return;
    onChange({
      ...value,
      schritte: value.schritte.filter((_, j) => j !== i),
      rollen:
        step.typ === 'subagent' ? value.rollen.filter(r => r.name !== step.rolle) : value.rollen,
    });
  };

  const moveSchritt = (i: number, dir: -1 | 1) => {
    const ziel = i + dir;
    if (ziel < 0 || ziel >= value.schritte.length) return;
    const next = [...value.schritte];
    const a = next[i];
    const b = next[ziel];
    if (!a || !b) return;
    next[i] = b;
    next[ziel] = a;
    onChange({ ...value, schritte: next });
  };

  // ---- Modus-Umschaltung (verlustarm, aber ein bewusster Umbau) ----
  const wechsleModus = (ziel: 'fest' | 'modell') => {
    if (ziel === modus) return;
    if (ziel === 'fest') {
      // Aus den vorhandenen Rollen je einen Rollen-Schritt bilden.
      const schritte: FlowStep[] =
        value.schritte.length > 0
          ? value.schritte
          : value.rollen.map(r => ({
              name: r.name,
              typ: 'subagent' as const,
              rolle: r.name,
              auftrag: '',
              iterationen: 1,
            }));
      onChange({ ...value, schritte });
    } else {
      // Modellgesteuert: die Rollen bleiben Bausteine, die feste Kette entfällt.
      onChange({ ...value, schritte: [] });
    }
    setModus(ziel);
  };

  return (
    <div className="flex flex-col gap-3" data-testid="ablauf-editor">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5">
          <Waypoints className="size-4 text-muted-foreground" />
          Ablauf
        </Label>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5 text-xs">
          <button
            type="button"
            onClick={() => wechsleModus('modell')}
            aria-pressed={modus === 'modell'}
            className={cn(
              'rounded px-2 py-1 transition-colors',
              modus === 'modell'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Modellgesteuert
          </button>
          <button
            type="button"
            onClick={() => wechsleModus('fest')}
            aria-pressed={modus === 'fest'}
            className={cn(
              'rounded px-2 py-1 transition-colors',
              modus === 'fest'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Feste Reihenfolge
          </button>
        </div>
      </div>

      {modus === 'modell' ? (
        <div className="flex flex-col gap-2">
          <p className="text-ui-xs text-muted-foreground">
            Das Modell entscheidet selbst, wann es welchen Baustein ruft — auch mehrfach. Ohne
            Bausteine läuft der Flow allein über den Prompt oben.
          </p>
          {value.rollen.map((r, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-md border border-border p-2.5"
              data-testid="rolle-row"
            >
              <div className="flex items-center gap-2">
                <Bot className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  value={r.name}
                  onChange={e => setRolle(i, { name: e.target.value })}
                  placeholder="baustein-name"
                  aria-label={`Name von Baustein ${i + 1}`}
                  className="flex-1 font-mono text-[13px]"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Baustein ${i + 1} entfernen`}
                  onClick={() => removeRolle(i)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <RolleFelder
                rolle={r}
                werkzeuge={werkzeuge}
                idPrefix={`Baustein ${i + 1}`}
                onChange={teil => setRolle(i, teil)}
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={addRolle}
          >
            <Plus className="size-4" /> Baustein
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-ui-xs text-muted-foreground">
            Feste Reihenfolge — jeder Rollen-Schritt bringt seine Rolle direkt mit.
          </p>
          {value.schritte.map((s, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-md border border-border p-2.5"
              data-testid="schritt-row"
            >
              <div className="flex items-center gap-1.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium text-muted-foreground">
                  {i + 1}
                </span>
                <Input
                  value={s.name}
                  onChange={e => renameSchritt(i, e.target.value)}
                  placeholder="schrittname"
                  aria-label={`Name von Schritt ${i + 1}`}
                  className="flex-1 font-mono text-[13px]"
                />
                <select
                  value={s.typ}
                  onChange={e => setSchrittTyp(i, e.target.value as FlowStep['typ'])}
                  aria-label={`Art von Schritt ${i + 1}`}
                  className={selectClass}
                >
                  <option value="subagent">Rolle</option>
                  <option value="werkzeug">Werkzeug</option>
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Schritt ${i + 1} nach oben`}
                  disabled={i === 0}
                  onClick={() => moveSchritt(i, -1)}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Schritt ${i + 1} nach unten`}
                  disabled={i === value.schritte.length - 1}
                  onClick={() => moveSchritt(i, 1)}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Schritt ${i + 1} entfernen`}
                  onClick={() => removeSchritt(i)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              {s.typ === 'subagent' ? (
                <>
                  <Textarea
                    value={s.auftrag ?? ''}
                    onChange={e => setSchritt(i, { auftrag: e.target.value })}
                    placeholder="Auftrag an die Rolle — Vorlagen: {{argument}}, {{vorheriger-schritt}}"
                    aria-label={`Auftrag von Schritt ${i + 1}`}
                    rows={2}
                    className="resize-y text-[13px]"
                  />
                  <div className="rounded-md border border-border/60 bg-background p-2">
                    <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
                      Rolle (inline)
                    </span>
                    <RolleFelder
                      rolle={rolleFuer(s)}
                      werkzeuge={werkzeuge}
                      idPrefix={`Schritt ${i + 1}`}
                      onChange={teil => setSchrittRolle(s, teil)}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
                    <select
                      value={s.werkzeug ?? ''}
                      onChange={e =>
                        setSchritt(i, {
                          werkzeug: (e.target.value || undefined) as FlowTool | undefined,
                        })
                      }
                      aria-label={`Werkzeug von Schritt ${i + 1}`}
                      className={cn(selectClass, 'flex-1')}
                    >
                      <option value="">— Werkzeug wählen —</option>
                      {werkzeuge
                        .filter(w => w.name !== 'subagent')
                        .map(w => (
                          <option key={w.name} value={w.name}>
                            {werkzeugLabel(w.name)}
                          </option>
                        ))}
                    </select>
                  </div>
                  <Textarea
                    defaultValue={paramsToText(s.parameter)}
                    onChange={e => setSchritt(i, { parameter: textToParams(e.target.value) })}
                    placeholder={'Parameter, je Zeile „schluessel: wert"\nz. B. query: {{thema}}'}
                    aria-label={`Parameter von Schritt ${i + 1}`}
                    rows={2}
                    className="resize-y font-mono text-[13px]"
                  />
                </>
              )}

              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground" htmlFor={`iter-${i}`}>
                  Durchläufe
                </Label>
                <Input
                  id={`iter-${i}`}
                  type="number"
                  min={1}
                  max={10}
                  value={s.iterationen}
                  onChange={e =>
                    setSchritt(i, { iterationen: Math.max(1, Number(e.target.value) || 1) })
                  }
                  aria-label={`Durchläufe von Schritt ${i + 1}`}
                  className="w-20 text-[13px]"
                />
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={addSchritt}
          >
            <Plus className="size-4" /> Schritt
          </Button>
        </div>
      )}
    </div>
  );
}
