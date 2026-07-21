/**
 * Werkzeug-Registry für Skills (Plan 011, Schritt 6).
 *
 * Übersetzt die im Skill deklarierten Werkzeugnamen in ausführbare Instanzen.
 * Sie ist die Stelle, an der die Werkzeug-Freigabe eines Skills technisch
 * durchgesetzt wird: Der Runner bekommt ausschließlich das, was der Skill
 * deklariert hat — nicht alles, was es gibt.
 *
 * Noch nicht implementierte Werkzeuge (Terminal, Web, Subagent — Schritte 7, 8
 * und 11) werden hier bewusst als "noch nicht verfügbar" gemeldet, statt still
 * zu fehlen. Ein Skill, der sie deklariert, ist gültig und lässt sich speichern;
 * beim Ausführen sagt das Werkzeug dann klar, woran es liegt.
 */

const { DateienLesenTool, DateienSchreibenTool } = require('./tools/dateien');
const RagSucheTool = require('./tools/rag');
const BaseTool = require('../../tools/baseTool');

/**
 * Platzhalter für ein Werkzeug, das der Plan vorsieht, das aber noch nicht
 * gebaut ist. Meldet den Grund als Text, damit ein Lauf nicht kommentarlos
 * ins Leere greift.
 */
class NochNichtVerfuegbarTool extends BaseTool {
  constructor(toolName, schritt) {
    super();
    this._name = toolName;
    this._schritt = schritt;
  }
  get name() {
    return this._name;
  }
  get description() {
    return `${this._name} (noch nicht verfügbar)`;
  }
  async execute() {
    return (
      `Das Werkzeug "${this._name}" ist noch nicht verfügbar ` +
      `(kommt mit Plan 011, Schritt ${this._schritt}).`
    );
  }
}

/** name → Fabrik. Muss zu VALID_TOOLS in schemas/skills.js passen. */
const FACTORIES = {
  dateien_lesen: () => new DateienLesenTool(),
  dateien_schreiben: () => new DateienSchreibenTool(),
  rag_suche: () => new RagSucheTool(),
  terminal: () => new NochNichtVerfuegbarTool('terminal', 7),
  web_suche: () => new NochNichtVerfuegbarTool('web_suche', 8),
  web_lesen: () => new NochNichtVerfuegbarTool('web_lesen', 8),
  subagent: () => new NochNichtVerfuegbarTool('subagent', 11),
};

/**
 * Baut die Werkzeuge für eine Liste deklarierter Namen.
 * @param {string[]} namen
 * @returns {import('../../tools/baseTool')[]}
 */
function buildTools(namen = []) {
  const seen = new Set();
  const tools = [];
  for (const name of namen) {
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    const factory = FACTORIES[name];
    // Unbekannte Namen werden schon vom Schema abgewiesen; hier still
    // überspringen statt werfen, damit eine künftige Schema-Erweiterung nicht
    // sofort jeden Lauf sprengt.
    if (factory) {
      tools.push(factory());
    }
  }
  return tools;
}

/** Welche Werkzeuge sind heute wirklich benutzbar? */
function implementedTools() {
  return Object.keys(FACTORIES).filter(n => !(FACTORIES[n]() instanceof NochNichtVerfuegbarTool));
}

module.exports = { buildTools, implementedTools, FACTORIES, NochNichtVerfuegbarTool };
