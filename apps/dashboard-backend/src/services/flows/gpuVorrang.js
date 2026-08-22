/**
 * Dem Indexer sagen, dass der Nutzer gerade die GPU braucht (Fund 22.08.2026).
 *
 * `gpuQueue.js` nennt sich in seiner Kopfzeile "die EINE Sperre fuer alle
 * lokalen Modell-Aufrufe". Das stimmte fuer alles, was IN DIESEM PROZESS
 * laeuft. Der Document-Indexer ist ein eigener Container, ruft Ollama direkt
 * auf und kann diesen Mutex nicht nehmen.
 *
 * **Gemessen auf dem Orin am 22.08.2026.** Der Indexer reichert im Hintergrund
 * an und laedt dafuer `qwen3:14b` (14 GB), der Chat rechnet mit dem
 * 27B-Modell (22 GB). Beide zusammen passen nicht in das Budget, also wirft
 * Ollama abwechselnd das jeweils andere heraus. In `llm_model_switches` stehen
 * fuer vierzig Minuten 35 Zeilen `auto_unload_ollama_keepalive` und neun
 * Ladevorgaenge zwischen 11 827 und 60 066 Millisekunden. Der Nutzer wartet
 * also bei fast jeder Chat-Runde eine halbe bis eine ganze Minute auf ein
 * Modell, das kurz zuvor schon im Speicher war.
 *
 * **Eine Frist, kein Schalter.** Gemeldet wird "halte dich bis T zurueck", und
 * solange gerechnet wird, wird die Frist erneuert. Stirbt das Backend mitten
 * im Lauf, laeuft die Frist ab und der Indexer arbeitet von selbst weiter. Ein
 * Schalter haette ihn nach einem Absturz fuer immer stillgelegt.
 *
 * **Nie im Weg.** Jeder Aufruf ist abgeschickt und vergessen, mit kurzem
 * Zeitlimit. Ein Indexer, der nicht antwortet, darf den Chat nicht bremsen —
 * das waere derselbe Fehler in der anderen Richtung.
 */

// Bewusst `fetch` und nicht `axios`: die Meldung faehrt sonst auf derselben
// Attrappe wie die Modell-Aufrufe. In `runFlow.test.js` stand danach die
// Vorrang-Meldung als `axios.post.mock.calls[0]` vor dem Modell-Aufruf, und 21
// Tests prueften plotzlich den falschen Aufruf. Ein Nebenweg, der fremde Tests
// verschiebt, ist der falsche Nebenweg.
const logger = require('../../utils/logger');

const INDEXER_URL = process.env.DOCUMENT_INDEXER_URL || 'http://document-indexer:9102';
// Wie lange eine einzelne Meldung gilt. Kurz genug, dass eine vergessene
// Freigabe den Indexer nicht lange aufhaelt, lang genug, dass zwischen zwei
// Erneuerungen keine Luecke entsteht.
const FRIST_S = parseInt(process.env.GPU_VORRANG_FRIST_S || '30', 10);
const ERNEUERN_MS = Math.max(1000, Math.round((FRIST_S * 1000) / 3));
const ZEITLIMIT_MS = parseInt(process.env.GPU_VORRANG_ZEITLIMIT_MS || '1500', 10);
const AN = process.env.GPU_VORRANG !== 'false';

let meldungenFehlgeschlagen = 0;

async function melde(sekunden) {
  if (!AN) {return;}
  try {
    await fetch(`${INDEXER_URL}/gpu/vorrang`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sekunden }),
      signal: AbortSignal.timeout(ZEITLIMIT_MS),
    });
    meldungenFehlgeschlagen = 0;
  } catch (err) {
    // Einmal laut, danach still. Ein abgeschalteter Indexer soll nicht bei
    // jedem Chat-Zug eine Zeile schreiben.
    //
    // `warn` und nicht `debug`: zwanzig Testdateien legen den Logger als
    // `{ info, warn, error }` an, und ein Aufruf von `debug` liess dort acht
    // fremde Tests scheitern. Eine Nebensache darf nicht die Stelle sein, an
    // der etwas bricht.
    if (meldungenFehlgeschlagen === 0) {
      logger.warn(`[GPU-Vorrang] Indexer nicht erreichbar: ${err.message}`);
    }
    meldungenFehlgeschlagen += 1;
  }
}

/**
 * Haelt den Vorrang, solange `fn` laeuft.
 *
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
async function mitVorrang(fn) {
  if (!AN) {return fn();}
  melde(FRIST_S);
  const takt = setInterval(() => melde(FRIST_S), ERNEUERN_MS);
  // Der Takt darf einen Neustart des Prozesses nicht aufhalten.
  if (typeof takt.unref === 'function') {takt.unref();}
  try {
    return await fn();
  } finally {
    clearInterval(takt);
    melde(0);
  }
}

module.exports = { mitVorrang, _melde: melde, _FRIST_S: FRIST_S };
