/**
 * Wohin darf eine Erweiterung hinaus? (Plan 023 H1)
 *
 * Die Ziele stehen im Manifest, durchgesetzt werden sie hier. Das ist der
 * Kern der Zusage: nicht die Anwendung entscheidet, wen sie anruft, sondern
 * das Gerät. Eine Erweiterung, die DATEV erreichen darf, darf deshalb noch
 * lange nicht Postgres erreichen.
 *
 * Zwei Wände, und beide sind nötig:
 *
 *   1. Die Liste aus dem Manifest. Sie sagt, welche Gegenstelle gemeint ist.
 *   2. Die aufgelöste Adresse. Ein Name im Manifest kann auf 127.0.0.1 oder
 *      172.17.0.1 zeigen, absichtlich oder weil jemand den DNS-Eintrag
 *      geändert hat, nachdem die Erweiterung installiert war. Ohne die zweite
 *      Wand wäre die erste eine Empfehlung.
 *
 * Die zweite Wand ist der Grund, warum hier keine Bibliothek steht: der
 * Zeitpunkt zählt. Geprüft wird die Adresse, mit der wirklich verbunden wird,
 * nicht die, die eine Minute vorher aufgelöst wurde.
 */

const dns = require('dns/promises');
const { ValidationError, ForbiddenError } = require('../../utils/errors');

/** Nur verschlüsselt hinaus. Ein Kundengeheimnis geht nicht im Klartext ins Netz. */
const ERLAUBTE_SCHEMATA = new Set(['https:']);

/**
 * Adressbereiche, die nie erlaubt sind, auch nicht mit Eintrag im Manifest.
 *
 * Das ist das eigene Gerät und das eigene Netz: Postgres, MinIO, Ollama, der
 * Docker-Proxy, das Dashboard selbst. Eine Erweiterung, die dorthin darf, ist
 * keine Erweiterung mehr, sondern hat das Gerät übernommen.
 */
const VERBOTENE_V4 = [
  { netz: '0.0.0.0', bits: 8, was: 'diese Maschine' },
  { netz: '10.0.0.0', bits: 8, was: 'privates Netz' },
  { netz: '100.64.0.0', bits: 10, was: 'Carrier-NAT' },
  { netz: '127.0.0.0', bits: 8, was: 'das Gerät selbst' },
  { netz: '169.254.0.0', bits: 16, was: 'Link-Local und Cloud-Metadaten' },
  { netz: '172.16.0.0', bits: 12, was: 'privates Netz, auch Docker' },
  { netz: '192.0.0.0', bits: 24, was: 'reserviert' },
  { netz: '192.168.0.0', bits: 16, was: 'privates Netz' },
  { netz: '198.18.0.0', bits: 15, was: 'Messnetz' },
  { netz: '224.0.0.0', bits: 4, was: 'Multicast' },
  { netz: '240.0.0.0', bits: 4, was: 'reserviert' },
];

/** IPv4 als Zahl, oder null wenn es keine ist. */
function alsZahl(ip) {
  const teile = String(ip).split('.');
  if (teile.length !== 4) {
    return null;
  }
  let wert = 0;
  for (const t of teile) {
    if (!/^\d{1,3}$/.test(t)) {
      return null;
    }
    const n = Number(t);
    if (n > 255) {
      return null;
    }
    wert = wert * 256 + n;
  }
  return wert;
}

/**
 * Liegt die Adresse in einem verbotenen Bereich?
 *
 * @param {string} ip IPv4 oder IPv6
 * @returns {string|null} Was dort liegt, oder null wenn erlaubt
 */
function verbotenerBereich(ip) {
  const roh = String(ip || '').trim();
  if (roh === '') {
    return 'leere Adresse';
  }

  // IPv6, einschließlich der Schreibweise ::ffff:127.0.0.1 für IPv4.
  if (roh.includes(':')) {
    const klein = roh.toLowerCase();
    const v4 = klein.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4 && v4[1]) {
      return verbotenerBereich(v4[1]);
    }
    if (klein === '::' || klein === '::1') {
      return 'das Gerät selbst';
    }
    // fc00::/7 (eindeutig lokal), fe80::/10 (Link-Local)
    if (/^f[cd]/.test(klein)) {
      return 'privates Netz (IPv6)';
    }
    if (/^fe[89ab]/.test(klein)) {
      return 'Link-Local (IPv6)';
    }
    return null;
  }

  const zahl = alsZahl(roh);
  if (zahl === null) {
    return 'keine erkennbare Adresse';
  }
  for (const { netz, bits, was } of VERBOTENE_V4) {
    const maske = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    const netzZahl = alsZahl(netz);
    if (netzZahl !== null && (zahl & maske) === (netzZahl & maske)) {
      return was;
    }
  }
  return null;
}

/**
 * Die Ziele aus dem Manifest lesen und prüfen.
 *
 * Erwartet wird `manifest.netz.ziele`, eine Liste von Adressen wie
 * `https://api.datev.de` oder `https://api.datev.de/v1/`. Der Pfad zählt als
 * Präfix: `https://api.datev.de/v1/` erlaubt `/v1/belege`, aber nicht `/admin`.
 *
 * @returns {Array<{herkunft: string, praefix: string}>}
 */
function zieleAus(manifest) {
  const roh = manifest?.netz?.ziele;
  if (!Array.isArray(roh)) {
    return [];
  }
  const ziele = [];
  for (const eintrag of roh) {
    let url;
    try {
      url = new URL(String(eintrag));
    } catch {
      continue;
    }
    if (!ERLAUBTE_SCHEMATA.has(url.protocol)) {
      continue;
    }
    ziele.push({ herkunft: url.origin, praefix: url.pathname === '/' ? '/' : url.pathname });
  }
  return ziele;
}

/**
 * Darf diese Erweiterung diese Adresse anrufen?
 *
 * Prüft NUR die erste Wand (das Manifest). Die zweite Wand (die aufgelöste
 * Adresse) sitzt in `pruefeAdresse`, weil sie das Netz braucht.
 *
 * @param {string} zielUrl gewünschte Adresse
 * @param {object} manifest Manifest der Erweiterung
 * @returns {URL} die geprüfte Adresse
 * @throws {ValidationError} bei einer unbrauchbaren Adresse
 * @throws {ForbiddenError} wenn sie nicht im Manifest steht
 */
function pruefeZiel(zielUrl, manifest) {
  let url;
  try {
    url = new URL(String(zielUrl));
  } catch {
    throw new ValidationError(`Keine gültige Adresse: ${zielUrl}`);
  }
  if (!ERLAUBTE_SCHEMATA.has(url.protocol)) {
    throw new ForbiddenError(
      `Nur https ist erlaubt, "${url.protocol.replace(':', '')}" nicht. ` +
        'Ein Kundengeheimnis geht nicht im Klartext ins Netz.'
    );
  }
  const ziele = zieleAus(manifest);
  if (ziele.length === 0) {
    throw new ForbiddenError(
      'Diese Erweiterung hat keine Ziele im Manifest deklariert. ' +
        'Ausgehende Aufrufe gehen nur an Adressen, die dort unter "netz.ziele" stehen.'
    );
  }
  const passt = ziele.some(z => url.origin === z.herkunft && url.pathname.startsWith(z.praefix));
  if (!passt) {
    throw new ForbiddenError(
      `"${url.origin}${url.pathname}" steht nicht in den Zielen dieser Erweiterung. ` +
        `Erlaubt: ${ziele.map(z => z.herkunft + z.praefix).join(', ')}`
    );
  }
  return url;
}

/**
 * Die zweite Wand: worauf löst der Name auf?
 *
 * @param {string} hostname Name aus der Adresse
 * @param {Function} [aufloesen] für Tests injizierbar
 * @returns {Promise<string[]>} die geprüften Adressen
 * @throws {ForbiddenError} wenn eine davon im eigenen Netz liegt
 */
async function pruefeAdresse(hostname, aufloesen = null) {
  const loeser = aufloesen || (name => dns.lookup(name, { all: true, verbatim: true }));
  let treffer;
  try {
    treffer = await loeser(hostname);
  } catch (err) {
    throw new ValidationError(`Name nicht auflösbar: ${hostname} (${err.code || err.message})`);
  }
  const adressen = (Array.isArray(treffer) ? treffer : [treffer])
    .map(t => (typeof t === 'string' ? t : t?.address))
    .filter(Boolean);
  if (adressen.length === 0) {
    throw new ValidationError(`Name löst auf nichts auf: ${hostname}`);
  }
  // ALLE prüfen, nicht die erste: sonst genügt ein zweiter A-Eintrag, der ins
  // eigene Netz zeigt, und die Verbindung nimmt zufällig den.
  for (const adresse of adressen) {
    const was = verbotenerBereich(adresse);
    if (was) {
      throw new ForbiddenError(
        `"${hostname}" zeigt auf ${adresse} (${was}). Erweiterungen erreichen ` +
          'das eigene Gerät und das eigene Netz nicht.'
      );
    }
  }
  return adressen;
}

module.exports = {
  pruefeZiel,
  pruefeAdresse,
  zieleAus,
  verbotenerBereich,
  ERLAUBTE_SCHEMATA,
};
