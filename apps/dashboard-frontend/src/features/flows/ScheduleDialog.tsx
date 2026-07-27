/**
 * ScheduleDialog — einen Flow-Auslöser anlegen (Plan 013, B8).
 *
 * Zwei Auslöser-Arten: fester Zeitplan (Cron, mit Voreinstellungen für die
 * häufigen Fälle) oder ein benanntes Ereignis (das ein n8n-Webhook über die
 * externe API feuert). Für die Argumente des gewählten Flows werden einfache
 * Wertfelder gezeigt — Pflicht-Argumente ohne Wert lässt das Backend abweisen.
 *
 * Bewusst minimalistisch: kein Cron-Baukasten, sondern Presets + freies Feld.
 */
import { useMemo, useState } from 'react';
import { CalendarClock, Zap } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { useFlowSchedules, type CreateScheduleInput } from '@/hooks/useFlowSchedules';
import type { Flow, FlowTriggerType } from '@/types/flows';

const selectClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-2 text-[13px] shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** Häufige Zeitpläne als 5-Feld-Cron — deckt die üblichen Wünsche ohne Tippen. */
const CRON_PRESETS: { label: string; cron: string }[] = [
  { label: 'Stündlich', cron: '0 * * * *' },
  { label: 'Täglich 8 Uhr', cron: '0 8 * * *' },
  { label: 'Wochentags 9 Uhr', cron: '0 9 * * 1-5' },
  { label: 'Montags 8 Uhr', cron: '0 8 * * 1' },
  { label: 'Monatlich (1., 8 Uhr)', cron: '0 8 1 * *' },
];

export default function ScheduleDialog({
  isOpen,
  onClose,
  flows,
  defaultFlow,
}: {
  isOpen: boolean;
  onClose: () => void;
  flows: Flow[];
  defaultFlow?: string;
}) {
  const { create } = useFlowSchedules();
  const [flowName, setFlowName] = useState(defaultFlow ?? flows[0]?.name ?? '');
  const [triggerType, setTriggerType] = useState<FlowTriggerType>('zeitplan');
  const [cron, setCron] = useState('0 8 * * *');
  const [eventName, setEventName] = useState('');
  const [argWerte, setArgWerte] = useState<Record<string, string>>({});
  const [fehler, setFehler] = useState<string | null>(null);

  const gewaehlt = useMemo(() => flows.find(f => f.name === flowName), [flows, flowName]);
  const argumente = gewaehlt?.argumente ?? [];

  const speichern = async () => {
    setFehler(null);
    // Nur nicht-leere Argumentwerte mitschicken.
    const args: Record<string, string> = {};
    for (const [k, v] of Object.entries(argWerte)) {
      if (v.trim()) args[k] = v.trim();
    }
    const input: CreateScheduleInput =
      triggerType === 'zeitplan'
        ? { flow: flowName, trigger_type: 'zeitplan', cron: cron.trim(), args }
        : { flow: flowName, trigger_type: 'ereignis', event_name: eventName.trim(), args };
    try {
      await create.mutateAsync(input);
      onClose();
    } catch (err) {
      setFehler((err as Error).message || 'Auslöser konnte nicht angelegt werden');
    }
  };

  const kannSpeichern =
    !!flowName &&
    (triggerType === 'zeitplan' ? cron.trim().length > 0 : eventName.trim().length > 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="small"
      title={
        <span className="flex items-center gap-2">
          <CalendarClock className="size-4 text-primary" /> Flow automatisch auslösen
        </span>
      }
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="button" onClick={speichern} disabled={!kannSpeichern || create.isPending}>
            {create.isPending ? 'Speichert …' : 'Anlegen'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {/* Flow */}
        <div className="flex flex-col gap-1">
          <Label htmlFor="sched-flow">Flow</Label>
          <select
            id="sched-flow"
            className={selectClass}
            value={flowName}
            onChange={e => {
              setFlowName(e.target.value);
              setArgWerte({});
            }}
          >
            {flows.length === 0 && <option value="">— kein Flow vorhanden —</option>}
            {flows.map(f => (
              <option key={f.name} value={f.name}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        {/* Auslöser-Art */}
        <div className="flex flex-col gap-1">
          <Label>Auslöser</Label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTriggerType('zeitplan')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[13px] ${
                triggerType === 'zeitplan'
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              <CalendarClock className="size-4" /> Zeitplan
            </button>
            <button
              type="button"
              onClick={() => setTriggerType('ereignis')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[13px] ${
                triggerType === 'ereignis'
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              <Zap className="size-4" /> Ereignis
            </button>
          </div>
        </div>

        {triggerType === 'zeitplan' ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sched-cron">Zeitplan (Cron)</Label>
            <div className="flex flex-wrap gap-1">
              {CRON_PRESETS.map(p => (
                <button
                  key={p.cron}
                  type="button"
                  onClick={() => setCron(p.cron)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${
                    cron === p.cron
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Input
              id="sched-cron"
              value={cron}
              onChange={e => setCron(e.target.value)}
              placeholder="0 8 * * *"
              className="font-mono text-[13px]"
              aria-label="Cron-Ausdruck"
            />
            <p className="text-xs text-muted-foreground">
              5 Felder: Minute Stunde Tag Monat Wochentag — in Gerätezeit.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sched-event">Ereignis-Name</Label>
            <Input
              id="sched-event"
              value={eventName}
              onChange={e => setEventName(e.target.value)}
              placeholder="neue-rechnung"
              className="font-mono text-[13px]"
              aria-label="Ereignis-Name"
            />
            <p className="text-xs text-muted-foreground">
              Feuerbar über <code>POST /api/v1/external/events/{eventName || 'name'}</code>{' '}
              (API-Key).
            </p>
          </div>
        )}

        {/* Argumente des Flows */}
        {argumente.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label>Argumente</Label>
            {argumente.map(a => (
              <div key={a.name} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate font-mono text-xs text-muted-foreground">
                  {a.name}
                  {a.pflicht && <span className="text-destructive"> *</span>}
                </span>
                <Input
                  value={argWerte[a.name] ?? a.standard ?? ''}
                  onChange={e => setArgWerte(prev => ({ ...prev, [a.name]: e.target.value }))}
                  placeholder={a.beschreibung || a.typ}
                  className="text-[13px]"
                  aria-label={`Wert für ${a.name}`}
                />
              </div>
            ))}
          </div>
        )}

        {fehler && <p className="text-xs text-destructive">{fehler}</p>}
      </div>
    </Modal>
  );
}
