/**
 * Das Werkzeug, mit dem ein Flow eine Freigabe anfordert (Phase C7).
 *
 * „Darf das raus?" -- an jeden, dem die App freigegeben ist, mit Frist und
 * Beleg, und ohne Antwort laeuft GAR NICHTS weiter. Deshalb steht die Freigabe
 * in einer Tabelle, und deshalb gibt es dieses Werkzeug in jeder Betriebsart:
 * sie IST der Halt, und ein Flow, der sie anfordert, will angehalten werden.
 * (Die Rueckfrage `frage_nutzer`, Plan 023 I3, ist am 06.10.2026 gefallen.)
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
      'Hält den Lauf an und bittet einen Menschen um Freigabe. ' +
      'Erst nach der Bestätigung geht es weiter; eine Ablehnung beendet den Lauf. ' +
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
            'Was zur Entscheidung nötig ist: der Entwurf, die Zahl, der Grund. ' +
            'Wer hier spart, lässt jemanden blind zustimmen.',
        },
        frist_minuten: {
          type: 'number',
          description:
            'Wie lange gewartet wird. Ohne Angabe gilt die Vorgabe des Geräts ' +
            `(${freigabeAnfragen.VORGABE_FRIST_MINUTEN} Minuten) oder die Frist der Stufe. ` +
            'Danach endet der Lauf als abgelaufen.',
        },
        stufe: {
          type: 'string',
          description:
            'Die benannte Freigabestufe aus dem Kopf des Flows (`stufen`). ' +
            'Ihre Frist gilt, wenn `frist_minuten` fehlt.',
        },
      },
      required: ['titel'],
    };
  }

  /**
   * @param {{titel: string, zusammenhang?: string, frist_minuten?: number, stufe?: string}} params
   * @param {{runId?: number, appId?: string, stand?: string, slug?: string,
   *          stufen?: object[], fortsetzung?: object|null,
   *          onEvent?: Function, signal?: AbortSignal}} context
   */
  async execute(params = {}, context = {}) {
    const begonnen = Date.now();
    const {
      entschieden_am: wann,
      benutzer,
      korrekturen,
    } = await freigabeAnfragen.anfordern(
      {
        runId: context.runId,
        appId: context.appId,
        stand: context.stand,
        flowName: context.slug || '',
        titel: params.titel,
        zusammenhang: params.zusammenhang,
        frist_minuten: params.frist_minuten,
        stufe: params.stufe,
        stufen: context.stufen,
        // Nur der deterministische Executor setzt das (`stepExecutor`): wo der
        // Lauf nach einem Neustart weitergeht. Ohne es bleibt die Freigabe
        // gueltig, der wartende Lauf aber nicht fortsetzbar.
        fortsetzung: context.fortsetzung || null,
        // Die erkannten Felder (M5) setzt ebenfalls nur der Executor, im Kontext
        // dieses einen Aufrufs und nie ueber `params`: welche Felder ein Mensch
        // aendern darf, erklaert die App in ihrer Rolle, nicht das Modell.
        erkennung: context.erkennung || null,
      },
      { signal: context.signal, onEvent: context.onEvent }
    );

    // Die Wartezeit zaehlt nicht gegen das Zeitlimit des Flows: waehrend der
    // Lauf haengt, rechnet er nicht. Ohne diese Zeile bekaeme der erste
    // Subagent NACH der Bestaetigung „Zeitlimit erreicht" -- der Lauf liefe
    // also bis genau zu der Stelle weiter, an der er wieder etwas tun soll.
    context.limits?.verschiebeUm(Date.now() - begonnen);

    // Nur der Erfolgsfall kommt hier an. Ablehnung und Zeitablauf werfen
    // `LaufBeendet` -- der Lauf ist dann in der Datenbank schon beendet, und
    // ein Text zurueck an das Modell waere die eine Antwort, die es NICHT
    // bekommen darf (es suchte sich sonst einen anderen Weg).
    return freigabeAnfragen.erteiltText(benutzer, wann, korrekturen);
  }
}

module.exports = FreigabeAnfordernTool;
