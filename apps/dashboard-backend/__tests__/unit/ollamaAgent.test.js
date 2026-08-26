/**
 * Niemand ruft den Modelldienst ohne eigenen Agenten (23.08.2026).
 *
 * Seit Node 19 hat `http.globalAgent` die Vorgabe `timeout: 5000`. Ein
 * `http.request(...)` ohne `agent` erbt sie, und der Sockel stirbt nach fuenf
 * Sekunden Stille. Bis zum ersten Token eines 27B-Modells vergeht regelmaessig
 * mehr, erst recht wenn das Modell noch geladen wird.
 *
 * Auf dem Orin gemessen: der Brueckenaufruf einer Erweiterung starb reihum nach
 * 5,0 bis 5,3 Sekunden, und der Modelldienst protokollierte dazu 499 (Client
 * hat aufgelegt). Der Chat hatte seinen Agenten, die Bruecke nicht — und weil
 * ein schnell antwortendes Modell den Fehler verdeckt, wirkte er launisch.
 *
 * Der Test prueft die Quelle, nicht das Verhalten: ein Aufruf ohne Agent
 * scheitert erst auf echter Hardware unter Last, also genau dort, wo es
 * niemand mehr sieht.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const { ollamaAgent, OLLAMA_AGENT_TIMEOUT_MS } = require('../../src/services/llm/ollamaAgent');

/** Dateien, die roh gegen den Modelldienst sprechen. */
const QUELLEN = [
  'src/services/llm/llmOllamaStream.js',
  'src/services/llm/llmJobProcessor.js',
];

describe('Agent zum Modelldienst', () => {
  test('Nodes Vorgabe ist wirklich fuenf Sekunden', () => {
    // Die Praemisse. Aendert Node das eines Tages, soll dieser Test es sagen,
    // statt dass der Kommentar in ollamaAgent.js still falsch wird.
    expect(http.globalAgent.options.timeout).toBe(5000);
  });

  test('unser Agent hat ein langes Zeitlimit', () => {
    expect(ollamaAgent.options.timeout).toBe(OLLAMA_AGENT_TIMEOUT_MS);
    expect(OLLAMA_AGENT_TIMEOUT_MS).toBeGreaterThanOrEqual(300000);
  });

  test.each(QUELLEN)('%s reicht einen Agenten mit', rel => {
    const quelle = fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8');
    const aufrufe = quelle.split('http.request(').length - 1;
    expect(aufrufe).toBeGreaterThan(0);
    // Jeder `http.request(` muss von einem `agent:` begleitet sein. Grob, aber
    // es faengt genau den Fall, der hier passiert ist: einer vergessen.
    const mitAgent = quelle.split(/agent:\s*/).length - 1;
    expect(mitAgent).toBeGreaterThanOrEqual(aufrufe);
  });

  test('alle drei ziehen denselben Agenten', () => {
    for (const rel of QUELLEN) {
      const quelle = fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8');
      expect(quelle).toMatch(/ollamaAgent/);
    }
  });
});
