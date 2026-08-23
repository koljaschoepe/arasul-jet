/**
 * Lese-Token fuer die Dateien einer App-Erweiterung (Fund vom 23.08.2026).
 *
 * Warum es das braucht. Der iframe in `ExtensionAppTab.tsx` laeuft absichtlich
 * ohne `allow-same-origin`, und die Antwort traegt zusaetzlich eine
 * CSP-`sandbox`-Direktive. Das Dokument hat damit einen OPAKEN Origin. Fuer den
 * Browser ist jede Unteranfrage aus diesem Dokument heraus „cross-site" — und
 * `arasul_session` ist `SameSite=Strict`. Das Cookie wird also NICHT
 * mitgeschickt, `requireAuth` antwortet 401, und der Browser meldet obendrein
 * `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`.
 *
 * Auf dem Orin gemessen an `arasul-bruecke.js`. Betroffen war aber nicht nur
 * die Bruecke: KEINE Unterdatei einer App-Erweiterung konnte je nachladen,
 * weder ein Stylesheet noch ein Bild. Nur die Startdatei kam an, weil ihr
 * Abruf eine Navigation des Elternfensters ist und dabei same-site zaehlt.
 *
 * Der Weg hier: die authentifizierte Dashboard-Seite holt einen kurzlebigen
 * Token und haengt ihn IN DEN PFAD des iframes. Relative Verweise im
 * App-HTML erben den Pfad von selbst, es braucht kein Cookie und keine
 * Kopfzeile — und damit auch keine Lockerung an `SameSite`.
 *
 * Was der Token wert ist: ausschliesslich das Lesen der Dateien GENAU DIESER
 * Erweiterung. Er steht in der Adresse des Rahmens, die App kann ihn also
 * lesen. Das ist folgenlos, denn es sind ihre eigenen Dateien.
 *
 * Bewusst getrennt vom Bruecken-Token: die Bruecke laesst sich per
 * `EXTENSIONS_BRUECKE_ENABLED=false` abschalten. Haenge man die Auslieferung
 * daran, zeichnete danach keine App mehr.
 */

const crypto = require('crypto');

const TTL_RAW = parseInt(process.env.EXTENSIONS_APP_TOKEN_TTL_MS || '900000', 10);
// Fail closed wie beim Bruecken-Token: ein kaputter Env-Wert (NaN) darf nicht
// dazu fuehren, dass Tokens nie ablaufen — `exp <= now` ist fuer NaN immer false.
const TTL_MS = Number.isFinite(TTL_RAW) && TTL_RAW > 0 ? TTL_RAW : 900000; // 15 min
const MAX_TOKENS = 500;

// token → { extensionId, userId, exp }
const tokens = new Map();

function aufraeumen() {
  const now = Date.now();
  for (const [t, e] of tokens.entries()) {
    if (e.exp <= now) {
      tokens.delete(t);
    }
  }
  if (tokens.size > MAX_TOKENS) {
    const sortiert = [...tokens.entries()].sort((a, b) => a[1].exp - b[1].exp);
    for (const [t] of sortiert.slice(0, tokens.size - MAX_TOKENS)) {
      tokens.delete(t);
    }
  }
}

/** Gibt einen frischen Lese-Token aus. Aufrufer ist die angemeldete Seite. */
function ausgeben(extensionId, userId) {
  aufraeumen();
  const token = crypto.randomBytes(32).toString('base64url');
  tokens.set(token, { extensionId, userId: userId ?? null, exp: Date.now() + TTL_MS });
  return { token, expiresInMs: TTL_MS };
}

/**
 * Wahr, wenn der Token gueltig ist UND zu genau dieser Erweiterung gehoert.
 * Ein Token fuer Erweiterung A darf die Dateien von B nicht oeffnen.
 */
function gueltig(token, extensionId) {
  if (!token) {
    return false;
  }
  const eintrag = tokens.get(token);
  if (!eintrag) {
    return false;
  }
  if (eintrag.exp <= Date.now()) {
    tokens.delete(token);
    return false;
  }
  return eintrag.extensionId === extensionId;
}

/** Nur fuer Tests — wie `_reset` im brueckeService. */
function alleVerwerfen() {
  tokens.clear();
}

module.exports = { ausgeben, gueltig, alleVerwerfen, TTL_MS, _internals: { tokens } };
