/**
 * Claude OAuth-Service — der eigene OAuth-2.0-PKCE-Handshake (Plan 015, Phase 3).
 *
 * Warum eigen: die `claude`-CLI erzeugt auf Headless/Linux eine kaputte
 * Authorize-URL (fehlender/falscher `code_challenge`, unpassender Scope) — Issues
 * #29983/#43996/#45340. Wir bauen den winzigen Handshake selbst und kontrollieren
 * damit `client_id`, `redirect_uri`, `scope` und `code_challenge` (S256). Ergebnis:
 * eine GARANTIERT korrekte URL, die im Dashboard als kopierbares Feld erscheint;
 * der Nutzer meldet sich EINMAL an, fügt den Rück-Code ein, das Backend tauscht ihn
 * gegen Access-+Refresh-Token und legt sie verschlüsselt im bestehenden Tresor ab
 * (`externalCredentialsService`, Provider `claude-central`, Modus `oauth`).
 *
 * Vorbild: das quelloffene grll/claude-code-login.
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const { ValidationError, ServiceUnavailableError } = require('../../utils/errors');
const ext = require('./externalCredentialsService');

// --- Konstanten (bewusst hartkodiert, kein process.env — feste Anthropic-Werte) ---
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const AUTHORIZE_URL = 'https://claude.ai/oauth/authorize';
const REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';
const SCOPE = 'org:create_api_key user:profile user:inference';
// Token-Endpunkt: platform.claude.com ist die neue Domain, console.anthropic.com
// die alte — beide live in Benutzung (Anthropic-Umbenennung). Wir probieren den
// bewährten console-Host zuerst, dann platform als Fallback. NIE rasch mehrfach
// auf DENSELBEN Code, sonst Rate-Limit (429) → siehe exchange().
const TOKEN_URLS = [
  'https://console.anthropic.com/v1/oauth/token',
  'https://platform.claude.com/v1/oauth/token',
];

// Browser-ähnliche Header helfen gegen Cloudflare am Token-Endpunkt.
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://claude.ai/',
  Origin: 'https://claude.ai',
};

// Pending-Handshakes je Nutzer: { verifier, state, createdAt }. In-Memory reicht
// (Einzel-Instanz, kurzes Login-Fenster); Verifier verlässt so NIE den Server.
// Aufräumen passiert bei jedem `startClaudeOAuth` (prunePending) — ein einmal
// gestarteter, nie abgeschlossener Eintrag bleibt bis dahin/Prozessende liegen;
// bei Einzel-Admin vernachlässigbar. Backend-Neustart verwirft Pendings → der
// Nutzer klickt „Anmeldung starten" erneut (bewusster Kompromiss).
const PENDING = new Map();
const PENDING_TTL_MS = 15 * 60 * 1000;

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function prunePending(now) {
  for (const [uid, p] of PENDING) {
    if (now - p.createdAt > PENDING_TTL_MS) {
      PENDING.delete(uid);
    }
  }
}

/**
 * Schritt 1: Handshake starten. Erzeugt Verifier/Challenge/State, merkt sie
 * serverseitig und liefert die fertige, korrekte Authorize-URL zurück.
 */
function startClaudeOAuth(userId) {
  const now = Date.now();
  prunePending(now);
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(24));
  PENDING.set(String(userId), { verifier, state, createdAt: now });

  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set('code', 'true');
  u.searchParams.set('client_id', CLIENT_ID);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('redirect_uri', REDIRECT_URI);
  u.searchParams.set('scope', SCOPE);
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('state', state);
  return { authorizeUrl: u.toString(), state };
}

/**
 * Einen Token-Endpunkt genau EINMAL ansprechen. Gibt IMMER ein strukturiertes
 * Ergebnis zurück (wirft NIE) — der Aufrufer entscheidet über Abbruch/Fallback:
 *   { ok:true, json }                              → Erfolg
 *   { ok:false, fatal:true, reason, message }      → nicht weiterprobieren
 *   { ok:false, fatal:false, detail }              → nächsten Host/Encoding testen
 * Fatal ist alles, was den Einmal-Code bereits verbraucht/entwertet hat oder wo
 * ein Retry sinnlos ist: 429 (Rate-Limit), invalid_grant (Code weg), 401/403.
 * Host/Format-Fehler (404, 5xx, Netz, invalid_request) sind NICHT fatal.
 */
async function postToken(url, bodyObj, encoding) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        ...BROWSER_HEADERS,
        'Content-Type':
          encoding === 'form' ? 'application/x-www-form-urlencoded' : 'application/json',
      },
      body: encoding === 'form' ? new URLSearchParams(bodyObj).toString() : JSON.stringify(bodyObj),
    });
  } catch (err) {
    return { ok: false, fatal: false, detail: `Netz: ${err.message}` };
  }
  const text = await res.text();
  if (res.status === 429) {
    return { ok: false, fatal: true, reason: 'rate_limit', detail: '429' };
  }
  if (res.ok) {
    try {
      return { ok: true, json: JSON.parse(text) };
    } catch {
      return { ok: false, fatal: false, detail: 'Ungültige JSON-Antwort' };
    }
  }
  const body = text.slice(0, 400);
  // invalid_grant = Code bereits benutzt/abgelaufen → weitere Versuche zwecklos.
  if (res.status === 401 || res.status === 403 || /invalid_grant/i.test(body)) {
    return { ok: false, fatal: true, reason: 'auth', detail: `${res.status}: ${body}` };
  }
  return { ok: false, fatal: false, detail: `${res.status}: ${body}` };
}

/**
 * Code/Refresh gegen Token tauschen. Probiert Host×Encoding SEQUENZIELL, stoppt
 * beim ERSTEN Erfolg — und bei einem fatalen Ergebnis (429/invalid_grant/401/403)
 * SOFORT, um den Einmal-Code nicht mit sinnlosen Folgeversuchen zu verbrennen.
 * Nur Host-/Format-Fehler (404, 5xx, invalid_request) führen zum nächsten Combo.
 */
async function exchange(bodyObj) {
  const errors = [];
  for (const url of TOKEN_URLS) {
    for (const encoding of ['json', 'form']) {
      const r = await postToken(url, bodyObj, encoding);
      if (r.ok) {
        return r.json;
      }
      errors.push(`${url} [${encoding}] → ${r.detail}`);
      if (r.fatal) {
        if (r.reason === 'rate_limit') {
          throw new ServiceUnavailableError(
            'Anthropic hat die Anfrage vorerst begrenzt (Rate-Limit). Bitte in einer Minute erneut anmelden.'
          );
        }
        logger.warn(`Claude-OAuth-Tausch abgebrochen (fatal): ${errors.join(' | ')}`);
        throw new ValidationError(
          'Token-Tausch abgelehnt. Der Code ist vermutlich abgelaufen oder bereits benutzt — bitte die Anmeldung neu starten.'
        );
      }
    }
  }
  logger.warn(`Claude-OAuth-Tausch fehlgeschlagen: ${errors.join(' | ')}`);
  throw new ValidationError(
    'Token-Tausch fehlgeschlagen. Ist der Code korrekt und frisch? Ggf. Anmeldung neu starten.'
  );
}

function toBundle(json) {
  if (!json || typeof json.access_token !== 'string') {
    throw new ValidationError('Antwort ohne access_token.');
  }
  const expiresIn = Number(json.expires_in) || 0;
  return {
    mode: 'oauth',
    accessToken: json.access_token,
    refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : null,
    expiresAt: expiresIn > 0 ? Date.now() + expiresIn * 1000 : null,
    scopes: typeof json.scope === 'string' ? json.scope.split(' ') : [],
  };
}

/**
 * Schritt 2: den eingefügten Code (Form `CODE#STATE` oder nur `CODE`) einlösen.
 * Prüft den State gegen den Pending-Eintrag, tauscht, speichert das Bündel im
 * Tresor und spielt es in alle laufenden Container des Nutzers ein.
 */
async function completeClaudeOAuth(userId, rawCode, providedState) {
  const uid = String(userId);
  const pending = PENDING.get(uid);
  if (!pending) {
    throw new ValidationError('Keine laufende Anmeldung. Bitte den Login neu starten.');
  }
  if (Date.now() - pending.createdAt > PENDING_TTL_MS) {
    PENDING.delete(uid);
    throw new ValidationError('Die Anmeldung ist abgelaufen. Bitte neu starten.');
  }

  const code = String(rawCode).split('#')[0].split('&')[0].trim();
  if (!code) {
    throw new ValidationError('Kein Code übergeben.');
  }
  // CSRF-Schutz: Anthropic hängt unseren State als CODE#STATE an — DIESER vom
  // Auth-Server zurückgegebene State ist der echte Beweis, dass der Code zu
  // UNSEREM Authorize-Request gehört. Der separat gesendete `providedState` ist
  // nur unser eigener Wert und dient höchstens als Fallback, wenn der eingefügte
  // Code (wider Erwarten) kein `#state` trägt.
  const echoedState = String(rawCode).includes('#') ? String(rawCode).split('#')[1].trim() : null;
  const stateToVerify = echoedState || (providedState && String(providedState).trim());
  if (!stateToVerify || stateToVerify !== pending.state) {
    throw new ValidationError(
      'State stimmt nicht überein (CSRF-Schutz). Bitte den vollständigen Code (inkl. „#…") einfügen oder neu anmelden.'
    );
  }

  const json = await exchange({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: pending.verifier,
    state: pending.state,
  });

  const bundle = toBundle(json);
  await ext.saveCredentials(userId, ext.PROVIDER_CENTRAL, bundle);
  PENDING.delete(uid);
  let appliedTo = 0;
  try {
    appliedTo = await ext.applyCentralAuthToUserContainers(userId);
  } catch (err) {
    logger.warn(`OAuth: Container-Injektion teilweise fehlgeschlagen: ${err.message}`);
  }
  logger.info(`Claude-OAuth erfolgreich für Nutzer ${userId} (${appliedTo} Container).`);
  return { configured: true, mode: 'oauth', expiresAt: bundle.expiresAt, applied_to: appliedTo };
}

/**
 * Access-Token über den gespeicherten Refresh-Token erneuern. Rotiert den Tresor
 * und spielt den frischen Token in die Container ein. Wirft, wenn kein Refresh-
 * Token vorliegt oder Anthropic ablehnt.
 */
async function refreshClaudeOAuth(userId) {
  const current = await ext.loadCredentials(userId, ext.PROVIDER_CENTRAL);
  if (!current || current.mode !== 'oauth' || !current.refreshToken) {
    throw new ValidationError('Kein erneuerbarer OAuth-Zugang hinterlegt.');
  }
  const json = await exchange({
    grant_type: 'refresh_token',
    refresh_token: current.refreshToken,
    client_id: CLIENT_ID,
  });
  const bundle = toBundle(json);
  // Anthropic rotiert den Refresh-Token nicht immer mit → alten behalten, falls neu fehlt.
  if (!bundle.refreshToken) {
    bundle.refreshToken = current.refreshToken;
  }
  await ext.saveCredentials(userId, ext.PROVIDER_CENTRAL, bundle);
  let appliedTo = 0;
  try {
    appliedTo = await ext.applyCentralAuthToUserContainers(userId);
  } catch (err) {
    logger.warn(`OAuth-Refresh: Container-Injektion teilweise fehlgeschlagen: ${err.message}`);
  }
  logger.info(`Claude-OAuth erneuert für Nutzer ${userId} (${appliedTo} Container).`);
  return { configured: true, mode: 'oauth', expiresAt: bundle.expiresAt, applied_to: appliedTo };
}

module.exports = {
  startClaudeOAuth,
  completeClaudeOAuth,
  refreshClaudeOAuth,
  // Für Tests.
  _internals: { CLIENT_ID, AUTHORIZE_URL, REDIRECT_URI, SCOPE, TOKEN_URLS, PENDING, toBundle },
};
