/**
 * Flow-Runner (Plan 011, Schritt 10) — der Kern.
 *
 * Nimmt einen Flow-Namen und die Argumente, und führt den Flow aus:
 *
 *   1. Flow laden (Registry).
 *   2. Argumente prüfen und einsetzen — Pflichtfelder, Auswahllisten, Standards;
 *      die Platzhalter im Prompt werden ersetzt.
 *   3. Werkzeuge zusammenstellen — GENAU die, die der Flow deklariert.
 *   4. Kontext bauen: erlaubte Ordner (Datei-Werkzeuge), Wissensraum (RAG),
 *      Sandbox-Container (Terminal). Der Runner ist die einzige Stelle, die den
 *      Container-Namen kennt — die Werkzeuge bekommen ihn nur durchgereicht.
 *   5. Modell auflösen: das im Flow genannte, sonst das Standardmodell.
 *   6. Lauf anlegen, die Werkzeug-Schleife treiben, jeden Schritt mitschreiben,
 *      Lauf abschließen. Die Grenzen des Flows (Runden, Zeitlimit) greifen hier.
 *
 * Alle Modell-Aufrufe der Schleife gehen durch die gemeinsame GPU-Sperre
 * (gpuQueue), nie zugleich mit einem Chat-Aufruf.
 */

const fs = require('fs/promises');
const path = require('path');
const registry = require('./flowRegistry');
const runStore = require('./runStore');
const { buildTools } = require('./toolRegistry');
const { runFlowLoop } = require('./toolLoop');
const { executeSteps } = require('./stepExecutor');
const { fillPlaceholders } = require('./flowFile');
const { ensureFlowSandbox } = require('./sandboxResolve');
const changeTracker = require('./changeTracker');
const { ladeDokumentText } = require('./documentText');
const { bauAusgabeAnweisungen, erzeugeDokument, DOKUMENT_FORMATE } = require('./dokumentAusgabe');
const { RunLimits } = require('./limits');
const projectService = require('../rag/projectService');
const modelService = require('../llm/modelService');
const logger = require('../../utils/logger');
const { ValidationError } = require('../../utils/errors');

/**
 * Platzhalter in `ordner`: zeigt auf die Projektablage des AKTIVEN Projekts.
 * So arbeitet ein Flow immer dort, wo auch Explorer und Sandbox arbeiten,
 * ohne dass der Autor eine UUID in die Flow-Datei schreiben müsste.
 *
 * Erweiterte Formen (Ziel-Ordner-Konzept, 2026-07-28):
 *   projekt://aktiv                → Ablage-Wurzel des aktiven Projekts
 *   projekt://aktiv/kunden/mueller → Unterordner darin (wird angelegt)
 *   projekt://<uuid>[/unterordner] → Ablage eines BESTIMMTEN Projekts
 */
const PROJEKT_ORDNER_TOKEN = 'projekt://aktiv';
const PROJEKT_PREFIX = 'projekt://';

/**
 * Löst ein `projekt://…`-Token in den echten Ablage-Pfad auf (legt ihn an).
 * Liefert neben dem Pfad auch Projekt-ID und Unterpfad — daraus baut die
 * Änderungs-Übersicht später klickbare Ablage-Ziele.
 */
async function resolveProjektToken(eintrag, { getActiveProjectId, projektOrdner }) {
  const rest = eintrag.slice(PROJEKT_PREFIX.length);
  const [kopf, ...teile] = rest.split('/');
  const unterpfad = teile.join('/');

  if (!kopf) {
    throw new ValidationError(`Ungültiger Ordner "${eintrag}"`);
  }
  if (unterpfad.split('/').includes('..') || path.isAbsolute(unterpfad)) {
    throw new ValidationError(`Ungültiger Ordner "${eintrag}": Pfad muss relativ und ohne .. sein`);
  }

  const projectId = kopf === 'aktiv' ? await getActiveProjectId() : kopf;
  const basis = await projektOrdner(projectId);
  if (!unterpfad) {
    return { pfad: basis, projectId, unterpfad: '' };
  }
  const ziel = path.join(basis, unterpfad);
  // path.join hat '..' bereits abgewiesen; der Gurt hier fängt Restfälle.
  if (!ziel.startsWith(basis + path.sep)) {
    throw new ValidationError(`Ungültiger Ordner "${eintrag}"`);
  }
  await fs.mkdir(ziel, { recursive: true });
  return { pfad: ziel, projectId, unterpfad };
}

/**
 * Löst alle `projekt://…`-Einträge in echte Ablage-Pfade auf (legt sie an).
 * `meta` (optional, Array) sammelt je Projekt-Ordner {pfad, projectId,
 * unterpfad} — für die klickbare Änderungs-Übersicht.
 */
async function resolveOrdnerListe(ordner = [], deps = {}, meta = null) {
  const {
    getActiveProjectId = projectService.getActiveProjectId,
    projektOrdner = require('../projects/ablageService').projektOrdner,
  } = deps;
  const out = [];
  for (const eintrag of ordner) {
    if (eintrag.startsWith(PROJEKT_PREFIX)) {
      const info = await resolveProjektToken(eintrag, { getActiveProjectId, projektOrdner });
      out.push(info.pfad);
      if (Array.isArray(meta)) {
        meta.push(info);
      }
    } else {
      out.push(eintrag);
    }
  }
  return out;
}

/**
 * Prüft die Argumente gegen die Deklaration und liefert die einzusetzenden
 * Werte plus die Wissensräume, auf die die RAG-Suche zu scopen ist.
 *
 * @param {object[]} declared - flow.argumente
 * @param {object} provided - name → Wert (vom Aufrufer)
 * @returns {{ werte: object, spaceIds: string[] }}
 * @throws {ValidationError} bei fehlendem Pflichtargument oder ungültiger Auswahl.
 */
function resolveArguments(declared = [], provided = {}) {
  const werte = {};
  const spaceIds = [];
  let ordnerArg = null;

  for (const arg of declared) {
    let wert = provided[arg.name];
    if (wert == null || wert === '') {
      if (arg.standard != null) {
        wert = arg.standard;
      } else if (arg.pflicht) {
        throw new ValidationError(`Pflicht-Argument "${arg.name}" fehlt`);
      } else {
        continue; // optional und leer → Platzhalter bleibt unersetzt (fillPlaceholders lässt ihn stehen)
      }
    }
    wert = String(wert);

    if (arg.typ === 'auswahl' && Array.isArray(arg.optionen) && !arg.optionen.includes(wert)) {
      throw new ValidationError(
        `Argument "${arg.name}": "${wert}" ist keine der erlaubten Auswahlen (${arg.optionen.join(', ')})`
      );
    }
    if (arg.typ === 'wissensbasis') {
      spaceIds.push(wert);
    }
    // Kundenordner-Fall: Ein ordner-Argument MUSS eine projekt://-Form sein —
    // dieselbe Grenze wie beim externen `ordner_ziel` (keine rohen Gerätepfade
    // aus Nutzereingaben). Der ERSTE ordner-Wert wird zum Arbeitsverzeichnis.
    if (arg.typ === 'ordner') {
      const rest = wert.startsWith(PROJEKT_PREFIX) ? wert.slice(PROJEKT_PREFIX.length) : null;
      if (rest == null || rest.split('/').includes('..') || rest.startsWith('/')) {
        throw new ValidationError(
          `Argument "${arg.name}": Ordner muss die Form projekt://aktiv[/pfad] oder projekt://<projekt-id>[/pfad] haben`
        );
      }
      if (ordnerArg == null) {
        ordnerArg = wert;
      }
    }
    werte[arg.name] = wert;
  }

  return { werte, spaceIds, ordnerArg };
}

/** Baut aus den Argumentwerten die konkrete Nutzer-Eingabe für das Modell. */
function buildUserInput(declared = [], werte = {}) {
  const zeilen = declared
    .filter(a => werte[a.name] != null)
    .map(a => `${a.beschreibung || a.name}: ${werte[a.name]}`);
  return zeilen.length > 0
    ? `Angaben:\n${zeilen.join('\n')}`
    : 'Bitte die beschriebene Aufgabe ausführen.';
}

/**
 * Speist den Inhalt der `datei`-Argumente in die Nutzer-Eingabe ein (Schritt 18).
 *
 * Ein `datei`-Argument liefert nur den Dateinamen — für „fasse dieses Dokument
 * zusammen" braucht das Modell den Inhalt. Der wird hier aus dem indexierten
 * Text geladen und als klar abgegrenzter Block angehängt. Ein nicht gefundenes
 * Dokument wird ehrlich vermerkt, damit das Modell nicht rät.
 *
 * @returns {Promise<string>} Die Nutzer-Eingabe, ggf. um Dokument-Blöcke ergänzt.
 */
async function anreichernMitDateien(userInput, declared = [], werte = {}, loadDocText) {
  const dateiArgs = declared.filter(a => a.typ === 'datei' && werte[a.name] != null);
  if (dateiArgs.length === 0) {
    return userInput;
  }
  const bloecke = [];
  for (const arg of dateiArgs) {
    const name = werte[arg.name];
    const doc = await loadDocText({ filename: name });
    if (doc.gefunden) {
      const gekuerzt = doc.gekuerzt ? ' (gekürzt)' : '';
      bloecke.push(
        `--- Inhalt der Datei "${name}"${gekuerzt} ---\n${doc.text}\n--- Ende der Datei ---`
      );
    } else {
      bloecke.push(
        `--- Datei "${name}" ---\nHinweis: Der Inhalt konnte nicht geladen werden ` +
          `(nicht in der Wissensbasis indexiert). Bitte weise darauf hin, statt zu raten.\n--- Ende ---`
      );
    }
  }
  return `${userInput}\n\n${bloecke.join('\n\n')}`;
}

/**
 * Führt einen Flow aus.
 *
 * @param {object} p
 * @param {string} p.flowName
 * @param {object} [p.args] - Argumentwerte (name → Wert).
 * @param {number} p.userId
 * @param {number|null} [p.conversationId]
 * @param {(evt:object)=>void} [p.onEvent] - Live-Ereignisse (Schritt 12 hängt sich hier ein).
 * @param {object} [deps] - Für Tests austauschbar.
 * @returns {Promise<object>} Der abgeschlossene Lauf (aus runStore).
 */
async function runFlow(
  {
    flowName,
    args = {},
    userId,
    conversationId = null,
    onEvent,
    existingRunId = null,
    signal,
    ordnerZiel = null,
    // „Ab Fehler wiederholen": Ausgaben erfolgreicher Schritte eines alten
    // Laufs (Schritt-Index → Ausgabe) — nur der deterministische Executor
    // wertet sie aus; der modellgetriebene Pfad ignoriert sie.
    vorabErgebnisse = null,
    vorabQuelleLaufId = null,
  },
  deps = {}
) {
  const {
    loadFlow = registry.loadFlow,
    store = runStore,
    makeTools = buildTools,
    runLoop = runFlowLoop,
    ensureSandbox = ensureFlowSandbox,
    tracker = changeTracker,
    loadDocText = ladeDokumentText,
    resolveModel = () => modelService.getDefaultModel(),
  } = deps;

  const geladen = await loadFlow(flowName);

  // Argumente FRÜH auflösen — ein Argument vom Typ `ordner` (Kundenordner)
  // bestimmt das Arbeitsverzeichnis des Laufs, noch bevor die Ordner-Liste
  // aufgelöst wird.
  const { werte, spaceIds: argSpaceIds, ordnerArg } = resolveArguments(geladen.argumente, args);

  // `projekt://…` in echte Ablage-Pfade auflösen — ab hier arbeitet der ganze
  // Lauf (Werkzeuge, Sandbox, Änderungs-Übersicht) mit realen Ordnern.
  // Ein pro Lauf mitgegebener Ziel-Ordner wird zum ARBEITSVERZEICHNIS (erster
  // Eintrag) — dort landen die Enddateien; die im Flow deklarierten Ordner
  // bleiben erlaubt. Rangfolge: explizites `ordnerZiel` (HTTP-Trigger) vor dem
  // ordner-Argument des Nutzers. Nur `projekt://…`-Formen sind zugelassen
  // (Routen-Schema bzw. resolveArguments erzwingen das), damit ein Aufrufer
  // keine beliebigen Gerätepfade öffnen kann.
  const effektivesZiel = ordnerZiel || ordnerArg || null;
  const ordnerListe = effektivesZiel ? [effektivesZiel, ...geladen.ordner] : geladen.ordner;
  // Je aufgelöstem Projekt-Ordner {pfad, projectId, unterpfad} — die
  // Änderungs-Übersicht macht damit Dateien in der Ablage klickbar.
  const projektOrdnerMeta = [];
  const flow = {
    ...geladen,
    ordner: await resolveOrdnerListe(ordnerListe, deps, projektOrdnerMeta),
  };

  // Ausgabe-Vorgaben (Sprache, Tonalität, Länge, Gliederung, Stilvorlage) an
  // den Prompt hängen — wirkt in BEIDEN Pfaden (Schleife wie Schritt-Kette).
  const ausgabeAnweisungen = await bauAusgabeAnweisungen(flow.ausgabe);
  if (ausgabeAnweisungen) {
    flow.systemPrompt = `${flow.systemPrompt}${ausgabeAnweisungen}`;
  }

  // Deklarierte Ordner sofort anlegen: ein Flow darf seine erlaubten Ordner
  // von Anfang an LESEN (dann eben leer), statt vor dem ersten Schreiben an
  // „Keiner der erlaubten Ordner existiert" zu scheitern (Live-Befund:
  // newsletter-Flow, dateien_lesen als 2. Schritt).
  for (const o of flow.ordner) {
    try {
      await fs.mkdir(o, { recursive: true });
    } catch (err) {
      logger.warn(`Flow "${flowName}": Ordner "${o}" nicht anlegbar: ${err.message}`);
    }
  }

  // 1. Platzhalter ersetzen (Argumente wurden oben schon aufgelöst). Ein
  //    `datei`-Argument reichert die Nutzer-Eingabe zusätzlich um den
  //    Dokument-Inhalt an (Schritt 18).
  // Batch 2: Ohne explizite `wissensbasis`-Argumente scopt der Flow seine
  // RAG-Suche auf das AKTIVE Projekt (statt zuvor auf die gesamte Wissensbasis) —
  // Agenten arbeiten damit standardmäßig nur im aktiven Projekt. Explizit
  // gewählte Wissensräume haben Vorrang.
  let spaceIds = argSpaceIds;
  if (spaceIds.length === 0) {
    const activeProjectId = await projectService.getActiveProjectId();
    spaceIds = await projectService.getProjectSpaceIds(activeProjectId);
  }
  const filledPrompt = fillPlaceholders(flow.systemPrompt, werte);
  const userInput = await anreichernMitDateien(
    buildUserInput(flow.argumente, werte),
    flow.argumente,
    werte,
    loadDocText
  );

  // 2. Modell.
  const model = flow.modell || (await resolveModel());
  if (!model) {
    throw new ValidationError('Kein Modell verfügbar — bitte im Model Store eines laden.');
  }

  // 3. Werkzeuge.
  const tools = makeTools(flow.werkzeuge);

  // 4. Kontext für die Werkzeuge (die Basis, die auch Rollen für IHRE Werkzeuge
  //    erben). Bewusst getrennt gehalten: `roleContextBase` sind die Ordner/
  //    Wissensraum/Container-Angaben, `context` ist dieselbe Basis plus die
  //    Lauf-weiten Subagent-Daten (Rollen, Grenzen, Tiefe).
  const roleContextBase = { userId, roots: flow.ordner, spaceIds, slug: flowName };

  // Terminal braucht einen Sandbox-Container. Nur aufbauen, wenn der Flow das
  // Werkzeug auch deklariert — sonst kein Container für einen Flow, der ihn
  // gar nicht nutzt.
  if (flow.werkzeuge.includes('terminal')) {
    try {
      const sandbox = await ensureSandbox(flow.ordner);
      roleContextBase.containerId = sandbox.containerId;
      roleContextBase.cwd = sandbox.cwd;
      roleContextBase.timeoutS = flow.grenzen.zeitlimit_s;
    } catch (err) {
      // Kein Container? Der Lauf startet trotzdem; das Terminal-Werkzeug meldet
      // dann pro Aufruf eine klare Ursache, statt dass der ganze Flow scheitert.
      logger.warn(`Flow "${flowName}": Sandbox nicht verfügbar: ${err.message}`);
    }
  }

  // 5. Lauf anlegen — ODER einen bereits angelegten weiterverwenden. Der
  //    Lauf-Verwalter (Schritt 12) legt den Lauf VOR dem Start an, damit seine
  //    ID sofort streambar ist, und reicht ihn hier herein.
  const run = existingRunId
    ? { id: existingRunId }
    : await store.createRun({ userId, flowName, arguments: werte, conversationId });

  // Zähler und offene Schritte (weiter unten von `weiter` und dem stepRecorder
  // gemeinsam genutzt) — hier deklariert, damit beide Closures sie sehen.
  let steps = 0;
  const offeneSchritte = new Map(); // toolName → stepId (für den Abschluss)

  // Notbremsen — EINE Instanz je Lauf, geteilt über alle Subagent-Ebenen.
  const limits = new RunLimits({
    maxAufrufe: flow.grenzen.max_aufrufe,
    zeitlimitS: flow.grenzen.zeitlimit_s,
    maxTiefe: flow.grenzen.max_tiefe,
  });

  const emitLive = evt => {
    if (typeof onEvent === 'function') {
      try {
        onEvent(evt);
      } catch (err) {
        logger.warn(`Flow "${flowName}": onEvent-Handler warf: ${err.message}`);
      }
    }
  };

  // Live-Ereignisse tragen die Schritt-Zeile OHNE raw_output — die Rohdaten
  // können 64 KB je Subagent sein und gehören nicht in jeden SSE-Frame; die
  // Ansicht lädt sie bei Bedarf über `?raw=1` nach.
  const oeffentlich = step => {
    if (!step) {
      return step;
    }
    const { raw_output: _weg, ...rest } = step;
    return rest;
  };

  // Der EINE Schritt-Schreiber des Laufs. Jeder Schritt — Orchestrator-Werkzeug,
  // Subagent, dessen innere Werkzeuge (parent_step_id) — läuft hierdurch und
  // wird zugleich live gemeldet: `step_start` beim Anlegen, `step_end` beim
  // Abschluss. Die Lauf-Ansicht baut daraus den Agenten-Baum, live wie nachher.
  const stepRecorder = {
    beginnen: async ({ kind, name = '', input = {}, parentStepId = null, modell = null }) => {
      const step = await store.startStep({
        runId: run.id,
        kind,
        name,
        input,
        parentStepId,
        modell,
      });
      steps += 1;
      await store.bumpSteps({ runId: run.id });
      emitLive({ type: 'step_start', step: oeffentlich(step) });
      return step;
    },
    abschliessen: async ({ stepId, output = null, rawOutput = null, status = 'fertig' }) => {
      const step = await store.finishStep({ stepId, output, rawOutput, status });
      emitLive({ type: 'step_end', step: oeffentlich(step) });
      return step;
    },
  };

  // Der volle Kontext: Werkzeug-Basis + die Lauf-weiten Subagent-Daten. `depth`
  // 0 = Orchestrator; Rollen laufen ab Ebene 1.
  const context = {
    ...roleContextBase,
    rollen: flow.rollen,
    limits,
    depth: 0,
    model,
    werkzeugRunden: flow.grenzen.werkzeug_runden,
    roleContextBase,
    stepRecorder,
    // Das Abbruch-Signal fließt mit in den Kontext, damit auch die
    // verschachtelten Rollen-Schleifen (Subagent) es prüfen und aufhören.
    signal,
  };

  // Ereignisse der Schleife an den Lauf-Speicher UND an den optionalen Live-Sink
  // durchreichen. Jeder Werkzeug-Aufruf wird ein Schritt.
  const weiter = async evt => {
    // `subagent` schreibt seinen eigenen, reicheren Schritt (mit Kind-Schritten
    // und Rohdaten) über den stepRecorder selbst. Hier NICHT zusätzlich als
    // generischen Werkzeug-Schritt mitschreiben — sonst stünde die Delegation
    // doppelt im Protokoll.
    const istSubagent = evt.tool === 'subagent';
    try {
      if (evt.type === 'tool_start' && !istSubagent) {
        const step = await stepRecorder.beginnen({
          kind: 'werkzeug',
          name: evt.tool || '',
          input: evt.params || {},
        });
        offeneSchritte.set(evt.tool, step.id);
      } else if (evt.type === 'tool_result' && !istSubagent) {
        const stepId = offeneSchritte.get(evt.tool);
        if (stepId) {
          await stepRecorder.abschliessen({ stepId, output: evt.result });
          offeneSchritte.delete(evt.tool);
        }
      }
    } catch (err) {
      // Das Mitschreiben darf einen laufenden Flow nie zum Absturz bringen.
      logger.warn(`Flow "${flowName}": Schritt konnte nicht gespeichert werden: ${err.message}`);
    }
    // Werkzeug-Ereignisse gehen als step_start/step_end raus (siehe
    // stepRecorder) — die rohen tool_*-Ereignisse hier NICHT doppelt senden.
    if (evt.type !== 'tool_start' && evt.type !== 'tool_result') {
      emitLive(evt);
    }
  };

  // 5b. Änderungs-Übersicht (Schritt 16): Nur wenn der Flow überhaupt Dateien
  //     verändern KANN (Schreib-Werkzeug oder Terminal), einen Abzug der Ordner
  //     VOR dem Lauf ziehen. Die Differenz zum Abzug NACH dem Lauf ist die
  //     Übersicht. Read-only-Flows (nur RAG/Web) tun das nie — kein Aufwand.
  //
  //     GRENZE, ehrlich benannt: Der Abzug-Vergleich nimmt an, dass NUR dieser
  //     Lauf die Ordner verändert. Griffe ein zweiter Lauf oder eine manuelle
  //     Terminal-Aktion GLEICHZEITIG in denselben Ordner, schriebe die Differenz
  //     dessen Änderungen fälschlich diesem Lauf zu. In der Praxis selten (ein
  //     Flow arbeitet in seinem eigenen Ordner), aber es ist ein anderer
  //     Fehlerfall als der TOCTOU-Schutz der Datei-Werkzeuge — hier nicht gelöst.
  const erzeugtDokument = DOKUMENT_FORMATE.has(flow.ausgabe?.format);
  const verfolgtAenderungen =
    erzeugtDokument ||
    (Array.isArray(flow.werkzeuge) &&
      (flow.werkzeuge.includes('dateien_schreiben') || flow.werkzeuge.includes('terminal')));
  let startAbzug = null;
  if (verfolgtAenderungen) {
    try {
      startAbzug = await tracker.snapshot(flow.ordner);
    } catch (err) {
      // Kein Abzug? Der Lauf läuft trotzdem — nur die Übersicht entfällt dann.
      logger.warn(`Flow "${flowName}": Start-Abzug fehlgeschlagen: ${err.message}`);
    }
  }

  // Zweiten Abzug ziehen, Differenz speichern und live melden. Wird in BEIDEN
  // Abschluss-Pfaden (Fehler wie Erfolg) genau einmal gerufen. Wirft nie: eine
  // gescheiterte Übersicht darf einen sonst gelungenen Lauf nicht kippen.
  const aenderungenAbschliessen = async () => {
    // Ein-Ordner-Modell: Flow-Schreibzugriffe sofort in den Wissens-Spiegel
    // übernehmen (der Lauf kann in der Projektablage gearbeitet haben).
    try {
      const aktivesProjekt = await projectService.getActiveProjectId();
      if (aktivesProjekt) {
        require('../projects/ordnerSyncService').trigger(aktivesProjekt);
      }
    } catch (err) {
      logger.warn(`Flow "${flowName}": Ordner-Sync-Trigger fehlgeschlagen: ${err.message}`);
    }
    if (!startAbzug) {
      return;
    }
    try {
      const endAbzug = await tracker.snapshot(flow.ordner);
      const roh = tracker.berechneAenderungen(startAbzug, endAbzug, flow.ordner || []);
      const abgeschnitten = roh.abgeschnitten;
      // Ablage-Dateien klickbar machen: liegt der Ordner der Datei in einer
      // Projektablage, bekommt der Eintrag `projekt` (Projekt-ID + Ablage-
      // Pfad). Die internen Felder root/rel (Gerätepfade) werden gestrichen.
      const aenderungen = roh.aenderungen.map(eintrag => {
        const { root, rel, ...rest } = eintrag;
        const m = projektOrdnerMeta.find(x => x.pfad === root);
        if (!m || !m.projectId || rel == null) {
          return rest;
        }
        return {
          ...rest,
          projekt: { projectId: m.projectId, pfad: m.unterpfad ? `${m.unterpfad}/${rel}` : rel },
        };
      });
      // Die Kürzung nicht still verschlucken (der Deckel greift erst bei sehr
      // vielen Datei-Änderungen, z. B. `npm install`): wenigstens im Log ehrlich
      // benennen, damit ein „nur 300 gelistet" nicht als vollständig missverstanden wird.
      if (abgeschnitten) {
        logger.warn(
          `Flow "${flowName}": Änderungs-Übersicht auf ${aenderungen.length} Einträge gekürzt — weitere ausgelassen.`
        );
      }
      await store.saveChanges({ runId: run.id, changes: aenderungen });
      // Live melden, damit die offen zusehende Lauf-Karte die Übersicht ohne
      // Nachladen zeigt. Beim Wiederverbinden liefert der gespeicherte Verlauf
      // dieselben Daten (getRun gibt `changes` mit).
      if (aenderungen.length > 0 && typeof onEvent === 'function') {
        try {
          onEvent({ type: 'aenderungen', changes: aenderungen });
        } catch (err) {
          logger.warn(`Flow "${flowName}": onEvent(aenderungen) warf: ${err.message}`);
        }
      }
    } catch (err) {
      logger.warn(`Flow "${flowName}": Änderungs-Übersicht fehlgeschlagen: ${err.message}`);
    }
  };

  // Werkzeug-Schritt (B7): führt EIN Werkzeug direkt aus und schreibt den Schritt
  // mit — für den deterministischen Executor. Der stepRecorder meldet Anfang und
  // Ende bereits live (step_start/step_end); eigene tool_*-Ereignisse braucht es
  // nicht mehr. Liefert die Werkzeug-Ausgabe als String zurück (fürs Threading).
  const recordWerkzeug = async ({ werkzeug, params }) => {
    const step = await stepRecorder.beginnen({
      kind: 'werkzeug',
      name: werkzeug || '',
      input: params || {},
    });
    let ausgabe;
    try {
      const [tool] = makeTools([werkzeug]);
      if (!tool) {
        throw new ValidationError(`Werkzeug "${werkzeug}" ist nicht verfügbar`);
      }
      ausgabe = String(await tool.execute(params, context));
    } catch (err) {
      await stepRecorder.abschliessen({
        stepId: step.id,
        output: `Fehler: ${err.message}`,
        status: 'fehler',
      });
      throw err;
    }
    await stepRecorder.abschliessen({ stepId: step.id, output: ausgabe });
    return ausgabe;
  };

  // 6. Ausführen — deterministische Schritt-Kette (B7), sonst modellgetrieben.
  let ergebnis;
  const hatSchritte = Array.isArray(flow.schritte) && flow.schritte.length > 0;
  try {
    ergebnis = hatSchritte
      ? await executeSteps({
          flow,
          werte,
          userInput,
          model,
          context,
          makeTools,
          runLoop,
          recordWerkzeug,
          emitLive: onEvent,
          signal,
          vorabErgebnisse,
          vorabQuelleLaufId,
        })
      : await runLoop({
          model,
          systemPrompt: filledPrompt,
          userInput,
          tools,
          maxRunden: flow.grenzen.werkzeug_runden,
          zeitlimitS: flow.grenzen.zeitlimit_s,
          context,
          signal,
          onEvent: weiter,
        });
  } catch (err) {
    logger.error(`Flow "${flowName}" abgebrochen: ${err.message}`);
    await store.finishRun({
      runId: run.id,
      status: 'fehler',
      error: err.message,
      stepsUsed: steps,
    });
    // Auch ein gescheiterter Lauf kann bis zum Abbruch Dateien verändert haben.
    await aenderungenAbschliessen();
    return store.getRun({ runId: run.id, userId });
  }

  // 6b. Ausgabe-Dokument erzeugen (Flows-Umbau 2026-08-02): das Ergebnis-
  //     Markdown wird ins deklarierte Format gerendert und ins Arbeits-
  //     verzeichnis geschrieben — VOR der Änderungs-Übersicht, damit die Datei
  //     dort als klickbares Artefakt auftaucht. Als eigener Schritt im
  //     Protokoll, damit sichtbar ist, WAS erzeugt wurde (oder woran es
  //     scheiterte). Ein Dokument-Fehler macht den Lauf zum Fehler-Lauf — der
  //     Nutzer wollte eine Datei, keine bloße Text-Antwort.
  let dokumentFehler = null;
  if (erzeugtDokument && !ergebnis.aborted && !ergebnis.error) {
    const zielOrdner = flow.ordner[0];
    let docStep = null;
    try {
      docStep = await stepRecorder.beginnen({
        kind: 'werkzeug',
        name: 'dokument_ausgabe',
        input: { format: flow.ausgabe.format, ordner: zielOrdner || '' },
      });
      if (!zielOrdner) {
        throw new ValidationError('Kein Zielordner für das Ausgabe-Dokument vorhanden');
      }
      const dok = await erzeugeDokument({
        ausgabe: flow.ausgabe,
        flowName,
        markdown: ergebnis.result,
        zielOrdner,
        werte,
      });
      await stepRecorder.abschliessen({
        stepId: docStep.id,
        output: `Dokument erzeugt: ${dok.dateiname}`,
      });
    } catch (err) {
      dokumentFehler = `Dokument konnte nicht erzeugt werden: ${err.message}`;
      logger.error(`Flow "${flowName}": ${dokumentFehler}`);
      if (docStep) {
        try {
          await stepRecorder.abschliessen({
            stepId: docStep.id,
            output: dokumentFehler,
            status: 'fehler',
          });
        } catch (stepErr) {
          logger.warn(
            `Flow "${flowName}": Dokument-Schritt nicht abschließbar: ${stepErr.message}`
          );
        }
      }
    }
  }

  // 7. Lauf abschließen. Ein per Signal abgebrochener Lauf wird 'abgebrochen';
  //    hat die Abbruch-Route den Status in der DB schon gesetzt, ist dieses
  //    finishRun ohnehin ein Nichts (WHERE status='laeuft' greift nicht mehr).
  const status = ergebnis.aborted
    ? 'abgebrochen'
    : ergebnis.error || dokumentFehler
      ? 'fehler'
      : 'fertig';
  await store.finishRun({
    runId: run.id,
    status,
    result: ergebnis.error ? null : ergebnis.result,
    error: ergebnis.error || dokumentFehler || null,
    stepsUsed: steps,
  });

  await aenderungenAbschliessen();

  return store.getRun({ runId: run.id, userId });
}

module.exports = {
  runFlow,
  resolveArguments,
  buildUserInput,
  anreichernMitDateien,
  resolveOrdnerListe,
  PROJEKT_ORDNER_TOKEN,
};
