/**
 * Chat-Agent (2026-07-28): die Werkzeugschleife der Flows im normalen Chat.
 *
 * Der Chat war reines Frage-Antwort-Streaming — er konnte weder Dateien
 * schreiben noch selbst suchen, und der fest verdrahtete RAG-Zitier-Modus
 * verweigerte Erstell-Aufgaben („Newsletter-Fall"). Ab jetzt läuft jede
 * Text-Nachricht als Agent-Lauf:
 *
 *  - Das Modell bekommt ECHTE Werkzeuge (Ollama function calling): Wissensraum-
 *    Suche, Projektablage lesen/schreiben/durchsuchen, Web, Subagent. Es ruft
 *    sie selbst auf, wann es sie braucht — einfache Fragen beantwortet es
 *    direkt, ohne Werkzeug-Runde.
 *  - Jede Runde streamt über /api/chat (stream:true): Antwort-Token gehen live
 *    als `response`-Events an den Client (dasselbe Protokoll wie bisher),
 *    Werkzeug-Aufrufe als `agent_step`-Events (kompakte Schritt-Zeilen im UI).
 *  - Geschriebene Ablage-Dateien werden erkannt und als `agent_datei`-Events
 *    gemeldet; der Verweis landet persistent an der Nachricht
 *    (chat_messages.datei), die Schritte in chat_messages.schritte.
 *  - Modelle ohne Tool-Unterstützung: der erste Ollama-Fehler „does not support
 *    tools" schaltet auf eine werkzeuglose Runde um — der Chat verhält sich
 *    dann wie bisher, statt zu scheitern.
 *
 * GPU: jeder Modell-Aufruf läuft durch dieselbe Sperre wie Flows und Alt-Chat
 * (gpuQueue) — nie zwei Aufrufe zugleich auf der GPU.
 */

const axios = require('axios');
const path = require('path');
const fs = require('fs/promises');
const services = require('../../config/services');
const logger = require('../../utils/logger');
const { withGpuLock } = require('../flows/gpuQueue');
const { zuOllamaName } = require('../flows/toolLoop');
const { buildTools } = require('../flows/toolRegistry');
const { RunLimits } = require('../flows/limits');
const projectService = require('../rag/projectService');
const { projektOrdner } = require('../projects/ablageService');
const { buildSystemPrompt } = require('./systemPromptBuilder');

const CALL_TIMEOUT_MS = parseInt(process.env.FLOW_LLM_TIMEOUT_MS || '120000', 10);
const MAX_RUNDEN = 8;
const ZEITLIMIT_S = 600;
const MAX_HISTORY_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 8000;
const KURZ_INPUT = 300;
const KURZ_OUTPUT = 500;

/** Werkzeuge des Chat-Agenten. Bewusst OHNE `terminal` — kein Shell-Zugriff aus dem Chat. */
const AGENT_WERKZEUGE = [
  'rag_suche',
  'dateien_lesen',
  'dateien_schreiben',
  'dateien_suchen',
  'web_suche',
  'web_lesen',
  'subagent',
];

/**
 * Eingebaute Subagenten-Rolle des Chats. Flows deklarieren Rollen pro Flow;
 * der Chat bringt EINE generische Recherche-Rolle mit — genug für „such mit
 * mehreren Subagenten", ohne eine eigene Rollen-Verwaltung aufzumachen.
 */
const AGENT_ROLLEN = [
  {
    name: 'rechercheur',
    prompt:
      'Du bist ein gründlicher Rechercheur. Erledige den Auftrag mit deinen ' +
      'Werkzeugen (Wissensraum-Suche, Web-Suche, Web-Lesen, Dateien lesen) und ' +
      'fasse die Ergebnisse knapp und faktentreu auf Deutsch zusammen. Keine Emojis.',
    werkzeuge: ['rag_suche', 'web_suche', 'web_lesen', 'dateien_lesen'],
    ergebnis: { felder: ['ergebnis'], max_zeichen: 4000 },
    modell: null,
  },
];

const AGENT_ANWEISUNG = `

## Arbeitsweise
Du bist der Arasul-Assistent mit Werkzeugen. Regeln:
1. Einfache Fragen und Gespräche beantwortest du DIREKT, ohne Werkzeug.
2. Fragen zu Dokumenten, Projekten oder Firmenwissen: nutze rag_suche und/oder dateien_lesen (die Projektablage), und verarbeite die Treffer frei als Material für deine Antwort.
3. Wenn der Nutzer ein Dokument oder eine Datei will (Newsletter, Webseite, Bericht, Liste …): erstelle den vollständigen Inhalt und speichere ihn mit dateien_schreiben. Wähle die Dateiendung passend zum Inhalt (.html für Webseiten, .md für Texte/Berichte, .csv für Tabellen, .txt/.json wo passend) und einen kurzen, sprechenden Dateinamen ohne Umlaute. In der Antwort danach: EIN kurzer Satz, was du gespeichert hast — den Dateiinhalt NICHT noch einmal wiederholen.
4. Für umfangreiche Recherchen kannst du mit subagent(rolle="rechercheur", auftrag=...) Teilaufgaben delegieren, auch mehrfach.
5. Erfinde keine Fakten. Wenn Werkzeuge nichts liefern, sag das ehrlich.
6. Antworte auf Deutsch, ohne Emojis (außer der Nutzer bittet darum).`;

/** Kürzt Werte für die persistierte Schritt-Liste (Kontext-/Speicherschutz). */
function kurz(wert, max) {
  const text = typeof wert === 'string' ? wert : JSON.stringify(wert ?? '');
  return text.length > max ? `${text.slice(0, max)} …` : text;
}

/**
 * Kürzt die Werkzeug-Parameter, behält aber die OBJEKT-Form — die UI baut
 * daraus die Schritt-Beschriftung („schreibt kunden/angebot.html").
 */
function kurzInput(input, maxJeWert) {
  if (!input || typeof input !== 'object') {
    return {};
  }
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    out[key] = typeof value === 'string' ? kurz(value, maxJeWert) : value;
  }
  return out;
}

/**
 * Eine Modell-Runde über /api/chat mit stream:true.
 * Antwort-Token fließen sofort über onToken; tool_calls werden gesammelt.
 * Inaktivitäts-Timeout statt Gesamt-Timeout: ein langsam tröpfelnder Stream
 * ist gesund, ein stiller Stream ist tot.
 *
 * @returns {Promise<{content:string, toolCalls:object[]}>}
 */
async function streamChatRound({ model, messages, tools, onToken }) {
  return withGpuLock(async () => {
    const body = { model, messages, stream: true, think: false };
    if (tools && tools.length > 0) {
      body.tools = tools;
    }
    const response = await axios.post(services.llm.chatEndpoint, body, {
      responseType: 'stream',
      timeout: 0,
    });

    return new Promise((resolve, reject) => {
      const stream = response.data;
      let buffer = '';
      let content = '';
      const toolCalls = [];
      let inactivity = null;
      let settled = false;

      const cleanup = () => {
        if (inactivity) {
          clearTimeout(inactivity);
          inactivity = null;
        }
        stream.removeAllListeners();
        stream.destroy();
      };
      const fail = err => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(err);
      };
      const armInactivity = () => {
        if (inactivity) {
          clearTimeout(inactivity);
        }
        inactivity = setTimeout(
          () =>
            fail(new Error(`Modell-Stream ${CALL_TIMEOUT_MS / 1000}s ohne Daten — abgebrochen`)),
          CALL_TIMEOUT_MS
        );
      };
      armInactivity();

      stream.on('data', chunk => {
        armInactivity();
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }
          let data;
          try {
            data = JSON.parse(line);
          } catch {
            continue; // unvollständige Zeile — bleibt im Buffer-Rest
          }
          if (data.error) {
            fail(new Error(String(data.error)));
            return;
          }
          const msg = data.message || {};
          if (msg.content) {
            content += msg.content;
            try {
              onToken(msg.content);
            } catch (err) {
              logger.warn(`Chat-Agent onToken warf: ${err.message}`);
            }
          }
          if (Array.isArray(msg.tool_calls)) {
            toolCalls.push(...msg.tool_calls);
          }
          if (data.done && !settled) {
            settled = true;
            cleanup();
            resolve({ content, toolCalls });
          }
        }
      });
      stream.on('error', err => fail(err));
      stream.on('end', () => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve({ content, toolCalls });
        }
      });
    });
  });
}

/** Ollama meldet fehlende Tool-Unterstützung als 400 mit dieser Formulierung. */
function istToolsNichtUnterstuetzt(err) {
  const text = `${err.message || ''} ${JSON.stringify(err.response?.data || '')}`.toLowerCase();
  return text.includes('does not support tools');
}

/**
 * Verarbeitet einen Chat-Job im Agent-Modus.
 * Gleicher Vertrag wie processChatJob: streamt Events an service.notifySubscribers,
 * persistiert über llmJobService (updateJobContent/completeJob).
 */
async function processAgentChatJob(ctx, job) {
  const { database, logger: log, llmJobService } = ctx.deps;
  const service = ctx.service;
  const { id: jobId, request_data: requestData, requested_model } = job;

  // --- Kontext: aktives Projekt, Ablage-Wurzel, Ziel-Ordner, Wissensräume ----
  const projectId = await projectService.getActiveProjectId();
  const spaceIds = projectId ? await projectService.getProjectSpaceIds(projectId) : [];
  const wurzel = await projektOrdner(projectId);
  let arbeitsOrdner = wurzel;
  let zielPrefix = '';
  if (requestData.ablage_ziel) {
    const ziel = path.join(wurzel, requestData.ablage_ziel);
    if (ziel.startsWith(wurzel + path.sep)) {
      await fs.mkdir(ziel, { recursive: true });
      arbeitsOrdner = ziel;
      zielPrefix = requestData.ablage_ziel.replace(/\/+$/, '');
    }
  }
  const roots = arbeitsOrdner === wurzel ? [wurzel] : [arbeitsOrdner, wurzel];

  const alleTools = buildTools(AGENT_WERKZEUGE);
  const toolByName = new Map(alleTools.map(t => [t.name, t]));
  const toolDefs = alleTools.map(t => t.toOllamaToolDefinition());

  // --- Schritt-Protokoll: live als SSE, am Ende persistiert -----------------
  const schritte = [];
  let schrittZaehler = 0;
  const dateien = [];
  const stepRecorder = {
    beginnen: async ({ kind, name = '', input = {}, parentStepId = null, modell = null }) => {
      schrittZaehler += 1;
      const step = {
        id: schrittZaehler,
        kind,
        name,
        input: kurzInput(input, KURZ_INPUT),
        parent_step_id: parentStepId,
        modell,
        status: 'laeuft',
      };
      schritte.push(step);
      service.notifySubscribers(jobId, { type: 'agent_step', phase: 'start', step });
      return step;
    },
    abschliessen: async ({ stepId, output = null, rawOutput: _raw = null, status = 'fertig' }) => {
      const step = schritte.find(s => s.id === stepId);
      if (step) {
        step.status = status;
        step.output = kurz(output ?? '', KURZ_OUTPUT);
        service.notifySubscribers(jobId, { type: 'agent_step', phase: 'end', step });
      }
      return step;
    },
  };

  const limits = new RunLimits({ maxAufrufe: 6, zeitlimitS: ZEITLIMIT_S, maxTiefe: 2 });
  const roleContextBase = { userId: job.user_id, roots, spaceIds, slug: 'chat-agent' };
  const context = {
    ...roleContextBase,
    rollen: AGENT_ROLLEN,
    limits,
    depth: 0,
    model: requested_model,
    werkzeugRunden: MAX_RUNDEN,
    roleContextBase,
    stepRecorder,
  };

  // --- System-Prompt (geschichtete Basis + Agent-Arbeitsweise) --------------
  // includeTools:false — der alte '## Tools'-Prompt-Text entfällt; der Agent
  // bekommt seine Werkzeuge STRUKTURELL über den tools-Parameter.
  const basisPrompt = await buildSystemPrompt(database, job.conversation_id, {
    includeTools: false,
  });
  let systemPrompt = (basisPrompt || '') + AGENT_ANWEISUNG;
  if (zielPrefix) {
    systemPrompt += `\n7. Zielordner des Nutzers: "${zielPrefix}" — dein Arbeitsverzeichnis zeigt bereits dorthin, schreibe Dateien einfach mit relativem Pfad.`;
  }
  if (requestData.datei_modus) {
    systemPrompt += `\n8. Der Nutzer hat den Datei-Modus aktiviert: erstelle für diese Anfrage IN JEDEM FALL eine Datei mit dateien_schreiben (passende Endung), und antworte danach nur mit einem kurzen Bestätigungssatz.`;
  }

  // --- Verlauf: letzte Nachrichten, hart gekappt ----------------------------
  const verlauf = (Array.isArray(requestData.messages) ? requestData.messages : [])
    .filter(
      m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .map(m => ({ role: m.role, content: kurz(m.content, MAX_MESSAGE_CHARS) }));
  const messages = [{ role: 'system', content: systemPrompt }, ...verlauf];

  const ollamaModel = await zuOllamaName(requested_model);

  // --- Token-Fluss: live an Client UND gebatcht in die DB -------------------
  let dbPuffer = '';
  let dbFlushTimer = null;
  const flushDb = async () => {
    if (!dbPuffer) {
      return;
    }
    const delta = dbPuffer;
    dbPuffer = '';
    try {
      await llmJobService.updateJobContent(jobId, delta, null);
    } catch (err) {
      log.warn(`[JOB ${jobId}] Agent-Content-Flush fehlgeschlagen: ${err.message}`);
    }
  };
  const onToken = token => {
    service.notifySubscribersBatched(jobId, { type: 'response', token });
    dbPuffer += token;
    if (!dbFlushTimer) {
      dbFlushTimer = setTimeout(() => {
        dbFlushTimer = null;
        void flushDb();
      }, 800);
    }
  };
  const separator = () => {
    // Zwischen Erzähl-Text einer Werkzeug-Runde und der Fortsetzung eine
    // Leerzeile — sonst klebt „Ich suche zunächst…Die Ergebnisse zeigen" zusammen.
    onToken('\n\n');
  };

  const deadline = Date.now() + ZEITLIMIT_S * 1000;
  let toolsAktiv = true;
  let fertigText = '';

  try {
    for (let runde = 0; runde < MAX_RUNDEN; runde++) {
      if (Date.now() >= deadline) {
        onToken(`\n\n_Abgebrochen: Zeitlimit von ${ZEITLIMIT_S}s erreicht._`);
        break;
      }

      let rundenErgebnis;
      try {
        rundenErgebnis = await streamChatRound({
          model: ollamaModel,
          messages,
          tools: toolsAktiv ? toolDefs : [],
          onToken,
        });
      } catch (err) {
        if (toolsAktiv && istToolsNichtUnterstuetzt(err)) {
          // Modell kann keine Werkzeuge — eine werkzeuglose Runde ist der
          // bisherige Chat. Einmal umschalten und weiter.
          log.info(
            `[JOB ${jobId}] Modell ${requested_model} ohne Tool-Support — Agent-Werkzeuge deaktiviert`
          );
          service.notifySubscribers(jobId, {
            type: 'warning',
            message: `Modell "${requested_model}" unterstützt keine Werkzeuge — Antwort ohne Agent-Funktionen.`,
            code: 'AGENT_TOOLS_UNSUPPORTED',
          });
          toolsAktiv = false;
          runde -= 1;
          continue;
        }
        throw err;
      }

      const { content, toolCalls } = rundenErgebnis;
      fertigText += content;

      if (!toolCalls.length) {
        break; // fertige Antwort — Token sind bereits gestreamt
      }

      messages.push({ role: 'assistant', content, tool_calls: toolCalls });
      if (content) {
        separator();
        fertigText += '\n\n';
      }

      for (const call of toolCalls) {
        const toolName = call.function?.name;
        let params = call.function?.arguments || {};
        if (typeof params === 'string') {
          try {
            params = JSON.parse(params);
          } catch {
            params = {};
          }
        }

        const istSubagent = toolName === 'subagent';
        let step = null;
        if (!istSubagent) {
          step = await stepRecorder.beginnen({
            kind: 'werkzeug',
            name: toolName || '',
            input: params,
          });
        }

        const tool = toolByName.get(toolName);
        let result;
        if (!tool) {
          result = `Fehler: Werkzeug "${toolName}" steht nicht zur Verfügung.`;
        } else {
          try {
            result = await tool.execute(params, context);
          } catch (err) {
            log.warn(`[JOB ${jobId}] Agent-Werkzeug "${toolName}" warf: ${err.message}`);
            result = `Fehler bei "${toolName}": ${err.message}`;
          }
        }
        result = result == null ? '' : String(result);

        if (step) {
          await stepRecorder.abschliessen({
            stepId: step.id,
            output: result,
            status: result.startsWith('Fehler') ? 'fehler' : 'fertig',
          });
        }

        // Geschriebene Ablage-Datei → Datei-Karte (live + persistiert).
        if (toolName === 'dateien_schreiben' && /^Datei "/.test(result) && params.pfad) {
          const relPfad = zielPrefix
            ? path.posix.join(zielPrefix, String(params.pfad))
            : String(params.pfad);
          const datei = {
            art: 'projektdatei',
            project_id: projectId,
            pfad: relPfad,
            name: path.posix.basename(relPfad),
          };
          dateien.push(datei);
          service.notifySubscribers(jobId, { type: 'agent_datei', datei });
        }

        messages.push({ role: 'tool', content: result });
      }
    }
  } catch (err) {
    // Fehler NACH gestreamtem Inhalt: sauber abschließen statt werfen — der
    // Nutzer soll den bisherigen Text behalten. Ohne Inhalt: werfen, die Queue
    // markiert den Job als Fehler.
    if (dbFlushTimer) {
      clearTimeout(dbFlushTimer);
      dbFlushTimer = null;
    }
    if (!fertigText && !dbPuffer) {
      throw err;
    }
    log.error(`[JOB ${jobId}] Agent-Lauf nach Teilantwort gescheitert: ${err.message}`);
    onToken(`\n\n_Abgebrochen: ${err.message}_`);
  }

  // --- Abschluss: Inhalt + Schritte + Dateien persistieren ------------------
  if (dbFlushTimer) {
    clearTimeout(dbFlushTimer);
    dbFlushTimer = null;
  }
  await flushDb();

  let persisted = false;
  try {
    persisted = await llmJobService.completeJob(jobId);
  } catch (err) {
    log.error(`[JOB ${jobId}] completeJob (Agent) fehlgeschlagen: ${err.message}`);
    try {
      await new Promise(r => {
        setTimeout(r, 2000);
      });
      persisted = await llmJobService.completeJob(jobId);
    } catch (retryErr) {
      log.error(`[JOB ${jobId}] completeJob (Agent) Retry fehlgeschlagen: ${retryErr.message}`);
    }
  }

  // Schritte/Datei an der persistierten Nachricht nachtragen. `datei` bleibt
  // beim Format aus Migration 127: EIN Objekt oder eine Liste (JSONB trägt beides).
  if (schritte.length > 0 || dateien.length > 0) {
    try {
      const jobRow = await database.query(`SELECT message_id FROM llm_jobs WHERE id = $1`, [jobId]);
      const messageId = jobRow.rows[0]?.message_id;
      if (messageId) {
        const dateiWert = dateien.length === 0 ? null : dateien.length === 1 ? dateien[0] : dateien;
        await database.query(
          `UPDATE chat_messages SET schritte = $1, datei = COALESCE($2, datei) WHERE id = $3`,
          [JSON.stringify(schritte), dateiWert ? JSON.stringify(dateiWert) : null, messageId]
        );
      }
    } catch (err) {
      log.warn(`[JOB ${jobId}] Schritte/Datei nicht persistiert: ${err.message}`);
    }
  }

  service.notifySubscribers(jobId, {
    done: true,
    persisted,
    model: requested_model || 'unknown',
    jobId,
    agent: true,
    schritte,
    datei: dateien.length === 0 ? null : dateien.length === 1 ? dateien[0] : dateien,
    timestamp: new Date().toISOString(),
  });

  const { onJobComplete } = require('./llmOllamaStream');
  onJobComplete(ctx, jobId);
}

module.exports = { processAgentChatJob, AGENT_WERKZEUGE, AGENT_ROLLEN, streamChatRound };
