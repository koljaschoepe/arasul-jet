/**
 * Flow-Definitionsdateien (Plan 011, Schritt 4).
 *
 * Ein Flow ist eine Markdown-Datei mit YAML-Kopfdaten unter `data/flows/`.
 * Die Kopfdaten sagen, was der Flow braucht und darf; der Markdown-Rumpf ist
 * sein Prompt und enthält `{{argument}}`-Platzhalter.
 *
 * Die Datei ist die Wahrheit — der Anlege-Dialog erzeugt sie nur. Deshalb muss
 * das Lesen genauso streng prüfen wie das Schreiben (siehe schemas/flows.js);
 * eine von Hand editierte Datei darf den Runner nicht in undefiniertes
 * Verhalten schicken.
 *
 * Beispiel (data/flows/recherche.md):
 *
 *   ---
 *   name: recherche
 *   beschreibung: Recherchiert ein Thema im Web und fasst es zusammen.
 *   argumente:
 *     - name: thema
 *       typ: freitext
 *       pflicht: true
 *   werkzeuge: [dateien_lesen, dateien_suchen, subagent]
 *   rollen:
 *     - name: leser
 *       werkzeuge: [dateien_lesen]
 *       ergebnis: { felder: [fakten], max_zeichen: 2000 }
 *       prompt: Lies die Datei und gib nur die belegten Fakten zurück.
 *   ---
 *   Recherchiere gründlich zum Thema {{thema}}.
 */

const yaml = require('js-yaml');
const { ValidationError } = require('../../utils/errors');
const { FlowDefinition } = require('../../schemas/flows');

/** Platzhalter im Prompt: {{name}}. */
const PLACEHOLDER_RE = /\{\{\s*([a-z][a-z0-9_]{0,30})\s*\}\}/g;

/**
 * Zerlegt eine Rohdatei in YAML-Kopfdaten und Markdown-Rumpf.
 * Kopfdaten sind eine `---`-Zeile, ein YAML-Block und eine schließende `---`-Zeile.
 * @returns {{front: string, body: string}}
 */
function splitFrontmatter(text) {
  // Führendes UTF-8-BOM abschneiden, dann Zeilenenden normalisieren.
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const normalized = withoutBom.replace(/\r\n/g, '\n');
  const match = normalized.match(/^\s*---\n([\s\S]*?)\n---\s*(?:\n([\s\S]*))?$/);
  if (!match) {
    return { front: '', body: normalized.trim() };
  }
  return { front: match[1], body: (match[2] || '').trim() };
}

/**
 * Sammelt die Platzhalternamen aus einem Prompt (dedupliziert, in Reihenfolge).
 * @param {string} prompt
 * @returns {string[]}
 */
function extractPlaceholders(prompt) {
  const found = [];
  for (const m of String(prompt || '').matchAll(PLACEHOLDER_RE)) {
    if (!found.includes(m[1])) {
      found.push(m[1]);
    }
  }
  return found;
}

/**
 * Parst und VALIDIERT den Text einer Flow-Datei.
 * @param {string} text - Roher Dateiinhalt.
 * @param {{ name?: string }} [opts] - `name` erlaubt es, den Dateinamen als
 *   Quelle der Wahrheit zu nehmen, falls die Kopfdaten keinen Namen tragen.
 * @returns {object} Normalisierte Flow-Definition.
 * @throws {ValidationError} bei ungültigem YAML oder Schema-Verstoß.
 */
function parseFlowFile(text, opts = {}) {
  if (typeof text !== 'string') {
    throw new ValidationError('Flow-Datei ist leer oder ungültig');
  }

  const { front, body } = splitFrontmatter(text);

  let meta = {};
  if (front.trim().length > 0) {
    try {
      meta = yaml.load(front) || {};
    } catch (err) {
      throw new ValidationError(`Flow-Kopfdaten sind kein gültiges YAML: ${err.message}`);
    }
    if (typeof meta !== 'object' || Array.isArray(meta)) {
      throw new ValidationError('Flow-Kopfdaten müssen ein Objekt sein');
    }
  }

  // Der Dateiname gewinnt nicht über die Kopfdaten, füllt aber eine Lücke:
  // so bleibt eine Datei ohne `name:` ladbar, statt hart zu scheitern.
  const candidate = {
    ...meta,
    name: typeof meta.name === 'string' && meta.name.trim() ? meta.name.trim() : opts.name,
    systemPrompt: body,
  };

  const parsed = FlowDefinition.safeParse(candidate);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first.path.length ? ` (${first.path.join('.')})` : '';
    throw new ValidationError(`Flow ist ungültig${where}: ${first.message}`, {
      issues: parsed.error.issues.map(i => ({ pfad: i.path.join('.'), meldung: i.message })),
    });
  }

  const flow = parsed.data;

  // Platzhalter gegen deklarierte Argumente prüfen. Ein Platzhalter ohne
  // Argument bliebe beim Ausführen als roher `{{name}}`-Text im Prompt stehen —
  // das Modell bekäme dann eine Anweisung, die es nicht erfüllen kann.
  const placeholders = extractPlaceholders(flow.systemPrompt);
  const argNames = flow.argumente.map(a => a.name);
  const unknown = placeholders.filter(p => !argNames.includes(p));
  if (unknown.length > 0) {
    throw new ValidationError(
      `Prompt verwendet unbekannte Platzhalter: ${unknown.map(u => `{{${u}}}`).join(', ')}. ` +
        `Deklarierte Argumente: ${argNames.length ? argNames.join(', ') : '(keine)'}`
    );
  }

  return flow;
}

/**
 * Serialisiert eine Flow-Definition zurück in eine Markdown-Datei.
 * Gegenstück zu `parseFlowFile` — der Anlege-Dialog nutzt das für die
 * Live-Vorschau, damit sichtbar bleibt, dass die Datei die Wahrheit ist.
 * @param {object} flow - Bereits validierte Definition.
 * @returns {string} Dateiinhalt.
 */
function serializeFlowFile(flow) {
  const head = {
    name: flow.name,
    ...(flow.beschreibung ? { beschreibung: flow.beschreibung } : {}),
    ...(flow.modell ? { modell: flow.modell } : {}),
    ...(flow.argumente && flow.argumente.length ? { argumente: flow.argumente } : {}),
    ...(flow.ordner && flow.ordner.length ? { ordner: flow.ordner } : {}),
    ...(flow.werkzeuge && flow.werkzeuge.length ? { werkzeuge: flow.werkzeuge } : {}),
    ...(flow.rollen && flow.rollen.length ? { rollen: flow.rollen } : {}),
    ...(flow.schritte && flow.schritte.length ? { schritte: flow.schritte } : {}),
    ...(flow.grenzen ? { grenzen: flow.grenzen } : {}),
    // Nur schreiben, wenn es NICHT die Voreinstellung ist: sonst bekämen alle
    // vorhandenen Flow-Dateien beim nächsten Speichern eine Zeile dazu, die
    // nichts ändert (Plan 023 I2).
    ...(flow.betriebsart && flow.betriebsart !== 'autonom'
      ? { betriebsart: flow.betriebsart }
      : {}),
    ...(flow.ausgabe ? { ausgabe: flow.ausgabe } : {}),
  };

  const front = yaml.dump(head, { lineWidth: 100, noRefs: true, quotingType: '"' });
  return `---\n${front}---\n\n${String(flow.systemPrompt || '').trim()}\n`;
}

/**
 * Setzt die Argumentwerte in den Prompt ein.
 * @param {string} prompt
 * @param {Record<string,string>} values
 * @returns {string}
 */
function fillPlaceholders(prompt, values = {}) {
  return String(prompt || '').replace(PLACEHOLDER_RE, (whole, key) => {
    const v = values[key];
    return v == null ? whole : String(v);
  });
}

module.exports = {
  parseFlowFile,
  serializeFlowFile,
  splitFrontmatter,
  extractPlaceholders,
  fillPlaceholders,
  PLACEHOLDER_RE,
};
