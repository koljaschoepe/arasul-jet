#!/usr/bin/env node
// Beispiel-Tool-Konnektor: liest eine JSON-Anfrage von stdin und antwortet mit
// JSON auf stdout. Das ist die Vorlage für ein Werkzeug, das ein Skill oder die
// Automation aufrufen kann. Halte es zustandslos und schnell.
//
// Eingabe:  { "text": "..." }
// Ausgabe:  { "ok": true, "laenge": <n>, "echo": "..." }

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').trim();
}

const raw = await readStdin();
let eingabe = {};
try {
  eingabe = raw ? JSON.parse(raw) : {};
} catch {
  process.stdout.write(JSON.stringify({ ok: false, fehler: 'Ungültiges JSON' }) + '\n');
  process.exit(1);
}

const text = typeof eingabe.text === 'string' ? eingabe.text : '';
process.stdout.write(JSON.stringify({ ok: true, laenge: text.length, echo: text }) + '\n');
