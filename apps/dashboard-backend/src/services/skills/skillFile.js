/**
 * Skill-Definitionsdateien (Plan 011, Schritt 4).
 *
 * Ein Skill ist eine Markdown-Datei mit YAML-Kopfdaten unter `data/skills/`.
 * Die Kopfdaten sagen, was der Skill braucht und darf; der Markdown-Rumpf ist
 * sein Prompt und enthält `{{argument}}`-Platzhalter.
 *
 * Die Datei ist die Wahrheit — der Anlege-Dialog erzeugt sie nur. Deshalb muss
 * das Lesen genauso streng prüfen wie das Schreiben (siehe schemas/skills.js);
 * eine von Hand editierte Datei darf den Runner nicht in undefiniertes
 * Verhalten schicken.
 *
 * Beispiel (data/skills/recherche.md):
 *
 *   ---
 *   name: recherche
 *   beschreibung: Recherchiert ein Thema im Web und fasst es zusammen.
 *   argumente:
 *     - name: thema
 *       typ: freitext
 *       pflicht: true
 *   werkzeuge: [web_suche, web_lesen, subagent]
 *   rollen:
 *     - name: leser
 *       werkzeuge: [web_lesen]
 *       ergebnis: { felder: [fakten], max_zeichen: 2000 }
 *       prompt: Lies die Seite und gib nur die belegten Fakten zurück.
 *   ---
 *   Recherchiere gründlich zum Thema {{thema}}.
 */

const yaml = require('js-yaml');
const { ValidationError } = require('../../utils/errors');
const { SkillDefinition } = require('../../schemas/skills');

/** Platzhalter im Prompt: {{name}} — bewusst dieselbe Syntax wie in n8n-Templates. */
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
 * Parst und VALIDIERT den Text einer Skill-Datei.
 * @param {string} text - Roher Dateiinhalt.
 * @param {{ name?: string }} [opts] - `name` erlaubt es, den Dateinamen als
 *   Quelle der Wahrheit zu nehmen, falls die Kopfdaten keinen Namen tragen.
 * @returns {object} Normalisierte Skill-Definition.
 * @throws {ValidationError} bei ungültigem YAML oder Schema-Verstoß.
 */
function parseSkillFile(text, opts = {}) {
  if (typeof text !== 'string') {
    throw new ValidationError('Skill-Datei ist leer oder ungültig');
  }

  const { front, body } = splitFrontmatter(text);

  let meta = {};
  if (front.trim().length > 0) {
    try {
      meta = yaml.load(front) || {};
    } catch (err) {
      throw new ValidationError(`Skill-Kopfdaten sind kein gültiges YAML: ${err.message}`);
    }
    if (typeof meta !== 'object' || Array.isArray(meta)) {
      throw new ValidationError('Skill-Kopfdaten müssen ein Objekt sein');
    }
  }

  // Der Dateiname gewinnt nicht über die Kopfdaten, füllt aber eine Lücke:
  // so bleibt eine Datei ohne `name:` ladbar, statt hart zu scheitern.
  const candidate = {
    ...meta,
    name: typeof meta.name === 'string' && meta.name.trim() ? meta.name.trim() : opts.name,
    systemPrompt: body,
  };

  const parsed = SkillDefinition.safeParse(candidate);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first.path.length ? ` (${first.path.join('.')})` : '';
    throw new ValidationError(`Skill ist ungültig${where}: ${first.message}`, {
      issues: parsed.error.issues.map(i => ({ pfad: i.path.join('.'), meldung: i.message })),
    });
  }

  const skill = parsed.data;

  // Platzhalter gegen deklarierte Argumente prüfen. Ein Platzhalter ohne
  // Argument bliebe beim Ausführen als roher `{{name}}`-Text im Prompt stehen —
  // das Modell bekäme dann eine Anweisung, die es nicht erfüllen kann.
  const placeholders = extractPlaceholders(skill.systemPrompt);
  const argNames = skill.argumente.map(a => a.name);
  const unknown = placeholders.filter(p => !argNames.includes(p));
  if (unknown.length > 0) {
    throw new ValidationError(
      `Prompt verwendet unbekannte Platzhalter: ${unknown.map(u => `{{${u}}}`).join(', ')}. ` +
        `Deklarierte Argumente: ${argNames.length ? argNames.join(', ') : '(keine)'}`
    );
  }

  return skill;
}

/**
 * Serialisiert eine Skill-Definition zurück in eine Markdown-Datei.
 * Gegenstück zu `parseSkillFile` — der Anlege-Dialog nutzt das für die
 * Live-Vorschau, damit sichtbar bleibt, dass die Datei die Wahrheit ist.
 * @param {object} skill - Bereits validierte Definition.
 * @returns {string} Dateiinhalt.
 */
function serializeSkillFile(skill) {
  const head = {
    name: skill.name,
    ...(skill.beschreibung ? { beschreibung: skill.beschreibung } : {}),
    ...(skill.modell ? { modell: skill.modell } : {}),
    ...(skill.argumente && skill.argumente.length ? { argumente: skill.argumente } : {}),
    ...(skill.ordner && skill.ordner.length ? { ordner: skill.ordner } : {}),
    ...(skill.werkzeuge && skill.werkzeuge.length ? { werkzeuge: skill.werkzeuge } : {}),
    ...(skill.rollen && skill.rollen.length ? { rollen: skill.rollen } : {}),
    ...(skill.grenzen ? { grenzen: skill.grenzen } : {}),
  };

  const front = yaml.dump(head, { lineWidth: 100, noRefs: true, quotingType: '"' });
  return `---\n${front}---\n\n${String(skill.systemPrompt || '').trim()}\n`;
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
  parseSkillFile,
  serializeSkillFile,
  splitFrontmatter,
  extractPlaceholders,
  fillPlaceholders,
  PLACEHOLDER_RE,
};
