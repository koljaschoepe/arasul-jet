/**
 * Query Complexity Analyzer
 * Classifies user queries to auto-disable think mode for simple questions.
 * Saves GPU time by avoiding 50-100 thinking tokens on trivial queries.
 */

/**
 * Classify query complexity using cheap heuristics (no LLM call).
 * @param {string} userMessage - The user's last message
 * @returns {{ level: 'trivial'|'simple'|'medium'|'complex', reason: string }}
 */
function classifyQueryComplexity(userMessage) {
  const msg = (userMessage || '').trim();
  const lower = msg.toLowerCase();

  // TRIVIAL: Greetings, very short social messages
  if (
    /^(hallo|hi|hey|moin|guten\s*(morgen|tag|abend)|servus|danke|bye|tschüss|ciao)\s*[.,!?]?\s*$/i.test(
      lower
    )
  ) {
    return { level: 'trivial', reason: 'greeting' };
  }

  // SIMPLE: Very short messages without reasoning keywords
  if (msg.length < 40 && !/warum|wieso|erkläre|analysiere|vergleiche|implementiere/i.test(lower)) {
    return { level: 'simple', reason: 'very_short' };
  }

  // SIMPLE: Short factual questions
  if (
    /^(was|wer|wo|wann|wie\s+viel|wie\s+lange|wie\s+heißt|welche[rs]?)\s+/i.test(lower) &&
    msg.length < 150
  ) {
    return { level: 'simple', reason: 'factual' };
  }

  // SIMPLE: Direct commands like "Sage X", "Nenne X", "Liste X"
  if (/^(sage?|nenne?|liste|zähle?|übersetze?|schreibe?)\s+/i.test(lower) && msg.length < 120) {
    return { level: 'simple', reason: 'direct_command' };
  }

  // COMPLEX: Code blocks, reasoning keywords, analysis requests
  if (/```/.test(msg)) {
    return { level: 'complex', reason: 'code_block' };
  }
  if (
    /analysiere|implementiere|designe?|debugge?|beweise|refaktor|optimiere|architektur/i.test(lower)
  ) {
    return { level: 'complex', reason: 'reasoning_keyword' };
  }
  if (msg.length > 500) {
    return { level: 'complex', reason: 'long_query' };
  }

  // MEDIUM: Everything else
  return { level: 'medium', reason: 'default' };
}

module.exports = { classifyQueryComplexity };
