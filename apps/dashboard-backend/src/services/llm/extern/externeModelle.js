/**
 * Externe Modelle, die eine Schicht ueber Speicher und Adapter (Plan 023 D9).
 *
 * Hier faellt die Entscheidung, WAS der Rest des Produkts von externen
 * Modellen sieht. Drei Zusagen des Plans werden genau hier eingeloest:
 *
 *   "Ein hinterlegter Schluessel macht das Modell im Chat waehlbar."
 *   "Ohne Schluessel taucht nichts auf."
 *   "Eine Anfrage an ein externes Modell ist im Pruefprotokoll erkennbar."
 *
 * Die erste und die zweite ergeben sich aus derselben Stelle: `modelleListen`
 * fragt nur Anbieter, die eingeschaltet sind UND einen Schluessel haben. Gibt
 * es keinen, gibt es auch keine Liste, und zwar nicht, weil hier gefiltert
 * wird, sondern weil niemand da ist, den man fragen koennte.
 */

const logger = require('../../../utils/logger');
const { writeAuditLog } = require('../../../middleware/audit');
const { anbieter: anbieterDef, externeId, zerlegeId } = require('./providerRegistry');
const speicher = require('./schluesselSpeicher');
const adapter = require('./adapter');
const { NotFoundError, ValidationError } = require('../../../utils/errors');

/**
 * Buchhaltung, die niemals den eigentlichen Fehler verdraengt.
 *
 * `ergebnisFesthalten` steht in jedem catch-Zweig hier. Wirft es selbst,
 * ersetzt sein Fehler den des Anbieters, und der Nutzer liest etwas ueber die
 * Datenbank statt "der Schluessel wird zurueckgewiesen". Genau das ist am
 * 22.08.2026 am Geraet passiert, Ursache war ein fehlender Typ-Cast im SQL.
 * Der Cast ist behoben; diese Klammer sorgt dafuer, dass die naechste solche
 * Ursache die Diagnose nicht noch einmal unbrauchbar macht.
 *
 * @param {string} anbieterName
 * @param {string|null} fehler
 */
async function ergebnisNotieren(anbieterName, fehler) {
  try {
    await speicher.ergebnisFesthalten(anbieterName, fehler);
  } catch (err) {
    logger.error(`[Extern] Stand von ${anbieterName} nicht festgehalten: ${err.message}`);
  }
}

/**
 * Die Modellliste eines Anbieters aendert sich selten. Ohne Zwischenspeicher
 * ginge bei jedem Oeffnen der Modellauswahl eine Anfrage ins Netz, und das
 * waere auf einem Geraet, das lokal arbeiten soll, das falsche Verhalten.
 */
const SPEICHER_MS = Number(process.env.EXTERN_MODELLE_CACHE_MS || 5 * 60 * 1000);
const zwischenspeicher = new Map();

/** Nur fuer Tests und fuer den Fall, dass ein Schluessel gewechselt hat. */
function speicherLeeren(anbieterName = null) {
  if (anbieterName) {
    zwischenspeicher.delete(anbieterName);
  } else {
    zwischenspeicher.clear();
  }
}

/**
 * Die Modelle EINES Anbieters, mit Zwischenspeicher.
 * @param {string} anbieterName
 * @param {{frisch?:boolean, jetzt?:number}} [optionen]
 * @returns {Promise<{id:string, name:string}[]>}
 */
async function modelleEinesAnbieters(anbieterName, optionen = {}) {
  const jetzt = optionen.jetzt ?? Date.now();
  const abgelegt = zwischenspeicher.get(anbieterName);
  if (!optionen.frisch && abgelegt && jetzt - abgelegt.zeit < SPEICHER_MS) {
    return abgelegt.modelle;
  }
  const schluessel = await speicher.schluesselLesen(anbieterName);
  if (!schluessel) {
    return [];
  }
  try {
    const modelle = await adapter.modelleHolen(anbieterName, schluessel);
    zwischenspeicher.set(anbieterName, { zeit: jetzt, modelle });
    await ergebnisNotieren(anbieterName, null);
    return modelle;
  } catch (err) {
    await ergebnisNotieren(anbieterName, err.message);
    logger.warn(`[Extern] Modellliste von ${anbieterName} nicht abrufbar: ${err.message}`);
    // Ein stiller Ausfall des Anbieters darf die Modellauswahl nicht
    // sprengen. Der Fehler steht in der Anbieter-Zeile und wird dort
    // angezeigt; die Liste bleibt hier leer.
    return [];
  }
}

/**
 * Alle externen Modelle, die heute waehlbar sind.
 *
 * In derselben Form wie der lokale Katalog, damit die Modellauswahl im
 * Frontend keine zweite Sorte Objekt kennen muss. `extern: true` ist die
 * Kennzeichnung, die der Plan verlangt.
 *
 * @param {{frisch?:boolean}} [optionen]
 * @returns {Promise<object[]>}
 */
async function modelleListen(optionen = {}) {
  const aktive = await speicher.aktiveAnbieter();
  const alle = [];
  for (const anbieterName of aktive) {
    const def = anbieterDef(anbieterName);
    const modelle = await modelleEinesAnbieters(anbieterName, optionen);
    for (const m of modelle) {
      alle.push({
        id: externeId(anbieterName, m.id),
        name: m.name,
        extern: true,
        anbieter: anbieterName,
        anbieter_name: def.name,
        // Der lokale Katalog fuehrt diese Felder, und die Modellauswahl liest
        // sie. Bei einem Cloud-Modell sind sie ohne Bedeutung: es belegt
        // keinen Speicher auf diesem Geraet und muss nicht geladen werden.
        model_type: 'llm',
        install_status: 'available',
        ram_required_gb: 0,
      });
    }
  }
  return alle;
}

/**
 * Prueft einen Schluessel, indem die Modellliste geholt wird.
 *
 * Das ist der billigste Aufruf, der einen Schluessel wirklich beweist: er
 * kostet nichts, erzeugt keine Token und scheitert bei einem falschen
 * Schluessel mit 401.
 *
 * @param {string} anbieterName
 * @returns {Promise<{anzahl:number}>}
 */
async function schluesselPruefen(anbieterName) {
  const schluessel = await speicher.schluesselLesen(anbieterName);
  if (!schluessel) {
    throw new NotFoundError(`Für "${anbieterName}" ist kein Schlüssel hinterlegt.`);
  }
  try {
    const modelle = await adapter.modelleHolen(anbieterName, schluessel);
    zwischenspeicher.set(anbieterName, { zeit: Date.now(), modelle });
    await ergebnisNotieren(anbieterName, null);
    return { anzahl: modelle.length };
  } catch (err) {
    await ergebnisNotieren(anbieterName, err.message);
    throw err;
  }
}

/**
 * Haelt eine externe Anfrage im Pruefprotokoll fest.
 *
 * Der Plan verlangt, dass eine Anfrage an ein externes Modell dort als solche
 * erkennbar ist. `action_type` ist deshalb nicht "llm_chat" mit einem Detail
 * irgendwo, sondern ein eigener Wert: wer das Protokoll nach dem filtert, was
 * das Geraet verlassen hat, findet genau diese Zeilen.
 *
 * Es wird die ANFRAGE festgehalten, nicht der Inhalt. Was der Nutzer
 * geschrieben hat, geht ins Netz, aber nicht zusaetzlich ins Protokoll; dort
 * steht, WAS wohin ging und wie viel, nicht der Text.
 *
 * @param {object} p
 */
async function anfrageProtokollieren({
  anbieterName,
  modell,
  benutzerId,
  jobId,
  zeichen,
  vorlauf,
  ausgabe,
  dauerMs,
  fehler = null,
}) {
  const def = anbieterDef(anbieterName);
  await writeAuditLog({
    user_id: benutzerId ?? null,
    action_type: 'externes_modell',
    target_endpoint: `${def ? def.basis : anbieterName}${def ? def.chatPfad : ''}`,
    request_payload: {
      anbieter: anbieterName,
      anbieter_name: def ? def.name : anbieterName,
      modell,
      job_id: jobId,
      zeichen_gesendet: zeichen ?? null,
      vorlauf_token: vorlauf ?? null,
      ausgabe_token: ausgabe ?? null,
      hinweis: 'Diese Anfrage hat das Gerät verlassen.',
    },
    response_status: fehler ? 502 : 200,
    duration_ms: dauerMs ?? null,
    ip_address: null,
    user_agent: 'arasul-extern',
    error_message: fehler,
    request_id: null,
  });
}

/**
 * Stroemt eine Antwort von einem externen Modell und protokolliert sie.
 *
 * @param {object} p
 * @param {string} p.modellId die volle Id mit Praefix, z. B. extern:openai/gpt-...
 * @param {{role:string, content:string}[]} p.nachrichten
 * @param {string} [p.systemPrompt]
 * @param {number} [p.temperatur]
 * @param {number} [p.maxTokens]
 * @param {AbortSignal} [p.signal]
 * @param {number|null} [p.benutzerId]
 * @param {string|null} [p.jobId]
 * @param {(text:string)=>void} p.aufToken
 * @returns {Promise<{text:string, vorlauf:number|null, ausgabe:number|null}>}
 */
async function antworten({
  modellId,
  nachrichten,
  systemPrompt,
  temperatur,
  maxTokens,
  signal,
  benutzerId = null,
  jobId = null,
  aufToken,
}) {
  const zerlegt = zerlegeId(modellId);
  if (!zerlegt) {
    throw new ValidationError(`"${modellId}" ist keine gültige Kennung eines externen Modells.`);
  }
  const aktive = await speicher.aktiveAnbieter();
  if (!aktive.includes(zerlegt.anbieter)) {
    // Der Plan verlangt: standardmaessig aus. Ein ausgeschalteter Anbieter
    // darf auch dann nicht antworten, wenn jemand die Kennung von Hand
    // schickt.
    throw new ValidationError(
      `Der Anbieter "${zerlegt.anbieter}" ist nicht eingeschaltet. ` +
        'Externe Modelle sind ab Werk aus und werden in den Einstellungen freigegeben.'
    );
  }
  const schluessel = await speicher.schluesselLesen(zerlegt.anbieter);
  if (!schluessel) {
    throw new NotFoundError(`Für "${zerlegt.anbieter}" ist kein Schlüssel hinterlegt.`);
  }

  const zeichen =
    (systemPrompt ? systemPrompt.length : 0) +
    nachrichten.reduce((n, m) => n + String(m.content ?? '').length, 0);
  const start = Date.now();
  try {
    const ergebnis = await adapter.antwortStroemen({
      anbieterName: zerlegt.anbieter,
      schluessel,
      modell: zerlegt.modell,
      nachrichten,
      systemPrompt,
      temperatur,
      maxTokens,
      signal,
      aufToken,
    });
    await anfrageProtokollieren({
      anbieterName: zerlegt.anbieter,
      modell: zerlegt.modell,
      benutzerId,
      jobId,
      zeichen,
      vorlauf: ergebnis.vorlauf,
      ausgabe: ergebnis.ausgabe,
      dauerMs: Date.now() - start,
    });
    return ergebnis;
  } catch (err) {
    await anfrageProtokollieren({
      anbieterName: zerlegt.anbieter,
      modell: zerlegt.modell,
      benutzerId,
      jobId,
      zeichen,
      dauerMs: Date.now() - start,
      fehler: err.message,
    });
    throw err;
  }
}

module.exports = {
  modelleListen,
  modelleEinesAnbieters,
  schluesselPruefen,
  antworten,
  anfrageProtokollieren,
  speicherLeeren,
  SPEICHER_MS,
};
