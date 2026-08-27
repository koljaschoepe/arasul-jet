/**
 * Das Werkzeug, mit dem ein Flow eine Freigabe anfordert (Phase C7).
 *
 * Der Unterschied zur Rueckfrage (`frage_nutzer`, Plan 023 I3) ist nicht die
 * Technik, sondern die Sache:
 *
 *   frage_nutzer         „Welchen Kunden meinst du?" -- an den, der zusieht,
 *                        nach einer halben Stunde gegenstandslos, und ohne
 *                        Antwort laeuft der Flow mit einer Annahme weiter.
 *   freigabe_anfordern   „Darf das raus?" -- an jeden, dem die App freigegeben
 *                        ist, mit Frist und Beleg, und ohne Antwort laeuft
 *                        GAR NICHTS weiter.
 *
 * Deshalb steht die Freigabe in einer Tabelle und die Rueckfrage nicht, und
 * deshalb gibt es dieses Werkzeug in JEDER Betriebsart. `frage_nutzer` fehlt in
 * `autonom` mit gutem Grund: ein autonomer Flow soll nicht auf einen Menschen
 * warten, der gerade nicht hinsieht. Eine Freigabe ist genau umgekehrt gemeint
 * -- sie IST der Halt, und ein Flow, der sie anfordert, will angehalten werden.
 *
 * Wer entscheidet, sagt dieses Werkzeug nicht. Es nennt keine Person und keine
 * Rolle (Entscheidung Kolja vom 27.08.2026); der Kreis steht in `app_members`.
 */

const BaseTool = require('../../../tools/baseTool');
const freigabeAnfragen = require('../freigabeAnfragen');

class FreigabeAnfordernTool extends BaseTool {
  get name() {
    return 'freigabe_anfordern';
  }

  get description() {
    return (
      'Haelt den Lauf an und bittet einen Menschen um Freigabe. ' +
      'Erst nach der Bestaetigung geht es weiter; eine Ablehnung beendet den Lauf. ' +
      'Nur benutzen, wenn ein Mensch wirklich zustimmen soll.'
    );
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        titel: {
          type: 'string',
          description: 'Worum es geht, in einem Satz. Das liest der Mensch zuerst.',
        },
        zusammenhang: {
          type: 'string',
          description:
            'Was zur Entscheidung noetig ist: der Entwurf, die Zahl, der Grund. ' +
            'Wer hier spart, laesst jemanden blind zustimmen.',
        },
        frist_minuten: {
          type: 'number',
          description:
            'Wie lange gewartet wird. Ohne Angabe gilt die Vorgabe des Geraets ' +
            `(${freigabeAnfragen.VORGABE_FRIST_MINUTEN} Minuten). Danach endet der Lauf als abgelaufen.`,
        },
      },
      required: ['titel'],
    };
  }

  /**
   * @param {{titel: string, zusammenhang?: string, frist_minuten?: number}} params
   * @param {{runId?: number, appId?: string, stand?: string, slug?: string,
   *          onEvent?: Function, signal?: AbortSignal}} context
   */
  async execute(params = {}, context = {}) {
    const { entschieden_am: wann, benutzer } = await freigabeAnfragen.anfordern(
      {
        runId: context.runId,
        appId: context.appId,
        stand: context.stand,
        flowName: context.slug || '',
        titel: params.titel,
        zusammenhang: params.zusammenhang,
        frist_minuten: params.frist_minuten,
      },
      { signal: context.signal, onEvent: context.onEvent }
    );

    // Nur der Erfolgsfall kommt hier an. Ablehnung und Zeitablauf werfen
    // `LaufBeendet` -- der Lauf ist dann in der Datenbank schon beendet, und
    // ein Text zurueck an das Modell waere die eine Antwort, die es NICHT
    // bekommen darf (es suchte sich sonst einen anderen Weg).
    return `Freigabe erteilt von ${benutzer} am ${new Date(wann).toISOString()}.`;
  }
}

module.exports = FreigabeAnfordernTool;
