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
const { projektOrdner, listTree } = require('../projects/ablageService');
const { ensureFlowSandbox } = require('../flows/sandboxResolve');
const { buildSystemPrompt } = require('./systemPromptBuilder');

const CALL_TIMEOUT_MS = parseInt(process.env.FLOW_LLM_TIMEOUT_MS || '120000', 10);
// Kein praktisches Zeitlimit mehr (Interview 2026-07-29: „Unbegrenzt +
// Abbruch-Knopf") — die Grenze ist der Nutzer-Abbruch; die Zahlen hier sind
// nur Notbremsen gegen Endlosschleifen.
const MAX_RUNDEN = 64;
const ZEITLIMIT_S = 24 * 60 * 60;
const MAX_HISTORY_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 8000;
const KURZ_INPUT = 300;
const KURZ_OUTPUT = 500;
/** Wie oft der Lauf nachschaut, ob der Nutzer abgebrochen hat. */
const ABBRUCH_POLL_MS = 2000;
/** Struktur-Übersicht im Systemprompt: höchstens so viele Einträge. */
const STRUKTUR_MAX_EINTRAEGE = 120;

/** Werkzeuge des Chat-Agenten. `terminal` läuft projektbeschränkt im Flow-Sandbox-Container. */
const AGENT_WERKZEUGE = [
  'rag_suche',
  'dateien_lesen',
  'dateien_schreiben',
  'dateien_suchen',
  'web_suche',
  'web_lesen',
  'terminal',
  'subagent',
];

/**
 * Die Rollen-Riege des Orchestrators (Interview 2026-07-29). Flows deklarieren
 * Rollen pro Flow; der Chat bringt vier feste mit — kleine Modelle arbeiten
 * mit enger Rollenbeschreibung nachweislich fokussierter.
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
  {
    name: 'autor',
    prompt:
      'Du bist ein sorgfältiger Autor. Erstelle oder überarbeite die im Auftrag ' +
      'genannten Dateien VOLLSTÄNDIG mit dateien_schreiben (passende Endung: .html ' +
      'für Webseiten, .md für Texte, .csv für Tabellen; kurzer Dateiname ohne ' +
      'Umlaute). Nutze mitgeliefertes Material und rag_suche/dateien_lesen als ' +
      'Quelle — erfinde keine Fakten. Antworte am Ende nur mit einem Satz, was du ' +
      'geschrieben hast. Deutsch, keine Emojis.',
    werkzeuge: ['rag_suche', 'dateien_lesen', 'dateien_schreiben', 'dateien_suchen'],
    ergebnis: { felder: ['ergebnis'], max_zeichen: 2000 },
    modell: null,
  },
  {
    name: 'pruefer',
    prompt:
      'Du bist ein strenger Prüfer. Lies die im Auftrag genannten Dateien mit ' +
      'dateien_lesen und beurteile NUR, ob sie den Auftrag erfüllen (vollständig, ' +
      'echter Inhalt statt Platzhalter, Quellen genutzt). Beginne deine Antwort ' +
      'EXAKT mit "OK" wenn alles passt, sonst mit "MANGEL:" gefolgt von den ' +
      'konkreten Problemen. Deutsch, keine Emojis.',
    werkzeuge: ['dateien_lesen', 'dateien_suchen', 'rag_suche'],
    ergebnis: { felder: ['ergebnis'], max_zeichen: 2000 },
    modell: null,
  },
  {
    name: 'entwickler',
    prompt:
      'Du bist ein Entwickler. Schreibe Code-Dateien mit dateien_schreiben und ' +
      'FÜHRE sie mit terminal AUS, um sie zu prüfen (z. B. "python3 skript.py", ' +
      '"node app.js"). Behebe Fehler, bis der Befehl sauber läuft. Antworte am ' +
      'Ende nur mit einem Satz zum Ergebnis inkl. des Prüf-Befehls. Deutsch, keine Emojis.',
    werkzeuge: ['dateien_lesen', 'dateien_schreiben', 'dateien_suchen', 'terminal'],
    ergebnis: { felder: ['ergebnis'], max_zeichen: 2000 },
    modell: null,
  },
];

const AGENT_ANWEISUNG = `

## Arbeitsweise
Du bist der Arasul-Orchestrator mit Werkzeugen und Subagenten. Regeln:
1. Einfache Fragen und Gespräche beantwortest du DIREKT, ohne Werkzeug.
2. Nutze die Struktur-Übersicht des Projektordners (unten): lies relevante Dateien mit dateien_lesen, bevor du antwortest oder etwas erstellst, und lege neue Dateien in den passenden Ordner (relativer Pfad, z. B. "kunden/angebot.html").
3. Fragen zu Dokumenten, Projekten oder Firmenwissen: nutze rag_suche und/oder dateien_lesen und verarbeite die Treffer frei als Material. PDF/DOCX und andere Binärdateien liest du NICHT mit dateien_lesen — ihren INHALT holst du mit rag_suche (inhaltliche Frage stellen).
4. Wenn der Nutzer ein Dokument oder eine Datei will (Newsletter, Webseite, Bericht, Liste …): erstelle den vollständigen Inhalt und speichere ihn mit dateien_schreiben (.html für Webseiten, .md für Texte/Berichte, .csv für Tabellen; kurzer Dateiname ohne Umlaute). Danach: EIN kurzer Satz, was du gespeichert hast — den Dateiinhalt NICHT wiederholen.
5. Zerlege größere Aufträge und delegiere an Subagenten, auch mehrfach parallel nacheinander: subagent(rolle="rechercheur", auftrag=…) sammelt Material, rolle="autor" schreibt Dateien aus Material, rolle="entwickler" schreibt UND testet Code per Terminal, rolle="pruefer" kontrolliert Ergebnisse. Gib jedem Subagenten einen präzisen, in sich vollständigen Auftrag inklusive Zielpfad.
6. Mit terminal kannst du selbst Befehle im Projektordner ausführen (Skripte testen, Dateien umwandeln, Pakete bauen).
7. Erfinde keine Fakten. Wenn Werkzeuge nichts liefern, sag das ehrlich.
8. Antworte auf Deutsch, ohne Emojis (außer der Nutzer bittet darum).`;

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
async function streamChatRound({ model, messages, tools, onToken, signal }) {
  return withGpuLock(async () => {
    if (signal?.aborted) {
      throw new Error('Vom Nutzer abgebrochen');
    }
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

      const onAbort = () => fail(new Error('Vom Nutzer abgebrochen'));
      const cleanup = () => {
        if (inactivity) {
          clearTimeout(inactivity);
          inactivity = null;
        }
        signal?.removeEventListener('abort', onAbort);
        stream.removeAllListeners();
        stream.destroy();
      };
      signal?.addEventListener('abort', onAbort, { once: true });
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
  // Scope der Wissensraum-Suche: ein per Drag gesetzter Ordner-Fokus
  // (space_ids) hat Vorrang; sonst alle Ordner des aktiven Projekts. NIE mit
  // leerer Liste weiterarbeiten — rag_suche behandelt [] als „ohne Filter"
  // und suchte dann über ALLE Räume (RAG-Isolationsregel). Der Sentinel hält
  // ein ordnerloses Projekt auf sich selbst gescopt (wie routes/rag.js).
  const EMPTY_SCOPE_SENTINEL = '00000000-0000-0000-0000-000000000000';
  let spaceIds =
    Array.isArray(requestData.space_ids) && requestData.space_ids.length > 0
      ? requestData.space_ids
      : projectId
        ? await projectService.getProjectSpaceIds(projectId)
        : [];
  if (spaceIds.length === 0) {
    spaceIds = [EMPTY_SCOPE_SENTINEL];
  }
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

  // Abbruch-Knopf: Der Nutzer kann den Lauf jederzeit stoppen (DELETE
  // /llm/jobs/:id setzt status='cancelled'). Ein Poller sieht das und reißt
  // über das Signal den laufenden Modell-Stream und alle Subagenten mit ab.
  const abbruch = new AbortController();
  let abgebrochen = false;
  abbruch.signal.addEventListener('abort', () => {
    abgebrochen = true;
  });
  // Sofort-Weg: die Abbruch-Route feuert registrierte AbortController direkt.
  if (typeof llmJobService.registerStream === 'function') {
    llmJobService.registerStream(jobId, abbruch);
  }
  // Fallback-Weg: falls die Registrierung verloren geht (Prozess-Neustart der
  // Route o. Ä.), sieht der Poller den 'cancelled'-Status in der DB.
  const abbruchPoller = setInterval(() => {
    database
      .query('SELECT status FROM llm_jobs WHERE id = $1', [jobId])
      .then(r => {
        if (r.rows[0]?.status === 'cancelled' && !abgebrochen) {
          abbruch.abort();
        }
      })
      .catch(() => {});
  }, ABBRUCH_POLL_MS);
  abbruchPoller.unref?.();

  const limits = new RunLimits({ maxAufrufe: 40, zeitlimitS: ZEITLIMIT_S, maxTiefe: 2 });
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
    signal: abbruch.signal,
  };

  // Terminal projektbeschränkt: Der Flow-Sandbox-Container wird erst
  // bereitgestellt, wenn wirklich ein Befehl laufen soll — einfache Chats
  // zahlen keinen Docker-Aufwand. Einmal aufgebaut, erben Subagenten den
  // Container über roleContextBase (gleiche Objekt-Referenz).
  let terminalBereit = null;
  const stelleTerminalBereit = async () => {
    if (context.containerId) {
      return;
    }
    if (!terminalBereit) {
      terminalBereit = ensureFlowSandbox([wurzel]).then(sb => {
        context.containerId = sb.containerId;
        context.cwd = sb.cwd;
        roleContextBase.containerId = sb.containerId;
        roleContextBase.cwd = sb.cwd;
      });
    }
    await terminalBereit;
  };

  // --- System-Prompt (geschichtete Basis + Agent-Arbeitsweise) --------------
  // includeTools:false — der alte '## Tools'-Prompt-Text entfällt; der Agent
  // bekommt seine Werkzeuge STRUKTURELL über den tools-Parameter.
  const basisPrompt = await buildSystemPrompt(database, job.conversation_id, {
    includeTools: false,
  });
  let systemPrompt = (basisPrompt || '') + AGENT_ANWEISUNG;

  // Orchestrator-Protokoll (Interview 2026-07-29): Die Ordnerstruktur des
  // Projekts kommt IMMER in den Kontext — der Server erzwingt das, statt zu
  // hoffen, dass ein 7B-Modell von sich aus nachschaut. So weiß der Agent,
  // was existiert und wohin neue Dateien gehören.
  try {
    const { eintraege, gekuerzt } = await listTree(projectId);
    if (eintraege.length > 0) {
      const zeilen = eintraege
        .slice(0, STRUKTUR_MAX_EINTRAEGE)
        .map(e => (e.typ === 'ordner' ? `${e.pfad}/` : e.pfad));
      const rest = eintraege.length - zeilen.length;
      systemPrompt +=
        `\n\n## Projektordner (Struktur)\n` +
        zeilen.join('\n') +
        (rest > 0 || gekuerzt ? `\n… (${rest > 0 ? rest : 'weitere'} Einträge ausgelassen)` : '');
    } else {
      systemPrompt += `\n\n## Projektordner (Struktur)\n(leer)`;
    }
  } catch (err) {
    log.warn(`[JOB ${jobId}] Struktur-Übersicht fehlgeschlagen: ${err.message}`);
  }
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
  let pruefungGemacht = false;

  /**
   * Lässt die pruefer-Rolle das Ergebnis gegen den Auftrag prüfen.
   * @returns {Promise<string|null>} Mängel-Text oder null (in Ordnung/Prüfung unmöglich).
   */
  const pruefeErgebnis = async antwortText => {
    const subagentTool = toolByName.get('subagent');
    if (!subagentTool) {
      return null;
    }
    const dateiListe = dateien.map(x => x.pfad).join(', ');
    const auftrag =
      `Auftrag des Nutzers: "${kurz(letzteNachricht, 600)}". ` +
      `Erstellte Datei(en): ${dateiListe}. ` +
      `Kurzfassung der Antwort: "${kurz(antwortText || '', 300)}". ` +
      'Lies die Datei(en) und prüfe, ob sie den Auftrag erfüllen.';
    try {
      const urteil = String(await subagentTool.execute({ rolle: 'pruefer', auftrag }, context));
      return /MANGEL/i.test(urteil) && !/^\s*OK\b/.test(urteil) ? urteil : null;
    } catch (err) {
      log.warn(`[JOB ${jobId}] Prüf-Schritt fehlgeschlagen: ${err.message}`);
      return null;
    }
  };

  // Erzwungener Plan-Schritt (Orchestrator-Protokoll): Bei erkennbar
  // komplexen Aufträgen plant das Modell ERST in einer werkzeuglosen Runde —
  // der Plan wird als Schritt-Zeile gezeigt und bindet die Arbeitsrunden.
  // Kleine Modelle überspringen sonst Recherche und erfinden Inhalte.
  const letzteNachricht = String(verlauf[verlauf.length - 1]?.content || '');
  const istKomplex =
    requestData.datei_modus ||
    letzteNachricht.length > 280 ||
    /erstell|schreib|generier|entwickl|entwirf|bau(e|t)?\b|recherchier|analysier|zusammenfass|überarbeit|newsletter|webseite|bericht|dokument|skript|subagent/i.test(
      letzteNachricht
    );

  try {
    if (istKomplex && toolsAktiv && !abgebrochen) {
      const planStep = await stepRecorder.beginnen({ kind: 'plan', name: 'plan', input: {} });
      try {
        const planErgebnis = await streamChatRound({
          model: ollamaModel,
          messages: [
            ...messages,
            {
              role: 'user',
              content:
                'Erstelle ZUERST einen knappen nummerierten Plan (3-6 Schritte) für diesen ' +
                'Auftrag: welche Werkzeuge/Subagenten du nutzt, welche Quellen du liest, ' +
                'welche Dateien du wohin schreibst. NUR den Plan, keine Ausführung.',
            },
          ],
          tools: [],
          onToken: () => {}, // Plan läuft still — er erscheint als Schritt, nicht als Antwort
          signal: abbruch.signal,
        });
        const plan = (planErgebnis.content || '').trim();
        await stepRecorder.abschliessen({ stepId: planStep.id, output: plan || '(kein Plan)' });
        if (plan) {
          messages.push({ role: 'assistant', content: `Mein Plan:\n${plan}` });
          messages.push({
            role: 'user',
            content: 'Gut. Führe den Plan jetzt vollständig aus.',
          });
        }
      } catch (err) {
        await stepRecorder.abschliessen({
          stepId: planStep.id,
          output: `Fehler: ${err.message}`,
          status: 'fehler',
        });
        if (abgebrochen) {
          throw err;
        }
        if (istToolsNichtUnterstuetzt(err)) {
          toolsAktiv = false;
        }
      }
    }

    for (let runde = 0; runde < MAX_RUNDEN; runde++) {
      if (abgebrochen) {
        break;
      }
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
          signal: abbruch.signal,
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
        // Erzwungener Prüf-Schritt (Orchestrator-Protokoll): Bevor eine Antwort
        // mit erstellten Dateien als fertig gilt, kontrolliert die pruefer-Rolle
        // das Ergebnis. Findet sie Mängel, bekommt das Modell GENAU EINE
        // Korrektur-Schleife — dieselben Runden, dieselben Werkzeuge.
        if (!pruefungGemacht && dateien.length > 0 && toolsAktiv && !abgebrochen) {
          pruefungGemacht = true;
          const mangel = await pruefeErgebnis(content);
          if (mangel) {
            messages.push({ role: 'assistant', content });
            messages.push({
              role: 'user',
              content:
                `Ein automatischer Prüfer hat Mängel gefunden:\n${kurz(mangel, 1500)}\n` +
                'Behebe sie jetzt: überschreibe die betroffenen Dateien mit dateien_schreiben ' +
                'und bestätige danach mit einem Satz.',
            });
            separator();
            fertigText += '\n\n';
            continue;
          }
        }
        break; // fertige Antwort — Token sind bereits gestreamt
      }

      messages.push({ role: 'assistant', content, tool_calls: toolCalls });
      if (content) {
        separator();
        fertigText += '\n\n';
      }

      for (const call of toolCalls) {
        if (abgebrochen) {
          break;
        }
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
            // Terminal (auch für die entwickler-Rolle) braucht den
            // projektbeschränkten Sandbox-Container — erst beim ersten Bedarf.
            if (toolName === 'terminal' || (istSubagent && params.rolle === 'entwickler')) {
              await stelleTerminalBereit();
            }
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

        // Geschriebene Ablage-Datei → Datei-Karte (live + persistiert). Nur für
        // saubere RELATIVE Pfade — ein absoluter Pfad (zeigt auf roots[1])
        // ließe die Karte auf einen falsch zusammengesetzten Pfad zeigen.
        const pfadStr = String(params.pfad || '');
        if (
          toolName === 'dateien_schreiben' &&
          /^Datei "/.test(result) &&
          pfadStr &&
          !path.isAbsolute(pfadStr) &&
          !pfadStr.split('/').includes('..')
        ) {
          const relPfad = zielPrefix ? path.posix.join(zielPrefix, pfadStr) : pfadStr;
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
    if (dbFlushTimer) {
      clearTimeout(dbFlushTimer);
      dbFlushTimer = null;
    }
    if (abgebrochen) {
      // Nutzer-Abbruch ist kein Fehler: bisherigen Text und Schritte behalten.
      log.info(`[JOB ${jobId}] Agent-Lauf vom Nutzer abgebrochen`);
      onToken('\n\n_Abgebrochen._');
    } else if (!fertigText && !dbPuffer) {
      // Fehler VOR jedem Inhalt: werfen, die Queue markiert den Job als Fehler.
      clearInterval(abbruchPoller);
      throw err;
    } else {
      // Fehler NACH gestreamtem Inhalt: sauber abschließen statt werfen — der
      // Nutzer soll den bisherigen Text behalten.
      log.error(`[JOB ${jobId}] Agent-Lauf nach Teilantwort gescheitert: ${err.message}`);
      onToken(`\n\n_Abgebrochen: ${err.message}_`);
    }
  } finally {
    clearInterval(abbruchPoller);
  }

  // --- Abschluss: Inhalt + Schritte + Dateien persistieren ------------------
  if (dbFlushTimer) {
    clearTimeout(dbFlushTimer);
    dbFlushTimer = null;
  }
  await flushDb();

  let persisted = false;
  if (abgebrochen) {
    // Der Job steht bereits auf 'cancelled' (Abbruch-Route) — completeJob
    // würde den Status überschreiben. Inhalt/Schritte sind trotzdem gesichert.
    persisted = true;
  } else {
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
  }

  // Schritte/Datei an der persistierten Nachricht nachtragen. `datei` bleibt
  // beim Format aus Migration 127: EIN Objekt oder eine Liste (JSONB trägt beides).
  // Bei Nutzer-Abbruch zusätzlich den Teiltext sichern — completeJob (das ihn
  // sonst überträgt) läuft dann nicht.
  if (schritte.length > 0 || dateien.length > 0 || (abgebrochen && fertigText)) {
    try {
      const jobRow = await database.query(`SELECT message_id FROM llm_jobs WHERE id = $1`, [jobId]);
      const messageId = jobRow.rows[0]?.message_id;
      if (messageId) {
        const dateiWert = dateien.length === 0 ? null : dateien.length === 1 ? dateien[0] : dateien;
        await database.query(
          `UPDATE chat_messages SET schritte = $1, datei = COALESCE($2, datei) WHERE id = $3`,
          [JSON.stringify(schritte), dateiWert ? JSON.stringify(dateiWert) : null, messageId]
        );
        if (abgebrochen && fertigText) {
          await database.query(
            `UPDATE chat_messages SET content = $1, status = 'completed' WHERE id = $2`,
            [`${fertigText}\n\n_Abgebrochen._`, messageId]
          );
        }
      }
    } catch (err) {
      log.warn(`[JOB ${jobId}] Schritte/Datei nicht persistiert: ${err.message}`);
    }
  }

  service.notifySubscribers(jobId, {
    done: true,
    persisted,
    cancelled: abgebrochen || undefined,
    model: requested_model || 'unknown',
    jobId,
    agent: true,
    schritte,
    datei: dateien.length === 0 ? null : dateien.length === 1 ? dateien[0] : dateien,
    timestamp: new Date().toISOString(),
  });

  // Ein-Ordner-Modell: was der Agent geschrieben hat, sofort in den
  // Wissens-Spiegel übernehmen (statt auf den nächsten Sync-Takt zu warten).
  if (projectId) {
    require('../projects/ordnerSyncService').trigger(projectId);
  }

  const { onJobComplete } = require('./llmOllamaStream');
  onJobComplete(ctx, jobId);
}

module.exports = { processAgentChatJob, AGENT_WERKZEUGE, AGENT_ROLLEN, streamChatRound };
