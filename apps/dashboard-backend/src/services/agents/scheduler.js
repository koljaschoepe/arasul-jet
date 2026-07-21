/**
 * Flow-Scheduler (Plan 010, Schritt 7)
 *
 * DB-gestützter Cron im Backend: tickt jede Minute, liest alle Flüsse mit
 * gesetztem `schedule_cron` und startet die fälligen — als OWNER des Flusses
 * (userId = flows.user_id), Trigger `schedule`. Doppel-Läufe innerhalb einer
 * Minute werden über einen In-Memory-Merker verhindert.
 *
 * Bewusst schlicht (kein externes Cron-Paket): der cronMatch-Util deckt die
 * üblichen Fälle ab. Läuft ein Fluss länger als der Tick, ist das unkritisch —
 * die nächste fällige Minute startet erst nach Abschluss des vorigen Laufs
 * nicht automatisch nach (kein Nachhol-/Queueing in v1, bewusst).
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const { cronMatches } = require('./cronMatch');
const runFlow = require('./runFlow');

const TICK_MS = 60 * 1000;

let timer = null;
// flowId -> Minuten-Schlüssel des letzten Laufs (Dedupe innerhalb einer Minute).
const lastRunMinute = new Map();

function minuteKey(date) {
  return Math.floor(date.getTime() / 60000);
}

/**
 * Einmal alle fälligen Flüsse prüfen und starten. Injizierbare deps für Tests.
 */
async function tick(deps = {}) {
  const now = deps.now || new Date();
  const runner = deps.runFlow || runFlow;
  const database = deps.db || db;
  const key = minuteKey(now);

  let rows;
  try {
    const res = await database.query(
      `SELECT id, user_id, schedule_cron FROM flows
        WHERE schedule_cron IS NOT NULL AND schedule_cron <> ''
        ORDER BY id
        LIMIT 500`
    );
    rows = res.rows;
  } catch (err) {
    logger.warn(`Flow-Scheduler: Abfrage fehlgeschlagen: ${err.message}`);
    return;
  }

  // Merker für nicht mehr geplante/gelöschte Flüsse aufräumen (Dauerbetrieb).
  const activeIds = new Set(rows.map(f => f.id));
  for (const id of lastRunMinute.keys()) {
    if (!activeIds.has(id)) {
      lastRunMinute.delete(id);
    }
  }

  for (const flow of rows) {
    let due = false;
    try {
      due = cronMatches(flow.schedule_cron, now);
    } catch {
      due = false;
    }
    if (!due) {
      continue;
    }
    if (lastRunMinute.get(flow.id) === key) {
      continue; // in dieser Minute schon gestartet
    }
    lastRunMinute.set(flow.id, key);
    logger.info(`Flow-Scheduler: starte Fluss ${flow.id} (Cron "${flow.schedule_cron}")`);
    // Feuern und vergessen — ein hängender Lauf darf den Tick nicht blockieren.
    Promise.resolve(
      runner.runById({
        flowId: Number(flow.id),
        userId: flow.user_id,
        trigger: 'schedule',
        input: '',
      })
    ).catch(err => logger.warn(`Flow-Scheduler: Lauf ${flow.id} warf: ${err.message}`));
  }
}

function start() {
  if (timer) {
    return;
  }
  timer = setInterval(() => {
    tick().catch(err => logger.warn(`Flow-Scheduler tick warf: ${err.message}`));
  }, TICK_MS);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  logger.info('Flow-Scheduler gestartet (Tick alle 60s)');
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  lastRunMinute.clear();
}

module.exports = { start, stop, tick, _internals: { lastRunMinute } };
