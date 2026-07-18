/**
 * App-Lifecycle: startet/stoppt die Container einer Workspace-App passend zum
 * gespeicherten Aktivierungszustand (platform_apps.enabled).
 *
 * Hintergrund (Lizenz): n8n ist fair-code-lizenziert und darf nur laufen, wenn
 * der Nutzer die Extension ausdrücklich aktiviert. Deshalb steuert das
 * Aktivieren/Deaktivieren in routes/workspaceApps.js zusätzlich den
 * n8n-Container: aktiv → Container laufen, inaktiv → Container gestoppt. Beim
 * Boot gleicht reconcileApps() den Container-Zustand an die DB an (aus, wenn
 * deaktiviert) — der lizenzsaubere Default.
 *
 * Nur n8n hat heute einen Container-Lifecycle. Andere Apps (z. B. terminal)
 * sind keine eigenständigen Dauerdienste → sicherer No-op.
 *
 * Robustheit: alle Container-Operationen sind idempotent (Zielzustand statt
 * blindes start/stop) und best-effort — es wird nie in den Request-Pfad oder
 * in den Boot geworfen. Ein Fehlschlag wird geloggt UND im Rückgabewert
 * (ok: false) sichtbar gemacht, damit der Aufrufer keinen falschen Erfolg meldet.
 */

const db = require('../../database');
const { docker } = require('../core/docker');
const logger = require('../../utils/logger');

// appId → zugehörige Container. Reihenfolge = Startreihenfolge (Task-Broker
// vor Runnern); gestoppt wird in umgekehrter Reihenfolge. Einziger Ort, an dem
// dieses Mapping lebt.
const APP_CONTAINERS = {
  n8n: ['n8n', 'n8n-runners'],
};

/** Container-Namen einer App (leer = kein Lifecycle). */
function containersForApp(appId) {
  return APP_CONTAINERS[appId] || [];
}

/**
 * Bringt einen einzelnen Container idempotent in den Zielzustand.
 * @param {string} name Container-Name
 * @param {'running'|'stopped'} desired Zielzustand
 * @returns {Promise<{name:string, ok:boolean, reason:string, error?:string}>}
 */
async function ensureContainerState(name, desired) {
  try {
    const container = docker.getContainer(name);

    let info;
    try {
      info = await container.inspect();
    } catch (err) {
      // Container existiert nicht (Extension nie ausgerollt): Beim Stoppen ist
      // das der gewünschte Zustand; beim Starten ein echtes Problem.
      if (err.statusCode === 404) {
        if (desired === 'stopped') {
          return { name, ok: true, reason: 'not_found' };
        }
        logger.error(`appLifecycle: Container '${name}' nicht vorhanden — kann nicht starten`);
        return { name, ok: false, reason: 'not_found' };
      }
      throw err;
    }

    const running = Boolean(info.State && info.State.Running);

    if (desired === 'running') {
      if (running) {
        return { name, ok: true, reason: 'already_running' };
      }
      await container.start();
      logger.info(`appLifecycle: Container '${name}' gestartet`);
      return { name, ok: true, reason: 'started' };
    }

    // desired === 'stopped'
    if (!running) {
      return { name, ok: true, reason: 'already_stopped' };
    }
    await container.stop();
    logger.info(`appLifecycle: Container '${name}' gestoppt`);
    return { name, ok: true, reason: 'stopped' };
  } catch (err) {
    logger.error(
      `appLifecycle: Zustandswechsel für Container '${name}' → ${desired} fehlgeschlagen: ${err.message}`
    );
    return { name, ok: false, reason: 'error', error: err.message };
  }
}

/**
 * Startet die Container einer App. No-op (ok) für Apps ohne Lifecycle.
 * @returns {Promise<{appId:string, hasLifecycle:boolean, ok:boolean, containers:Array}>}
 */
async function startApp(appId) {
  const names = containersForApp(appId);
  if (names.length === 0) {
    logger.debug(`appLifecycle: '${appId}' hat keinen Container-Lifecycle — startApp no-op`);
    return { appId, hasLifecycle: false, ok: true, containers: [] };
  }

  const containers = [];
  for (const name of names) {
    // eslint-disable-next-line no-await-in-loop -- Container bewusst seriell (Broker vor Runnern)
    containers.push(await ensureContainerState(name, 'running'));
  }

  const ok = containers.every(c => c.ok);
  if (ok) {
    logger.info(`appLifecycle: App '${appId}' gestartet (${names.join(', ')})`);
  } else {
    const failed = containers
      .filter(c => !c.ok)
      .map(c => c.name)
      .join(', ');
    logger.error(
      `appLifecycle: Start von App '${appId}' unvollständig — fehlgeschlagen: ${failed}`
    );
  }
  return { appId, hasLifecycle: true, ok, containers };
}

/**
 * Stoppt die Container einer App (umgekehrte Reihenfolge). No-op (ok) für Apps
 * ohne Lifecycle.
 * @returns {Promise<{appId:string, hasLifecycle:boolean, ok:boolean, containers:Array}>}
 */
async function stopApp(appId) {
  const names = containersForApp(appId);
  if (names.length === 0) {
    logger.debug(`appLifecycle: '${appId}' hat keinen Container-Lifecycle — stopApp no-op`);
    return { appId, hasLifecycle: false, ok: true, containers: [] };
  }

  const containers = [];
  for (const name of [...names].reverse()) {
    // eslint-disable-next-line no-await-in-loop -- Container bewusst seriell (Runner vor Broker)
    containers.push(await ensureContainerState(name, 'stopped'));
  }

  const ok = containers.every(c => c.ok);
  if (ok) {
    logger.info(`appLifecycle: App '${appId}' gestoppt (${names.join(', ')})`);
  } else {
    const failed = containers
      .filter(c => !c.ok)
      .map(c => c.name)
      .join(', ');
    logger.error(
      `appLifecycle: Stopp von App '${appId}' unvollständig — fehlgeschlagen: ${failed}`
    );
  }
  return { appId, hasLifecycle: true, ok, containers };
}

/**
 * Boot-Reconcile: liest platform_apps und gleicht den Container-Zustand jeder
 * App mit Lifecycle an das gespeicherte enabled-Flag an. Best-effort — wirft
 * nie, damit der Backend-Start nie blockiert wird. Fehlende Zeile → defensiv
 * deaktiviert (lizenzsauber).
 */
async function reconcileApps() {
  let rows;
  try {
    const result = await db.query('SELECT id, enabled FROM platform_apps');
    rows = result.rows;
  } catch (err) {
    logger.error(`appLifecycle: reconcile konnte platform_apps nicht lesen: ${err.message}`);
    return;
  }

  const enabledById = new Map(rows.map(r => [r.id, r.enabled === true]));

  for (const appId of Object.keys(APP_CONTAINERS)) {
    const enabled = enabledById.get(appId) === true;
    try {
      // eslint-disable-next-line no-await-in-loop -- Apps seriell reconcilen
      const res = enabled ? await startApp(appId) : await stopApp(appId);
      logger.info(
        `appLifecycle: reconcile '${appId}' → ${enabled ? 'gestartet' : 'gestoppt'} (ok=${res.ok})`
      );
    } catch (err) {
      logger.error(`appLifecycle: reconcile für '${appId}' fehlgeschlagen: ${err.message}`);
    }
  }
}

module.exports = {
  APP_CONTAINERS,
  containersForApp,
  startApp,
  stopApp,
  reconcileApps,
};
