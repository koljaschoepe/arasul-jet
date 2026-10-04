/**
 * Die Uebergabe eines Flow-Ergebnisses an die App (M5, 04.10.2026, Kontrakt 11).
 *
 * Nach der letzten Stufe ruft das Geraet die Abschluss-Route auf, die der Flow
 * im Kopf nennt (`abschluss.route`). Der Weg ist der kuerzeste und der, den es
 * schon gibt: der Dienstname des Containers im Netz `arasul-apps`
 * (`appContainer.containerName`), ohne Traefik und ohne den Browser. Die Route
 * sieht den Pfad so, wie die App ihn kennt -- ohne `/apps/<id>/api`.
 *
 * WIE DIE APP WEISS, DASS ES DAS GERAET IST. Im selben Netz haengen andere Apps;
 * ein Aufruf aus dem Netz allein beweist nichts. Das Geraet leitet je App und
 * Stand ein Geheimnis aus dem Schluessel des Geraets ab (HMAC, wie der Zugang
 * zum Ausgangs-Proxy) und schickt es als `Authorization: Bearer`; dieselbe
 * Ableitung gibt es der App als `ARASUL_ABSCHLUSS_TOKEN` in die Umgebung. Es
 * wird nirgends gespeichert und aendert sich nicht bei einem Update.
 *
 * IDEMPOTENT: die Lauf-Kennung steht im Kopf `Idempotency-Key` und im Body
 * (`lauf`). Antwortet die App erst nach dem Timeout oder wurde der erste
 * Aufruf nicht bestaetigt, kommt beim zweiten dieselbe Kennung -- die App legt
 * ein Ergebnis nicht zweimal an.
 */

const crypto = require('crypto');
const http = require('http');
const db = require('../../database');
const { containerName } = require('./appContainer');

/** Wie lange das Geraet auf die Empfangsbestaetigung wartet. */
const TIMEOUT_MS = 30000;

/** Hoechstens so viele Zeichen der Antwort einer App kommen ins Protokoll. */
const MAX_FEHLER_ZEICHEN = 300;

/** Das Geheimnis, das eine App und ihr Stand fuer Aufrufe des Geraets kennen. */
function tokenFuer(appId, stand) {
  return crypto
    .createHmac('sha256', process.env.JWT_SECRET || '')
    .update(`abschluss:${appId}:${stand}`)
    .digest('hex');
}

/** Die Umgebung, die der Container einer App mit Backend dazubekommt. */
function umgebungFuer(appId, stand) {
  return { ARASUL_ABSCHLUSS_TOKEN: tokenFuer(appId, stand) };
}

/** Der Port des Backends in dem Stand, der gerade dort steht. */
async function portVon(appId, stand) {
  const { rows } = await db.query(
    'SELECT manifest FROM public.app_staende WHERE app_id = $1 AND stand = $2',
    [appId, stand]
  );
  return rows[0]?.manifest?.ports?.backend ?? null;
}

function kuerze(text) {
  const eins = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return eins.length > MAX_FEHLER_ZEICHEN ? `${eins.slice(0, MAX_FEHLER_ZEICHEN)}...` : eins;
}

/**
 * Ruft die Abschluss-Route auf. Wirft nie: das Ergebnis ist `{ ok, statusCode,
 * fehler }`, damit der Aufrufer den Zustand schreiben kann, ob die App
 * antwortet oder nicht.
 *
 * Nur 2xx ist eine Empfangsbestaetigung. Eine Weiterleitung (3xx) folgt das
 * Geraet nicht: es ruft genau diese Route und keine andere.
 */
async function uebergebe({ appId, stand, route, laufId, nutzlast }, deps = {}) {
  const { anfrage = http.request, port: portLesen = portVon } = deps;
  const port = await portLesen(appId, stand);
  if (!port) {
    return {
      ok: false,
      statusCode: null,
      fehler: `Die App ${appId} hat im ${stand}-Stand kein Backend`,
    };
  }
  const body = JSON.stringify(nutzlast);
  return new Promise(resolve => {
    let fertig = false;
    const ende = ergebnis => {
      if (!fertig) {
        fertig = true;
        resolve(ergebnis);
      }
    };
    const req = anfrage(
      {
        host: containerName(appId, stand),
        port,
        path: route,
        method: 'POST',
        timeout: TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(body),
          Authorization: `Bearer ${tokenFuer(appId, stand)}`,
          'Idempotency-Key': `arasul-lauf-${laufId}`,
          'X-Arasul-Lauf': String(laufId),
        },
      },
      res => {
        const stuecke = [];
        let laenge = 0;
        res.on('data', c => {
          if (laenge < 4096) {
            stuecke.push(c);
            laenge += c.length;
          }
        });
        res.on('end', () => {
          const code = res.statusCode;
          if (code >= 200 && code < 300) {
            ende({ ok: true, statusCode: code, fehler: null });
          } else {
            ende({
              ok: false,
              statusCode: code,
              fehler: `Die App antwortete ${code}${
                stuecke.length ? `: ${kuerze(Buffer.concat(stuecke).toString('utf8'))}` : ''
              }`,
            });
          }
        });
        res.on('error', err => ende({ ok: false, statusCode: null, fehler: kuerze(err.message) }));
      }
    );
    req.on('timeout', () => {
      req.destroy();
      ende({
        ok: false,
        statusCode: null,
        fehler: `Die App hat den Empfang nicht innerhalb von ${Math.round(TIMEOUT_MS / 1000)} Sekunden bestätigt`,
      });
    });
    req.on('error', err => {
      ende({
        ok: false,
        statusCode: null,
        fehler: `Die App ist nicht erreichbar (${err.code || kuerze(err.message)})`,
      });
    });
    req.end(body);
  });
}

module.exports = { tokenFuer, umgebungFuer, uebergebe, portVon, TIMEOUT_MS };
