/**
 * Das Passwort eines Menschen am Geraet zuruecksetzen, ohne Sitzung (J33).
 *
 * Der Einstieg hinter `scripts/security/reset-password.sh`, nach dem Muster von
 * `cli/lizenz.js`: das Skript ruft ihn per `docker exec -i` im Backend-
 * Container. Es ist DERSELBE Schreibweg wie hinter der Oberflaeche
 * (`passwordService.schreibePasswort`), damit auch der Dateidienst das neue
 * Passwort bekommt.
 *
 *   passwort.js <benutzername>     Passwort auf STDIN (eine Zeile)
 *     {"ok":true,"benutzer":"admin","firmenordner":"gespiegelt"}
 *     firmenordner: "gespiegelt" | "offen" (Dienst nahm es nicht an) | "aus"
 *     {"ok":false,"fehler":"..."} mit Rueckgabe 1
 */
const logger = require('../utils/logger');
logger.silent = true;
for (const t of logger.transports) {
  t.silent = true;
}

function antworte(objekt, code = 0) {
  process.stdout.write(`${JSON.stringify(objekt)}\n`);
  process.exit(code);
}

function leseStdin() {
  return new Promise((resolve, reject) => {
    let text = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', stueck => {
      text += stueck;
    });
    // Nur der Zeilenumbruch faellt weg, Leerzeichen gehoeren zum Passwort.
    process.stdin.on('end', () => resolve(text.replace(/\r?\n$/, '')));
    process.stdin.on('error', reject);
  });
}

async function main(benutzername) {
  if (!benutzername) {
    return antworte({ ok: false, fehler: 'Benutzername fehlt' }, 2);
  }
  const passwort = await leseStdin();
  const { setzePasswortAmGeraet } = require('../services/auth/passwordService');
  const ergebnis = await setzePasswortAmGeraet(benutzername, passwort);
  const { logSecurityEvent } = require('../utils/auditLog');
  await logSecurityEvent({
    userId: ergebnis.id,
    action: 'password_reset_device',
    details: { quelle: 'reset-password.sh', firmenordner: ergebnis.gespiegelt },
  });
  const firmenordner =
    ergebnis.gespiegelt === null ? 'aus' : ergebnis.gespiegelt ? 'gespiegelt' : 'offen';
  return antworte({ ok: true, benutzer: ergebnis.username, firmenordner });
}

main(process.argv[2]).catch(fehler => antworte({ ok: false, fehler: fehler.message }, 1));
