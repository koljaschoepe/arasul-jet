/**
 * EIN HTTP-Agent fuer alle Aufrufe an den Modelldienst (23.08.2026).
 *
 * Warum das ein eigenes Modul ist und nicht einfach weggelassen wird: seit
 * Node 19 hat `http.globalAgent` die Vorgabe `keepAlive: true, timeout: 5000`.
 * Wer `http.request(...)` ohne eigenen Agenten aufruft, bekommt damit ein
 * FUENF-SEKUNDEN-Zeitlimit auf den Sockel. Der Sockel wird zerstoert, sobald
 * fuenf Sekunden lang nichts flieht.
 *
 * Fuer ein 27B-Modell ist das der Normalfall, nicht die Ausnahme: bis zum
 * ersten Token vergehen leicht mehr als fuenf Sekunden, erst recht wenn das
 * Modell geladen werden muss oder etwas anderes gerade die GPU haelt.
 *
 * Auf dem Orin gemessen. Der Brueckenaufruf einer Erweiterung starb reihum
 * nach 5,0 bis 5,3 Sekunden mit "socket hang up", und im Zugriffsprotokoll des
 * Modelldienstes stand dazu:
 *
 *   [GIN] 07:11:34 | 499 | 5.285065629s | 172.30.0.74 | POST "/api/chat"
 *
 * 499 heisst: der Client hat aufgelegt. Der Client waren wir. Antwortete das
 * Modell schnell genug, ging derselbe Aufruf durch, deshalb wirkte der Fehler
 * launisch und war es nie.
 *
 * Der Chat-Pfad hatte seinen eigenen Agenten schon; die Bruecke nicht. Zwei
 * Wahrheiten waeren hier ein Fehler, also steht der Agent jetzt an einer
 * Stelle. `scripts/test/ollama-agent.py` haelt fest, dass niemand den
 * Modelldienst ohne ihn anruft.
 */

const http = require('http');

/** Zehn Minuten. Ein langer Lauf soll nicht am Transport scheitern. */
const TIMEOUT_MS = 600000;

const ollamaAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 5,
  maxFreeSockets: 2,
  timeout: TIMEOUT_MS,
});

module.exports = {
  ollamaAgent,
  OLLAMA_AGENT_TIMEOUT_MS: TIMEOUT_MS,
  destroyOllamaAgent: () => ollamaAgent.destroy(),
};
