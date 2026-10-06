/**
 * Die Proben-App der Abnahme „Protokoll des Containers" (M5, Auftrag
 * app-protokoll-abrufen, 06.10.2026).
 *
 * Ein Messgeraet, keine Vorlage. Beim Start schreibt sie zwei Dinge ins
 * Protokoll ihres Containers:
 *
 *   1. einen bekannten Satz mit dem Stempel der Abnahme (PROBE_STEMPEL ist
 *      kuerzer als acht Zeichen und wird deshalb nicht geschwaerzt) -- an ihm
 *      erkennt die Abnahme, dass sie das Protokoll DIESES Containers liest;
 *   2. absichtlich die Geheimnisse aus ihrer Umgebung: den Schluessel, die
 *      Adresse ihrer Datenbank samt Passwort, das Passwort allein und einen
 *      eigenen Wert aus `backend.umgebung`. Genau das tut eine App, die beim
 *      Start ihre Einstellungen ausgibt, und genau das darf das Kit nicht
 *      zu lesen bekommen.
 */

const http = require('http');

const PORT = Number(process.env.PORT || 8080);
const STEMPEL = process.env.PROBE_STEMPEL || '?';
const umgebung = process.env;

let passwort = '';
try {
  passwort = decodeURIComponent(new URL(umgebung.ARASUL_DB_URL || '').password);
} catch {
  passwort = '';
}

console.log(`Probe-Protokoll ${STEMPEL}: der Container ist gestartet.`);
console.log(`Schluessel ${umgebung.ARASUL_API_SCHLUESSEL || '-'}`);
console.log(`Datenbank ${umgebung.ARASUL_DB_URL || '-'}`);
console.log(`Passwort ${passwort || '-'}`);
console.error(`Eigenes Geheimnis ${umgebung.PROBE_GEHEIM || '-'}`);
console.log(`Basis ${umgebung.ARASUL_API_URL || '-'}`);

http
  .createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, stempel: STEMPEL }));
  })
  .listen(PORT, () => console.log(`Probe-Protokoll ${STEMPEL}: hoert auf ${PORT}.`));
