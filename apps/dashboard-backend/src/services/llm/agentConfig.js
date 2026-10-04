/**
 * Denk-Stellschrauben der Modell-Aufrufe (Harness v2, 2026-07-30).
 *
 * Thinking ist eine MODELL-Eigenschaft: qwen3 & Co. koennen es, Coder- und
 * Gemma-Modelle nicht. Gelesen von `services/flows/subagent.js`. Die
 * Konstanten des Chat-Agenten (Kontextfenster, Plan-Deckel, Verlauf,
 * Subagent-Budget) sind mit dem Chat gefallen; ein Flow traegt seine Grenzen
 * selbst (`grenzen` im Flow-Kopf).
 */

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
  thinkingGewuenscht,
  kannDenken,
};
