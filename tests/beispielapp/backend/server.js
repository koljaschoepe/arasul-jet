/**
 * Das Backend der Beispielapp.
 *
 * Ohne Abhaengigkeiten, mit dem eingebauten `http`-Modul: die Beispielapp soll
 * belegen, dass eine App unter `/apps/<id>/api/` erreichbar ist, und nicht
 * nebenbei einen zweiten Paketbaum ins Repository holen.
 *
 * Sie sieht ihre Pfade OHNE das Praefix der Plattform: Traefik schneidet
 * `/apps/beispielapp/api` ab, bevor die Anfrage hier ankommt. Genau das gibt
 * `/hallo` in der Antwort zurueck — es ist der Beleg dafuer.
 *
 * Seit Phase C4 belegt sie zwei Dinge mehr, und beide kommen von der
 * Plattform, nicht von ihr selbst:
 *
 *   /hallo       wer angemeldet ist (`X-Arasul-User`, `X-Arasul-Role`)
 *   /schluessel  dass ihr API-Schluessel wirklich gilt
 *
 * Seit Phase C6 kommt das Dritte dazu, und es ist das eigentliche Mass jener
 * Phase:
 *
 *   /flow        sie STARTET ihren eigenen Flow, mit ihrem eigenen Schluessel
 *
 * Der Flow liegt in ihrem Paket (`flows/wochenbericht.md`) und wurde beim
 * Einspielen je Stand registriert. Dass sie ihn starten darf und den einer
 * anderen App nicht, entscheidet nicht sie, sondern der Schluessel: er traegt
 * App und Stand, und das Geraet sucht mit beiden.
 */

const http = require('http');

const PORT = Number(process.env.PORT || 8080);
const NAME = process.env.ARASUL_APP_NAME || 'Beispielapp';
const API_URL = process.env.ARASUL_API_URL || '';
const API_SCHLUESSEL = process.env.ARASUL_API_SCHLUESSEL || '';

/**
 * Eine Kopfzeile, wie die Plattform sie meint.
 *
 * Node liest Kopfzeilen als Latin-1, die Plattform legt den Namen aber als
 * UTF-8 ab (`services/app/appZugang.js`). Ohne diese Zeile stuende
 * "JÃ¼rgen MÃ¼ller" auf dem Bildschirm. Der Umweg ist bei reinem ASCII
 * folgenlos, deshalb steht er ohne Bedingung da.
 */
function ausUtf8(wert) {
  return wert ? Buffer.from(wert, 'latin1').toString('utf8') : null;
}

/**
 * Einen Aufruf an die externe Schnittstelle des Geraets machen und NUR den
 * HTTP-Code zurueckgeben.
 *
 * Der Schluessel selbst verlaesst diesen Prozess nicht. Eine Beispielapp, die
 * ihn anzeigt, waere eine Anleitung dafuer, es genauso zu machen.
 */
/**
 * Einen Aufruf an die externe Schnittstelle machen und Code UND Rumpf
 * zurueckgeben.
 *
 * `schluesselPruefen` unten will nur den Code; hier braucht es die Antwort
 * selbst, weil die Lauf-Nummer darin steht.
 */
function ruf(verb, pfad, leib) {
  return new Promise(fertig => {
    if (!API_URL || !API_SCHLUESSEL) {
      fertig({ code: null, rumpf: null });
      return;
    }
    const daten = leib ? JSON.stringify(leib) : null;
    const anfrage = http.request(
      `${API_URL}${pfad}`,
      {
        method: verb,
        timeout: 30000,
        headers: {
          'x-api-key': API_SCHLUESSEL,
          ...(daten
            ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(daten) }
            : {}),
        },
      },
      antwort => {
        let text = '';
        antwort.setEncoding('utf8');
        antwort.on('data', stueck => {
          text += stueck;
        });
        antwort.on('end', () => {
          let rumpf = null;
          try {
            rumpf = JSON.parse(text);
          } catch {
            rumpf = null;
          }
          fertig({ code: antwort.statusCode, rumpf });
        });
      }
    );
    anfrage.on('timeout', () => anfrage.destroy());
    anfrage.on('error', () => fertig({ code: 0, rumpf: null }));
    if (daten) {
      anfrage.write(daten);
    }
    anfrage.end();
  });
}

function schluesselPruefen() {
  return new Promise(fertig => {
    if (!API_URL || !API_SCHLUESSEL) {
      fertig(null);
      return;
    }
    const anfrage = http.get(
      `${API_URL}/models`,
      { headers: { 'x-api-key': API_SCHLUESSEL }, timeout: 10000 },
      antwort => {
        antwort.resume();
        fertig(antwort.statusCode);
      }
    );
    anfrage.on('timeout', () => anfrage.destroy());
    anfrage.on('error', () => fertig(0));
  });
}

const server = http.createServer((anfrage, antwort) => {
  const pfad = new URL(anfrage.url, 'http://app').pathname;
  antwort.setHeader('content-type', 'application/json; charset=utf-8');

  if (pfad === '/gesund') {
    antwort.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (pfad === '/hallo') {
    antwort.end(
      JSON.stringify({
        app: NAME,
        pfad,
        // Was die Plattform der App ueber den Aufrufer sagt. Seit C4 steht
        // hier ein Name: die Forward-Auth vor diesem Container setzt beide
        // Koepfe, und sie sind nicht faelschbar — Traefik loescht sie aus der
        // eingehenden Anfrage, bevor es sie aus der Antwort der Anmeldung neu
        // setzt.
        nutzer: ausUtf8(anfrage.headers['x-arasul-user']),
        rolle: ausUtf8(anfrage.headers['x-arasul-role']),
        zeit: new Date().toISOString(),
      })
    );
    return;
  }

  if (pfad === '/schluessel') {
    schluesselPruefen().then(code => {
      antwort.end(
        JSON.stringify({
          gesetzt: Boolean(API_SCHLUESSEL),
          url: API_URL || null,
          // Der HTTP-Code der externen Schnittstelle: 200 heisst, der
          // Schluessel gilt. `null` heisst, das Geraet hat keinen gesetzt,
          // `0` heisst, es kam keine Antwort.
          antwort: code,
        })
      );
    });
    return;
  }

  // Phase C6: die App startet IHREN Flow. Der Schluessel verlaesst den
  // Container auch hier nicht -- zurueck geht nur, was die Plattform
  // antwortet.
  //
  //   POST /flow          startet `wochenbericht` und gibt die Lauf-Nummer
  //   GET  /flow?lauf=42  fragt nach, wie weit er ist
  //
  // Getrennt in zwei Aufrufe, weil ein Flow Minuten laufen kann: die
  // Forward-Auth, Traefik und der Browser dazwischen haben alle ihre eigenen
  // Zeitlimits, und ein Aufruf, der auf das Ende wartet, laeuft in das
  // kuerzeste davon.
  if (pfad === '/flow') {
    const woche = new URL(anfrage.url, 'http://app').searchParams;
    if (anfrage.method === 'POST') {
      ruf('POST', '/flows/wochenbericht/run', {
        args: { woche: woche.get('woche') || '34' },
        wait_for_result: false,
      }).then(({ code, rumpf }) => {
        antwort.statusCode = code === 202 ? 202 : 502;
        antwort.end(
          JSON.stringify({ gestartet: code === 202, antwort: code, lauf: rumpf?.run_id ?? null })
        );
      });
      return;
    }
    const lauf = woche.get('lauf');
    if (!lauf) {
      antwort.statusCode = 400;
      antwort.end(JSON.stringify({ fehler: 'GET /flow braucht ?lauf=<nummer>' }));
      return;
    }
    ruf('GET', `/flows/runs/${encodeURIComponent(lauf)}`).then(({ code, rumpf }) => {
      antwort.statusCode = code === 200 ? 200 : 502;
      antwort.end(
        JSON.stringify({
          antwort: code,
          lauf: Number(lauf),
          status: rumpf?.status ?? null,
          schritte: rumpf?.steps_used ?? null,
          ergebnis: rumpf?.result ?? null,
          fehler: rumpf?.error ?? null,
        })
      );
    });
    return;
  }

  antwort.statusCode = 404;
  antwort.end(JSON.stringify({ fehler: `Die Beispielapp kennt ${pfad} nicht` }));
});

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`Beispielapp hoert auf ${PORT}\n`);
});

// Docker schickt SIGTERM; ohne diese Zeilen wartet es zehn Sekunden und
// schiesst dann. Bei einer App, die je Deploy neu gestartet wird, sind das
// zehn Sekunden je Deploy.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
