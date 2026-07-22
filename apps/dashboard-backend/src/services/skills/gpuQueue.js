/**
 * GPU-Warteschlange (Plan 011, Schritt 10) — die EINE Sperre für alle lokalen
 * Modell-Aufrufe, geteilt zwischen Chat und Skills.
 *
 * Auf der einen Jetson-GPU darf immer nur EIN lokaler Modell-Lauf gleichzeitig
 * laufen — sonst GPU-OOM. Der Chat serialisiert seine Aufrufe bereits über den
 * llmQueueService (ein Job zur Zeit). Ein Skill-Lauf ist aber ein ZWEITER
 * Aufrufer der GPU; ohne eine GEMEINSAME Sperre könnten ein Chat-Aufruf und ein
 * Skill-Aufruf zugleich auf die GPU treffen (llmQueueService und das frühere
 * gpuGate waren zwei getrennte Mutexe, die nichts voneinander wussten).
 *
 * Nutzer-Entscheidung (2026-07-22): strikt einer nach dem anderen, volle
 * Rechenleistung auf den laufenden Vorgang; wenn nötig, wartet auch der Chat.
 * Bewusst KEINE Priorisierung — das Chat-Interface wird langfristig nur noch
 * Auslöser für Skills, kein eigener Dauerbetrieb.
 *
 * Deshalb geht der EIGENTLICHE Ollama-Aufruf des Chats (streamFromOllama in
 * services/llm/llmOllamaStream.js) durch DIESELBE Sperre wie die Skill-Aufrufe.
 * Wer zuerst kommt, mahlt zuerst (der Mutex ist FIFO-fair, siehe AsyncMutex);
 * der andere wartet, bis der Vorgang fertig ist — beim Chat bis der Stream zu
 * Ende ist, beim Skill bis der eine Modell-Aufruf zurück ist. Cloud-Provider
 * berühren die GPU nicht; im rein lokalen Arasul gibt es sie ohnehin nicht.
 */

const AsyncMutex = require('../llm/AsyncMutex');

// Ein einziger, prozessweiter Mutex für ALLE lokalen Modell-Aufrufe (Chat wie
// Skill). Dass es genau EINE Instanz ist, ist der ganze Punkt — deshalb lebt
// sie an dieser einen Stelle und wird von beiden Pfaden importiert.
const gpuMutex = new AsyncMutex();

/**
 * Führt `fn` unter exklusivem GPU-Zugriff aus. Serialisiert alle Aufrufer:
 * der nächste startet erst, wenn der vorherige (auch bei Fehler) fertig ist.
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
function withGpuLock(fn) {
  return gpuMutex.withLock(fn);
}

module.exports = { withGpuLock, _gpuMutex: gpuMutex };
