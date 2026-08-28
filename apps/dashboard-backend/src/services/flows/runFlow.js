/**
 * Flow-Runner (Plan 011, Schritt 10) — der Kern.
 *
 * Nimmt einen Flow-Namen und die Argumente, und führt den Flow aus:
 *
 *   1. Flow laden -- aus der Registry der Plattform (`/arasul/flows/`) oder,
 *      mit `appId`/`stand`, aus den Flows dieser App (`app_flows`, Phase C6).
 *   2. Argumente prüfen und einsetzen — Pflichtfelder, Auswahllisten, Standards;
 *      die Platzhalter im Prompt werden ersetzt.
 *   3. Werkzeuge zusammenstellen — GENAU die, die der Flow deklariert.
 *   4. Kontext bauen: die erlaubten Ordner der Datei-Werkzeuge.
 *   5. Modell auflösen: das im Flow genannte, sonst das Standardmodell. Bei
 *      einem App-Flow hat `appFlows.lade` die Überschreibung des Admins
 *      (`flow_settings`) schon eingesetzt -- der Runner sieht ein Modell,
 *      nicht zwei Quellen.
 *   6. Lauf anlegen, die Werkzeug-Schleife treiben, jeden Schritt mitschreiben,
 *      Lauf abschließen. Die Grenzen des Flows (Runden, Zeitlimit) greifen hier.
 *
 * Alle Modell-Aufrufe der Schleife gehen durch die gemeinsame GPU-Sperre
 * (gpuQueue), nie zugleich mit einem Chat-Aufruf.
 */

const fs = require('fs/promises');
const path = require('path');
const registry = require('./flowRegistry');
const appFlows = require('../app/appFlows');
const runStore = require('./runStore');
const { buildTools } = require('./toolRegistry');
const { runFlowLoop } = require('./toolLoop');
const { executeSteps } = require('./stepExecutor');
const { fillPlaceholders } = require('./flowFile');
const changeTracker = require('./changeTracker');
const { bauAusgabeAnweisungen, erzeugeDokument, DOKUMENT_FORMATE } = require('./dokumentAusgabe');
const pruefungService = require('./pruefung');
const { RunLimits } = require('./limits');
const modelService = require('../llm/modelService');
const logger = require('../../utils/logger');
const { ValidationError } = require('../../utils/errors');

/**
 * Prüft die Argumente gegen die Deklaration und liefert die einzusetzenden
 * Werte.
 *
 * @param {object[]} declared - flow.argumente
 * @param {object} provided - name → Wert (vom Aufrufer)
 * @returns {{ werte: object }}
 * @throws {ValidationError} bei fehlendem Pflichtargument oder ungültiger Auswahl.
 */
function resolveArguments(declared = [], provided = {}) {
  const werte = {};

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
    werte[arg.name] = wert;
  }

  return { werte };
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
 * Führt einen Flow aus.
 *
 * @param {object} p
 * @param {string} p.flowName
 * @param {object} [p.args] - Argumentwerte (name → Wert).
 * @param {number} p.userId
 * @param {string|null} [p.appId] - Die App, deren Flow das ist (C6). Ohne sie
 *   ist es ein Flow der Plattform.
 * @param {'test'|'live'|null} [p.stand] - Ihr Stand. Zusammen mit `appId`
 *   gesetzt oder beide nicht.
 * @param {(evt:object)=>void} [p.onEvent] - Live-Ereignisse (Schritt 12 hängt sich hier ein).
 * @param {object} [deps] - Für Tests austauschbar.
 * @returns {Promise<object>} Der abgeschlossene Lauf (aus runStore).
 */
async function runFlow(
  {
    flowName,
    args = {},
    userId,
    appId = null,
    stand = null,
    onEvent,
    existingRunId = null,
    signal,
    // „Ab Fehler wiederholen": Ausgaben erfolgreicher Schritte eines alten
    // Laufs (Schritt-Index → Ausgabe) — nur der deterministische Executor
    // wertet sie aus; der modellgetriebene Pfad ignoriert sie.
    vorabErgebnisse = null,
    vorabQuelleLaufId = null,
  },
  deps = {}
) {
  const {
    // Zwei Herkuenfte, ein Aufruf: die Flows der Plattform liegen als Dateien
    // unter `/arasul/flows/`, die einer App als Zeilen in `app_flows` (C6).
    // Welche gemeint ist, sagt `appId` -- nicht der Aufrufer mit einem
    // zweiten Parameter, und nicht ein Praefix im Namen. Ein Name wie
    // `urlaub/bericht` waere ein zusammengesetzter Schluessel in einem
    // Textfeld, und jeder, der ihn zerlegt, zerlegt ihn ein bisschen anders.
    // `mitZugang`: NUR hier wird der Schluessel eines externen Modells
    // entschluesselt (D4) -- der Runner ist der einzige, der ihn benutzt.
    loadFlow = ({ flowName: name, appId: app, stand: st }) =>
      app
        ? appFlows.lade({ appId: app, stand: st, name, mitZugang: true })
        : registry.loadFlow(name),
    store = runStore,
    makeTools = buildTools,
    runLoop = runFlowLoop,
    tracker = changeTracker,
    resolveModel = () => modelService.getDefaultModel(),
    pruefe = pruefungService.pruefeUndKorrigiere,
  } = deps;

  const geladen = await loadFlow({ flowName, appId, stand });

  const { werte } = resolveArguments(geladen.argumente, args);

  // Die Ordner des Laufs sind GENAU die im Flow deklarierten. Bis Phase B4
  // (26.08.2026) loeste der Runner hier `projekt://…`-Formen in die
  // Projektablage auf; Projekte sind mit den Wissensraeumen gefallen.
  const flow = {
    ...geladen,
    ordner: [...geladen.ordner],
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

  // 1. Platzhalter ersetzen (Argumente wurden oben schon aufgelöst).
  const filledPrompt = fillPlaceholders(flow.systemPrompt, werte);
  const userInput = buildUserInput(flow.argumente, werte);

  // 2. Modell. Entweder eines vom Gerät — oder, seit Phase D4, das externe,
  //    das der Administrator für diesen Flow hinterlegt hat (`flow_settings`,
  //    aufgelöst in `appFlows.lade`). `extern` reicht bis in `callOllama`
  //    durch und entscheidet dort, wohin der Aufruf geht; `model` bleibt
  //    daneben stehen, weil jeder Schritt seinen Modellnamen protokolliert.
  const extern = flow.extern || null;
  const model = flow.modell || (await resolveModel());
  if (!model) {
    throw new ValidationError('Kein Modell verfügbar, bitte im Model Store eines laden.');
  }

  // 3. Werkzeuge.
  const tools = makeTools(flow.werkzeuge, { betriebsart: flow.betriebsart });

  // 4. Kontext für die Werkzeuge (die Basis, die auch Rollen für IHRE Werkzeuge
  //    erben). Bewusst getrennt gehalten: `roleContextBase` sind die
  //    Ordner-Angaben, `context` ist dieselbe Basis plus die Lauf-weiten
  //    Subagent-Daten (Rollen, Grenzen, Tiefe).
  //
  //    `appId`/`stand` gehoeren in die BASIS und nicht nur in den aeusseren
  //    Kontext (Phase C7): eine Rolle, die `freigabe_anfordern` deklariert,
  //    braucht denselben Namensraum wie der Orchestrator. Ohne sie forderte
  //    sie eine Freigabe an, die niemandem gehoert -- und bekaeme dieselbe
  //    Abweisung wie ein Flow der Plattform.
  const roleContextBase = { userId, roots: flow.ordner, slug: flowName, appId, stand };

  // 5. Lauf anlegen — ODER einen bereits angelegten weiterverwenden. Der
  //    Lauf-Verwalter (Schritt 12) legt den Lauf VOR dem Start an, damit seine
  //    ID sofort streambar ist, und reicht ihn hier herein.
  const run = existingRunId
    ? { id: existingRunId }
    : await store.createRun({ userId, flowName, appId, stand, arguments: werte });

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
    // Die Rollen erben den Zugang: ein Flow, der draußen rechnet, rechnet
    // auch in seinen Delegationen draußen. Eine Rolle mit EIGENEM Modell
    // (`rolle.modell`) fällt davon aus — sie nennt ein Modell dieses Geräts.
    extern,
    werkzeugRunden: flow.grenzen.werkzeug_runden,
    roleContextBase,
    stepRecorder,
    // Das Abbruch-Signal fließt mit in den Kontext, damit auch die
    // verschachtelten Rollen-Schleifen (Subagent) es prüfen und aufhören.
    signal,
    // Plan 023 I3: `frage_nutzer` braucht die Lauf-Nummer, um seine Frage
    // zuzuordnen. `onEvent` kommt gleich dazu, sobald `weiter` steht.
    runId: run.id,
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
      } else if (evt.type === 'gedanke') {
        // Der Gedankengang (Phase D4): was das Modell gesagt hat, BEVOR es ein
        // Werkzeug rief. Ein Schritt der Art `modell`, sofort geschlossen — er
        // hat keine Dauer, er ist eine Aussage. Er steht zwischen den
        // Werkzeug-Schritten und beantwortet in der Lauf-Ansicht die Frage,
        // die eine reine Werkzeug-Kette offenlässt: warum dieses Werkzeug.
        const step = await stepRecorder.beginnen({
          kind: 'modell',
          name: 'Gedankengang',
          modell: evt.modell || model,
        });
        await stepRecorder.abschliessen({ stepId: step.id, output: evt.content });
      }
    } catch (err) {
      // Das Mitschreiben darf einen laufenden Flow nie zum Absturz bringen.
      logger.warn(`Flow "${flowName}": Schritt konnte nicht gespeichert werden: ${err.message}`);
    }
    // Werkzeug-Ereignisse gehen als step_start/step_end raus (siehe
    // stepRecorder) — die rohen tool_*-Ereignisse hier NICHT doppelt senden.
    // `gedanke` ebenso wenig: er ist gerade als Schritt gemeldet worden.
    if (evt.type !== 'tool_start' && evt.type !== 'tool_result' && evt.type !== 'gedanke') {
      emitLive(evt);
    }
  };

  // Erst jetzt, weil `weiter` oben noch nicht stand (Plan 023 I3). Das
  // Werkzeug `frage_nutzer` schickt seine Frage hierüber an den Live-Kanal.
  context.onEvent = weiter;
  roleContextBase.onEvent = weiter;
  roleContextBase.runId = run.id;

  // 5b. Änderungs-Übersicht (Schritt 16): Nur wenn der Flow überhaupt Dateien
  //     verändern KANN (Schreib-Werkzeug oder Terminal), einen Abzug der Ordner
  //     VOR dem Lauf ziehen. Die Differenz zum Abzug NACH dem Lauf ist die
  //     Übersicht. Read-only-Flows (nur Web) tun das nie — kein Aufwand.
  //
  //     GRENZE, ehrlich benannt: Der Abzug-Vergleich nimmt an, dass NUR dieser
  //     Lauf die Ordner verändert. Griffe ein zweiter Lauf GLEICHZEITIG in
  //     denselben Ordner, schriebe die Differenz
  //     dessen Änderungen fälschlich diesem Lauf zu. In der Praxis selten (ein
  //     Flow arbeitet in seinem eigenen Ordner), aber es ist ein anderer
  //     Fehlerfall als der TOCTOU-Schutz der Datei-Werkzeuge — hier nicht gelöst.
  const erzeugtDokument = DOKUMENT_FORMATE.has(flow.ausgabe?.format);
  // Werkzeuge, die Dateien schreiben — ihre Ergebnisse sollen in der
  // Änderungs-Übersicht auftauchen.
  const SCHREIBENDE_WERKZEUGE = ['dateien_schreiben'];
  const verfolgtAenderungen =
    erzeugtDokument ||
    (Array.isArray(flow.werkzeuge) && flow.werkzeuge.some(w => SCHREIBENDE_WERKZEUGE.includes(w)));
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
    if (!startAbzug) {
      return;
    }
    try {
      const endAbzug = await tracker.snapshot(flow.ordner);
      const roh = tracker.berechneAenderungen(startAbzug, endAbzug, flow.ordner || []);
      const abgeschnitten = roh.abgeschnitten;
      // Die internen Felder root/rel (Gerätepfade) werden gestrichen.
      const aenderungen = roh.aenderungen.map(({ root: _root, rel: _rel, ...rest }) => rest);
      // Die Kürzung nicht still verschlucken (der Deckel greift erst bei sehr
      // vielen Datei-Änderungen, z. B. `npm install`): wenigstens im Log ehrlich
      // benennen, damit ein „nur 300 gelistet" nicht als vollständig missverstanden wird.
      if (abgeschnitten) {
        logger.warn(
          `Flow "${flowName}": Änderungs-Übersicht auf ${aenderungen.length} Einträge gekürzt, weitere ausgelassen.`
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
      // Die Betriebsart MUSS mit (Plan 023 I3, gefunden am 23.08.2026).
      //
      // `buildTools` laesst `frage_nutzer` in der Betriebsart `autonom`
      // absichtlich weg, und ohne diese Angabe ist die Vorgabe `autonom`. Ein
      // deterministischer Schritt mit `werkzeug: frage_nutzer` scheiterte
      // deshalb IMMER, auch in einem Flow mit `betriebsart: rueckfragen`:
      //
      //   Schritt "umfang" fehlgeschlagen:
      //   Werkzeug "frage_nutzer" ist nicht verfuegbar
      //
      // Damit war die Rueckfrage im deklarierten Schritt unerreichbar, also
      // genau der Weg, den das `angebot`-Beispiel geht. Der modellgetriebene
      // Pfad eine Zeile weiter oben reichte sie laengst durch.
      const [tool] = makeTools([werkzeug], { betriebsart: flow.betriebsart });
      if (!tool) {
        throw new ValidationError(
          `Werkzeug "${werkzeug}" ist nicht verfügbar` +
            (werkzeug === 'frage_nutzer' && flow.betriebsart !== 'rueckfragen'
              ? '. "frage_nutzer" braucht die Betriebsart "rueckfragen".'
              : '')
        );
      }
      ausgabe = String(await tool.execute(params, context));
    } catch (err) {
      // `laufBeendet` heisst: hier ist Schluss, aber nichts ist kaputt
      // (Phase C7, `services/flows/freigabeAnfragen.js`). Eine abgelehnte
      // oder abgelaufene Freigabe beendet den Lauf; sie als Fehler zu
      // protokollieren hiesse, im Protokoll nach einer Stoerung zu suchen,
      // wo ein Mensch nein gesagt hat.
      await stepRecorder.abschliessen({
        stepId: step.id,
        output: err.laufBeendet ? err.message : `Fehler: ${err.message}`,
        status: err.laufBeendet ? 'abgebrochen' : 'fehler',
      });
      throw err;
    }
    await stepRecorder.abschliessen({ stepId: step.id, output: ausgabe });
    return ausgabe;
  };

  // Ein Werkzeug, das WIRFT, laesst im modellgetriebenen Pfad seinen Schritt
  // offen: `weiter` legt ihn bei `tool_start` an und schliesst ihn bei
  // `tool_result` -- und das Ereignis bleibt aus, wenn das Werkzeug wirft. Die
  // Werkzeuge halten sich an die Regel „nie werfen"; seit Phase C7 gibt es
  // genau eine Ausnahme (`freigabe_anfordern`, wenn die Freigabe ausbleibt),
  // und ein Schritt, der fuer immer auf `laeuft` steht, waere die falsche
  // Erinnerung an einen Lauf, der laengst beendet ist.
  const offeneSchritteSchliessen = async (text, status) => {
    for (const stepId of offeneSchritte.values()) {
      try {
        await stepRecorder.abschliessen({ stepId, output: text, status });
      } catch (err) {
        logger.warn(`Flow "${flowName}": offener Schritt nicht abschliessbar: ${err.message}`);
      }
    }
    offeneSchritte.clear();
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
          extern,
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
          extern,
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
    await offeneSchritteSchliessen(
      err.laufBeendet ? err.message : `Fehler: ${err.message}`,
      err.laufBeendet ? 'abgebrochen' : 'fehler'
    );
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

  // 6a. Prüfschritt (Plan 014, Phase 2): Zwischen Entwurf und Ausgabe steht
  //     bei Dokument-Flows ein fester Prüfschritt — deterministische Checks,
  //     eine LLM-Prüfrunde gegen den Auftrag, höchstens eine Korrekturrunde.
  //     Getroffene Annahmen (statt Rückfragen) landen strukturiert am Lauf.
  //     Der Prüfschritt wirft nie: scheitert er selbst, läuft der Entwurf
  //     unverändert weiter und das Protokoll benennt das.
  let annahmen = null;
  if (erzeugtDokument && !ergebnis.aborted && !ergebnis.error && ergebnis.result) {
    try {
      const geprueft = await pruefe({
        markdown: ergebnis.result,
        flow,
        userInput,
        model,
        extern,
        context,
        signal,
        stepRecorder,
        runLoop,
      });
      ergebnis.result = geprueft.text;
      annahmen = geprueft.annahmen;
      if (annahmen.length > 0 && typeof onEvent === 'function') {
        try {
          onEvent({ type: 'annahmen', annahmen });
        } catch (err) {
          logger.warn(`Flow "${flowName}": onEvent(annahmen) warf: ${err.message}`);
        }
      }
    } catch (err) {
      logger.warn(`Flow "${flowName}": Prüfschritt fehlgeschlagen, Entwurf bleibt: ${err.message}`);
    }
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

  if (ergebnis.error) {
    await offeneSchritteSchliessen(
      ergebnis.laufBeendet ? ergebnis.error : `Fehler: ${ergebnis.error}`,
      ergebnis.laufBeendet ? 'abgebrochen' : 'fehler'
    );
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
    annahmen,
  });

  await aenderungenAbschliessen();

  return store.getRun({ runId: run.id, userId });
}

module.exports = {
  runFlow,
  resolveArguments,
  buildUserInput,
};
