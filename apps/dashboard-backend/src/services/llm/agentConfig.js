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
 * Ab welchem Füllstand (Anteil von NUM_CTX) der Kontext-Haushalt alte
 * Werkzeug-Ausgaben eindampft. Puffer unter 1.0, weil die Token-Schätzung
 * (Zeichen/3.2) bewusst grob ist.
 */
const KONTEXT_SCHWELLE = 0.7;

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

module.exports = {
  NUM_CTX,
  NUM_PREDICT,
  KEEP_ALIVE,
  KONTEXT_SCHWELLE,
  qualitaetsModell,
  thinkingGewuenscht,
  kannDenken,
};
