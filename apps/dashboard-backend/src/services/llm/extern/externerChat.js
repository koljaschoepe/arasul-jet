/**
 * Der Chatpfad fuer externe Modelle (Plan 023 D9).
 *
 * Er tut dasselbe wie `llmOllamaStream`, aber gegen einen Cloud-Anbieter, und
 * er tut zwei Dinge ausdruecklich NICHT:
 *
 * 1. Er nimmt die GPU-Sperre nicht. Ein Cloud-Modell rechnet nicht auf diesem
 *    Geraet. Wer hier `withGpuLock` nehmen wuerde, liesse einen lokalen Chat
 *    warten, bis eine Anfrage aus dem Netz zurueck ist, und das waere genau
 *    verkehrt herum.
 * 2. Er fragt den Lebenszyklus nicht nach einer Haltezeit. Es gibt nichts zu
 *    halten und nichts zu entladen.
 *
 * Der SSE-Vertrag zum Frontend ist derselbe wie beim lokalen Pfad, damit die
 * Oberflaeche keinen zweiten Fall kennen muss: `response`-Ereignisse mit
 * Token, am Ende `completeJob`. Zusaetzlich geht einmal am Anfang ein
 * `warning` raus, das sagt, dass diese Anfrage das Geraet verlaesst. Das ist
 * keine Verzierung: ein Produkt, das mit "laeuft vollstaendig lokal" verkauft
 * wird, muss die eine Ausnahme sichtbar machen, in dem Moment, in dem sie
 * passiert.
 */

const externeModelle = require('./externeModelle');
const { zerlegeId, anbieter: anbieterDef } = require('./providerRegistry');

/** Wie oft der Zwischenstand in die Datenbank geschrieben wird. */
const SCHREIB_INTERVALL_MS = 500;

/**
 * Faehrt einen Chat gegen ein externes Modell.
 *
 * @param {object} ctx wie bei processChatJob: { deps, service }
 * @param {object} job die Zeile aus llm_jobs
 * @param {object} p
 * @param {{role:string, content:string}[]} p.nachrichten
 * @param {string} [p.systemPrompt]
 * @param {number} [p.temperatur]
 * @param {number} [p.maxTokens]
 */
async function externenChatFahren(ctx, job, { nachrichten, systemPrompt, temperatur, maxTokens }) {
  const { database, logger, llmJobService } = ctx.deps;
  const service = ctx.service;
  const { id: jobId, requested_model: modellId } = job;

  const zerlegt = zerlegeId(modellId);
  const def = zerlegt ? anbieterDef(zerlegt.anbieter) : null;

  // Der Abbruch-Knopf muss auch hier greifen. Ohne Registrierung liefe die
  // Anfrage beim Anbieter weiter, und der Nutzer bezahlte eine Antwort, die
  // niemand mehr sehen will.
  const abbruch = new AbortController();
  if (typeof llmJobService.registerStream === 'function') {
    llmJobService.registerStream(jobId, abbruch);
  }

  service.notifySubscribers(jobId, {
    type: 'warning',
    code: 'EXTERNES_MODELL',
    message:
      `Diese Anfrage geht an ${def ? def.name : 'einen externen Anbieter'} und verlässt das Gerät. ` +
      'Sie steht im Prüfprotokoll.',
  });

  let puffer = '';
  let letzterSchreib = Date.now();
  const schreiben = async (erzwingen = false) => {
    if (!puffer) {
      return;
    }
    if (!erzwingen && Date.now() - letzterSchreib < SCHREIB_INTERVALL_MS) {
      return;
    }
    const stueck = puffer;
    puffer = '';
    letzterSchreib = Date.now();
    await llmJobService.updateJobContent(jobId, stueck);
  };

  const start = Date.now();
  try {
    const ergebnis = await externeModelle.antworten({
      modellId,
      nachrichten,
      systemPrompt,
      temperatur,
      maxTokens,
      signal: abbruch.signal,
      benutzerId: job.user_id ?? null,
      jobId,
      aufToken: token => {
        puffer += token;
        service.notifySubscribersBatched(jobId, { type: 'response', token });
        // Absichtlich ohne await: der Strom soll nicht auf die Datenbank
        // warten. Der erzwungene Schreibvorgang am Ende holt jeden Rest.
        schreiben().catch(err =>
          logger.debug(`[JOB ${jobId}] Zwischenstand nicht geschrieben: ${err.message}`)
        );
      },
    });

    await schreiben(true);
    await llmJobService.completeJob(jobId);

    // Dieselben Spalten wie beim lokalen Pfad, damit eine Auswertung nicht
    // zwei Faelle kennen muss. Der Anbieter liefert beide Zahlen mit.
    if (ergebnis.vorlauf || ergebnis.ausgabe) {
      try {
        await database.query(
          `UPDATE llm_jobs SET prompt_tokens = $1, completion_tokens = $2 WHERE id = $3`,
          [ergebnis.vorlauf, ergebnis.ausgabe, jobId]
        );
      } catch (err) {
        logger.debug(`[JOB ${jobId}] Tokenzahlen nicht gespeichert: ${err.message}`);
      }
    }

    logger.info(
      `[JOB ${jobId}] Externes Modell ${modellId} fertig in ${Date.now() - start} ms, ` +
        `${ergebnis.text.length} Zeichen`
    );
    service.notifySubscribers(jobId, { type: 'done', done: true });
  } catch (err) {
    // Auch ein abgebrochener Lauf soll behalten, was schon da war. Der Nutzer
    // hat den Anfang gesehen; ihn beim Neuladen verschwinden zu lassen waere
    // schlimmer als eine halbe Antwort.
    await schreiben(true).catch(() => {});
    if (abbruch.signal.aborted) {
      logger.info(`[JOB ${jobId}] Externes Modell abgebrochen`);
      await llmJobService.completeJob(jobId).catch(() => {});
      service.notifySubscribers(jobId, { type: 'done', done: true });
      return;
    }
    logger.error(`[JOB ${jobId}] Externes Modell gescheitert: ${err.message}`);
    await llmJobService.errorJob(jobId, err.message);
    service.notifySubscribers(jobId, { type: 'error', error: err.message, done: true });
  } finally {
    const { onJobComplete } = require('../llmOllamaStream');
    onJobComplete(ctx, jobId);
  }
}

module.exports = { externenChatFahren, SCHREIB_INTERVALL_MS };
