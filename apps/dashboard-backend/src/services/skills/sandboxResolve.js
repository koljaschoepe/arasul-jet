/**
 * Auflösung des Sandbox-Containers für Skill-Terminalbefehle (Plan 011, Schritt 7).
 *
 * Skill-Befehle laufen NICHT im Backend, sondern über `docker exec` in einem
 * eigenen Container aus dem Image `arasul-sandbox:latest` (§8). Ein Fehlgriff
 * des Modells trifft damit den Container, nicht das Dashboard.
 *
 * Zwei Dinge löst dieses Modul, und nur diese:
 *
 * 1. PFAD-ÜBERSETZUNG. Das Backend sieht die Ordner eines Skills unter seinen
 *    eigenen Mount-Pfaden (z. B. `/arasul/skills`), der Docker-Daemon kennt nur
 *    HOST-Pfade. Ein Bind-Mount muss deshalb übersetzt werden. Die Zuordnung
 *    steht in den Bind-Mounts unseres eigenen Containers — genau wie
 *    `sandboxShared.getHostDataDir()`, hier nur allgemein statt für einen
 *    festen Pfad.
 *
 * 2. CONTAINER-LEBENSZYKLUS. Der Container heißt immer gleich und bleibt
 *    stehen, damit ein `apt-get install` aus einem Lauf im nächsten noch da
 *    ist. Er wird aber NEU GEBAUT, sobald ein Skill andere Ordner braucht.
 *
 * Warum nicht die Ordner mehrerer Skills sammeln (Union), was das Neubauen
 * spart? Weil ein Skill dann per `cd` in den Ordner eines ANDEREN Skills
 * käme — die Ordner-Beschränkung wäre über das Terminal umgangen. Der
 * Container trägt deshalb ausschließlich die Ordner des Skills, der gerade
 * läuft. Der Preis ist ein Neubau beim Wechsel; die Grenze ist es wert.
 *
 * Jeder Ordner wird unter dem GLEICHEN Pfad eingehängt, den auch das Backend
 * sieht. Dadurch meint ein Pfad in der Terminal-Ausgabe dasselbe wie in den
 * Datei-Werkzeugen — für ein kleines Modell ist das der Unterschied zwischen
 * "es funktioniert" und "es rät".
 */

const path = require('path');
const fs = require('fs');
const logger = require('../../utils/logger');
const { ValidationError } = require('../../utils/errors');
const { docker } = require('../core/docker');
const { DEFAULT_IMAGE, parseMemoryLimit } = require('../sandbox/sandboxShared');
const { normalizeRoots } = require('./pathSafe');

/** Fester Name — es gibt genau einen Skill-Sandbox-Container je Gerät. */
const SKILL_CONTAINER_NAME = 'arasul-skills-sandbox';

/** Name unseres eigenen Containers, aus dem die Mount-Tabelle stammt. */
const SELF_CONTAINER = process.env.BACKEND_CONTAINER_NAME || 'dashboard-backend';

/** Ressourcendeckel — bewusst enger als bei Workspace-Projekten. */
const LIMITS = { memory: '2G', cpus: '2', pids: 256 };

/** Mount-Tabelle unseres eigenen Containers: [{ Source, Destination }]. */
let _bindCache = null;

/**
 * Läuft gerade ein Aufbau? Ohne diese Sperre könnten zwei gleichzeitige Läufe
 * denselben Container parallel entfernen und neu anlegen — der eine zieht dem
 * anderen den Container unter dem laufenden Befehl weg.
 */
let _pending = null;

/** Mount-Tabelle des eigenen Containers holen (einmalig, dann zwischengespeichert). */
async function getOwnMounts() {
  if (_bindCache) {
    return _bindCache;
  }
  const info = await docker.getContainer(SELF_CONTAINER).inspect();
  _bindCache = (info.Mounts || [])
    .filter(m => m.Source && m.Destination)
    .map(m => ({ source: m.Source, destination: m.Destination }));
  return _bindCache;
}

/**
 * Übersetzt einen Pfad, wie das Backend ihn sieht, in den Host-Pfad.
 *
 * Der LÄNGSTE passende Mount gewinnt: Liegt `/arasul/sandbox/projects` als
 * eigener Mount innerhalb von `/arasul`, muss der speziellere zählen, sonst
 * zeigt die Übersetzung auf den falschen Host-Ordner.
 *
 * @param {string} containerPath - Absoluter Pfad im Backend-Container.
 * @returns {Promise<string>} Absoluter Pfad auf dem Host.
 * @throws {ValidationError} wenn der Pfad in keinem Mount liegt.
 */
async function toHostPath(containerPath) {
  const target = path.resolve(String(containerPath || ''));
  const mounts = await getOwnMounts();

  let best = null;
  for (const m of mounts) {
    const rel = path.relative(m.destination, target);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      continue;
    }
    if (!best || m.destination.length > best.mount.destination.length) {
      best = { mount: m, rel };
    }
  }

  if (!best) {
    throw new ValidationError(
      `Ordner "${containerPath}" ist im Backend nicht als Mount eingebunden — ` +
        'er kann deshalb nicht in den Sandbox-Container gereicht werden'
    );
  }
  return best.rel ? path.join(best.mount.source, best.rel) : best.mount.source;
}

/** Prüft, ob das Sandbox-Image vorhanden ist — mit klarer Ursache statt Absturz. */
async function assertImagePresent() {
  try {
    await docker.getImage(DEFAULT_IMAGE).inspect();
  } catch (err) {
    if (err.statusCode === 404) {
      throw new ValidationError(
        `Das Sandbox-Image "${DEFAULT_IMAGE}" fehlt auf diesem Gerät. ` +
          'Es wird beim Deploy gebaut; manuell: ' +
          '`docker build -t arasul-sandbox:latest services/sandbox`'
      );
    }
    throw err;
  }
}

/**
 * Legt die Skill-Ordner an, BEVOR sie als Bind-Mount verwendet werden.
 *
 * Der Grund ist unscheinbar, aber folgenreich: fehlt das Quellverzeichnis eines
 * Bind-Mounts, legt der Docker-Daemon es selbst an — und zwar als **root**.
 * Das Backend läuft als `node` (uid 1000) und kann danach nicht mehr in seinen
 * eigenen Arbeitsordner schreiben; `dateien_schreiben` scheitert mit
 * `EACCES: permission denied, mkdir …`. Legen WIR den Ordner vorher an, gehört
 * er dem Backend und Docker findet ihn einfach vor.
 *
 * Best-effort: schlägt das Anlegen fehl (z. B. read-only Mount), läuft der
 * bisherige Weg weiter — der Fehler zeigt sich dann wie zuvor beim Zugriff.
 */
function ensureRootDirs(roots) {
  for (const root of roots) {
    try {
      fs.mkdirSync(root, { recursive: true });
    } catch (err) {
      logger.warn(`Skill-Ordner ${root} konnte nicht angelegt werden: ${err.message}`);
    }
  }
}

/** Erwartete Bind-Einträge (`host:container:rw`) für eine Ordnerliste. */
async function bindsFor(roots) {
  const binds = [];
  for (const root of roots) {
    binds.push(`${await toHostPath(root)}:${root}:rw`);
  }
  return binds;
}

/**
 * Stellt sicher, dass ein passender Sandbox-Container läuft.
 *
 * @param {string[]|string} roots - Erlaubte Ordner des Skills; der erste ist
 *   das Arbeitsverzeichnis.
 * @returns {Promise<{containerId:string, containerName:string, cwd:string}>}
 * @throws {ValidationError} bei fehlendem Image oder nicht einbindbarem Ordner.
 */
async function ensureSkillSandbox(roots) {
  const list = normalizeRoots(roots);
  // Serialisieren: gleichzeitige Läufe dürfen sich nicht gegenseitig den
  // Container wegräumen.
  const run = async () => {
    await assertImagePresent();
    // Ordner anlegen, BEVOR Docker sie als root anlegen würde (siehe
    // ensureRootDirs) — sonst kann das Backend nicht hineinschreiben.
    ensureRootDirs(list);
    const binds = await bindsFor(list);
    const cwd = list[0];

    const container = docker.getContainer(SKILL_CONTAINER_NAME);
    let info = null;
    try {
      info = await container.inspect();
    } catch (err) {
      if (err.statusCode !== 404) {
        throw err;
      }
    }

    if (info) {
      const vorhanden = info.HostConfig?.Binds || [];
      // Exakt gleiche Menge, nicht "enthält" — ein Container mit ZUSÄTZLICHEN
      // Ordnern wäre eine Umgehung der Ordner-Beschränkung.
      const passt = vorhanden.length === binds.length && binds.every(b => vorhanden.includes(b));
      if (passt) {
        if (info.State?.Running) {
          return { containerId: info.Id, containerName: SKILL_CONTAINER_NAME, cwd };
        }
        await container.start();
        logger.info(`Skill-Sandbox ${SKILL_CONTAINER_NAME} wieder gestartet`);
        return { containerId: info.Id, containerName: SKILL_CONTAINER_NAME, cwd };
      }
      logger.info(
        `Skill-Sandbox wird neu aufgebaut — andere Ordner angefordert (${binds.join(', ')})`
      );
      await container.remove({ force: true });
    }

    const erzeugt = await docker.createContainer({
      Image: DEFAULT_IMAGE,
      name: SKILL_CONTAINER_NAME,
      Hostname: 'skills-sandbox',
      Cmd: ['sleep', 'infinity'],
      WorkingDir: cwd,
      Env: ['SANDBOX_PROJECT=skills'],
      HostConfig: {
        Binds: binds,
        // Eigenes Bridge-Netz: Internet ja (ein Skill darf Pakete holen),
        // interne Dienste nein — das Backend ist von hier nicht erreichbar.
        NetworkMode: 'bridge',
        RestartPolicy: { Name: 'unless-stopped' },
        Memory: parseMemoryLimit(LIMITS.memory),
        NanoCpus: Math.round(parseFloat(LIMITS.cpus) * 1e9),
        PidsLimit: LIMITS.pids,
        // Gleiche Härtung wie bei Workspace-Containern.
        SecurityOpt: ['no-new-privileges:true'],
        CapDrop: ['ALL'],
        CapAdd: ['NET_BIND_SERVICE'],
        Tmpfs: { '/tmp': 'noexec,nosuid,size=256M' },
      },
    });
    await erzeugt.start();
    logger.info(`Skill-Sandbox ${SKILL_CONTAINER_NAME} angelegt (Ordner: ${list.join(', ')})`);
    return { containerId: erzeugt.id, containerName: SKILL_CONTAINER_NAME, cwd };
  };

  _pending = Promise.resolve(_pending)
    .catch(() => {})
    .then(run);
  return _pending;
}

/** Nur für Tests: Mount-Tabelle und Sperre zurücksetzen. */
function _reset() {
  _bindCache = null;
  _pending = null;
}

module.exports = {
  SKILL_CONTAINER_NAME,
  toHostPath,
  ensureSkillSandbox,
  _reset,
};
