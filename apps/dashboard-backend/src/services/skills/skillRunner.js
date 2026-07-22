/**
 * Lauf-Verwalter für Skills (Plan 011, Schritt 12).
 *
 * Bisher lief ein Skill SYNCHRON im Request: schloss der Browser den Tab, war
 * der Lauf weg. Ab hier läuft er SERVERSEITIG weiter, losgelöst vom Request.
 *
 * Zwei Dinge macht dieses Modul:
 *
 *  1. LOSGELÖST STARTEN. `starten` legt den Lauf an, stößt `runSkill` im
 *     Hintergrund an (NICHT awaited) und gibt sofort die Lauf-ID zurück. Der
 *     Request ist damit fertig; der Lauf läuft weiter.
 *
 *  2. LIVE VERTEILEN. Jeder Schritt (`onEvent`) wird an einen Ereignis-Bus
 *     gemeldet, auf den die SSE-Route hört. Bricht die Verbindung ab, läuft der
 *     Lauf weiter; beim Wiederverbinden liest die Route den gespeicherten
 *     Verlauf aus der DB (Schritt 9) und hängt sich ab dem letzten Schritt
 *     wieder an den Bus.
 *
 * ABBRUCH ist damit echt: `abbrechen` setzt das AbortSignal des Laufs. Die
 * Werkzeug-Schleife prüft es VOR jedem Modell-Aufruf und hört dann auf — statt
 * nur in der DB als „abgebrochen" zu stehen, während sie heimlich weiterrechnet.
 * GRENZE: Ein bereits LAUFENDER Werkzeug-Aufruf (ein langer Terminal-Befehl, ein
 * hängender Web-Abruf) wird nicht mitten drin unterbrochen — er läuft bis zu
 * seinem eigenen Zeitlimit, erst danach greift der Abbruch. Der Abbruch wirkt
 * also spätestens vor dem nächsten Modell-Aufruf, nicht zwingend sofort.
 *
 * GRENZE, ehrlich benannt: Der Lauf überlebt das Schließen des Tabs, aber NICHT
 * einen Neustart des Backends. Ein beim Neustart „laeuft"-gebliebener Lauf wird
 * einmalig beim Hochfahren als „fehler" markiert (siehe `verwaisteAufraeumen`),
 * damit kein Lauf für immer als laufend gilt.
 */

const EventEmitter = require('events');
const logger = require('../../utils/logger');
const runStore = require('./runStore');
const { runSkill } = require('./runSkill');

// Aktive Läufe: runId → { bus, controller }. Der Bus verteilt die Ereignisse
// an die SSE-Abonnenten; der controller bricht den Lauf ab.
const aktive = new Map();

// Wie lange ein beendeter Lauf noch im Speicher bleibt, damit ein knapp zu spät
// verbindender Client sein Schluss-Ereignis noch mitbekommt.
const NACHLAUF_MS = 30 * 1000;

/**
 * Startet einen Skill-Lauf LOSGELÖST vom Request.
 *
 * @param {object} p - siehe runSkill: skillName, args, userId, conversationId.
 * @param {object} [deps] - für Tests austauschbar (`run` = runSkill).
 * @returns {Promise<{runId:number}>} die ID des angelegten Laufs.
 */
async function starten({ skillName, args = {}, userId, conversationId = null }, deps = {}) {
  const { run = runSkill, store = runStore } = deps;

  // Den Lauf ZUERST anlegen, damit die zurückgegebene ID sofort streambar ist —
  // die SSE-Route kann sich verbinden, noch bevor der erste Schritt da ist.
  const angelegt = await store.createRun({ userId, skillName, arguments: args, conversationId });
  const runId = angelegt.id;

  const bus = new EventEmitter();
  // Ein SSE-Abonnent pro Verbindung; mehrere Tabs sind möglich.
  bus.setMaxListeners(0);
  const controller = new AbortController();
  aktive.set(runId, { bus, controller });

  // Jedes Schleifen-Ereignis an den Bus weiterreichen. runSkill schreibt den
  // Schritt bereits in die DB (Schritt 9); hier kommt nur die Live-Verteilung
  // dazu. Der Bus wirft nie in die Schleife zurück.
  const onEvent = evt => {
    try {
      bus.emit('evt', evt);
    } catch (err) {
      logger.debug(`skillRunner: Bus-Emit fehlgeschlagen: ${err.message}`);
    }
  };

  // BEWUSST NICHT await: Der Lauf läuft im Hintergrund weiter.
  run(
    {
      skillName,
      args,
      userId,
      conversationId,
      onEvent,
      existingRunId: runId,
      signal: controller.signal,
    },
    {}
  )
    .then(fertig => {
      bus.emit('evt', { type: 'ende', status: fertig ? fertig.status : 'fertig', runId });
    })
    .catch(err => {
      logger.error(`Skill-Lauf ${runId} (${skillName}) im Hintergrund gescheitert: ${err.message}`);
      // Der Lauf konnte nicht sauber abschließen — Status hart auf Fehler setzen,
      // damit er nicht ewig als „laeuft" gilt.
      store
        .finishRun({ runId, status: 'fehler', error: err.message })
        .catch(() => {})
        .finally(() => bus.emit('evt', { type: 'ende', status: 'fehler', runId }));
    })
    .finally(() => {
      // Nachlauf: den Bus noch kurz halten, dann aufräumen.
      setTimeout(() => aktive.delete(runId), NACHLAUF_MS).unref?.();
    });

  return { runId };
}

/**
 * Abonniert die Live-Ereignisse eines laufenden Laufs.
 * @param {number} runId
 * @param {(evt:object)=>void} handler
 * @returns {(()=>void)|null} Abmelde-Funktion, oder null wenn der Lauf nicht
 *   (mehr) aktiv ist (dann gibt es nur noch den DB-Verlauf).
 */
function abonnieren(runId, handler) {
  const eintrag = aktive.get(runId);
  if (!eintrag) {
    return null;
  }
  eintrag.bus.on('evt', handler);
  return () => eintrag.bus.removeListener('evt', handler);
}

/** Läuft dieser Lauf gerade aktiv im Speicher? */
function istAktiv(runId) {
  return aktive.has(runId);
}

/**
 * Bricht einen laufenden Lauf ab: erst in der DB (Eigentümer-geprüft, Schritt 9),
 * dann das Abort-Signal setzen, damit die Schleife wirklich aufhört.
 *
 * @returns {Promise<object|null>} der abgebrochene Lauf, oder null wenn nichts
 *   abzubrechen war (fremd/unbekannt/schon beendet).
 */
async function abbrechen({ runId, userId }, deps = {}) {
  const { store = runStore } = deps;
  const abgebrochen = await store.cancelRun({ runId, userId });
  if (!abgebrochen) {
    return null;
  }
  const eintrag = aktive.get(runId);
  if (eintrag) {
    eintrag.controller.abort();
    eintrag.bus.emit('evt', { type: 'ende', status: 'abgebrochen', runId });
  }
  return abgebrochen;
}

/**
 * Markiert beim Hochfahren alle noch als „laeuft" stehenden Läufe als Fehler.
 * Nach einem Backend-Neustart gibt es keinen Prozess mehr, der sie fortsetzt —
 * sie würden sonst für immer als laufend gelten.
 */
async function verwaisteAufraeumen(deps = {}) {
  const { db = require('../../database') } = deps;
  const res = await db.query(
    `UPDATE skill_runs
        SET status = 'fehler',
            error = 'Backend wurde neu gestartet, während der Lauf lief',
            finished_at = NOW()
      WHERE status = 'laeuft'
      RETURNING id`
  );
  if (res.rowCount > 0) {
    logger.warn(`skillRunner: ${res.rowCount} verwaiste Läufe beim Start auf 'fehler' gesetzt`);
  }
  return res.rowCount;
}

/** Nur für Tests: den Registry-Zustand zurücksetzen. */
function _reset() {
  aktive.clear();
}

module.exports = {
  starten,
  abonnieren,
  istAktiv,
  abbrechen,
  verwaisteAufraeumen,
  _aktive: aktive,
  _reset,
};
