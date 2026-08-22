/**
 * Die zwei Cloud-Anbieter, in einer Form (Plan 023 D9).
 *
 * Beide koennen dasselbe, sprechen es aber unterschiedlich aus. Diese Datei
 * uebersetzt beide auf dieselben zwei Fragen, die das Produkt stellt:
 *
 *   modelleHolen(anbieter, schluessel)  ->  welche Modelle gibt es dort?
 *   antwortStroemen(...)                ->  eine Antwort, Wort fuer Wort
 *
 * Die Modellliste kommt vom Anbieter, nicht aus einer Liste im Code. Beide
 * bieten GET /v1/models. Das ist Regel 1 aus CLAUDE.md, keine Fakten aus dem
 * Gedaechtnis, und es hat einen praktischen Nebeneffekt: die Abnahme "ohne
 * Schluessel taucht nichts auf" ergibt sich von selbst, weil ohne Schluessel
 * niemand fragen kann.
 */

const logger = require('../../../utils/logger');
const { anbieter: anbieterDef } = require('./providerRegistry');
const { ServiceUnavailableError, UnauthorizedError } = require('../../../utils/errors');

/** Nach so vielen Millisekunden ohne Antwort gilt der Anbieter als still. */
const ZEITLIMIT_MS = Number(process.env.EXTERN_TIMEOUT_MS || 60000);

/**
 * Uebersetzt eine Fehlerantwort des Anbieters in etwas, das ein Mensch liest.
 * @param {number} status
 * @param {string} rumpf
 * @param {string} name
 * @returns {Error}
 */
function fehlerAus(status, rumpf, name) {
  if (status === 401 || status === 403) {
    return new UnauthorizedError(
      `${name} weist den hinterlegten Schlüssel zurück. Bitte in den Einstellungen erneuern.`
    );
  }
  if (status === 429) {
    return new ServiceUnavailableError(
      `${name} drosselt gerade (zu viele Anfragen). Bitte später erneut versuchen.`
    );
  }
  const kurz = String(rumpf || '').slice(0, 200);
  return new ServiceUnavailableError(`${name} antwortete mit Status ${status}: ${kurz}`);
}

/**
 * Ein Aufruf gegen einen Anbieter, mit Zeitlimit.
 * @param {string} url
 * @param {object} optionen
 * @param {string} name Anzeigename fuer Fehlermeldungen
 * @returns {Promise<Response>}
 */
async function ruf(url, optionen, name) {
  const abbruch = new AbortController();
  const wecker = setTimeout(() => abbruch.abort(), ZEITLIMIT_MS);
  let antwort;
  try {
    antwort = await fetch(url, { ...optionen, signal: abbruch.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ServiceUnavailableError(
        `${name} hat innerhalb von ${Math.round(ZEITLIMIT_MS / 1000)} Sekunden nicht geantwortet.`
      );
    }
    throw new ServiceUnavailableError(`${name} ist nicht erreichbar: ${err.message}`);
  } finally {
    clearTimeout(wecker);
  }
  if (!antwort.ok) {
    throw fehlerAus(antwort.status, await antwort.text().catch(() => ''), name);
  }
  return antwort;
}

/**
 * Welche Modelle hat dieser Anbieter?
 *
 * Beide liefern `{ data: [...] }`, aber mit unterschiedlichen Feldern: bei
 * Anthropic heisst der Anzeigename `display_name`, bei OpenAI gibt es keinen,
 * dort ist die Id auch der Name.
 *
 * @param {string} name Anbieter-Kennung
 * @param {string} schluessel
 * @returns {Promise<{id:string, name:string}[]>}
 */
async function modelleHolen(name, schluessel) {
  const def = anbieterDef(name);
  if (!def) {
    throw new ServiceUnavailableError(`Unbekannter Anbieter "${name}".`);
  }
  const antwort = await ruf(
    `${def.basis}${def.modellePfad}?limit=1000`,
    { method: 'GET', headers: def.kopfzeilen(schluessel) },
    def.name
  );
  const daten = await antwort.json();
  const roh = Array.isArray(daten?.data) ? daten.data : [];
  return roh
    .filter(m => m && typeof m.id === 'string')
    .map(m => ({ id: m.id, name: m.display_name || m.id }));
}

/**
 * Baut den Anfragerumpf fuer Anthropic.
 *
 * Anthropic nimmt den Systemprompt NICHT als Nachricht, sondern als eigenes
 * Feld, und verlangt `max_tokens`. Wer das uebersieht, bekommt einen 400, der
 * nach einem Schluesselproblem aussieht.
 */
function rumpfAnthropic({ modell, nachrichten, systemPrompt, temperatur, maxTokens }) {
  return {
    model: modell,
    max_tokens: maxTokens || 4096,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    ...(typeof temperatur === 'number' ? { temperature: temperatur } : {}),
    messages: nachrichten.map(n => ({ role: n.role, content: String(n.content ?? '') })),
    stream: true,
  };
}

/** Baut den Anfragerumpf fuer OpenAI. Dort ist der Systemprompt eine Nachricht. */
function rumpfOpenai({ modell, nachrichten, systemPrompt, temperatur, maxTokens }) {
  const messages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...nachrichten]
    : nachrichten;
  return {
    model: modell,
    ...(maxTokens ? { max_completion_tokens: maxTokens } : {}),
    ...(typeof temperatur === 'number' ? { temperature: temperatur } : {}),
    messages: messages.map(n => ({ role: n.role, content: String(n.content ?? '') })),
    stream: true,
    stream_options: { include_usage: true },
  };
}

/**
 * Liest eine Zeile des Ereignisstroms und gibt zurueck, was drinsteht.
 *
 * Beide sprechen Server-Sent Events, aber unterschiedlich: OpenAI schliesst
 * mit der Zeile `data: [DONE]`, Anthropic mit einem Ereignis
 * `message_stop`. Und Anthropic verteilt den Text auf
 * `content_block_delta.delta.text`, OpenAI auf `choices[0].delta.content`.
 *
 * @param {string} anbieterName
 * @param {string} rohzeile Zeile ohne "data: "
 * @returns {{text?:string, fertig?:boolean, vorlauf?:number, ausgabe?:number}|null}
 */
function zeileDeuten(anbieterName, rohzeile) {
  if (rohzeile === '[DONE]') {
    return { fertig: true };
  }
  let daten;
  try {
    daten = JSON.parse(rohzeile);
  } catch {
    return null;
  }
  if (anbieterName === 'anthropic') {
    if (daten.type === 'content_block_delta' && daten.delta?.type === 'text_delta') {
      return { text: daten.delta.text };
    }
    if (daten.type === 'message_start') {
      return { vorlauf: daten.message?.usage?.input_tokens };
    }
    if (daten.type === 'message_delta') {
      return { ausgabe: daten.usage?.output_tokens };
    }
    if (daten.type === 'message_stop') {
      return { fertig: true };
    }
    if (daten.type === 'error') {
      throw new ServiceUnavailableError(
        `Anthropic meldet: ${daten.error?.message || 'unbekannter Fehler'}`
      );
    }
    return null;
  }
  // OpenAI
  const stueck = daten.choices?.[0]?.delta?.content;
  if (typeof stueck === 'string' && stueck.length > 0) {
    return { text: stueck };
  }
  if (daten.usage) {
    return { vorlauf: daten.usage.prompt_tokens, ausgabe: daten.usage.completion_tokens };
  }
  return null;
}

/**
 * Stroemt eine Antwort von einem externen Modell.
 *
 * @param {object} p
 * @param {string} p.anbieterName
 * @param {string} p.schluessel
 * @param {string} p.modell der Modellname BEIM ANBIETER, ohne Praefix
 * @param {{role:string, content:string}[]} p.nachrichten
 * @param {string} [p.systemPrompt]
 * @param {number} [p.temperatur]
 * @param {number} [p.maxTokens]
 * @param {AbortSignal} [p.signal]
 * @param {(text:string)=>void} p.aufToken
 * @returns {Promise<{text:string, vorlauf:number|null, ausgabe:number|null}>}
 */
async function antwortStroemen({
  anbieterName,
  schluessel,
  modell,
  nachrichten,
  systemPrompt,
  temperatur,
  maxTokens,
  signal,
  aufToken,
}) {
  const def = anbieterDef(anbieterName);
  if (!def) {
    throw new ServiceUnavailableError(`Unbekannter Anbieter "${anbieterName}".`);
  }
  const rumpf =
    anbieterName === 'anthropic'
      ? rumpfAnthropic({ modell, nachrichten, systemPrompt, temperatur, maxTokens })
      : rumpfOpenai({ modell, nachrichten, systemPrompt, temperatur, maxTokens });

  const antwort = await ruf(
    `${def.basis}${def.chatPfad}`,
    {
      method: 'POST',
      headers: { ...def.kopfzeilen(schluessel), accept: 'text/event-stream' },
      body: JSON.stringify(rumpf),
      signal,
    },
    def.name
  );

  const leser = antwort.body.getReader();
  const dekoder = new TextDecoder();
  let puffer = '';
  let text = '';
  let vorlauf = null;
  let ausgabe = null;

  try {
    for (;;) {
      const { done, value } = await leser.read();
      if (done) {
        break;
      }
      puffer += dekoder.decode(value, { stream: true });
      // Der Strom kommt in Bloecken, nicht in Zeilen. Der letzte Rest bleibt
      // im Puffer, bis seine Zeile vollstaendig ist.
      const zeilen = puffer.split('\n');
      puffer = zeilen.pop() ?? '';
      for (const zeile of zeilen) {
        const beschnitten = zeile.trim();
        if (!beschnitten.startsWith('data:')) {
          continue;
        }
        const gedeutet = zeileDeuten(anbieterName, beschnitten.slice(5).trim());
        if (!gedeutet) {
          continue;
        }
        if (gedeutet.text) {
          text += gedeutet.text;
          aufToken(gedeutet.text);
        }
        if (typeof gedeutet.vorlauf === 'number') {
          vorlauf = gedeutet.vorlauf;
        }
        if (typeof gedeutet.ausgabe === 'number') {
          ausgabe = gedeutet.ausgabe;
        }
      }
    }
  } finally {
    // Ohne cancel bleibt bei einem Abbruch die Verbindung offen, und der
    // Anbieter rechnet weiter ab, obwohl niemand mehr zuhoert.
    leser.cancel().catch(() => {});
  }

  logger.info(
    `[Extern] ${def.name}/${modell} fertig: ${text.length} Zeichen` +
      (vorlauf ? `, Vorlauf ${vorlauf} Token` : '')
  );
  return { text, vorlauf, ausgabe };
}

module.exports = { modelleHolen, antwortStroemen, zeileDeuten, ZEITLIMIT_MS };
