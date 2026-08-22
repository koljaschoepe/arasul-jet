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

/**
 * Ab so vielen Runden ohne Aktualisierung wird die Aufforderung verschärft,
 * solange noch offene Punkte offen sind. Kleine Modelle (8B/14B) „vergessen"
 * das Nachpflegen sonst mitten im Lauf.
 */
const MAX_TODO_STILL_RUNDEN = 2;

const NUDGE_NORMAL = 'Arbeite die offenen Punkte ab und aktualisiere die Liste mit todo_liste.';
const NUDGE_STRENG =
  'WICHTIG: Du hast die Aufgabenliste seit mehreren Schritten nicht aktualisiert. ' +
  'Markiere jetzt erledigte Punkte mit "[x]" und den aktuellen mit "[~]" über todo_liste, bevor du weiterarbeitest.';

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
      'Pflegt deine Aufgabenliste. Übergib immer die KOMPLETTE Liste als ' +
      'Checkboxen: "- [ ] offen", "- [~] in Arbeit", "- [x] erledigt".'
    );
  }

  get parameters() {
    return {
      liste: {
        type: 'string',
        description: 'Die vollständige Liste, eine Zeile je Aufgabe.',
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

/**
 * Wählt den Erinnerungstext, der der Aufgabenliste je Runde beigelegt wird.
 * Nutzt bewusst denselben Parser wie das Werkzeug (parseTodos) statt einer
 * eigenen Regex — sonst löste die Verschärfung bei `*`-Bullets oder
 * eingerückten Punkten nicht aus, also genau im Modell-Format-Drift-Fall,
 * den sie abfangen soll.
 *
 * @param {string} todoListe - aktuelle Liste (leer = kein Zusatztext)
 * @param {number} rundenSeitUpdate - Runden seit der letzten Aktualisierung
 * @returns {string} normaler oder verschärfter Hinweis
 */
function todoErinnerung(todoListe, rundenSeitUpdate) {
  const offen = parseTodos(todoListe).some(t => t.status === 'offen');
  return offen && rundenSeitUpdate >= MAX_TODO_STILL_RUNDEN ? NUDGE_STRENG : NUDGE_NORMAL;
}

module.exports = {
  TodoListeTool,
  parseTodos,
  todoErinnerung,
  MAX_TODO_STILL_RUNDEN,
  NUDGE_NORMAL,
  NUDGE_STRENG,
};
