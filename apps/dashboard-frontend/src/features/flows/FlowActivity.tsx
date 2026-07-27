/**
 * FlowActivity — die Flow-Steuerung im Chat (Plan 013, B8).
 *
 * Der Chat ist die ausführende Ebene: hier sieht man, welche Flows GERADE
 * laufen und welche GEPLANT sind, und stößt sie von hier an oder plant neue.
 * Bewusst eine schmale, einklappbare Leiste — sie drängt sich nicht vor den
 * Verlauf, ist aber einen Klick entfernt.
 *
 *  • Laufend: aktive Läufe (systemweit) mit Abbrechen.
 *  • Geplant: Auslöser (Zeitplan/Ereignis) mit An/Aus, Jetzt-Starten, Löschen.
 *  • „+ Zeitplan" öffnet den Auslöser-Dialog.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Loader2,
  Play,
  Plus,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { useFlowSchedules } from '@/hooks/useFlowSchedules';
import { Switch } from '@/components/ui/shadcn/switch';
import ScheduleDialog from './ScheduleDialog';
import type { Flow, FlowRunSummary, FlowSchedule } from '@/types/flows';

/** Ein paar geläufige Cron-Ausdrücke lesbar machen; sonst roh anzeigen. */
function cronText(cron: string): string {
  const map: Record<string, string> = {
    '0 * * * *': 'stündlich',
    '0 8 * * *': 'täglich 8 Uhr',
    '0 9 * * 1-5': 'wochentags 9 Uhr',
    '0 8 * * 1': 'montags 8 Uhr',
    '0 8 1 * *': 'monatlich (1., 8 Uhr)',
  };
  return map[cron.trim()] ?? cron;
}

function naechsteZeit(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ScheduleRow({
  schedule,
  onRunNow,
}: {
  schedule: FlowSchedule;
  onRunNow: (flow: string) => void;
}) {
  const { update, remove } = useFlowSchedules();
  const istZeitplan = schedule.trigger_type === 'zeitplan';
  return (
    <div
      className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5"
      data-testid="schedule-row"
    >
      {istZeitplan ? (
        <CalendarClock className="size-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <Zap className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-foreground">{schedule.flow_name}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {istZeitplan
            ? `${cronText(schedule.cron ?? '')}${schedule.enabled && schedule.next_run_at ? ` · nächste: ${naechsteZeit(schedule.next_run_at)}` : ''}`
            : `Ereignis: ${schedule.event_name}`}
          {schedule.last_error && (
            <span className="text-destructive"> · Fehler: {schedule.last_error}</span>
          )}
        </div>
      </div>
      <Switch
        checked={schedule.enabled}
        onCheckedChange={val => update.mutate({ id: schedule.id, patch: { enabled: val } })}
        aria-label={`Auslöser ${schedule.flow_name} ${schedule.enabled ? 'deaktivieren' : 'aktivieren'}`}
        className="scale-90"
      />
      <button
        type="button"
        onClick={() => onRunNow(schedule.flow_name)}
        aria-label={`${schedule.flow_name} jetzt starten`}
        title="Jetzt starten"
        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Play className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => remove.mutate(schedule.id)}
        aria-label={`Auslöser ${schedule.flow_name} löschen`}
        title="Löschen"
        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

export default function FlowActivity({
  flows,
  onRunFlow,
}: {
  flows: Flow[];
  onRunFlow: (flowName: string, args: Record<string, string>) => void;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const { schedules } = useFlowSchedules();
  const [offen, setOffen] = useState(false);
  const [dialogOffen, setDialogOffen] = useState(false);

  // Laufende Flows systemweit — kurz gepollt, damit die Leiste „lebt".
  const { data: laufend } = useQuery({
    queryKey: ['flow-runs', 'laeuft'],
    queryFn: () =>
      api.get<{ data: FlowRunSummary[] }>('/flows/laeufe?status=laeuft&limit=20', {
        showError: false,
      }),
    refetchInterval: 5000,
    staleTime: 2000,
  });
  const laufende = laufend?.data ?? [];

  const abbrechen = useMutation({
    mutationFn: (id: number | string) => api.post(`/flows/laeufe/${id}/abbrechen`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flow-runs', 'laeuft'] }),
  });

  // Nichts los und nichts geplant → die Leiste bleibt ganz weg (kein Rauschen).
  if (laufende.length === 0 && schedules.length === 0 && !offen) {
    return (
      <>
        <div className="flex items-center justify-end px-2.5 py-0.5">
          <button
            type="button"
            onClick={() => setDialogOffen(true)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-3" /> Zeitplan
          </button>
        </div>
        {dialogOffen && (
          <ScheduleDialog isOpen onClose={() => setDialogOffen(false)} flows={flows} />
        )}
      </>
    );
  }

  return (
    <div className="border-b border-border">
      <div className="flex items-center gap-1.5 px-2.5 py-1">
        <button
          type="button"
          onClick={() => setOffen(o => !o)}
          className="flex min-w-0 flex-1 items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          aria-expanded={offen}
        >
          {offen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          Flows
          {laufende.length > 0 && (
            <span className="ml-1 flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-px text-[10px] text-primary">
              <Loader2 className="size-2.5 animate-spin" /> {laufende.length} laufend
            </span>
          )}
          {schedules.length > 0 && (
            <span className="ml-1 rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
              {schedules.length} geplant
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setDialogOffen(true)}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3" /> Zeitplan
        </button>
      </div>

      {offen && (
        <div className="flex flex-col gap-1.5 px-2.5 pb-2">
          {laufende.map(run => (
            <div
              key={`run-${run.id}`}
              className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5"
              data-testid="laufender-flow"
            >
              <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                {run.flow_name}
              </span>
              <button
                type="button"
                onClick={() => abbrechen.mutate(run.id)}
                aria-label={`Lauf ${run.flow_name} abbrechen`}
                title="Abbrechen"
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}

          {schedules.map(s => (
            <ScheduleRow key={s.id} schedule={s} onRunNow={flow => onRunFlow(flow, {})} />
          ))}

          {laufende.length === 0 && schedules.length === 0 && (
            <p className="px-1 py-1 text-[11px] text-muted-foreground">
              Keine laufenden oder geplanten Flows.
            </p>
          )}
        </div>
      )}

      {dialogOffen && <ScheduleDialog isOpen onClose={() => setDialogOffen(false)} flows={flows} />}
    </div>
  );
}
