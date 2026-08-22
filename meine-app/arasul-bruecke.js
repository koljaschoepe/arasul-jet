/**
 * arasul-bruecke.js — Client-SDK der KI-Brücke (Plan 017 Schritt 2).
 *
 * In die eigene App-Erweiterung einbinden:
 *   <script src="arasul-bruecke.js"></script>
 * (Die Datei mit ins Paket legen — sie wird wie jedes andere Asset
 * ausgeliefert.)
 *
 * Das Dashboard reicht der App nach dem Laden per postMessage einen
 * kurzlebigen, auf die freigegebenen Fähigkeiten gescopten Token. Dieses SDK
 * nimmt ihn entgegen, hängt ihn an jeden Aufruf und holt bei Ablauf
 * selbstständig einen frischen.
 *
 * API (alle Funktionen geben Promises zurück):
 *   ArasulBruecke.bereit()                        — wartet auf den Token
 *   ArasulBruecke.info()                          — { id, name, faehigkeiten }
 *   ArasulBruecke.llm(prompt, { system, temperature, onChunk })
 *                                                 — gestreamte Antwort; onChunk
 *                                                   bekommt jedes Textstück,
 *                                                   Rückgabe ist der Gesamttext
 *   ArasulBruecke.rag(frage, { anzahl })          — [{ quelle, text, score }]
 *   ArasulBruecke.dateien.liste(pfad)             — { eintraege: [{name, typ}] }
 *   ArasulBruecke.dateien.lesen(pfad)             — { inhalt }
 *   ArasulBruecke.dateien.schreiben(pfad, inhalt) — { geschrieben, pfad }
 *   ArasulBruecke.flows.liste()                   — [{ name, beschreibung, argumente }]
 *   ArasulBruecke.flows.starten(name, args)       — { runId }
 *   ArasulBruecke.flows.lauf(runId)               — { status, ergebnis, fehler }
 *
 * Fähigkeiten müssen im manifest.json deklariert ("faehigkeiten":
 * ["llm","rag","dateien","flows"]) und vom Admin beim Live-Schalten
 * freigegeben sein — sonst antwortet das Backend mit 403.
 */
(function () {
  'use strict';

  let token = null;
  let extensionId = null;
  let apiBase = '/api';
  let faehigkeiten = [];
  const wartende = [];

  window.addEventListener('message', function (ev) {
    const d = ev && ev.data;
    if (!d || d.typ !== 'arasul-bruecke-token') {
      return;
    }
    token = d.token || null;
    extensionId = d.extensionId || extensionId;
    apiBase = d.apiBase || apiBase;
    faehigkeiten = Array.isArray(d.faehigkeiten) ? d.faehigkeiten : [];
    wartende.splice(0).forEach(function (fn) {
      fn();
    });
  });

  function anfordern() {
    try {
      window.parent.postMessage({ typ: 'arasul-bruecke-token-anfrage' }, '*');
    } catch (e) {
      /* kein Parent — direkt geöffnet */
    }
  }

  function bereit() {
    if (token) {
      return Promise.resolve();
    }
    return new Promise(function (resolve) {
      wartende.push(resolve);
      anfordern();
    });
  }

  async function rohAufruf(pfad, options, versuch) {
    await bereit();
    const res = await fetch(
      apiBase + '/extensions/' + encodeURIComponent(extensionId) + '/bruecke' + pfad,
      Object.assign({}, options, {
        headers: Object.assign({}, (options && options.headers) || {}, {
          Authorization: 'Bearer ' + token,
        }),
      })
    );
    if (res.status === 401 && !versuch) {
      // Token abgelaufen — frischen anfordern und genau einmal wiederholen.
      token = null;
      return rohAufruf(pfad, options, 1);
    }
    return res;
  }

  async function jsonAufruf(pfad, options) {
    const res = await rohAufruf(pfad, options);
    let body = null;
    try {
      body = await res.json();
    } catch (e) {
      /* leer */
    }
    if (!res.ok) {
      const msg =
        (body && body.error && body.error.message) || 'Brücken-Aufruf fehlgeschlagen (' + res.status + ')';
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  function postJson(pfad, daten) {
    return jsonAufruf(pfad, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(daten || {}),
    });
  }

  async function llm(prompt, opts) {
    opts = opts || {};
    const res = await rohAufruf('/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: String(prompt),
        system: opts.system || '',
        temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.7,
      }),
    });
    if (!res.ok) {
      let body = null;
      try {
        body = await res.json();
      } catch (e) {
        /* leer */
      }
      const err = new Error(
        (body && body.error && body.error.message) || 'LLM-Aufruf fehlgeschlagen (' + res.status + ')'
      );
      err.status = res.status;
      throw err;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let puffer = '';
    let gesamt = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      puffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = puffer.indexOf('\n\n')) >= 0) {
        const frame = puffer.slice(0, idx);
        puffer = puffer.slice(idx + 2);
        if (frame.indexOf('data: ') !== 0) {
          continue;
        }
        let ev;
        try {
          ev = JSON.parse(frame.slice(6));
        } catch (e) {
          continue;
        }
        if (ev.error) {
          throw new Error(ev.error);
        }
        if (ev.delta) {
          gesamt += ev.delta;
          if (typeof opts.onChunk === 'function') {
            opts.onChunk(ev.delta, gesamt);
          }
        }
      }
    }
    return gesamt;
  }

  window.ArasulBruecke = {
    bereit: bereit,
    faehigkeiten: function () {
      return faehigkeiten.slice();
    },
    info: function () {
      return jsonAufruf('/info', { method: 'GET' });
    },
    llm: llm,
    rag: function (frage, opts) {
      return postJson('/rag', { frage: String(frage), anzahl: (opts && opts.anzahl) || 5 }).then(
        function (b) {
          return b.treffer;
        }
      );
    },
    dateien: {
      liste: function (pfad) {
        return postJson('/dateien', { aktion: 'list', pfad: pfad || '.' });
      },
      lesen: function (pfad) {
        return postJson('/dateien', { aktion: 'read', pfad: pfad });
      },
      schreiben: function (pfad, inhalt) {
        return postJson('/dateien', { aktion: 'write', pfad: pfad, inhalt: String(inhalt) });
      },
    },
    flows: {
      liste: function () {
        return jsonAufruf('/flows', { method: 'GET' }).then(function (b) {
          return b.flows;
        });
      },
      starten: function (name, args) {
        return postJson('/flows/' + encodeURIComponent(name) + '/run', { args: args || {} });
      },
      lauf: function (runId) {
        return jsonAufruf('/flows/runs/' + encodeURIComponent(runId), { method: 'GET' });
      },
    },
  };
})();
