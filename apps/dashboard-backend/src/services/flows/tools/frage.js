/**
 * Das Werkzeug, mit dem ein Flow zurückfragt (Plan 023 I3).
 *
 * Es gibt es nur in der Betriebsart `rueckfragen`. In `autonom` liegt es gar
 * nicht im Werkzeugkasten — nicht als gesperrte Variante, sondern es ist nicht
 * da. Ein Modell, das ein Werkzeug sieht, benutzt es irgendwann; die Zusage
 * „autonom stellt er keine Frage" hält nur, wenn es die Frage nicht geben kann.
 *
 * Die Form der Frage folgt derselben Regel wie im Chat: bis zu vier begründete
 * Empfehlungen, erste Option ist die Empfehlung, dazu immer ein Freitextfeld.
 * Das Freitextfeld baut die Oberfläche, nicht dieses Werkzeug.
 */

const BaseTool = require('../../../tools/baseTool');
const frageStore = require('../frageStore');

class FrageNutzerTool extends BaseTool {
  get name() {
    return 'frage_nutzer';
  }

  get description() {
    return (
      'Stellt dem Nutzer EINE Rückfrage und wartet auf die Antwort. ' +
      'Nur benutzen, wenn die Antwort den weiteren Ablauf wirklich ändert. ' +
      'Gib bis zu vier Optionen an, die beste zuerst.'
    );
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        frage: {
          type: 'string',
          description: 'Eine einzelne, konkrete Frage in ganzen Sätzen.',
        },
        optionen: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Bis zu vier Antwortmöglichkeiten, die empfohlene zuerst. ' +
            'Der Nutzer kann immer auch frei antworten.',
        },
      },
      required: ['frage'],
    };
  }

  /**
   * @param {{frage: string, optionen?: string[]}} params
   * @param {{runId?: number, onEvent?: Function}} context
   */
  async execute(params = {}, context = {}) {
    const { runId, onEvent } = context;
    if (!runId) {
      // Ohne Lauf gibt es niemanden, der die Frage sehen könnte. Das ist kein
      // Fehler des Modells, deshalb ein Satz statt einer Ausnahme.
      return (
        'Rückfragen sind in diesem Zusammenhang nicht möglich. ' +
        'Bitte triff eine begründete Annahme und schreibe sie mit.'
      );
    }
    const { antwort, quelle } = await frageStore.stelleFrage(runId, params, { onEvent });
    if (quelle === 'zeitablauf') {
      return antwort
        ? `Keine Antwort erhalten. Es gilt die Annahme: ${antwort}`
        : 'Keine Antwort erhalten. Bitte triff eine begründete Annahme und schreibe sie mit.';
    }
    return `Antwort des Nutzers: ${antwort}`;
  }
}

module.exports = FrageNutzerTool;
