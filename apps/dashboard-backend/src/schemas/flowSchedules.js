/**
 * Zod-Schemas für Flow-Auslöser (Plan 013, B8).
 *
 * Ein Auslöser (`flow_schedules`) startet einen Flow automatisch: entweder zu
 * festen Zeiten (Cron) oder auf ein benanntes Ereignis hin. Dieses Schema
 * erzwingt die Form BEVOR geschrieben wird — ein ungültiger Cron oder ein
 * Zeitplan ohne Cron kann gar nicht erst entstehen.
 */

const { z } = require('zod');
const { FlowName } = require('./flows');
const { istGueltig } = require('../services/flows/cronExpr');

/** Ereignis-Name: klein, Ziffern, Bindestrich/Unterstrich — wie ein Slug. */
const EVENT_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,58}[a-z0-9]$|^[a-z0-9]$/;

const TriggerType = z.enum(['zeitplan', 'ereignis']);

/** Argumentwerte, die dem Flow bei jedem Auto-Start mitgegeben werden. */
const ScheduleArgs = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
  .default({});

const Cron = z
  .string()
  .trim()
  .max(120)
  .refine(istGueltig, 'Ungültiger Cron-Ausdruck (5 Felder: Minute Stunde Tag Monat Wochentag)');

const EventName = z
  .string()
  .trim()
  .regex(EVENT_NAME_RE, 'Ereignis-Name: Kleinbuchstaben, Ziffern, Bindestrich/Unterstrich (1–60)');

/**
 * Auslöser anlegen. Discriminated union über `trigger_type`, damit genau die
 * passenden Felder gefordert werden (Zeitplan → cron, Ereignis → event_name).
 */
const CreateScheduleBody = z.discriminatedUnion('trigger_type', [
  z
    .object({
      flow: FlowName,
      trigger_type: z.literal('zeitplan'),
      cron: Cron,
      args: ScheduleArgs,
      enabled: z.coerce.boolean().default(true),
    })
    .strict(),
  z
    .object({
      flow: FlowName,
      trigger_type: z.literal('ereignis'),
      event_name: EventName,
      args: ScheduleArgs,
      enabled: z.coerce.boolean().default(true),
    })
    .strict(),
]);

/**
 * Auslöser ändern. Bewusst zusammenführend: nur gesetzte Felder ändern sich.
 * `trigger_type` bleibt fest (wer den Typ wechseln will, legt neu an) — sonst
 * müssten cron/event_name bedingt neu geprüft werden, was den Merge unklar macht.
 */
const UpdateScheduleBody = z
  .object({
    flow: FlowName.optional(),
    cron: Cron.optional(),
    event_name: EventName.optional(),
    args: ScheduleArgs.optional(),
    enabled: z.coerce.boolean().optional(),
  })
  .strict();

const ScheduleIdParams = z.object({ id: z.coerce.number().int().positive() }).strict();

module.exports = {
  CreateScheduleBody,
  UpdateScheduleBody,
  ScheduleIdParams,
  TriggerType,
  EVENT_NAME_RE,
};
