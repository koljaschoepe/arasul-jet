/**
 * Agent-Konfiguration (Harness v2, 2026-07-30).
 *
 * Zentrale Stellschrauben des Chat-Agenten an EINEM Ort, statt verstreuter
 * Magic Numbers. Zwei Erkenntnisse aus der Recherche stecken dahinter:
 *
 *  1. Ollama schneidet Prompts, die das Server-num_ctx sprengen, STILL vorne
 *     ab — System-Prompt und Tool-Definitionen verschwinden zuerst. Deshalb
 *     setzt der Agent num_ctx ab jetzt explizit pro Aufruf und haushaltet
 *     selbst (contextHaushalt in chatAgentRunner), statt dem Server-Default
 *     zu vertrauen.
 *  2. Thinking ist eine MODELL-Eigenschaft: qwen3 & Co. können es (und der
 *     Nutzer will den Gedankengang live sehen), Coder-/Gemma-Modelle nicht.
 *     Der Harness fragt hier nach, statt think blind zu setzen.
 */

/** parseInt mit NaN-Wächter — ein kaputter Env-Wert würde sonst als
 * options.num_ctx=null genau den stillen Truncate zurückbringen, den
 * dieses Modul beseitigt. */
function ganzzahl(wert, standard) {
  const n = parseInt(wert ?? '', 10);
  return Number.isFinite(n) ? n : standard;
}

const NUM_CTX = ganzzahl(process.env.AGENT_NUM_CTX, 32768);

/** Modell-Antwortlänge pro Runde: -1 = unbegrenzt (Ollama-Konvention). */
const NUM_PREDICT = ganzzahl(process.env.AGENT_NUM_PREDICT, -1);

/** Modell zwischen Runden im Speicher halten — Kaltstart kostet auf dem Jetson 6-30 s. */
const KEEP_ALIVE = process.env.AGENT_KEEP_ALIVE || '30m';

/**
 * Token-Deckel für die Plan-Runde (Proportionalität, 2026-08-01): Das
 * Thinking-Modell kann sich bei offenen Fragen minutenlang im Kreis drehen —
 * live beobachtet: >5 Minuten Grübeln für eine Drei-Zeilen-Datei. Der Deckel
 * begrenzt Thinking + Plan zusammen (num_predict zählt beides).
 * GROSS: echte Groß-Aufträge (Recherche/Subagenten/Mehr-Datei) auf dem
 * Qualitätsmodell · KLEIN: kleine Erstell-Aufgaben, kurzer Plan ohne Thinking
 * auf dem Arbeitsmodell.
 */
const PLAN_NUM_PREDICT_GROSS = ganzzahl(process.env.AGENT_PLAN_TOKENS_GROSS, 2048);
const PLAN_NUM_PREDICT_KLEIN = ganzzahl(process.env.AGENT_PLAN_TOKENS_KLEIN, 512);

/**
 * Ab welchem Füllstand (Anteil von NUM_CTX) der Kontext-Haushalt alte
 * Werkzeug-Ausgaben eindampft. Puffer unter 1.0, weil die Token-Schätzung
 * (Zeichen/3.2) bewusst grob ist.
 */
const KONTEXT_SCHWELLE = 0.7;

/**
 * Wie viele Token der VERLAUF im Vorlauf der ersten Runde hoechstens kosten
 * darf (Plan 023 D7, Schritt 2).
 *
 * Nicht zu verwechseln mit KONTEXT_SCHWELLE darueber. Die schuetzt den
 * Kontext vor dem Ueberlaufen und greift bei NUM_CTX * 0.7, also rund 22900
 * Token. Dieses Budget schuetzt die Zeit bis zum ersten Wort und greift viel
 * frueher: zwoelf Nachrichten a 8000 Zeichen sind gemessen 12060 Token, und
 * bei 262 Token je Sekunde Vorverarbeitung sind das 46 Sekunden Warten, bevor
 * ein Wort erscheint. Der Kontext laeuft dabei nie ueber, deshalb hat es
 * niemand gesehen.
 *
 * 1200 Token sind rund vier gewoehnliche Nachrichtenpaare in voller Laenge.
 * Wer laengere Gespraeche ungekuerzt will, setzt AGENT_VERLAUF_TOKEN_BUDGET
 * hoch und bezahlt es in Wartezeit.
 */
const VERLAUF_TOKEN_BUDGET = ganzzahl(process.env.AGENT_VERLAUF_TOKEN_BUDGET, 1200);

/**
 * Aggressivere Delegation (Plan 019 · Phase 5): Obergrenze der Subagent-Aufrufe
 * über den GANZEN Lauf. Höher = der Orchestrator kann große Aufträge in viele
 * kleine, in sich geschlossene Blöcke zerlegen — jeder Subagent arbeitet mit
 * eigenem, frischem Kontext und gibt nur sein Ergebnis zurück, sodass der
 * Hauptkontext schlank bleibt. Die Verschachtelung bleibt über maxTiefe hart
 * begrenzt (keine Endlos-Schachtelung); die GPU arbeitet ohnehin sequenziell.
 */
const MAX_SUBAGENTEN = ganzzahl(process.env.AGENT_MAX_SUBAGENTEN, 60);

/**
 * Optionales Qualitätsmodell für schwere Einzelschritte (Plan-Runde,
 * Prüf-Rolle). Leer = keine Eskalation. Interview 2026-07-30: automatische
 * Eskalation ist gewünscht; der konkrete Name kommt aus der Umgebung, damit
 * ein Gerät ohne das Modell nicht ins Leere eskaliert.
 */
function qualitaetsModell() {
  return (process.env.AGENT_QUALITAETS_MODELL || '').trim() || null;
}

/** Nutzer-Schalter: Thinking global abschaltbar (Standard: an — Interview 2026-07-30). */
function thinkingGewuenscht() {
  return (process.env.AGENT_THINKING || 'an').toLowerCase() !== 'aus';
}

/**
 * Kann dieses Modell (Ollama-Name) einen Reasoning-Trace liefern?
 * Heuristik über den Namen — der Modellkatalog kennt die Fähigkeit nicht, und
 * ein Probe-Aufruf pro Runde wäre zu teuer. Coder-Varianten VOR der
 * qwen3-Familie prüfen: "qwen3-coder" denkt nicht.
 */
function kannDenken(ollamaName) {
  const name = String(ollamaName || '').toLowerCase();
  if (!name || name.includes('coder') || name.includes('nothink')) {
    return false;
  }
  return /qwen3|deepseek-r1|gpt-oss|magistral|glm-4|smallthinker/.test(name);
}

/**
 * Soll dieser Lauf sichtbar denken?
 *
 * Drei Bedingungen, alle müssen zutreffen: Thinking ist überhaupt gewünscht,
 * das Modell kann es, und die Frage ist es wert. Der dritte Teil ist neu
 * (Audit 023, Befund F-28): die Einstufung aus `queryComplexityAnalyzer` lief
 * bis zum 19.08.2026 nur im `llmJobProcessor`, nicht im Agent-Runner. Eine
 * Frage wie „Nenne mir in drei Stichpunkten, was Arasul kann." kostete dadurch
 * 37 Sekunden Denkzeit vor dem ersten Wort, obwohl der Analyzer sie als
 * `simple` einstuft.
 *
 * @param {string} ollamaName Modellname, wie Ollama ihn kennt
 * @param {string} letzteNutzerfrage ungekürzte letzte Nachricht des Nutzers
 * @returns {{ denken: boolean, grund: string }} `grund` ist protokollierbar
 */
function sollDenken(ollamaName, letzteNutzerfrage) {
  if (!thinkingGewuenscht()) {
    return { denken: false, grund: 'per Einstellung aus' };
  }
  if (!kannDenken(ollamaName)) {
    return { denken: false, grund: 'Modell denkt nicht' };
  }

  const { classifyQueryComplexity } = require('./queryComplexityAnalyzer');
  const stufe = classifyQueryComplexity(letzteNutzerfrage || '');
  if (stufe.level === 'trivial' || stufe.level === 'simple') {
    return { denken: false, grund: `${stufe.level} (${stufe.reason})` };
  }
  return { denken: true, grund: `${stufe.level} (${stufe.reason})` };
}

module.exports = {
  NUM_CTX,
  VERLAUF_TOKEN_BUDGET,
  NUM_PREDICT,
  KEEP_ALIVE,
  PLAN_NUM_PREDICT_GROSS,
  PLAN_NUM_PREDICT_KLEIN,
  KONTEXT_SCHWELLE,
  MAX_SUBAGENTEN,
  qualitaetsModell,
  thinkingGewuenscht,
  kannDenken,
  sollDenken,
};
