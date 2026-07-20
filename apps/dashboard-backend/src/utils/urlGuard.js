/**
 * URL-Guard gegen SSRF (Plan 010, Schritt 3 — Web/HTTP-Tool).
 *
 * assertPublicHttpUrl() lässt nur http(s)-URLs zu, deren aufgelöste IP-Adressen
 * NICHT in privaten/reservierten Bereichen liegen (Loopback, RFC1918,
 * Link-Local inkl. Cloud-Metadaten 169.254.169.254, ULA fc00::/7, …). Damit
 * kann ein (ohnehin nur admin-freigeschaltetes) Web-Tool nicht auf interne
 * Dienste oder den Metadaten-Endpoint zugreifen.
 *
 * Hinweis: Es bleibt ein TOCTOU-/DNS-Rebinding-Restrisiko (die Auflösung beim
 * eigentlichen Request kann abweichen). Für v1 akzeptiert — das Tool ist
 * opt-in + Admin-gated. Eine spätere Härtung kann die aufgelöste IP pinnen.
 */

const dns = require('dns').promises;
const net = require('net');
const { ValidationError } = require('./errors');

function ipv4IsPrivate(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => Number.isNaN(n))) {
    return true; // im Zweifel blocken
  }
  const [a, b] = p;
  if (a === 10) {
    return true;
  } // 10.0.0.0/8
  if (a === 127) {
    return true;
  } // Loopback
  if (a === 0) {
    return true;
  } // 0.0.0.0/8
  if (a === 169 && b === 254) {
    return true;
  } // Link-Local / Cloud-Metadaten
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  } // 172.16.0.0/12
  if (a === 192 && b === 168) {
    return true;
  } // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  } // CGNAT 100.64.0.0/10
  if (a >= 224) {
    return true;
  } // Multicast/reserved
  return false;
}

function ipv6IsPrivate(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') {
    return true;
  } // Loopback / unspecified
  if (lower.startsWith('fe80')) {
    return true;
  } // Link-Local
  if (lower.startsWith('fc') || lower.startsWith('fd')) {
    return true;
  } // ULA fc00::/7
  // IPv4-mapped (::ffff:a.b.c.d) auf den v4-Check zurückführen
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) {
    return ipv4IsPrivate(mapped[1]);
  }
  return false;
}

function ipIsPrivate(ip) {
  const kind = net.isIP(ip);
  if (kind === 4) {
    return ipv4IsPrivate(ip);
  }
  if (kind === 6) {
    return ipv6IsPrivate(ip);
  }
  return true; // kein gültiges IP → blocken
}

/**
 * Wirft ValidationError, wenn die URL kein öffentliches http(s)-Ziel ist.
 * @param {string} rawUrl
 * @returns {Promise<URL>} die geparste URL (bei Erfolg)
 */
async function assertPublicHttpUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl));
  } catch {
    throw new ValidationError('Ungültige URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError('Nur http/https-URLs sind erlaubt');
  }
  // Bei IPv6-Literalen liefert URL.hostname die Klammern mit ("[::1]") —
  // vor net.isIP / dns.lookup entfernen, sonst greift die IP-Prüfung nicht.
  const host = url.hostname.replace(/^\[|\]$/g, '');

  // Direkt als IP angegeben?
  if (net.isIP(host)) {
    if (ipIsPrivate(host)) {
      throw new ValidationError('Ziel-IP liegt in einem privaten/reservierten Bereich');
    }
    return url;
  }

  // Hostname → alle aufgelösten Adressen prüfen.
  let addrs;
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    throw new ValidationError(`Hostname "${host}" nicht auflösbar`);
  }
  if (!addrs.length) {
    throw new ValidationError(`Hostname "${host}" nicht auflösbar`);
  }
  for (const { address } of addrs) {
    if (ipIsPrivate(address)) {
      throw new ValidationError('Ziel-Host löst auf eine private/reservierte IP auf');
    }
  }
  return url;
}

module.exports = { assertPublicHttpUrl, _internals: { ipIsPrivate } };
