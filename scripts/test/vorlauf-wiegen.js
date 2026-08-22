#!/usr/bin/env node
/**
 * Wiegt den Vorlauf des Agentenpfads, Posten fuer Posten (Plan 023 D7).
 *
 * Warum es dieses Werkzeug gibt
 * -----------------------------
 * D7 verlangt eine Zahl: "Bei einer Unterhaltung mit 20 Nachrichten liegt der
 * Vorlauf unter 2500 Token." Gemessen wurde sie am 21.08.2026 von Hand, mit
 * einem Wegwerf-Skript. Damit ist sie beim naechsten Satz, den jemand in die
 * AGENT_ANWEISUNG schreibt, still wieder falsch, und niemand merkt es.
 *
 * Ollama gibt bei `num_predict: 0` den `prompt_eval_count` zurueck, ohne ein
 * Wort zu erzeugen. Damit laesst sich jeder Bestandteil einzeln wiegen, ohne
 * dass etwas ausgeliefert werden muss. Genau das tut dieses Skript, und zwar
 * gegen dieselben Bausteine, die `chatAgentRunner` zusammensetzt: die
 * Werkzeugdefinitionen aus der Registry und die AGENT_ANWEISUNG aus dem
 * Runner, nicht eine Kopie davon.
 *
 * Was NICHT gewogen wird
 * ----------------------
 * Basis-Systemprompt und Unternehmenskontext haengen an der Datenbank des
 * Geraets (Profil, Zusatzkontext). Sie sind zusammen laut der Messung vom
 * 21.08.2026 rund 136 Token, also Rundung gegenueber den beiden Posten, um
 * die es hier geht. Wer sie mitwiegen will, misst am Geraet ueber
 * `llm_jobs.prompt_tokens` (seit D7 Schritt 1 gefuellt).
 *
 * Die Ordnerstruktur bleibt ebenfalls draussen: sie haengt am Projekt, ist
 * gemessen der beste der geprueften Zuschnitte und wird von D7 ausdruecklich
 * nicht angefasst.
 *
 * Aufruf
 * ------
 *   node scripts/test/vorlauf-wiegen.js                     # gegen localhost
 *   OLLAMA_URL=http://jetson:11434 node scripts/test/vorlauf-wiegen.js
 *   node scripts/test/vorlauf-wiegen.js --modell qwen3-coder:30b
 *   node scripts/test/vorlauf-wiegen.js --grenze 2500       # Exit 1 bei Ueberschreitung
 */

const path = require('path');

const WURZEL = path.resolve(__dirname, '..', '..');
const BACKEND = path.join(WURZEL, 'apps', 'dashboard-backend');

// Der Runner zieht beim Laden die Konfiguration hoch und will ein Passwort
// sehen. Gewogen wird hier nichts, was die Datenbank braucht.
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'nur-zum-wiegen';

const { AGENT_WERKZEUGE, AGENT_ANWEISUNG } = require(
  path.join(BACKEND, 'src', 'services', 'llm', 'chatAgentRunner')
);
const { buildTools } = require(path.join(BACKEND, 'src', 'services', 'flows', 'toolRegistry'));
const { verlaufAufBudget, VERLAUF_TOKEN_BUDGET } = require(
  path.join(BACKEND, 'src', 'services', 'llm', 'chatAgentRunner')
);
const { TodoListeTool } = require(path.join(BACKEND, 'src', 'services', 'llm', 'agentTodoTool'));

// Ein Bestandteil, der beim Umbau des Runners wegfaellt oder umbenannt wird,
// kaeme hier als `undefined` an. Ollama laesst eine Nachricht ohne Inhalt
// stillschweigend weg, und das Werkzeug meldete dann einen wunderbar kleinen
// Vorlauf. Genau das ist am 22.08.2026 passiert: AGENT_ANWEISUNG war nicht
// exportiert, die Messung sagte 15 Token statt 1293.
for (const [name, wert] of Object.entries({ AGENT_WERKZEUGE, AGENT_ANWEISUNG })) {
  if (!wert || (typeof wert === 'string' && wert.trim() === '') || wert.length === 0) {
    console.error(
      `Wiegen abgebrochen: ${name} kommt leer aus chatAgentRunner. ` +
        'Entweder ist der Export weg oder der Name hat sich geaendert.'
    );
    process.exit(2);
  }
}

const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';

function argument(name, vorgabe) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : vorgabe;
}

const MODELL = argument('modell', 'qwen3-coder:30b');
const GRENZE = Number(argument('grenze', 0));

/**
 * Fragt Ollama, wie viele Token ein Prompt kostet, ohne ein Wort zu erzeugen.
 * @param {object[]} messages
 * @param {object[]} tools
 * @returns {Promise<number>} prompt_eval_count
 */
async function wiegen(messages, tools) {
  const antwort = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELL,
      messages,
      ...(tools && tools.length > 0 ? { tools } : {}),
      stream: false,
      options: { num_predict: 0 },
    }),
  });
  if (!antwort.ok) {
    throw new Error(`Ollama antwortete ${antwort.status}: ${await antwort.text()}`);
  }
  const daten = await antwort.json();
  const zahl = Number(daten.prompt_eval_count);
  if (!Number.isFinite(zahl) || zahl <= 0) {
    throw new Error(`Ollama lieferte keinen prompt_eval_count: ${JSON.stringify(daten)}`);
  }
  return zahl;
}

async function main() {
  const werkzeuge = [...buildTools(AGENT_WERKZEUGE), new TodoListeTool()];
  const toolDefs = werkzeuge.map(t => t.toOllamaToolDefinition());
  const frage = [{ role: 'user', content: 'Was steht in der Preisliste?' }];

  console.log(`Modell: ${MODELL}`);
  console.log(`Ollama: ${OLLAMA}`);
  console.log('');

  const posten = [];
  let vorher = 0;
  const stufe = async (etikett, messages, tools) => {
    const token = await wiegen(messages, tools);
    posten.push([etikett, token, vorher === 0 ? null : token - vorher]);
    vorher = token;
    return token;
  };

  await stufe('nur die Frage', frage, []);
  await stufe(
    'Agent-Anweisung',
    [{ role: 'system', content: AGENT_ANWEISUNG }, ...frage],
    []
  );
  const gesamt = await stufe(
    `Werkzeuge, ${toolDefs.length} strukturell`,
    [{ role: 'system', content: AGENT_ANWEISUNG }, ...frage],
    toolDefs
  );

  const breite = Math.max(...posten.map(p => p[0].length));
  for (const [etikett, token, dazu] of posten) {
    const anteil = dazu ? ` ${String(Math.round((dazu / gesamt) * 100)).padStart(3)} %` : '';
    console.log(
      `${etikett.padEnd(breite)}  ${String(token).padStart(6)}` +
        `  ${(dazu ? `+${dazu}` : '').padStart(7)}${anteil}`
    );
  }
  console.log('');

  // Je Werkzeug einzeln: zeigt, welche Beschreibung teuer ist. Gewogen wird
  // gegen die Frage allein, damit die Zahlen vergleichbar bleiben.
  const nurFrage = posten[0][1];
  const einzeln = [];
  for (const def of toolDefs) {
    const token = await wiegen(frage, [def]);
    einzeln.push([def.function.name, token - nurFrage]);
  }
  einzeln.sort((a, b) => b[1] - a[1]);
  console.log('Je Werkzeug:');
  const wBreite = Math.max(...einzeln.map(e => e[0].length));
  for (const [name, token] of einzeln) {
    console.log(`  ${name.padEnd(wBreite)}  ${String(token).padStart(5)}`);
  }
  const summe = einzeln.reduce((s, e) => s + e[1], 0);
  console.log(`  ${'Summe'.padEnd(wBreite)}  ${String(summe).padStart(5)}`);
  console.log('');

  // Der schlimmste Verlauf, den MAX_MESSAGE_CHARS zulaesst: zwoelf Nachrichten
  // a 8000 Zeichen. Vor dem Budget gingen sie vollstaendig mit.
  const schlimmst = Array.from({ length: 12 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: 'Wort '.repeat(1600).slice(0, 8000),
  }));
  const anweisung = [{ role: 'system', content: AGENT_ANWEISUNG }];
  const ohneBudget = await wiegen([...anweisung, ...schlimmst], toolDefs);
  const mitBudget = await wiegen(
    [...anweisung, ...verlaufAufBudget(schlimmst).verlauf],
    toolDefs
  );
  console.log('Zwoelf Nachrichten a 8000 Zeichen (die Kappungsgrenze):');
  console.log(`  ohne Verlaufsbudget  ${String(ohneBudget).padStart(6)} Token`);
  console.log(
    `  mit Budget ${String(VERLAUF_TOKEN_BUDGET).padStart(4)}     ` +
      `${String(mitBudget).padStart(6)} Token   -${ohneBudget - mitBudget}`
  );
  console.log('');
  console.log(`Grundvorlauf ohne Verlauf und ohne Projektordner: ${gesamt} Token`);

  if (GRENZE > 0) {
    if (gesamt > GRENZE) {
      console.log(`FEHLER: ueber der Grenze von ${GRENZE}`);
      process.exit(1);
    }
    console.log(`unter der Grenze von ${GRENZE}`);
  }
}

main().catch(err => {
  console.error(`Wiegen fehlgeschlagen: ${err.message}`);
  process.exit(2);
});
