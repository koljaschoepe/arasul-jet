/**
 * Werkzeug-Schleife für Flows (Plan 011, Schritt 10).
 *
 * Die Schleife ist an drei Stellen bewusst so aufgebaut:
 *
 *  1. WERKZEUGE: Sie kommen als fertige BaseTool-Instanzen herein (von
 *     toolRegistry.buildTools), nicht als Namen, die hier gegen eine feste
 *     Klassentabelle aufgelöst werden. Die Freigabe eines Flows ist damit
 *     schon getroffen, bevor die Schleife startet — sie führt nur aus, was sie
 *     bekommt.
 *
 *  2. GRENZEN pro Flow, nicht global: Runden (`maxRunden`) und Gesamt-Zeitlimit
 *     (`deadline`) stammen aus den Grenzen des Flows, nicht aus einer
 *     Umgebungsvariablen. Zwei Flows mit verschiedenen Grenzen laufen deshalb
 *     wirklich verschieden.
 *
 *  3. GPU-SPERRE: Jeder Modell-Aufruf geht durch dieselbe Sperre wie der Chat
 *     (gpuQueue). Nie treffen ein Chat- und ein Flow-Aufruf zugleich auf die
 *     GPU.
 *
 * Werkzeuge werfen NIE in die Schleife hinein — sie geben Fehler als kurzen Text
 * zurück (Konvention aus tools/*). Ein fehlgeschlagenes Werkzeug beendet also
 * die Werkzeug-Runde mit einer `tool`-Nachricht, nicht den ganzen Lauf.
 */

const axios = require('axios');
const services = require('../../config/services');
const logger = require('../../utils/logger');
const { withGpuLock } = require('./gpuQueue');
const { ServiceUnavailableError } = require('../../utils/errors');
const { parseTextToolCalls, enthaeltToolSyntax } = require('../llm/textToolCalls');

// Eine eigene Variable, und zwar seit dem 22.08.2026 wirklich eine eigene.
//
// Bis dahin teilte sich dieser Pfad `FLOW_LLM_TIMEOUT_MS` mit dem Chat-Agenten,
// und dieselbe Zahl bedeutete an beiden Stellen etwas ANDERES:
//
//   Chat  (`chatAgentRunner`): wie lange der Strom ZWISCHEN zwei Zeichen
//         stumm bleiben darf. Der Zaehler beginnt bei jedem Datenstueck neu.
//   Flow  (hier): das Zeitlimit des GANZEN Aufrufs. Der Aufruf laeuft mit
//         `stream: false`, es gibt keine Zwischenstuecke, und axios bricht
//         nach dieser Zeit ab.
//
// 120 Sekunden Stille zwischen zwei Zeichen sind grosszuegig. 120 Sekunden fuer
// eine ganze Antwort sind bei rund zehn Token je Sekunde etwa 1200 Token, und
// damit scheitert jeder Auftrag, der mehr verlangt.
//
// Am Orin gemessen: der `handbuch-bau`-Flow verlangt je Abschnitt "mindestens
// 80 Zeilen ausfuehrlichem HTML-Inhalt" in EINEM Werkzeugaufruf. Acht
// Delegationen liefen ins Zeitlimit, und die Datei blieb bei 373 Bytes.
// Dieselbe Rolle mit einem kleinen Auftrag arbeitete einwandfrei.
//
// Der Vorgabewert entspricht `FLOW_LLM_VORLAUF_TIMEOUT_MS`: dieselbe Maschine,
// dieselbe Groessenordnung. Die aeussere Grenze bleibt `zeitlimit_s` des Flows.
const CALL_TIMEOUT_MS = parseInt(process.env.FLOW_LLM_AUFRUF_TIMEOUT_MS || '300000', 10);

// Katalog-ID → Ollama-Name (z. B. 'qwen3:7b-q8' → 'qwen3:8b'). Der Standard-
// Modell-Weg liefert die KATALOG-ID; Ollama kennt aber nur seinen eigenen
// Namen — ohne dieses Mapping scheitert jeder Flow-Lauf mit dem
// Standardmodell an einem 404 (der Chat-Pfad mappt in llmOllamaStream längst).
// Gecacht, damit nicht jede Runde die DB fragt; bei DB-Fehlern bleibt der
// Name unverändert (rohe Ollama-Namen laufen so weiter durch).
const ollamaNameCache = new Map();
async function zuOllamaName(model) {
  if (!model) {
    return model;
  }
  if (ollamaNameCache.has(model)) {
    return ollamaNameCache.get(model);
  }
  let name = model;
  try {
    const database = require('../../database');
    const result = await database.query(
      `SELECT COALESCE(ollama_name, id) AS effektiv FROM llm_model_catalog WHERE id = $1`,
      [model]
    );
    if (result.rows.length > 0 && result.rows[0].effektiv) {
      name = result.rows[0].effektiv;
    }
  } catch {
    // Katalog nicht erreichbar (z. B. Tests) — Name unverändert verwenden.
  }
  ollamaNameCache.set(model, name);
  return name;
}

/** Nur für Tests: den Namens-Cache leeren. */
function _clearOllamaNameCache() {
  ollamaNameCache.clear();
}

/**
 * Ein Aufruf gegen ein EXTERNES, OpenAI-kompatibles Modell (Phase D4).
 *
 * OHNE GPU-SPERRE, und das ist der Sinn der Sache: dieses Modell rechnet
 * woanders. Die Sperre haelt genau eine Sache auseinander -- wer die GPU
 * dieses Geraets benutzt -- und ein Aufruf, der sie nicht anfasst, soll
 * niemanden aufhalten, der sie braucht.
 *
 * `/chat/completions` und nicht `/v1/chat/completions`: die `basis_url`
 * enthaelt das Versionsstueck bereits (`https://api.openai.com/v1`). So kann
 * ein Kunde auch ein Gateway anwaehlen, das seine Wege anders schneidet.
 *
 * Die Antwort wird auf die Form gebracht, die die Schleife von Ollama kennt
 * (`{content, tool_calls:[{function:{name, arguments}}]}`). OpenAI liefert die
 * Argumente als JSON-ZEICHENKETTE, Ollama als Objekt; die Schleife erwartet
 * ein Objekt, und diese Uebersetzung ist der einzige echte Unterschied
 * zwischen den beiden Protokollen an dieser Stelle.
 *
 * @param {{extern: {anbieter:string, modell:string, basisUrl:string, schluessel:string|null},
 *          messages: object[], tools: object[]}} was
 * @returns {Promise<object>} das `message`-Objekt, in Ollama-Form
 */
async function callExtern({ extern, messages, tools }) {
  const koepfe = { 'content-type': 'application/json' };
  if (extern.schluessel) {
    koepfe.authorization = `Bearer ${extern.schluessel}`;
  }
  const body = { model: extern.modell, messages, stream: false };
  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  let antwort;
  try {
    antwort = await axios.post(`${extern.basisUrl}/chat/completions`, body, {
      headers: koepfe,
      timeout: CALL_TIMEOUT_MS,
    });
  } catch (err) {
    // Der Schluessel darf in KEINER Fehlermeldung landen -- axios haengt die
    // Anfrage samt Koepfen an seinen Fehler, und der geht als Lauf-Fehler in
    // die Datenbank und in die Oberflaeche.
    const status = err.response?.status;
    throw new ServiceUnavailableError(
      `Das externe Modell ${extern.anbieter}/${extern.modell} antwortete nicht` +
        (status ? ` (HTTP ${status})` : ` (${err.code || 'keine Antwort'})`)
    );
  }

  const wahl = antwort.data?.choices?.[0]?.message || {};
  const aufrufe = Array.isArray(wahl.tool_calls) ? wahl.tool_calls : [];
  return {
    content: wahl.content || '',
    // `roh` ist die Antwort des Anbieters, unveraendert. Die Schleife schickt
    // sie WORTGLEICH als Assistenten-Zug zurueck: OpenAI verlangt an einem
    // `tool_calls` eine `id`, `type: 'function'` und Argumente als
    // ZEICHENKETTE. Die uebersetzte Ollama-Form hat nichts davon, und ein
    // Gespraech, das sie zurueckschickt, wird abgewiesen oder falsch
    // verstanden. Uebersetzt wird nur, was die SCHLEIFE liest.
    roh: wahl,
    ...(aufrufe.length > 0
      ? {
          tool_calls: aufrufe.map(a => ({
            id: a.id,
            function: {
              name: a.function?.name,
              arguments:
                typeof a.function?.arguments === 'string'
                  ? sicherGeparst(a.function.arguments)
                  : a.function?.arguments || {},
            },
          })),
        }
      : {}),
  };
}

/**
 * JSON aus einer Zeichenkette, ohne zu werfen. Ein Modell, das seine Argumente
 * kaputt formatiert, soll eine Werkzeug-Fehlermeldung bekommen und keinen
 * abgebrochenen Lauf -- dieselbe Linie wie beim Text-Fallback weiter unten.
 */
function sicherGeparst(text) {
  try {
    const wert = JSON.parse(text);
    return wert && typeof wert === 'object' ? wert : {};
  } catch {
    logger.warn('Flow-toolLoop: Werkzeug-Argumente des externen Modells sind kein JSON');
    return {};
  }
}

/**
 * Die Notbremse gegen ein SCHEMA an der Stelle eines Aufrufs (Phase H7).
 *
 * Am Orin gemessen (Werkstatt W4, 29.08.2026): das Standardmodell rief
 * `freigabe_anfordern` achtmal in drei Laeufen auf und schickte jedes Mal
 * nicht die Werte, sondern die Huelle darum:
 *
 *   {"type": "freigabe",
 *    "required": "[\"titel\", \"zusammenhang\"]",
 *    "properties": "{\"titel\": \"A-2026-0001 …\", \"zusammenhang\": \"…\"}"}
 *
 * Titel und Zusammenhang sind da, sie stehen nur eine Ebene zu tief und als
 * Zeichenkette. Das Werkzeug antwortete achtmal „Eine Freigabe braucht einen
 * Titel", das Modell schrieb im naechsten Gedankengang „Die Parameter-Struktur
 * war offenbar falsch angelegt" und schickte dieselbe Huelle noch einmal. Ein
 * ausdruecklicher Satz im Prompt hat daran nichts geaendert.
 *
 * ES IST EIN AUSPACKEN UND KEIN RATEN, und die Bedingung sagt das: nur wenn
 * unter `properties` ein Objekt liegt, das die Namen traegt, die das Werkzeug
 * WIRKLICH kennt, und wenn keiner dieser Namen schon oben steht. Traegt der
 * Aufruf oben auch nur einen richtigen Namen, ist er gemeint, wie er dasteht,
 * und diese Funktion laesst ihn in Ruhe. Ein Werkzeug, das selbst einen
 * Parameter `properties` fuehrt, ebenso.
 *
 * Der Lauf faehrt damit nicht achtmal gegen dieselbe Wand -- und in der
 * Lauf-Ansicht steht trotzdem, was ankam: `tool_start` meldet die Parameter
 * VOR dem Auspacken.
 *
 * @param {object} params was das Modell geschickt hat
 * @param {import('../../tools/baseTool')} [tool]
 * @returns {object} die Parameter, notfalls ausgepackt
 */
function schemaAuspacken(params, tool) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return params;
  }
  const bekannt = Object.keys(tool?.parameters || {});
  if (bekannt.length === 0 || bekannt.includes('properties')) {
    return params;
  }
  if (bekannt.some(name => name in params)) {
    return params;
  }
  let innen = params.properties;
  if (typeof innen === 'string') {
    try {
      innen = JSON.parse(innen);
    } catch {
      return params;
    }
  }
  if (!innen || typeof innen !== 'object' || Array.isArray(innen)) {
    return params;
  }
  if (!bekannt.some(name => name in innen)) {
    return params;
  }
  logger.warn(
    `Flow-toolLoop: "${tool.name}" bekam ein JSON-Schema statt der Werte; ` +
      `\`properties\` ausgepackt (${Object.keys(innen).join(', ')})`
  );
  return innen;
}

/**
 * Ein einzelner Modell-Aufruf. Lokal ueber /api/chat und die GPU-Sperre, oder
 * -- wenn der Administrator diesen Flow umgestellt hat (D4) -- gegen den
 * externen Anbieter.
 *
 * EINE WEICHE, und sie steht hier: jeder Modell-Aufruf eines Flows geht durch
 * diese Funktion, auch der einer Subagent-Rolle und der des Pruefschritts.
 * Stuende die Weiche weiter oben, gaebe es Pfade, die sie umgehen -- und ein
 * Flow, der halb draussen und halb hier rechnet, waere das Gegenteil einer
 * Entscheidung.
 *
 * @returns {Promise<object>} Das `message`-Objekt der Antwort.
 */
async function callOllama({ model, messages, tools, think = false, extern = null }) {
  if (extern) {
    return callExtern({ extern, messages, tools });
  }
  // `think: false` (Standard) schaltet den Reasoning-Trace „denkender" Modelle
  // (qwen3 & Co.) ab. Ein Flow FÜHRT AUS statt zu plaudern — der lange
  // Gedankengang bringt hier nichts, kostet aber ein Vielfaches: auf dem
  // Jetson braucht qwen3:14b mit Denken ~100 s je Aufruf, ohne ~8 s.
  // Der Chat-Agent kann Thinking für seine Subagenten gezielt anfordern
  // (Interview 2026-07-30) — der Aufrufer prüft die Modell-Fähigkeit.
  const body = { model: await zuOllamaName(model), messages, stream: false, think: think === true };
  if (tools && tools.length > 0) {
    body.tools = tools;
  }
  return withGpuLock(async () => {
    const response = await axios.post(services.llm.chatEndpoint, body, {
      timeout: CALL_TIMEOUT_MS,
    });
    return response.data?.message || {};
  });
}

/**
 * Treibt einen Flow-Lauf bis zur Antwort (oder bis eine Grenze greift).
 *
 * @param {object} args
 * @param {string} args.model
 * @param {object|null} [args.extern] - Zugang zu einem externen Modell (D4);
 *   gesetzt, laeuft JEDER Aufruf dieser Schleife dort statt auf der GPU.
 * @param {string} args.systemPrompt - Prompt mit bereits ersetzten Platzhaltern.
 * @param {string} args.userInput - Die Eingabe des Nutzers (Argument-Freitext o. Ä.).
 * @param {import('../../tools/baseTool')[]} args.tools - Fertige Werkzeug-Instanzen.
 * @param {number} args.maxRunden - Obergrenze der Werkzeug-Runden (grenzen.werkzeug_runden).
 * @param {number} args.zeitlimitS - Gesamt-Zeitlimit in Sekunden (grenzen.zeitlimit_s).
 * @param {object} args.context - Wird an jedes Werkzeug durchgereicht (roots, onChange, …).
 * @param {(evt:object)=>void} [args.onEvent] - Ereignis-Senke. Formen:
 *   {type:'tool_start', tool, params} · {type:'tool_result', tool, result} ·
 *   {type:'text', content} · {type:'done', result, truncated?} · {type:'error', message}
 * @param {() => number} [args.now] - Zeitquelle (für Tests); Standard Date.now.
 * @returns {Promise<{result:string, runden:number, truncated?:boolean, error?:string}>}
 */
async function runFlowLoop({
  model,
  extern = null,
  systemPrompt,
  userInput,
  tools = [],
  maxRunden = 10,
  zeitlimitS = 900,
  context = {},
  onEvent,
  now = () => Date.now(),
  signal,
  think = false,
} = {}) {
  // BEWUSST await: Der Ereignis-Handler schreibt jeden Schritt in den
  // Lauf-Speicher. Würde nicht gewartet, könnte ein `tool_result` eintreffen,
  // BEVOR das `tool_start` seinen Schritt angelegt hat (die DB-Schreibvorgänge
  // sind asynchron) — der Schritt bliebe dann als "laeuft" verwaist. Awaiten
  // serialisiert das Mitschreiben mit der Schleife und garantiert die
  // Reihenfolge start-vor-result.
  const emit = async evt => {
    if (typeof onEvent === 'function') {
      try {
        await onEvent(evt);
      } catch (err) {
        logger.warn(`Flow onEvent-Handler warf: ${err.message}`);
      }
    }
  };

  const deadline = now() + zeitlimitS * 1000;
  const toolByName = new Map(tools.map(t => [t.name, t]));
  const toolDefs = tools.map(t => t.toOllamaToolDefinition());

  const messages = [
    { role: 'system', content: systemPrompt || '' },
    { role: 'user', content: String(userInput || '') },
  ];

  try {
    // Höchstens EINE Wiederholung wegen unparsebarer Text-Tool-Syntax —
    // sonst könnte ein Modell, das das Format nie trifft, Runden verbrennen.
    let syntaxNachfass = 0;
    for (let runde = 0; runde < maxRunden; runde++) {
      // Abbruch VOR dem nächsten Modell-Aufruf prüfen: Ein laufender Flow soll
      // sich abbrechen lassen, ohne den teuren Modell-Aufruf noch zu starten.
      if (signal && signal.aborted) {
        const note = 'Abgebrochen.';
        await emit({ type: 'done', result: note, truncated: true, aborted: true });
        return { result: note, runden: runde, truncated: true, aborted: true };
      }
      // Zeitlimit VOR dem Aufruf prüfen: Ein einzelner Modell-Aufruf kann lang
      // sein; überschreiten wir die Frist schon vor dem nächsten, brechen wir
      // sauber ab, statt sie noch einmal zu reißen.
      if (now() >= deadline) {
        const note = `Abgebrochen: Zeitlimit von ${zeitlimitS}s erreicht.`;
        await emit({ type: 'done', result: note, truncated: true });
        return { result: note, runden: runde, truncated: true };
      }

      const message = await callOllama({ model, messages, tools: toolDefs, think, extern });
      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      let rundenContent = message.content || '';

      // Fallback: Werkzeug-Aufruf als TEXT (fehlendes <tool_call>-Tag →
      // Ollamas Parser greift nicht). Selbst parsen und normal ausführen,
      // statt das rohe XML als Flow-Ergebnis zu liefern. Nicht parsebare
      // Syntax bekommt EINE Nachfass-Runde im echten Werkzeug-Format.
      if (toolCalls.length === 0 && enthaeltToolSyntax(rundenContent)) {
        const geparst = parseTextToolCalls(rundenContent);
        if (geparst.calls.length > 0) {
          logger.info(
            `Flow-toolLoop: Text-Tool-Call-Fallback, ${geparst.calls.length} Aufruf(e) geparst`
          );
          toolCalls.push(...geparst.calls);
          rundenContent = geparst.rest;
        } else if (syntaxNachfass < 1) {
          syntaxNachfass += 1;
          logger.warn('Flow-toolLoop: Tool-Syntax im Text nicht parsebar, Nachfass-Runde');
          messages.push({ role: 'assistant', content: rundenContent });
          messages.push({
            role: 'user',
            content:
              'Dein letzter Werkzeug-Aufruf war fehlerhaft formatiert und wurde NICHT ausgeführt. ' +
              'Rufe das Werkzeug jetzt erneut auf, über die Werkzeug-Schnittstelle, nicht als Text.',
          });
          continue;
        }
      }

      if (toolCalls.length === 0) {
        await emit({ type: 'text', content: rundenContent });
        await emit({ type: 'done', result: rundenContent });
        return { result: rundenContent, runden: runde + 1 };
      }

      // DER GEDANKENGANG (Phase D4). Ruft das Modell ein Werkzeug auf, sagt es
      // fast immer auch, WARUM ("Ich hole zuerst den Bericht der Woche, dann
      // …"). Bis D4 fiel dieser Text hier lautlos weg: gemeldet wurde nur die
      // LETZTE Runde, die ohne Werkzeug-Aufruf. Damit stand in der Lauf-Ansicht
      // eine Kette von Werkzeugen ohne einen einzigen Satz dazu, und die Frage
      // "warum hat der Flow das getan" liess sich nicht beantworten.
      //
      // Ein eigenes Ereignis und nicht `text`: `text` ist die ANTWORT des
      // Laufs, dieses hier ist sein Weg dorthin. Der Runner schreibt es als
      // Schritt der Art `modell` mit (Migration 112 kennt sie seit jeher), der
      // Live-Kanal reicht es durch.
      if (rundenContent.trim()) {
        await emit({ type: 'gedanke', content: rundenContent, modell: model });
      }

      // Den Assistenten-Zug MIT seinen tool_calls festhalten, bevor die
      // Ergebnisse folgen — sonst versteht das Modell die tool-Antworten nicht.
      //
      // Bei einem EXTERNEN Modell geht die Antwort wortgleich zurueck (`roh`):
      // OpenAI verlangt an jedem `tool_calls` eine `id` und Argumente als
      // Zeichenkette, und beides geht in der uebersetzten Form verloren. Nur
      // wenn die Aufrufe nicht vom Modell selbst kamen, sondern aus dem
      // Text-Fallback darunter, ist die selbst gebaute Form die richtige.
      const vomModell = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
      messages.push(
        extern && vomModell && message.roh
          ? message.roh
          : { role: 'assistant', content: rundenContent, tool_calls: toolCalls }
      );

      for (const call of toolCalls) {
        const toolName = call.function?.name;
        const params = call.function?.arguments || {};
        // Gemeldet wird, was ANKAM, und ausgefuehrt, was gemeint war: das
        // Protokoll soll ein Schema an dieser Stelle zeigen, nicht verstecken.
        await emit({ type: 'tool_start', tool: toolName, params });

        const tool = toolByName.get(toolName);
        const argumente = schemaAuspacken(params, tool);
        let result;
        if (!tool) {
          // Das Modell hat ein Werkzeug erfunden, das der Flow nicht hat. Als
          // Text zurückmelden, statt zu werfen — das Modell kann es korrigieren.
          result = `Fehler: Werkzeug "${toolName}" steht diesem Flow nicht zur Verfügung.`;
        } else {
          try {
            result = await tool.execute(argumente, context);
          } catch (err) {
            // EINE Ausnahme von „Werkzeuge werfen nie in die Schleife hinein":
            // `laufBeendet` (Phase C7). Eine abgelehnte oder abgelaufene
            // Freigabe beendet den Lauf, und das Modell darf davon nichts als
            // Werkzeugantwort lesen -- es suchte sich sonst einen anderen Weg
            // zum selben Ziel, und genau den soll die Freigabe verhindern.
            // Der Lauf steht zu diesem Zeitpunkt bereits terminal in der
            // Datenbank (`freigabeAnfragen.beendeLauf`).
            if (err.laufBeendet) {
              throw err;
            }
            // Doppelter Boden: Sollte ein Werkzeug wider Erwarten doch werfen,
            // wird daraus eine Fehler-Nachricht, kein Lauf-Abbruch.
            logger.warn(`Flow-Werkzeug "${toolName}" warf: ${err.message}`);
            result = `Fehler bei "${toolName}": ${err.message}`;
          }
        }
        result = result == null ? '' : String(result);
        await emit({ type: 'tool_result', tool: toolName, result });
        // DIE ANTWORT SAGT, ZU WELCHEM AUFRUF SIE GEHOERT (Phase H7). Bis
        // dahin stand hier `{ role: 'tool', content }` und sonst nichts. Ein
        // Modell, das mehrere Werkzeuge kennt und in einer Runde zwei davon
        // ruft, kann eine solche Antwort keinem seiner Aufrufe zuordnen -- die
        // Rueckmeldung, an der es merken soll, dass sein Aufruf falsch geformt
        // war, geht damit verloren. Die Werkstatt hat am 29.08.2026 genau das
        // gesehen: achtmal derselbe Fehler, achtmal dieselbe falsche Form.
        //
        // Die beiden Protokolle nennen das Feld verschieden: Ollama
        // `tool_name`, OpenAI `tool_call_id` und `name`. Geschickt wird, was
        // das Gegenueber kennt -- ein fremdes Feld weist OpenAI ab.
        messages.push(
          extern
            ? { role: 'tool', tool_call_id: call.id, name: toolName, content: result }
            : { role: 'tool', tool_name: toolName, content: result }
        );
      }
    }

    const note = `Abgebrochen nach ${maxRunden} Werkzeug-Runden.`;
    await emit({ type: 'done', result: note, truncated: true });
    return { result: note, runden: maxRunden, truncated: true };
  } catch (err) {
    logger.error(`Flow-Lauf fehlgeschlagen: ${err.message}`);
    await emit({ type: 'error', message: err.message });
    // `laufBeendet` reicht mit nach oben (Phase C7): der Runner soll den
    // offenen Werkzeug-Schritt dann als `abgebrochen` schliessen und nicht als
    // `fehler`. Eine abgelehnte Freigabe ist keine Stoerung.
    return {
      result: '',
      runden: 0,
      error: err.message,
      ...(err.laufBeendet ? { laufBeendet: true, laufStatus: err.laufStatus } : {}),
    };
  }
}

module.exports = { runFlowLoop, callOllama, zuOllamaName, CALL_TIMEOUT_MS, _clearOllamaNameCache };
