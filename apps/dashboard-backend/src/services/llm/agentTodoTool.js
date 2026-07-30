/**
 * Aufgabenliste des Chat-Agenten (Harness v2, 2026-07-30) — das
 * TodoWrite-Muster von Claude Code für kleine lokale Modelle.
 *
 * Kleine Modelle driften in langen Läufen vom Ziel ab, weil der Plan nur
 * flüchtig im Nachrichten-Verlauf steht. Dieses Werkzeug macht den Plan zu
 * ZUSTAND: Der Harness hält die Liste, hängt sie VOR JEDER Runde ans
 * Kontextende (frisch, nie weggekürzt) und streamt jede Änderung live ans UI.
 *
 * Format bewusst Markdown-Checkboxen statt JSON-Array: eine Zeile je Aufgabe
 * ist für ein 7-30B-Modell praktisch nicht falsch zu schreiben, ein
 * verschachteltes JSON-Array schon.
 */

const BaseTool = require('../../tools/baseTool');

const MAX_LISTE_ZEICHEN = 4000;

/** Parst Markdown-Checkboxen zu strukturierten Einträgen (für UI-Events). */
function parseTodos(liste) {
  const todos = [];
  for (const zeile of String(liste || '').split('\n')) {
    const m = zeile.match(/^\s*[-*]\s*\[([ xX~])\]\s*(.+)$/);
    if (m) {
      todos.push({
        text: m[2].trim(),
        status: m[1] === ' ' ? 'offen' : m[1] === '~' ? 'laeuft' : 'fertig',
      });
    }
  }
  return todos;
}

class TodoListeTool extends BaseTool {
  get name() {
    return 'todo_liste';
  }

  get description() {
    return (
      'Pflegt deine Aufgabenliste für mehrschrittige Aufträge. Übergib die KOMPLETTE ' +
      'aktuelle Liste als Markdown-Checkboxen: "- [ ] offen", "- [~] in Arbeit", "- [x] erledigt". ' +
      'Nach jedem erledigten Schritt aktualisieren.'
    );
  }

  get parameters() {
    return {
      liste: {
        type: 'string',
        description:
          'Die vollständige Aufgabenliste, eine Zeile je Aufgabe ' +
          '(z. B. "- [x] Quellen lesen\\n- [~] Entwurf schreiben\\n- [ ] Prüfen")',
        required: true,
      },
    };
  }

  /**
   * @param {{liste?:string}} params
   * @param {{setTodos?:(liste:string, todos:object[])=>void}} context
   */
  async execute(params = {}, context = {}) {
    const liste = String(params.liste || '').slice(0, MAX_LISTE_ZEICHEN);
    const todos = parseTodos(liste);
    if (todos.length === 0) {
      return 'Fehler: Keine Aufgaben erkannt. Format: "- [ ] Aufgabe" (eine je Zeile).';
    }
    if (typeof context.setTodos === 'function') {
      context.setTodos(liste, todos);
    }
    const offen = todos.filter(t => t.status === 'offen').length;
    const fertig = todos.filter(t => t.status === 'fertig').length;
    return `Aufgabenliste aktualisiert: ${todos.length} Aufgaben (${fertig} erledigt, ${offen} offen).`;
  }
}

module.exports = { TodoListeTool, parseTodos };
