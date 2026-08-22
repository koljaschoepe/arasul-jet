/**
 * Welche Cloud-Anbieter das Geraet kennt (Plan 023 D9).
 *
 * Hier stehen Adressen und Protokoll-Eigenheiten, KEINE Modellnamen. Welche
 * Modelle ein Anbieter hat, sagt der Anbieter selbst: beide bieten
 * GET /v1/models. Eine gepflegte Liste im Code waere am Tag ihres Schreibens
 * schon veraltet und verstiesse gegen Regel 1 aus CLAUDE.md, keine Fakten aus
 * dem Gedaechtnis.
 *
 * Das Praefix im Modellnamen ist die Trennlinie zum lokalen Katalog. Ein
 * Modell heisst nach aussen `extern:anthropic/claude-...`, und genau daran
 * erkennt der Chatpfad, dass er nicht zu Ollama gehen darf. Ein lokales Modell
 * kann diesen Namen nicht tragen: Ollama-Namen enthalten keinen Doppelpunkt
 * vor dem Anbieter, und `extern:` ist als Kennung reserviert.
 */

/** Alles, was extern laeuft, traegt dieses Praefix in seiner Modell-Id. */
const EXTERN_PREFIX = 'extern:';

const ANBIETER = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    basis: 'https://api.anthropic.com',
    modellePfad: '/v1/models',
    chatPfad: '/v1/messages',
    schluesselHinweis: 'beginnt mit sk-ant-',
    /** @param {string} schluessel */
    kopfzeilen: schluessel => ({
      'x-api-key': schluessel,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    }),
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    basis: 'https://api.openai.com',
    modellePfad: '/v1/models',
    chatPfad: '/v1/chat/completions',
    schluesselHinweis: 'beginnt mit sk-',
    /** @param {string} schluessel */
    kopfzeilen: schluessel => ({
      authorization: `Bearer ${schluessel}`,
      'content-type': 'application/json',
    }),
  },
};

/** @returns {string[]} */
function anbieterNamen() {
  return Object.keys(ANBIETER);
}

/**
 * @param {string} name
 * @returns {object|null}
 */
function anbieter(name) {
  return ANBIETER[name] || null;
}

/**
 * Baut die nach aussen sichtbare Modell-Id.
 * @param {string} anbieterName
 * @param {string} modellName
 * @returns {string} z. B. "extern:anthropic/claude-sonnet-4-5"
 */
function externeId(anbieterName, modellName) {
  return `${EXTERN_PREFIX}${anbieterName}/${modellName}`;
}

/**
 * Zerlegt eine externe Modell-Id wieder.
 *
 * Gibt null zurueck, wenn die Id nicht extern ist ODER wenn sie das Praefix
 * traegt, aber nicht auf einen bekannten Anbieter zeigt. Der zweite Fall ist
 * wichtig: eine Id wie `extern:erfunden/x` darf nicht still zu Ollama
 * durchrutschen, sie ist schlicht ungueltig.
 *
 * @param {string} id
 * @returns {{anbieter:string, modell:string}|null}
 */
function zerlegeId(id) {
  const text = String(id || '');
  if (!text.startsWith(EXTERN_PREFIX)) {
    return null;
  }
  const rest = text.slice(EXTERN_PREFIX.length);
  const schnitt = rest.indexOf('/');
  if (schnitt <= 0 || schnitt === rest.length - 1) {
    return null;
  }
  const anbieterName = rest.slice(0, schnitt);
  if (!ANBIETER[anbieterName]) {
    return null;
  }
  return { anbieter: anbieterName, modell: rest.slice(schnitt + 1) };
}

/**
 * Traegt diese Modell-Id das externe Praefix?
 *
 * Bewusst NICHT dasselbe wie `zerlegeId(id) !== null`: eine Id mit Praefix,
 * aber unbekanntem Anbieter, ist extern gemeint und trotzdem ungueltig. Wer
 * nur wissen will, ob er den lokalen Pfad verlassen muss, fragt hier.
 *
 * @param {string} id
 * @returns {boolean}
 */
function istExtern(id) {
  return String(id || '').startsWith(EXTERN_PREFIX);
}

module.exports = {
  EXTERN_PREFIX,
  ANBIETER,
  anbieterNamen,
  anbieter,
  externeId,
  zerlegeId,
  istExtern,
};
