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
const agentConfig = require('./agentConfig');
const { parseTextToolCalls, enthaeltToolSyntax } = require('./textToolCalls');
const { TodoListeTool, todoErinnerung } = require('./agentTodoTool');

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
/** Korrektur-Zyklen: Prüf-Gate und Ankündigungs-Wächter dürfen MEHRFACH greifen
 * (Harness v2) — ein echter Entwurf-Prüfung-Korrektur-Kreis braucht mehr als
 * die eine Runde von früher. Hart gedeckelt gegen Endlos-Pingpong. */
const MAX_PRUEF_ZYKLEN = 2;
const MAX_NACHFASS_ZYKLEN = 2;

/** Werkzeuge des Chat-Agenten. `terminal` läuft projektbeschränkt im Flow-Sandbox-Container. */
const AGENT_WERKZEUGE = [
  'rag_suche',
  'dateien_lesen',
  'dateien_schreiben',
  'dateien_bearbeiten',
  'dateien_anhaengen',
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
      'genannten Dateien VOLLSTÄNDIG mit deinen Schreib-Werkzeugen (passende Endung: ' +
      '.html für Webseiten, .md für Texte, .csv für Tabellen; kurzer Dateiname ohne ' +
      'Umlaute). Speichere unter EXAKT dem im Auftrag genannten Pfad/Dateinamen — ' +
      'erfinde keine zusätzlichen Ordner. Lange Dokumente baust du abschnittsweise: erst dateien_schreiben mit ' +
      'dem Anfang, dann Abschnitt für Abschnitt dateien_anhaengen. Gezielte Änderungen ' +
      'machst du mit dateien_bearbeiten statt alles neu zu schreiben. Nutze ' +
      'mitgeliefertes Material und rag_suche/dateien_lesen als Quelle — erfinde keine ' +
      'Fakten. Antworte am Ende nur mit einem Satz, was du geschrieben hast. Deutsch, keine Emojis.',
    werkzeuge: [
      'rag_suche',
      'dateien_lesen',
      'dateien_schreiben',
      'dateien_bearbeiten',
      'dateien_anhaengen',
      'dateien_suchen',
    ],
    ergebnis: { felder: ['ergebnis'], max_zeichen: 2000 },
    modell: null,
    schreibend: true,
  },
  {
    name: 'pruefer',
    prompt:
      'Du bist ein strenger Prüfer. Lies die im Auftrag genannten Dateien mit ' +
      'dateien_lesen und beurteile NUR, ob sie den Auftrag erfüllen. MANGEL ist ' +
      'insbesondere: Platzhalter wie "[Thema]", "[Ziel]", "Lorem", "TODO" oder ' +
      '"…" im Inhalt; leere/generische Abschnitte ohne konkrete Fakten; Inhalt, ' +
      'der die genannten Quellen erkennbar NICHT nutzt; fehlende Dateien. ' +
      'Beginne deine Antwort EXAKT mit "OK" nur wenn nichts davon zutrifft, ' +
      'sonst mit "MANGEL:" gefolgt von den konkreten Problemen und was konkret ' +
      'hineingehört. Deutsch, keine Emojis.',
    werkzeuge: ['dateien_lesen', 'dateien_suchen', 'rag_suche'],
    ergebnis: { felder: ['ergebnis'], max_zeichen: 2000 },
    modell: null,
  },
  {
    name: 'entwickler',
    prompt:
      'Du bist ein Entwickler. Schreibe Code-Dateien mit dateien_schreiben und ' +
      'FÜHRE sie mit terminal AUS, um sie zu prüfen (z. B. "python3 skript.py", ' +
      '"node app.js"). Fehler behebst du gezielt mit dateien_bearbeiten ' +
      '(Suchen/Ersetzen), bis der Befehl sauber läuft. Antworte am Ende nur mit ' +
      'einem Satz zum Ergebnis inkl. des Prüf-Befehls. Deutsch, keine Emojis.',
    werkzeuge: [
      'dateien_lesen',
      'dateien_schreiben',
      'dateien_bearbeiten',
      'dateien_anhaengen',
      'dateien_suchen',
      'terminal',
    ],
    ergebnis: { felder: ['ergebnis'], max_zeichen: 2000 },
    modell: null,
    schreibend: true,
  },
];

const AGENT_ANWEISUNG = `

## Arbeitsweise
Du bist der Arasul-Orchestrator mit Werkzeugen und Subagenten. Regeln:
1. Einfache Fragen und Gespräche beantwortest du DIREKT, ohne Werkzeug.
2. Nutze die Struktur-Übersicht des Projektordners (unten): lies relevante Dateien mit dateien_lesen, bevor du antwortest oder etwas erstellst. Neue Dateien legst du GENAU dort an, wo der Nutzer es sagt — nennt er nur einen Dateinamen, speichere unter exakt diesem Namen (Wurzel des Arbeitsordners). ERFINDE KEINE Ordner oder Kunden-/Firmennamen; einen Unterordner nutzt du nur, wenn der Nutzer ihn nennt oder die Struktur-Übersicht einen eindeutig passenden BESTEHENDEN Ordner zeigt. In großen Bäumen findest du Dateien gezielt mit dateien_suchen (Muster oder Textsuche) statt zu raten.
3. Fragen zu Dokumenten, Projekten oder Firmenwissen: nutze rag_suche und/oder dateien_lesen und verarbeite die Treffer frei als Material. PDF/DOCX und andere Binärdateien liest du NICHT mit dateien_lesen — ihren INHALT holst du mit rag_suche (inhaltliche Frage stellen).
4. Wenn der Nutzer ein Dokument oder eine Datei will (Newsletter, Webseite, Bericht, Liste …): erstelle den vollständigen Inhalt und speichere ihn mit dateien_schreiben (.html für Webseiten, .md für Texte/Berichte, .csv für Tabellen; kurzer Dateiname ohne Umlaute). Danach: EIN kurzer Satz, was du gespeichert hast — den Dateiinhalt NICHT wiederholen.
5. LANGE Dokumente (viele Abschnitte, große Webseiten) baust du abschnittsweise: dateien_schreiben mit dem Kopf/Anfang, danach Abschnitt für Abschnitt dateien_anhaengen — nie alles in einem einzigen Aufruf. Bestehende Dateien änderst du GEZIELT mit dateien_bearbeiten (exakten Textblock suchen/ersetzen) statt sie neu zu schreiben.
6. Bei mehrschrittigen Aufträgen pflegst du mit todo_liste eine Aufgabenliste: zu Beginn anlegen, nach JEDEM erledigten Schritt aktualisieren ("- [x] …"). Sie hält dich auf Kurs.
7. Zerlege größere Aufträge und delegiere an Subagenten: subagent(rolle="rechercheur", auftrag=…) sammelt Material, rolle="autor" schreibt Dateien aus Material, rolle="entwickler" schreibt UND testet Code per Terminal, rolle="pruefer" kontrolliert Ergebnisse. Gib jedem Subagenten einen präzisen, in sich vollständigen Auftrag inklusive Zielpfad.
8. Mit terminal kannst du selbst Befehle im Projektordner ausführen (Skripte testen, Dateien umwandeln, Pakete bauen).
9. Sage vor jedem Werkzeug-Block in EINEM kurzen Satz, was du gerade tust ("Ich lese zuerst die Preisliste.") — und rufe die Werkzeuge dann SOFORT in derselben Antwort auf. Niemals eine Aktion ankündigen, ohne sie auszuführen.
10. Erfinde keine Fakten. Wenn Werkzeuge nichts liefern, sag das ehrlich.
11. Antworte auf Deutsch, ohne Emojis (außer der Nutzer bittet darum).`;

/** Kürzt Werte für die persistierte Schritt-Liste (Kontext-/Speicherschutz). */
function kurz(wert, max) {
  const text = typeof wert === 'string' ? wert : JSON.stringify(wert ?? '');
  return text.length > max ? `${text.slice(0, max)} …` : text;
}

/**
 * Übersetzt einen technischen Fehler in einen Satz, den ein Nicht-Techniker
 * versteht (Agent-UX 2026-08-02). Der rohe Text bleibt im Log — dem Nutzer
 * gehört die Ursache in Alltagssprache plus ein klarer nächster Schritt.
 */
function verstaendlicherFehler(err) {
  const roh = String(err?.message || err || '');
  if (/ohne Daten|timeout|timed?\s*out|ETIMEDOUT/i.test(roh)) {
    return 'Das Modell hat zu lange nicht geantwortet (Zeitüberschreitung). Bitte noch einmal versuchen — bei großen Aufträgen hilft es, sie in kleinere Schritte zu teilen.';
  }
  if (/ECONNREFUSED|ENOTFOUND|fetch failed|socket|ECONNRESET/i.test(roh)) {
    return 'Der KI-Dienst ist gerade nicht erreichbar. Einen Moment warten und erneut versuchen.';
  }
  if (/model .*not found|no such model|nicht geladen|model_not_found/i.test(roh)) {
    return 'Das gewählte Modell ist nicht geladen — bitte im Store laden oder ein anderes Modell wählen.';
  }
  if (/GPU|out of memory|OOM|Speicher/i.test(roh)) {
    return 'Dem Gerät ist der KI-Speicher ausgegangen. Ein kleineres Modell wählen oder laufende Aufgaben beenden.';
  }
  return `Der Lauf ist unerwartet gescheitert (${kurz(roh, 140)}). Bitte erneut versuchen.`;
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
async function streamChatRound({
  model,
  messages,
  tools,
  onToken,
  onThinking,
  think,
  signal,
  numPredict,
}) {
  return withGpuLock(async () => {
    if (signal?.aborted) {
      throw new Error('Vom Nutzer abgebrochen');
    }
    // Explizite options statt Server-Defaults (Harness v2): Ollama schneidet
    // Prompts über num_ctx STILL vorne ab — System-Prompt und Tools zuerst.
    // Der Agent setzt sein Fenster deshalb selbst und haushaltet davor.
    const body = {
      model,
      messages,
      stream: true,
      think: think === true,
      keep_alive: agentConfig.KEEP_ALIVE,
      options: {
        num_ctx: agentConfig.NUM_CTX,
        num_predict: Number.isFinite(numPredict) ? numPredict : agentConfig.NUM_PREDICT,
      },
    };
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
          // Reasoning-Trace (qwen3 & Co.): Ollama liefert ihn als eigenes
          // thinking-Feld. Live durchreichen — der Nutzer sieht den
          // Gedankengang, in den Verlauf wandert er NICHT.
          if (msg.thinking && typeof onThinking === 'function') {
            try {
              onThinking(msg.thinking);
            } catch (err) {
              logger.warn(`Chat-Agent onThinking warf: ${err.message}`);
            }
          }
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
  // Strenge Ordner-Bindung (Plan 019 · Phase 2): angehängter Ordner = Wurzel.
  const { arbeitsOrdner, zielPrefix, roots, scoped } = deriveRoots(wurzel, requestData.ablage_ziel);
  if (scoped) {
    await fs.mkdir(arbeitsOrdner, { recursive: true });
  }

  const alleTools = [...buildTools(AGENT_WERKZEUGE), new TodoListeTool()];
  const toolByName = new Map(alleTools.map(t => [t.name, t]));
  const toolDefs = alleTools.map(t => t.toOllamaToolDefinition());

  // --- Schritt-Protokoll: live als SSE, am Ende persistiert -----------------
  const schritte = [];
  let schrittZaehler = 0;
  const dateien = [];
  // Cursor-Darstellung (Plan 019): jeder Werkzeug-Schritt der obersten Ebene
  // gehört zur gerade aktiven Aufgabe (Todo). `aktiveTaskIndex` zeigt auf den
  // Index der Aufgabe, die läuft (bzw. der nächsten offenen) — er wird bei
  // jedem Todo-Update in `setTodos` nachgezogen. So kann das Frontend die
  // Schritte GRUPPIERT unter ihrer Aufgabe zeigen, statt als flachen Strom.
  let aktiveTaskIndex = null;
  const stepRecorder = {
    beginnen: async ({ kind, name = '', input = {}, parentStepId = null, modell = null }) => {
      schrittZaehler += 1;
      const step = {
        id: schrittZaehler,
        kind,
        name,
        input: kurzInput(input, KURZ_INPUT),
        parent_step_id: parentStepId,
        // Nur Schritte der obersten Ebene hängen an einer Aufgabe; Kind-Schritte
        // (Subagent-Innereien) hängen an ihrem Eltern-Schritt, nicht an einer Todo.
        task_index:
          parentStepId == null && kind !== 'todos' && kind !== 'plan' ? aktiveTaskIndex : null,
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

  // Auto-Eskalation (Interview 2026-07-30): Die Prüf-Rolle — der Schritt, an
  // dem Qualität hängt — läuft auf dem Qualitätsmodell, wenn eines
  // konfiguriert ist. Werkzeug-Runden bleiben auf dem schnellen Modell.
  const qualModell = agentConfig.qualitaetsModell();
  const rollen = qualModell
    ? AGENT_ROLLEN.map(r => (r.name === 'pruefer' ? { ...r, modell: qualModell } : r))
    : AGENT_ROLLEN;

  const limits = new RunLimits({ maxAufrufe: 40, zeitlimitS: ZEITLIMIT_S, maxTiefe: 2 });
  const roleContextBase = {
    userId: job.user_id,
    roots,
    spaceIds,
    slug: 'chat-agent',
    // Subagenten dürfen denken, wenn ihr Modell es kann (Interview 2026-07-30).
    denkenSubagenten: true,
  };
  const context = {
    ...roleContextBase,
    rollen,
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
      // Terminal an DIESELBE Wurzel binden wie die Datei-Werkzeuge (Plan 019 ·
      // Phase 2): cwd + Mount = angehängter Ordner, nicht die ganze Projektablage.
      terminalBereit = ensureFlowSandbox(roots).then(sb => {
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
    // Struktur-Übersicht auf die gebundene Wurzel scopen: ist ein Ordner
    // angehängt, sieht der Agent NUR dessen Baum (relative Pfade) — keine
    // unerreichbaren Projektpfade, die zu „verlässt die erlaubten Ordner" führen.
    const { eintraege, gekuerzt } = await listTree(projectId, { startRel: zielPrefix });
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

  // --- Denk-Strom (Interview 2026-07-30: „voller Gedankengang, live") -------
  // Modelle mit Reasoning (qwen3 …) denken sichtbar: thinking-Token gehen live
  // als eigene SSE-Events raus (das UI hat dafür die Gedankengang-Zeile).
  // Coder-Modelle ohne Reasoning liefern stattdessen die Erzähl-Sätze aus
  // Regel 9 — der Nutzer sieht IMMER einen Arbeitsstrom.
  const denken = agentConfig.thinkingGewuenscht() && agentConfig.kannDenken(ollamaModel);
  let denktGerade = false;
  const onThinking = token => {
    denktGerade = true;
    service.notifySubscribersBatched(jobId, { type: 'thinking', token });
  };
  const denkenEnde = () => {
    if (denktGerade) {
      denktGerade = false;
      service.notifySubscribers(jobId, { type: 'thinking_end' });
    }
  };

  // --- Aufgabenliste (TodoWrite-Muster): Zustand statt flüchtigem Plan ------
  // Der Harness hält die Liste und hängt sie VOR JEDER Runde frisch ans
  // Kontextende — sie kann nicht aus dem Fenster rutschen. Im Schritt-Protokoll
  // lebt sie als EIN Schritt, der bei jeder Änderung aktualisiert wird.
  let todoListe = '';
  let todoStep = null;
  // Wie viele Werkzeug-Runden ist die Aufgabenliste unverändert? Kleinere
  // Modelle (8B/14B) vergessen das Nachpflegen mitten im Lauf; nach ein paar
  // stummen Runden bei noch offenen Punkten wird die Aufforderung verschärft.
  let rundenSeitTodoUpdate = 0;
  const setTodos = (liste, todos) => {
    todoListe = liste;
    rundenSeitTodoUpdate = 0;
    // Aktive Aufgabe bestimmen: danach beginnende Schritte werden ihr über
    // task_index zugeordnet (Grundlage der gruppierten Darstellung, Plan 019).
    aktiveTaskIndex = aktiveTaskIndexAus(todos);
    service.notifySubscribers(jobId, { type: 'agent_todos', liste, todos });
    void (async () => {
      try {
        if (!todoStep) {
          todoStep = await stepRecorder.beginnen({ kind: 'todos', name: 'aufgaben', input: {} });
        }
        await stepRecorder.abschliessen({ stepId: todoStep.id, output: liste });
      } catch (err) {
        log.warn(`[JOB ${jobId}] Aufgabenliste nicht protokolliert: ${err.message}`);
      }
    })();
  };
  context.setTodos = setTodos;

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
    denkenEnde(); // erster Antwort-Token schließt die Gedankengang-Zeile
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
  // Hat der Text-Tool-Call-Fallback rohes XML aus einer Antwort entfernt?
  // Dann muss am Ende fertigText (bereinigt) den gestreamten Roh-Inhalt in
  // der DB ERSETZEN — der Token-Strom enthielt das XML bereits.
  let inhaltBereinigt = false;
  let pruefZyklen = 0;
  let nachfassZyklen = 0;

  // --- Kontext-Haushalt (Harness v2) ----------------------------------------
  // Das Nachrichten-Array wächst über die Runden — jede Werkzeug-Ausgabe bleibt
  // sonst bis zum Ende resident und lange Läufe sterben am stillen Ollama-
  // Truncate (der zuerst den System-Prompt frisst). Deshalb: grob Token
  // schätzen und über der Schwelle ALTE Werkzeug-Ausgaben eindampfen; die
  // jüngsten Züge und der System-Prompt bleiben unangetastet. Die Details
  // stehen weiterhin im Schritt-Protokoll.
  const schaetzeTokens = list =>
    list.reduce((n, m) => n + Math.ceil(String(m.content || '').length / 3.2) + 8, 0);
  let kompaktierungGemeldet = false;
  const kontextHaushalt = () => {
    const budget = Math.floor(agentConfig.NUM_CTX * agentConfig.KONTEXT_SCHWELLE);
    if (schaetzeTokens(messages) <= budget) {
      return;
    }
    const SCHUTZ = 6; // die jüngsten Nachrichten bleiben immer vollständig
    for (let i = 1; i < messages.length - SCHUTZ && schaetzeTokens(messages) > budget; i++) {
      const m = messages[i];
      if (m.role === 'tool' && typeof m.content === 'string' && m.content.length > 700) {
        m.content = `${m.content.slice(0, 400)}\n… [ältere Werkzeug-Ausgabe gekürzt — Details im Schritt-Protokoll]`;
      }
    }
    for (let i = 1; i < messages.length - SCHUTZ && schaetzeTokens(messages) > budget; i++) {
      const m = messages[i];
      if (
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.length > 900
      ) {
        m.content = `${m.content.slice(0, 600)}\n… [gekürzt]`;
      }
    }
    if (!kompaktierungGemeldet) {
      kompaktierungGemeldet = true;
      service.notifySubscribers(jobId, {
        type: 'compaction',
        message: 'Kontext eingedampft: ältere Werkzeug-Ausgaben wurden gekürzt.',
      });
    }
  };

  // --- Platten-Wahrheit: Welche Dateien hat dieser Lauf WIRKLICH angelegt? ---
  // Kleine Modelle behaupten gern Erfolge („HTML-Datei erstellt"), ohne je
  // dateien_schreiben gerufen zu haben — gerade in Subagenten. Deshalb zählt
  // nicht die Behauptung, sondern der Baum-Vergleich: vor/nach Subagenten und
  // am Ende des Laufs. Gefundene neue/geänderte Dateien werden zu Karten und
  // füttern das Prüf-Gate; ein „erfolgreicher" Autor ohne Dateiänderung
  // bekommt die Wahrheit als Warnung ins Ergebnis zurück.
  const gemeldeteDateien = new Set(dateien.map(x => x.pfad));
  const leseSnapshot = async () => {
    try {
      const { eintraege } = await listTree(projectId);
      return new Map(
        eintraege.filter(e => e.typ === 'datei').map(e => [e.pfad, `${e.groesse}:${e.geaendert}`])
      );
    } catch {
      return null;
    }
  };
  const meldeNeueDateien = (vorher, nachher) => {
    if (!vorher || !nachher) {
      return 0;
    }
    let geaendertGesamt = 0;
    const melde = (pfad, aenderung) => {
      if (gemeldeteDateien.has(pfad)) {
        return;
      }
      gemeldeteDateien.add(pfad);
      const datei = {
        art: 'projektdatei',
        project_id: projectId,
        pfad,
        name: path.posix.basename(pfad),
        // Kategorie für die Änderungs-Übersicht im Chat (Agent-UX 2026-08-02):
        // neu | geaendert | geloescht — dieselbe Sprache wie bei Flow-Läufen.
        aenderung,
      };
      dateien.push(datei);
      service.notifySubscribers(jobId, { type: 'agent_datei', datei });
    };
    for (const [pfad, sig] of nachher) {
      if (!vorher.has(pfad)) {
        geaendertGesamt += 1;
        melde(pfad, 'neu');
      } else if (vorher.get(pfad) !== sig) {
        geaendertGesamt += 1;
        melde(pfad, 'geaendert');
      }
    }
    // Gelöschte Dateien nicht verschlucken — sie sind genauso eine Änderung,
    // die der Nutzer sehen muss (vorher unsichtbar verpufft).
    for (const pfad of vorher.keys()) {
      if (!nachher.has(pfad)) {
        geaendertGesamt += 1;
        melde(pfad, 'geloescht');
      }
    }
    return geaendertGesamt;
  };
  const snapshotStart = await leseSnapshot();

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
      'Lies die Datei(en) und prüfe, ob sie den Auftrag erfüllen. Prüfe NUR gegen ' +
      'die AUSDRÜCKLICHEN Anforderungen des Auftrags — erfinde keine zusätzlichen ' +
      '(Struktur, Überschriften, Umfang, Stil). Erfüllt die Datei das Verlangte, ' +
      'antworte OK, auch wenn du selbst mehr geschrieben hättest.';
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
  // Proportionalität (2026-08-01): Nicht jedes "Erstelle …" verdient die
  // teure Qualitätsmodell-Plan-Runde mit Thinking (live gemessen: >5 Minuten
  // Grübeln für eine Drei-Zeilen-Datei). Zwei Stufen:
  //  GROSS  → Recherche/Subagenten/Mehrteiler: Plan auf dem Qualitätsmodell,
  //           mit Thinking, Deckel PLAN_NUM_PREDICT_GROSS.
  //  KOMPLEX→ kleine Erstell-Aufgaben: knapper Plan auf dem Arbeitsmodell,
  //           ohne Thinking, Deckel PLAN_NUM_PREDICT_KLEIN.
  const istGross =
    letzteNachricht.length > 600 ||
    /recherchier|subagent|handbuch|webseite|newsletter|analysier|überarbeit|kapitel|abschnitt|mehrere\s+dateien/i.test(
      letzteNachricht
    );
  const istKomplex =
    istGross ||
    requestData.datei_modus ||
    letzteNachricht.length > 280 ||
    /erstell|schreib|generier|entwickl|entwirf|bau(e|t)?\b|zusammenfass|bericht|dokument|skript/i.test(
      letzteNachricht
    );

  try {
    if (istKomplex && toolsAktiv && !abgebrochen) {
      const planStep = await stepRecorder.beginnen({ kind: 'plan', name: 'plan', input: {} });
      try {
        // Auto-Eskalation: die Plan-Runde — der Schritt mit dem größten
        // Qualitäts-Hebel — läuft auf dem Qualitätsmodell, wenn konfiguriert.
        // Der Plan-Text streamt als Gedankengang live ins UI (nicht als
        // Antwort): der Nutzer sieht das Modell planen, die Antwort bleibt sauber.
        const planOllama = istGross && qualModell ? await zuOllamaName(qualModell) : ollamaModel;
        const planErgebnis = await streamChatRound({
          model: planOllama,
          messages: [
            ...messages,
            {
              role: 'user',
              content: istGross
                ? 'Erstelle ZUERST einen knappen nummerierten Plan (3-6 Schritte) für diesen ' +
                  'Auftrag: welche Werkzeuge/Subagenten du nutzt, welche Quellen du liest, ' +
                  'welche Dateien du wohin schreibst. NUR den Plan, keine Ausführung.'
                : 'Nenne in 2-4 knappen nummerierten Schritten, wie du diesen Auftrag ' +
                  'ausführst (Werkzeug + Zieldatei). NUR die Schritte, keine Ausführung, ' +
                  'keine Abwägungen.',
            },
          ],
          tools: [],
          think: istGross && agentConfig.thinkingGewuenscht() && agentConfig.kannDenken(planOllama),
          numPredict: istGross
            ? agentConfig.PLAN_NUM_PREDICT_GROSS
            : agentConfig.PLAN_NUM_PREDICT_KLEIN,
          onThinking,
          onToken: token => onThinking(token), // Plan-Text in die Gedankengang-Zeile
          signal: abbruch.signal,
        });
        denkenEnde();
        const plan = (planErgebnis.content || '').trim();
        await stepRecorder.abschliessen({ stepId: planStep.id, output: plan || '(kein Plan)' });
        if (plan) {
          messages.push({ role: 'assistant', content: `Mein Plan:\n${plan}` });
          messages.push({
            role: 'user',
            content:
              'Gut. Führe den Plan jetzt vollständig aus. Hake nach jedem erledigten ' +
              'Schritt die Aufgabenliste mit todo_liste ab.',
          });
          // Plan → Aufgabenliste, deterministisch durch den Harness: Die
          // nummerierten Plan-Schritte werden sofort das Aufgaben-Panel,
          // statt darauf zu hoffen, dass das Modell todo_liste selbst ruft
          // (live beobachtet: es malt sonst nur Checkboxen in den Text).
          if (!todoListe) {
            const schritte = plan
              .split('\n')
              .map(zeile => zeile.match(/^\s*(?:\d+[.)]|[-*])\s+(.+)$/))
              .filter(Boolean)
              .map(m => m[1].replace(/\*\*/g, '').trim())
              .filter(s => s.length > 3)
              .slice(0, 12);
            if (schritte.length >= 2) {
              const liste = schritte.map(s => `- [ ] ${s}`).join('\n');
              setTodos(
                liste,
                schritte.map(text => ({ text, status: 'offen' }))
              );
            }
          }
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

      // Kontext-Haushalt VOR jeder Runde; die Aufgabenliste kommt danach
      // frisch ans Ende — sie ist Zustand des Harness, nicht des Verlaufs.
      kontextHaushalt();
      // Verschärfte Erinnerung, wenn die Liste offene Punkte hat und mehrere
      // Runden lang nicht angefasst wurde (kleine Modelle „vergessen"
      // todo_liste). Der Punkt-in-Arbeit-Marker `[~]` zählt nicht als offen.
      const rundenMessages = todoListe
        ? [
            ...messages,
            {
              role: 'system',
              content:
                `## Aufgabenliste (aktueller Stand)\n${todoListe}\n` +
                todoErinnerung(todoListe, rundenSeitTodoUpdate),
            },
          ]
        : messages;
      if (todoListe) {
        rundenSeitTodoUpdate += 1;
      }

      let rundenErgebnis;
      try {
        rundenErgebnis = await streamChatRound({
          model: ollamaModel,
          messages: rundenMessages,
          tools: toolsAktiv ? toolDefs : [],
          think: denken,
          onThinking,
          onToken,
          signal: abbruch.signal,
        });
        denkenEnde();
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

      let { content } = rundenErgebnis;
      const { toolCalls } = rundenErgebnis;

      // Fallback: Manche Runden geben den Werkzeug-Aufruf als TEXT aus
      // (fehlendes <tool_call>-Tag → Ollamas Parser greift nicht). Statt das
      // rohe XML als Antwort stehen zu lassen, parsen wir es selbst und
      // führen die Aufrufe normal aus; der Antworttext wird vom XML befreit.
      if (!toolCalls.length && enthaeltToolSyntax(content)) {
        const geparst = parseTextToolCalls(content);
        if (geparst.calls.length > 0) {
          log.info(
            `[JOB ${jobId}] Text-Tool-Call-Fallback: ${geparst.calls.length} Aufruf(e) aus Antworttext geparst`
          );
          toolCalls.push(...geparst.calls);
          content = geparst.rest;
          inhaltBereinigt = true;
        } else if (nachfassZyklen < MAX_NACHFASS_ZYKLEN && toolsAktiv && !abgebrochen) {
          // Syntax erkannt, aber nicht parsebar — dem Modell eine saubere
          // Wiederholung im echten Werkzeug-Format abverlangen.
          nachfassZyklen += 1;
          messages.push({ role: 'assistant', content });
          messages.push({
            role: 'user',
            content:
              'Dein letzter Werkzeug-Aufruf war fehlerhaft formatiert und wurde NICHT ausgeführt. ' +
              'Rufe das Werkzeug jetzt erneut auf — über die Werkzeug-Schnittstelle, nicht als Text.',
          });
          separator();
          continue;
        }
      }
      fertigText += content;

      if (!toolCalls.length) {
        // Platten-Wahrheit nachziehen: auch Dateien aus Terminal-/Subagenten-
        // Arbeit bekommen ihre Karte und zählen für das Prüf-Gate.
        meldeNeueDateien(snapshotStart, await leseSnapshot());
        // Erzwungener Prüf-Schritt (Orchestrator-Protokoll): Bevor eine Antwort
        // mit erstellten Dateien als fertig gilt, kontrolliert die pruefer-Rolle
        // das Ergebnis. Findet sie Mängel, bekommt das Modell eine Korrektur-
        // Schleife — bis zu MAX_PRUEF_ZYKLEN Mal (Entwurf→Prüfung→Korrektur).
        if (pruefZyklen < MAX_PRUEF_ZYKLEN && dateien.length > 0 && toolsAktiv && !abgebrochen) {
          pruefZyklen += 1;
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
        // Ankündigungs-Wächter: kleine Modelle beenden Aufträge gern mit
        // „Ich schreibe die Datei jetzt …" statt zu handeln. Eine angekündigte
        // Aktion ohne Werkzeug-Aufruf bekommt bis zu MAX_NACHFASS_ZYKLEN
        // Nachfass-Runden.
        const kuendigtNurAn =
          /\b(ich\s+(schreibe|erstelle|lege|speichere|kopiere|beginne)|jetzt\s+(schreibe|erstelle|lege|speichere)|werde\s+ich\s+(die|den|das)?\s*\w*\s*(schreiben|erstellen|anlegen|speichern))\b/i.test(
            content || ''
          );
        if (nachfassZyklen < MAX_NACHFASS_ZYKLEN && kuendigtNurAn && toolsAktiv && !abgebrochen) {
          nachfassZyklen += 1;
          messages.push({ role: 'assistant', content });
          messages.push({
            role: 'user',
            content:
              'Du hast eine Aktion nur ANGEKÜNDIGT, aber nicht ausgeführt. ' +
              'Führe sie JETZT mit deinen Werkzeugen aus (z. B. dateien_schreiben) ' +
              'und antworte erst danach mit dem Ergebnis — ohne weitere Ankündigungen.',
          });
          separator();
          fertigText += '\n\n';
          continue;
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
            const vorher = istSubagent ? await leseSnapshot() : null;
            result = await tool.execute(params, context);
            if (istSubagent) {
              // Platten-Wahrheit statt Subagenten-Behauptung: neue Dateien
              // melden; ein Schreib-Auftrag ohne Dateiänderung wird als solcher
              // benannt, damit der Orchestrator selbst schreibt statt dem
              // erfundenen Erfolg zu glauben.
              const geaendert = meldeNeueDateien(vorher, await leseSnapshot());
              const sollteSchreiben = params.rolle === 'autor' || params.rolle === 'entwickler';
              if (sollteSchreiben && geaendert === 0 && !/^Fehler/.test(String(result || ''))) {
                result =
                  `${result}\n\nWARNUNG (Platten-Prüfung): Der Subagent hat KEINE Datei ` +
                  'geschrieben oder geändert — sein Erfolgsbericht stimmt nicht. Erstelle die ' +
                  'Datei jetzt SELBST mit dateien_schreiben (vollständiger Inhalt, relativer Pfad).';
              }
            }
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
        // saubere RELATIVE Pfade: der Pfad ist relativ zur (einzigen) Wurzel und
        // wird unten mit `zielPrefix` wieder projekt-relativ zusammengesetzt.
        // Ein absoluter Pfad ließe die Karte auf einen falschen Pfad zeigen
        // (und wird von den Werkzeugen bei strenger Bindung ohnehin abgelehnt).
        const pfadStr = String(params.pfad || '');
        const schreibWerkzeug =
          toolName === 'dateien_schreiben' ||
          toolName === 'dateien_bearbeiten' ||
          toolName === 'dateien_anhaengen';
        if (
          schreibWerkzeug &&
          !/^Fehler/.test(result) &&
          pfadStr &&
          !path.isAbsolute(pfadStr) &&
          !pfadStr.split('/').includes('..')
        ) {
          const relPfad = zielPrefix ? path.posix.join(zielPrefix, pfadStr) : pfadStr;
          if (!gemeldeteDateien.has(relPfad)) {
            gemeldeteDateien.add(relPfad);
            const datei = {
              art: 'projektdatei',
              project_id: projectId,
              pfad: relPfad,
              name: path.posix.basename(relPfad),
              // Gab es die Datei beim Lauf-Start schon? Dann ist das eine
              // Änderung, sonst eine Neuanlage — fürs Badge der Datei-Karte.
              ...(snapshotStart
                ? { aenderung: snapshotStart.has(relPfad) ? 'geaendert' : 'neu' }
                : {}),
            };
            dateien.push(datei);
            service.notifySubscribers(jobId, { type: 'agent_datei', datei });
          }
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
      // Dem Nutzer gehört die verständliche Fassung; die rohe steht im Log.
      clearInterval(abbruchPoller);
      log.error(`[JOB ${jobId}] Agent-Lauf gescheitert: ${err.message}`);
      throw new Error(verstaendlicherFehler(err));
    } else {
      // Fehler NACH gestreamtem Inhalt: sauber abschließen statt werfen — der
      // Nutzer soll den bisherigen Text behalten.
      log.error(`[JOB ${jobId}] Agent-Lauf nach Teilantwort gescheitert: ${err.message}`);
      onToken(`\n\n_Abgebrochen: ${verstaendlicherFehler(err)}_`);
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

  if (inhaltBereinigt && !abgebrochen) {
    try {
      await llmJobService.setJobContent(jobId, fertigText);
    } catch (err) {
      log.warn(`[JOB ${jobId}] Bereinigter Inhalt nicht gesetzt: ${err.message}`);
    }
  }

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
  // Bei Nutzer-Abbruch zusätzlich den (ggf. leeren) Teiltext sichern —
  // completeJob (das ihn sonst überträgt) läuft dann nicht, und ohne diesen
  // Schritt bliebe ein Sofort-Abbruch als leere 'error'-Nachricht zurück.
  if (schritte.length > 0 || dateien.length > 0 || abgebrochen) {
    try {
      const jobRow = await database.query(`SELECT message_id FROM llm_jobs WHERE id = $1`, [jobId]);
      const messageId = jobRow.rows[0]?.message_id;
      if (messageId) {
        const dateiWert = dateien.length === 0 ? null : dateien.length === 1 ? dateien[0] : dateien;
        await database.query(
          `UPDATE chat_messages SET schritte = $1, datei = COALESCE($2, datei) WHERE id = $3`,
          [JSON.stringify(schritte), dateiWert ? JSON.stringify(dateiWert) : null, messageId]
        );
        if (abgebrochen) {
          await database.query(
            `UPDATE chat_messages SET content = $1, status = 'completed' WHERE id = $2`,
            [fertigText ? `${fertigText}\n\n_Abgebrochen._` : '_Abgebrochen._', messageId]
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

/**
 * Aktive Aufgabe aus der Todo-Liste bestimmen (Plan 019): die gerade laufende
 * Aufgabe, sonst die erste offene, sonst keine. Danach beginnende Schritte
 * werden dieser Aufgabe zugeordnet (task_index) — Grundlage der gruppierten
 * Cursor-Darstellung im Frontend.
 * @param {Array<{status?: string}>} todos
 * @returns {number|null}
 */
function aktiveTaskIndexAus(todos) {
  if (!Array.isArray(todos) || todos.length === 0) {
    return null;
  }
  const laufend = todos.findIndex(t => t && t.status === 'laeuft');
  if (laufend >= 0) {
    return laufend;
  }
  const offen = todos.findIndex(t => t && t.status === 'offen');
  return offen >= 0 ? offen : null;
}

/**
 * Wurzel-Ableitung der Agent-Werkzeuge (Plan 019 · Phase 2 „strenge
 * Ordner-Bindung"). Hängt der Nutzer einen Ordner an (`ablage_ziel`, relativ
 * zur Projektablage), IST DIESER die Wurzel — der Agent (Datei- UND Terminal-
 * Werkzeug) arbeitet ausschließlich darin, kein Ausweichen auf die ganze
 * Projektablage, kein Ausbruch nach „/". Ohne Anhang bleibt die Projektablage
 * die Wurzel. Ein ungültiger/ausbrechender `ablage_ziel` (…/.., absolut) wird
 * ignoriert und fällt sicher auf die Projektwurzel zurück.
 *
 * Rein & seiteneffektfrei (das mkdir des Zielordners macht der Aufrufer) →
 * unit-testbar ohne echtes Dateisystem.
 *
 * @param {string} wurzel  Absoluter Pfad der Projektablage.
 * @param {string|null|undefined} ablageZiel  Relativer Zielordner oder leer.
 * @returns {{ arbeitsOrdner: string, zielPrefix: string, roots: string[], scoped: boolean }}
 */
function deriveRoots(wurzel, ablageZiel) {
  let arbeitsOrdner = wurzel;
  let zielPrefix = '';
  if (ablageZiel && typeof ablageZiel === 'string' && ablageZiel.trim()) {
    const ziel = path.resolve(wurzel, ablageZiel);
    // Muss innerhalb der Projektwurzel liegen (kein .. / absoluter Ausbruch).
    if (ziel === wurzel || ziel.startsWith(wurzel + path.sep)) {
      arbeitsOrdner = ziel;
      zielPrefix = path.relative(wurzel, ziel).split(path.sep).join('/');
    }
  }
  const scoped = arbeitsOrdner !== wurzel;
  // STRENG: genau EIN Wurzelordner — der angehängte, sonst das Projekt.
  const roots = [arbeitsOrdner];
  return { arbeitsOrdner, zielPrefix, roots, scoped };
}

module.exports = {
  processAgentChatJob,
  AGENT_WERKZEUGE,
  AGENT_ROLLEN,
  streamChatRound,
  verstaendlicherFehler,
  aktiveTaskIndexAus,
  deriveRoots,
};
