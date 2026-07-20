/**
 * GPU-Gate (Plan 010) — prozessweite Serialisierung lokaler Modell-Aufrufe.
 *
 * WARUM: Auf der einen Jetson-GPU darf immer nur EIN lokaler Modell-Lauf
 * gleichzeitig laufen, sonst droht GPU-OOM (das größte Risiko in Plan 010,
 * besonders bei parallelen Fluss-Zweigen). Der bestehende llmQueueService
 * garantiert genau das für den Chat/RAG-Pfad — ist aber eine streaming- und
 * chat_conversations-gebundene Job-Pipeline (llm_jobs + SSE-Subscriber) und
 * damit KEIN allgemeiner "führe diesen LLM-Call aus"-Primitiv. Die Agenten
 * brauchen nicht-streamende Function-Calling-Antworten.
 *
 * Deshalb reicht die Fluss-Engine lokale Aufrufe NICHT durch die Chat-Queue,
 * sondern durch dieses schlanke Gate: dieselbe "einer nach dem anderen"-
 * Garantie über denselben AsyncMutex-Primitiv wie die Queue, ohne die
 * Chat-Historie mit synthetischen Jobs zu verschmutzen. Cloud-Provider
 * (OpenAI/Anthropic) berühren die GPU nicht und laufen ohne Gate.
 */

const AsyncMutex = require('../llm/AsyncMutex');

// Ein einziger, prozessweiter Mutex für alle lokalen Modell-Aufrufe.
const gpuMutex = new AsyncMutex();

/**
 * Führe fn unter exklusivem GPU-Zugriff aus. Serialisiert alle Aufrufer:
 * der nächste startet erst, wenn der vorherige (auch bei Fehler) fertig ist.
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
function withGpuLock(fn) {
  return gpuMutex.withLock(fn);
}

module.exports = { withGpuLock, _gpuMutex: gpuMutex };
