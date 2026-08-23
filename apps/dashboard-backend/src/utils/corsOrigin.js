// SEC-007: CORS origin allow-list — pure, testable helper.
//
// Extracted from index.js so the origin-matching rules can be unit-tested at
// their boundaries. `isAllowedOrigin(origin, allowedOrigins)` returns true when
// the request origin should be permitted by the CORS layer.
//
// Allowed:
//   - no origin (same-origin request, curl, server-to-server)
//   - an origin explicitly listed in ALLOWED_ORIGINS
//   - a local/private network origin (RFC 1918, localhost, docker service name)
//   - an *.local mDNS hostname (LAN standard access path)
//   - a Tailscale CGNAT IP (100.64.0.0/10, RFC 6598) — remote access via tailnet
//   - a MagicDNS *.ts.net hostname — remote access with browser-trusted cert
//
// Intentionally NOT allowed: public 100.0.0.0/8 addresses outside the CGNAT
// range (e.g. 100.63.x / 100.128.x are real routable IPs). The regex boundaries
// below are a security control — the corsOrigin.test.js grenzfall tests exist
// to keep them from drifting.

const _octet = '(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)';

// RFC 1918 private ranges: 192.168/16, 10/8, 172.16-31/12
const _privateIPRegex = new RegExp(
  `^https?:\\/\\/(192\\.168\\.${_octet}\\.${_octet}|10\\.${_octet}\\.${_octet}\\.${_octet}|172\\.(?:1[6-9]|2\\d|3[01])\\.${_octet}\\.${_octet})(:\\d+)?$`
);

// Tailscale CGNAT range 100.64.0.0/10 (RFC 6598): second octet 64–127 only.
// 64-69 | 70-99 | 100-119 | 120-127  →  6[4-9] | [7-9]\d | 1[01]\d | 12[0-7]
const _tailscaleCGNATRegex = new RegExp(
  `^https?:\\/\\/100\\.(?:6[4-9]|[7-9]\\d|1[01]\\d|12[0-7])\\.${_octet}\\.${_octet}(:\\d+)?$`
);

// mDNS LAN hostname: <name>.local
const _mdnsRegex = /^https?:\/\/[a-zA-Z0-9-]+\.local(:\d+)?$/;

// Tailscale MagicDNS hostname: <device>.<tailnet>.ts.net
const _tailscaleDNSRegex = /^https?:\/\/[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.ts\.net(:\d+)?$/;

/**
 * Decide whether a CORS request origin is allowed.
 *
 * @param {string|undefined} origin - the request Origin header (undefined for same-origin/curl)
 * @param {string[]} [allowedOrigins] - explicit origins from ALLOWED_ORIGINS
 * @returns {boolean}
 */
function isAllowedOrigin(origin, allowedOrigins = []) {
  // No origin → same-origin request, curl, or server-to-server: allow.
  if (!origin) {
    return true;
  }

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  return (
    _privateIPRegex.test(origin) ||
    _tailscaleCGNATRegex.test(origin) ||
    origin.includes('://localhost') ||
    origin.includes('://127.0.0.1') ||
    origin.includes('://dashboard-frontend') ||
    _mdnsRegex.test(origin) ||
    _tailscaleDNSRegex.test(origin)
  );
}

/**
 * Der opake Origin der KI-Bruecke (Fund vom 23.08.2026).
 *
 * Der iframe einer App-Erweiterung laeuft ohne `allow-same-origin`; sein
 * `fetch` schickt woertlich `Origin: null`. `isAllowedOrigin` kennt nur echte
 * Herkuenfte und lehnt das ab — und weil der globale CORS-Waechter VOR dem
 * Router laeuft, beantwortete er schon den Vorabflug mit 403. Der Router kam
 * nie dran, im Browser stand nur `net::ERR_FAILED`, und keine App konnte die
 * Bruecke je benutzen.
 *
 * Die Ausnahme ist absichtlich eng: nur woertlich `null`, nur unterhalb von
 * `/api/extensions/:id/bruecke`, und OHNE `credentials`. Ein opaker Origin
 * bekommt hier nie ein Cookie; er weist sich mit seinem Bruecken-Token im
 * `Authorization`-Kopf aus, und genau darauf ist die Bruecke gebaut.
 *
 * Liefert die CORS-Optionen fuer diesen Fall — oder `null`, wenn der
 * allgemeine Waechter zustaendig bleibt.
 */
const _brueckePfad = /^\/api\/extensions\/[^/]+\/bruecke(\/|$)/;

function brueckeCorsOptionen(origin, pfad) {
  if (origin !== 'null' || typeof pfad !== 'string' || !_brueckePfad.test(pfad)) {
    return null;
  }
  return {
    origin: 'null',
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  };
}

module.exports = { isAllowedOrigin, brueckeCorsOptionen };
