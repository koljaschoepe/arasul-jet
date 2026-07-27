/**
 * Flow-Scheduler (Plan 013, B8) — startet Flows AUTOMATISCH.
 *
 * Zwei Wege, beide über denselben Start-Pfad wie der Chat (`flowRunner.starten`,
 * derselbe GPU-geteilte Lauf, dieselbe Lauf-Karte):
 *
 *  1. ZEITPLAN. Ein Intervall („Tick", alle 60 s) fragt die fälligen Zeitpläne
 *     ab (`next_run_at <= jetzt`), startet jeden und rechnet den nächsten
 *     Fälligkeits-Zeitpunkt aus dem Cron aus. Die Fälligkeit steht als Spalte in
 *     der DB — der Tick parst nicht jede Minute jeden Cron, sondern liest nur.
 *
 *  2. EREIGNIS. `feuerEreignis(name)` sucht die aktiven Ereignis-Auslöser mit
 *     diesem Namen und startet sie. Gefeuert wird das aus dem Ereignis-Eingang
 *     (`routes/external/events.js`), sodass ein n8n-Webhook einen Flow anstößt.
 *
 * Robustheit: Ein einzelner fehlerhafter Auslöser (Flow gelöscht, Pflicht-
 * Argument fehlt) darf weder den Tick noch die anderen Auslöser kippen — der
 * Fehler landet als `last_error` an der Zeile und wird protokolliert, der Tick
 * läuft weiter. Ein Zeitplan-Auslöser bleibt fällig-frei (next_run_at wird auch
 * im Fehlerfall weitergesetzt), damit ein kaputter Cron nicht jede Minute feuert.
 *
 * Der Tick ist NICHT re-entrant: ist ein voriger Durchlauf noch aktiv (langsame
 * DB), wird der nächste übersprungen.
 */

const logger = require('../../utils/logger');
const { naechsteFaelligkeit } = require('./cronExpr');
const scheduleStore = require('./scheduleStore');
const flowRunner = require('./flowRunner');
const registry = require('./flowRegistry');
const { resolveArguments } = require('./runFlow');

const TICK_MS = 60 * 1000;

let tickTimer = null;
let laeuftGerade = false;

/**
 * Startet EINEN Auslöser: Flow prüfen, Argumente prüfen, losgelöst starten.
 * Gibt die Lauf-ID zurück oder wirft (der Aufrufer fängt und protokolliert).
 */
async function starteAusloeser(schedule, deps = {}) {
  const { runner = flowRunner, reg = registry } = deps;
  // Früh prüfen — genau wie die manuelle Start-Route: existiert der Flow und
  // passen die hinterlegten Argumente? Sonst gäbe es einen sofort scheiternden
  // Lauf, dessen Ursache niemand sieht.
  const flow = await reg.loadFlow(schedule.flow_name);
  resolveArguments(flow.argumente, schedule.args || {});
  const { runId } = await runner.starten({
    flowName: schedule.flow_name,
    args: schedule.args || {},
    userId: schedule.user_id,
    conversationId: null,
  });
  return runId;
}

/**
 * Ein Tick-Durchlauf: alle fälligen Zeitpläne starten und neu terminieren.
 * Exportiert, damit Tests ihn direkt (ohne Intervall) auslösen können.
 */
async function tick(deps = {}) {
  const { store = scheduleStore } = deps;
  const jetzt = deps.jetzt || new Date();
  const faellige = await store.faelligeZeitplaene({ jetzt });
  for (const schedule of faellige) {
    let runId = null;
    let fehler = null;
    try {
      runId = await starteAusloeser(schedule, deps);
      logger.info(
        `Scheduler: Flow „${schedule.flow_name}" per Zeitplan gestartet (Lauf ${runId}, Auslöser ${schedule.id})`
      );
    } catch (err) {
      fehler = err.message;
      logger.error(
        `Scheduler: Auslöser ${schedule.id} („${schedule.flow_name}") gescheitert: ${err.message}`
      );
    }
    // Nächsten Termin NACH dem Start-Versuch aus der JETZIGEN Zeit berechnen
    // (nicht aus der Tick-Startzeit): ein langsamer Start dürfte den Termin sonst
    // schon in die Vergangenheit legen → der Auslöser feuerte sofort wieder.
    // Auch im Fehlerfall setzen, damit ein kaputter Auslöser nicht jede Minute
    // erneut fällig ist. (Tests injizieren `jetzt` → deterministisch.)
    const ref = deps.jetzt || new Date();
    const nextRun = naechsteFaelligkeit(schedule.cron, ref);
    await store.markiereGefeuert({ id: schedule.id, runId, nextRunAt: nextRun, error: fehler });
  }
  return faellige.length;
}

/**
 * Feuert alle Auslöser, die auf `eventName` hören. Für jeden wird ein Lauf
 * gestartet; Fehler je Auslöser werden isoliert (einer bricht die anderen nicht).
 *
 * @returns {Promise<{ausgeloest:number, laeufe:Array<{scheduleId:number, runId:number}>}>}
 */
async function feuerEreignis(eventName, deps = {}) {
  const { store = scheduleStore } = deps;
  const ausloeser = await store.ereignisAusloeser({ eventName });
  const laeufe = [];
  for (const schedule of ausloeser) {
    try {
      const runId = await starteAusloeser(schedule, deps);
      await store.markiereGefeuert({ id: schedule.id, runId, nextRunAt: null, error: null });
      laeufe.push({ scheduleId: schedule.id, runId });
      logger.info(
        `Scheduler: Flow „${schedule.flow_name}" per Ereignis „${eventName}" gestartet (Lauf ${runId})`
      );
    } catch (err) {
      await store.markiereGefeuert({
        id: schedule.id,
        runId: null,
        nextRunAt: null,
        error: err.message,
      });
      logger.error(
        `Scheduler: Ereignis-Auslöser ${schedule.id} („${schedule.flow_name}") gescheitert: ${err.message}`
      );
    }
  }
  return { ausgeloest: ausloeser.length, laeufe };
}

/** Startet die Tick-Schleife (im Server-Boot). Mehrfachaufruf ist folgenlos. */
function start() {
  if (tickTimer) {
    return;
  }
  tickTimer = setInterval(async () => {
    if (laeuftGerade) {
      return; // voriger Tick noch aktiv — überspringen
    }
    laeuftGerade = true;
    try {
      await tick();
    } catch (err) {
      logger.error(`Scheduler-Tick gescheitert: ${err.message}`);
    } finally {
      laeuftGerade = false;
    }
  }, TICK_MS);
  tickTimer.unref?.();
  logger.info(`Flow-Scheduler gestartet (Tick alle ${TICK_MS / 1000} s)`);
}

/** Hält die Tick-Schleife an (für Shutdown/Tests). */
function stop() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

module.exports = { start, stop, tick, feuerEreignis, starteAusloeser, TICK_MS };
