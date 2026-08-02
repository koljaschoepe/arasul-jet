/**
 * FlowForm — das geführte Flow-Formular (Flows-Umbau 2026-08-02).
 *
 * Für Nicht-Techniker gedacht: drei nummerierte Abschnitte in Alltagssprache
 * (① Was soll der Flow tun? · ② Welche Eingaben braucht er? · ③ Was kommt am
 * Ende heraus?) plus ein eingeklappter „Erweitert"-Bereich mit den technischen
 * Teilen (Werkzeuge als kompakte Chips, erlaubte Ordner, Ablauf, Grenzen,
 * Modell). Rein darstellend und kontrolliert — der Tab hält den Zustand
 * (`flowFormState.ts`) und bekommt jede Änderung über `onChange`.
 */
import { useState } from 'react';
import { ChevronRight, FolderOpen, Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { Button } from '@/components/ui/shadcn/button';
import { Checkbox } from '@/components/ui/Checkbox';
import { cn } from '@/lib/utils';
import type { FlowArgument, FlowArgumentType, FlowTool, FlowToolInfo } from '@/types/flows';
import { brauchtOrdner, leeresArgument, type FlowFormState } from './flowFormState';
import AblaufEditor from './AblaufEditor';
import AusgabeEditor from './AusgabeEditor';

const ARG_TYP_LABEL: Record<FlowArgumentType, string> = {
  freitext: 'Freitext',
  datei: 'Datei',
  ordner: 'Ordner',
  auswahl: 'Auswahlliste',
  wissensbasis: 'Wissensbasis',
};

/** Lesbare deutsche Labels für die Werkzeug-Chips (statt roher Namen). */
const WERKZEUG_LABEL: Record<FlowTool, string> = {
  dateien_lesen: 'Dateien lesen',
  dateien_schreiben: 'Dateien schreiben',
  dateien_bearbeiten: 'Dateien bearbeiten',
  dateien_anhaengen: 'Dateien anhängen',
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

/** Ein nummerierter Abschnitt des geführten Formulars. */
function Abschnitt({
  nummer,
  titel,
  hinweis,
  children,
}: {
  nummer: string;
  titel: string;
  hinweis?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-0.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {nummer}
          </span>
          {titel}
        </h3>
        {hinweis && <p className="pl-7 text-ui-xs text-muted-foreground">{hinweis}</p>}
      </div>
      <div className="flex flex-col gap-4 pl-7 max-sm:pl-0">{children}</div>
    </section>
  );
}

export default function FlowForm({ value, onChange, mode, werkzeuge }: FlowFormProps) {
  const patch = (teil: Partial<FlowFormState>) => onChange({ ...value, ...teil });
  const [erweitertOffen, setErweitertOffen] = useState(false);

  const toggleWerkzeug = (name: FlowTool) => {
    const drin = value.werkzeuge.includes(name);
    patch({
      werkzeuge: drin ? value.werkzeuge.filter(w => w !== name) : [...value.werkzeuge, name],
    });
  };

  const setArg = (i: number, teil: Partial<FlowArgument>) => {
    patch({ argumente: value.argumente.map((a, j) => (j === i ? { ...a, ...teil } : a)) });
  };

  const hatOrdnerArgument = value.argumente.some(a => a.typ === 'ordner' && a.name.trim());
  const hatOrdnerListe = value.ordner.filter(Boolean).length > 0;
  const ordnerNoetig =
    (brauchtOrdner(value.werkzeuge) || value.ausgabe.format !== 'keins') &&
    !hatOrdnerArgument &&
    !hatOrdnerListe;

  const zielordnerHinzufuegen = () =>
    patch({
      argumente: [
        ...value.argumente,
        {
          name: 'zielordner',
          typ: 'ordner',
          beschreibung: 'Zielordner (z. B. der Kundenordner)',
          pflicht: true,
        },
      ],
    });

  return (
    <div className="flex flex-col gap-4" data-testid="flow-form">
      {/* ① Was soll der Flow tun? */}
      <Abschnitt
        nummer="1"
        titel="Was soll der Flow tun?"
        hinweis="Name, Kurzbeschreibung und der Auftrag an die KI."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="flow-name">Name</Label>
            <Input
              id="flow-name"
              value={value.name}
              onChange={e => patch({ name: e.target.value })}
              placeholder="z. B. angebot"
              disabled={mode === 'edit'}
              maxLength={50}
            />
            <p className="text-ui-xs text-muted-foreground">
              Wird zum <code>/</code>-Befehl im Chat.
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
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="flow-prompt">Auftrag</Label>
          <Textarea
            id="flow-prompt"
            value={value.prompt}
            onChange={e => patch({ prompt: e.target.value })}
            placeholder={
              'Beschreibe in normalen Sätzen, was der Flow tun soll — z. B.:\n„Erstelle aus der Anfrage im Zielordner ein Angebot. Nutze die Unterlagen im Ordner als Kontext."\nEingaben aus Schritt 2 setzt du mit {{argumentname}} ein.'
            }
            rows={6}
            className="resize-y text-[13px]"
          />
        </div>
      </Abschnitt>

      {/* ② Eingaben */}
      <Abschnitt
        nummer="2"
        titel="Welche Eingaben braucht der Flow?"
        hinweis="Diese Angaben werden beim Start im Chat abgefragt — z. B. der Kundenordner oder ein Dokument."
      >
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
                aria-label={`Name von Eingabe ${i + 1}`}
                className="flex-1 font-mono text-[13px]"
              />
              <select
                value={a.typ}
                onChange={e => setArg(i, { typ: e.target.value as FlowArgumentType })}
                className="h-9 rounded-md border border-border bg-background px-2 text-ui-xs text-foreground"
                aria-label={`Typ von Eingabe ${i + 1}`}
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
                  aria-label={`Eingabe ${i + 1} ist Pflicht`}
                />
                Pflicht
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Eingabe ${i + 1} entfernen`}
                onClick={() => patch({ argumente: value.argumente.filter((_, j) => j !== i) })}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <Input
              value={a.beschreibung}
              onChange={e => setArg(i, { beschreibung: e.target.value })}
              placeholder="Beschreibung (grauer Hinweis im Chat)"
              aria-label={`Beschreibung von Eingabe ${i + 1}`}
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
                aria-label={`Optionen von Eingabe ${i + 1}`}
                className="text-[13px]"
              />
            )}
            {a.typ === 'ordner' && (
              <p className="text-ui-xs text-muted-foreground">
                Beim Start öffnet sich eine Ordner-Auswahl. Der gewählte Ordner wird zum
                Arbeitsordner des Laufs — dort liest der Flow seinen Kontext und legt sein Ergebnis
                ab.
              </p>
            )}
            {!a.pflicht && (
              <Input
                value={a.standard ?? ''}
                onChange={e => setArg(i, { standard: e.target.value })}
                placeholder="Standardwert (optional)"
                aria-label={`Standardwert von Eingabe ${i + 1}`}
                className="text-[13px]"
              />
            )}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => patch({ argumente: [...value.argumente, leeresArgument()] })}
          >
            <Plus className="size-4" /> Eingabe
          </Button>
          {!hatOrdnerArgument && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={zielordnerHinzufuegen}
              data-testid="zielordner-hinzufuegen"
            >
              <FolderOpen className="size-4" /> Zielordner (Kundenordner)
            </Button>
          )}
        </div>
        {ordnerNoetig && (
          <p className="text-ui-xs text-warning" data-testid="ordner-hinweis">
            Dieser Flow arbeitet mit Dateien, hat aber noch keinen Ordner: füge die Eingabe
            „Zielordner&ldquo; hinzu (empfohlen) oder trage unter „Erweitert&ldquo; einen festen
            Ordner ein.
          </p>
        )}
      </Abschnitt>

      {/* ③ Ausgabe */}
      <Abschnitt
        nummer="3"
        titel="Was kommt am Ende heraus?"
        hinweis="Format, Vorlage, Länge, Sprache und Aufbau des Ergebnisses."
      >
        <AusgabeEditor value={value.ausgabe} onChange={ausgabe => patch({ ausgabe })} />
      </Abschnitt>

      {/* Erweitert (eingeklappt) */}
      <section className="rounded-lg border border-border">
        <button
          type="button"
          onClick={() => setErweitertOffen(o => !o)}
          aria-expanded={erweitertOffen}
          data-testid="erweitert-toggle"
          className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground hover:bg-accent/40"
        >
          <ChevronRight
            className={cn(
              'size-4 text-muted-foreground transition-transform',
              erweitertOffen && 'rotate-90'
            )}
          />
          Erweitert
          <span className="font-normal text-ui-xs text-muted-foreground">
            Werkzeuge · Ordner · Ablauf · Grenzen · Modell
          </span>
        </button>

        {erweitertOffen && (
          <div className="flex flex-col gap-5 border-t border-border p-4">
            {/* Werkzeuge — kompakte Chips statt großer Karten */}
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-sm font-medium text-foreground">Werkzeuge</legend>
              <p className="text-ui-xs text-muted-foreground">
                Nur für Flows, die selbst Dateien anfassen, im Web suchen oder Unteraufgaben
                verteilen sollen. Ein reiner Dokument-Flow braucht keine Werkzeuge — die Datei
                erzeugt Arasul aus Schritt 3 automatisch.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {werkzeuge.map(w => {
                  const drin = value.werkzeuge.includes(w.name);
                  return (
                    <label
                      key={w.name}
                      className={cn(
                        'flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-ui-xs transition-colors',
                        drin
                          ? 'border-primary/40 bg-primary/5 text-foreground'
                          : 'border-border text-muted-foreground hover:bg-accent/50'
                      )}
                    >
                      <Checkbox checked={drin} onCheckedChange={() => toggleWerkzeug(w.name)} />
                      {werkzeugLabel(w.name)}
                      {!w.verfuegbar && <span className="text-warning">kommt noch</span>}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* Feste Ordner */}
            <div className="flex flex-col gap-1.5">
              <Label>
                Feste Ordner{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  (der erste ist das Arbeitsverzeichnis, falls kein Zielordner-Argument greift)
                </span>
              </Label>
              {value.ordner.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={o}
                    onChange={e =>
                      patch({ ordner: value.ordner.map((x, j) => (j === i ? e.target.value : x)) })
                    }
                    placeholder="projekt://aktiv/unterordner"
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
            </div>

            {/* Ablauf: Rollen (Bausteine) + optional feste Reihenfolge */}
            <AblaufEditor value={value} onChange={onChange} werkzeuge={werkzeuge} />

            {/* Grenzen */}
            <fieldset className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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

            {/* Modell */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="flow-modell">Modell (optional)</Label>
              <Input
                id="flow-modell"
                value={value.modell}
                onChange={e => patch({ modell: e.target.value })}
                placeholder="leer = Standardmodell"
                className="font-mono text-[13px] sm:max-w-xs"
                data-testid="flow-modell"
              />
            </div>
          </div>
        )}
      </section>
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
