/**
 * Das Terminal in der Oberflaeche (Karte terminal-im-frontend, M5, 21.10.2026).
 *
 * Ein Entwickler oeffnet in der Shell ein Terminal und landet als SEIN EIGENER
 * Linux-Nutzer am Geraet, in seinem eigenen Ordner, und startet dort Claude
 * Code. Der Weg, von aussen nach innen:
 *
 *   Browser ─ /terminal/ ─▶ Traefik ─ Forward-Auth ─▶ GET /api/terminal/tor
 *                              │                      (diese Datei: darf er?)
 *                              ▼
 *                       Container `terminal` (ttyd)
 *                              │  ssh als `ara-<id>`, ein Schluessel des Containers
 *                              ▼
 *                       sshd am Geraet ─▶ Shell des Nutzers `ara-<id>`
 *
 * DIE TRENNUNG MACHT LINUX, NICHT DIESE DATEI. Hier wird nur entschieden, ob
 * die Tuer aufgeht und WELCHER Nutzer dahinter steht. Was der Nutzer danach
 * darf (nur der eigene Ordner, kein sudo, kein Docker, keine Dienste des
 * Geraets ausser 443), richtet `scripts/terminal/` am Geraet ein und prueft
 * `scripts/terminal/trennung-pruefen.sh`. Der stärkste Einwand gegen die Karte
 * (R35, eine Shell im Browser auf dem Geraet der Belege) wird dort beantwortet,
 * nicht hier.
 *
 * DER NAME KOMMT AUS DER KENNUNG, NIE AUS DEM BENUTZERNAMEN. `ara-<id>` ist
 * eindeutig, aendert sich nicht, wenn jemand umbenannt wird, und passt ohne
 * Umschreiben in die Regeln fuer Linux-Namen. Aus einem Benutzernamen gebaut,
 * waere `../` oder ein Name mit 40 Zeichen eine Frage an jede Stelle dahinter.
 */

const crypto = require('crypto');
const fs = require('fs');

const PRAEFIX = 'ara-';

/**
 * Das Geheimnis zwischen Tuer und Container (`scripts/terminal/einrichten.sh`
 * wuerfelt es). Gelesen bei jedem Aufbau und nicht beim Start: wer das
 * Terminal nach dem Backend einrichtet, soll es nicht neu starten muessen.
 */
const GEHEIMNIS_DATEI =
  process.env.TERMINAL_TOR_GEHEIMNIS_FILE || '/config/secrets/terminal/tor_geheimnis';

/** Die Kopfzeile, in der Traefik dem Container den Linux-Nutzer nennt. */
const KOPFZEILE = 'X-Arasul-Terminal-Nutzer';

/**
 * Der Linux-Nutzer einer Person: `ara-<id>`. Hoechstens acht Ziffern, weil der
 * Wert mit Siegel (unten) in die 29 Zeichen passen muss, die ttyd 1.7.7 fuer
 * den Nutzer der Kopfzeile vorhaelt (`char user[30]`, `src/server.h`).
 */
function linuxNutzer(userId) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id < 1 || id > 99999999) {
    return null;
  }
  return `${PRAEFIX}${id}`;
}

function geheimnis() {
  try {
    return fs.readFileSync(GEHEIMNIS_DATEI, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

/**
 * Der Wert der Kopfzeile: `ara-<id>:<siegel>`, das Siegel sind die ersten 16
 * Hex-Zeichen von HMAC-SHA256(Geheimnis, `ara-<id>`).
 *
 * WARUM EIN SIEGEL, WENN DOCH NUR TRAEFIK DEN CONTAINER ERREICHT? Weil das
 * nicht stimmt: jeder Prozess AM GERAET erreicht die Adresse eines Containers
 * im Docker-Netz, also auch die Shell eines Entwicklers. Wer dort ttyd direkt
 * anspricht und `X-Arasul-Terminal-Nutzer: ara-1` mitschickt, waere ohne
 * Siegel ein anderer Mensch. Mit Siegel braucht er das Geheimnis, und das
 * liegt in `config/secrets/`, wohin kein Terminal-Nutzer kommt. Die Firewall
 * aus `einrichten.sh` sperrt den Weg ausserdem; zwei Riegel, weil der eine
 * Linux und der andere eine Datei ist.
 */
function siegel(nutzer, geheim) {
  return crypto.createHmac('sha256', geheim).update(nutzer).digest('hex').slice(0, 16);
}

/**
 * Laeuft auf diesem Geraet ein Terminal? Dieselbe Frage an denselben Schalter
 * wie beim Firmenordner (`ordnerdienst.istAn`): der Container faehrt hoch,
 * wenn `COMPOSE_PROFILES` das Profil `terminal` nennt.
 */
function istAn() {
  return (process.env.COMPOSE_PROFILES || '')
    .split(',')
    .map(s => s.trim())
    .includes('terminal');
}

/** Was die Shell ueber das Terminal wissen muss, fuer den Angemeldeten. */
function lage(user) {
  const entwickler = user.entwickler === true;
  return {
    an: istAn(),
    entwickler,
    linuxNutzer: entwickler ? linuxNutzer(user.id) : null,
  };
}

/**
 * Kommt die Anfrage von dieser Seite? Ein WebSocket kennt keine CORS-Pruefung:
 * eine fremde Seite, die der Browser des Entwicklers offen hat, koennte ihn
 * mit dessen Cookie aufbauen. `SameSite=strict` haelt das schon ab; das hier
 * ist die zweite Tuer, und ttyd prueft mit `--check-origin` die dritte.
 *
 * Ohne `Origin` (kein Browser) geht es durch, denn ohne Cookie kommt ohnehin
 * niemand an.
 */
function herkunftPasst(origin, host) {
  if (!origin) {
    return true;
  }
  if (!host) {
    return false;
  }
  try {
    const herkunft = new URL(origin);
    // Ueber dieselbe Form gelesen, damit `arasul:443` und `arasul` gleich sind.
    const ziel = new URL(`${herkunft.protocol}//${host}`);
    return herkunft.host === ziel.host;
  } catch {
    return false;
  }
}

/**
 * Die Entscheidung der Tuer: `{ status, grund }` oder `{ status: 200, nutzer }`.
 *
 * `zeile` ist die Zeile aus `admin_users` (oder `null`, wenn es das Konto
 * nicht oder nicht mehr aktiv gibt), `decoded` das gepruefte Token.
 */
function entscheide({ decoded, zeile, origin, host }) {
  if (!decoded) {
    return { status: 401, grund: 'Die Anmeldung ist ungültig.' };
  }
  if (!zeile) {
    return { status: 401, grund: 'Dieses Konto gibt es nicht.' };
  }
  if (!herkunftPasst(origin, host)) {
    return { status: 403, grund: 'Das Terminal öffnet sich nur aus der Oberfläche des Geräts.' };
  }
  if (!istAn()) {
    return { status: 403, grund: 'Auf diesem Gerät ist das Terminal nicht eingeschaltet.' };
  }
  if (zeile.entwickler !== true) {
    return { status: 403, grund: 'Das Terminal ist nur für Personen mit der Rolle Entwickler.' };
  }
  const nutzer = linuxNutzer(zeile.id);
  if (!nutzer) {
    return { status: 403, grund: 'Für dieses Konto gibt es keinen Nutzer am Gerät.' };
  }
  const geheim = geheimnis();
  if (!geheim) {
    return { status: 503, grund: 'Das Terminal ist auf diesem Gerät noch nicht eingerichtet.' };
  }
  return { status: 200, nutzer, kopf: `${nutzer}:${siegel(nutzer, geheim)}` };
}

module.exports = { KOPFZEILE, linuxNutzer, siegel, istAn, lage, herkunftPasst, entscheide };
