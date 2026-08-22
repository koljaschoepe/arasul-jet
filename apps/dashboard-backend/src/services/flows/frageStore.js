/**
 * Rückfragen im laufenden Flow (Plan 023 I2 und I3).
 *
 * Bis hierher galt für Flows das ANNAHMEN-PROTOKOLL: ein Flow fragt nicht, er
 * trifft die Annahme und schreibt sie mit (`pruefung.js`). Das bleibt die
 * Voreinstellung und die Betriebsart `autonom` — die Abnahme aus I2 nennt sie
 * wörtlich so. Dieser Baustein ergänzt die ZWEITE Betriebsart, in der der Flow
 * anhalten und fragen darf.
 *
 * WARUM DAS WARTEN HIER GEFAHRLOS IST: `withGpuLock` umschließt einen einzelnen
 * Ollama-Aufruf, nicht den ganzen Lauf (`llmOllamaStream.streamFromOllama`).
 * Ein Flow, der zwischen zwei Werkzeugrunden auf eine Antwort wartet, hält also
 * keine GPU-Sperre. Wäre das anders, blockierte eine unbeantwortete Frage den
 * Chat des ganzen Geräts.
 *
 * WARUM IM SPEICHER: eine offene Frage gehört zu einem laufenden Prozess. Stirbt
 * das Backend, stirbt der Lauf mit; eine Frage in der Datenbank hätte danach
 * niemanden mehr, der auf sie wartet. Der Zeitablauf unten ist trotzdem nötig:
 * eine Frage, die niemand sieht, darf einen Lauf nicht ewig anhalten.
 */

const logger = require('../../utils/logger');
const { ValidationError, NotFoundError } = require('../../utils/errors');

/** Wie lange ein Flow auf eine Antwort wartet, bevor er selbst entscheidet. */
const WARTE_MS = parseInt(process.env.FLOW_RUECKFRAGE_TIMEOUT_MS || '1800000', 10);
/** Höchstzahl Optionen. Vier, wie im Plan; mehr trifft niemand mehr im Blick. */
const MAX_OPTIONEN = 4;

/** runId → { frage, optionen, gestelltAm, aufloesen, uhr } */
const offen = new Map();

/** Die offene Frage eines Laufs, oder null. */
function offeneFrage(runId) {
  const e = offen.get(String(runId));
  if (!e) {
    return null;
  }
  return { frage: e.frage, optionen: e.optionen, gestelltAm: e.gestelltAm };
}

/** Alle offenen Fragen (für die Anzeige „hier wartet etwas"). */
function alleOffenen() {
  return [...offen.entries()].map(([runId, e]) => ({
    runId: Number(runId),
    frage: e.frage,
    optionen: e.optionen,
    gestelltAm: e.gestelltAm,
  }));
}

/**
 * Eine Frage stellen und auf die Antwort warten.
 *
 * @param {string|number} runId Lauf, der fragt
 * @param {{frage: string, optionen?: string[]}} was
 * @param {{onEvent?: Function, warteMs?: number}} [deps]
 * @returns {Promise<{antwort: string, quelle: 'nutzer'|'zeitablauf'}>}
 */
function stelleFrage(runId, { frage, optionen }, deps = {}) {
  const kennung = String(runId);
  const text = String(frage || '').trim();
  if (!text) {
    return Promise.reject(new ValidationError('Eine Rückfrage braucht eine Frage'));
  }
  if (offen.has(kennung)) {
    // Zwei Fragen gleichzeitig gäbe es nur, wenn ein Lauf parallel liefe. Tut
    // er nicht; das hier ist der Schutz gegen einen künftigen Umbau.
    return Promise.reject(new ValidationError('Für diesen Lauf ist schon eine Frage offen'));
  }
  const liste = (Array.isArray(optionen) ? optionen : [])
    .map(o => String(o || '').trim())
    .filter(Boolean)
    .slice(0, MAX_OPTIONEN);

  const warteMs = deps.warteMs ?? WARTE_MS;
  return new Promise(resolve => {
    const uhr = setTimeout(() => {
      offen.delete(kennung);
      // Kein Fehler: die Betriebsart `autonom` ist der Rückfall, nicht der
      // Abbruch. Der Lauf entscheidet selbst weiter und schreibt es mit.
      const angenommen = liste[0] || '';
      logger.info(
        `Flow-Lauf ${kennung}: Rückfrage nach ${Math.round(warteMs / 1000)}s ` +
          `unbeantwortet, es gilt die Annahme "${angenommen || 'keine Vorgabe'}"`
      );
      resolve({ antwort: angenommen, quelle: 'zeitablauf' });
    }, warteMs);
    uhr.unref?.();

    offen.set(kennung, {
      frage: text,
      optionen: liste,
      gestelltAm: new Date().toISOString(),
      aufloesen: resolve,
      uhr,
    });

    if (typeof deps.onEvent === 'function') {
      try {
        deps.onEvent({ type: 'frage', runId: Number(runId), frage: text, optionen: liste });
      } catch (err) {
        logger.warn(`Flow-Lauf ${kennung}: onEvent(frage) warf: ${err.message}`);
      }
    }
  });
}

/**
 * Eine offene Frage beantworten.
 *
 * @returns {{beantwortet: true}}
 * @throws {NotFoundError} wenn nichts offen ist
 */
function beantworte(runId, antwort) {
  const kennung = String(runId);
  const e = offen.get(kennung);
  if (!e) {
    throw new NotFoundError(`Für Lauf ${kennung} ist keine Frage offen`);
  }
  const text = String(antwort ?? '').trim();
  if (!text) {
    throw new ValidationError('Eine leere Antwort hilft dem Lauf nicht weiter');
  }
  clearTimeout(e.uhr);
  offen.delete(kennung);
  e.aufloesen({ antwort: text, quelle: 'nutzer' });
  logger.info(`Flow-Lauf ${kennung}: Rückfrage beantwortet`);
  return { beantwortet: true };
}

/**
 * Eine offene Frage verwerfen (Lauf abgebrochen, Backend fährt herunter).
 *
 * Der Lauf bekommt dann dieselbe Antwort wie beim Zeitablauf: die erste
 * Empfehlung. Ihn hängen zu lassen wäre schlechter.
 */
function verwirf(runId) {
  const kennung = String(runId);
  const e = offen.get(kennung);
  if (!e) {
    return false;
  }
  clearTimeout(e.uhr);
  offen.delete(kennung);
  e.aufloesen({ antwort: e.optionen[0] || '', quelle: 'zeitablauf' });
  return true;
}

/** Nur für Tests. */
function _reset() {
  for (const e of offen.values()) {
    clearTimeout(e.uhr);
  }
  offen.clear();
}

module.exports = {
  stelleFrage,
  beantworte,
  offeneFrage,
  alleOffenen,
  verwirf,
  _reset,
  MAX_OPTIONEN,
  WARTE_MS,
};
