/**
 * Die Lizenz am Geraet, ohne Sitzung (Auftrag J35, 25.09.2026).
 *
 * Der Einstieg hinter `scripts/util/lizenz-geraet.sh`: das Skript ruft ihn per
 * `docker exec` im Backend-Container, denn dort liegen der oeffentliche
 * Schluessel, die Lizenzdatei (`/arasul/lizenz/`), die machine-id des Hosts
 * und die Datenbank. WARUM NICHT DIE SCHNITTSTELLE: `POST /api/license/activate`
 * verlangt eine Sitzung als Administrator, und wer einem Kunden die Lizenz
 * einspielt -- das Ara-Kit, ein Partner, Kolja -- hat am Geraet SSH, aber kein
 * Passwort des Kunden. Wer SSH hat, ist ohnehin Herr des Geraets; ein zweiter
 * Nachweis davor waere keine Sicherheit, sondern Handarbeit.
 *
 * Es ist DERSELBE Dienst wie hinter der Schnittstelle (`licenseService`):
 * dieselbe Pruefung vor dem Schreiben, derselbe Fingerabdruck, dieselben
 * Zaehlungen wie die Riegel. Eine zweite Pruefung gibt es damit nicht. Und
 * weil der Cache des laufenden Backends an der Datei haengt, gilt eine hier
 * eingespielte Lizenz dort sofort.
 *
 * DER VERTRAG NACH AUSSEN (andere Karten bauen darauf): jeder Aufruf gibt
 * genau EINE Zeile JSON auf STDOUT aus, auch im Fehlerfall.
 *
 *   fingerabdruck      {"fingerabdruck":"<hex>"}
 *   status             {"stufe":"community","konten":{"belegt":2,"grenze":3},
 *                       "apps":{"belegt":1,"grenze":3}}      (-1 = unbegrenzt)
 *   einspielen         Lizenz auf STDIN; {"ok":true,"stufe":"professional"}
 *                      oder {"ok":false,"fehler":"..."} mit Rueckgabe 1
 *   entfernen          {"ok":true,"entfernt":true,"stufe":"community"}
 *                      (seit 25.09.2026, Installationsdurchlauf am Orin):
 *                      dasselbe wie `DELETE /api/license` -- Datei und Cache
 *                      weg, danach community. `entfernt: false` heisst, es
 *                      lag keine Datei da; das ist kein Fehler.
 *
 * Ein Fehler bei `fingerabdruck` oder `status` ist {"fehler":"..."} mit
 * Rueckgabe 1, ein unbekannter Befehl dasselbe mit Rueckgabe 2; bei
 * `einspielen` und `entfernen` steht der Fehler als {"ok":false,"fehler":"..."}.
 */

// STDOUT GEHOERT DEM JSON. Der Logger schreibt sonst auf dieselbe Leitung
// (`licenseService.activateLicense` meldet jede Aktivierung), und eine zweite
// Zeile davor macht aus der Antwort etwas, das kein Aufrufer mehr parsen kann.
// Deshalb zuerst der Logger, still, und erst danach alles, was ihn benutzt.
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
    process.stdin.on('end', () => resolve(text.trim()));
    process.stdin.on('error', reject);
  });
}

async function main(befehl) {
  const licenseService = require('../services/app/licenseService');

  if (befehl === 'fingerabdruck') {
    return antworte({ fingerabdruck: await licenseService.getHardwareFingerprint() });
  }

  if (befehl === 'status') {
    return antworte(await licenseService.nutzung());
  }

  if (befehl === 'einspielen') {
    const lizenz = await leseStdin();
    // Dieselben Grenzen wie `ActivateLicenseBody` an der Schnittstelle.
    if (lizenz.length < 10 || lizenz.length > 4096) {
      return antworte(
        { ok: false, fehler: 'Keine Lizenz bekommen (erwartet: 10 bis 4096 Zeichen).' },
        1
      );
    }
    const ergebnis = await licenseService.activateLicense(lizenz);
    // Im Protokoll wie jede Aktivierung ueber die Oberflaeche, nur ohne
    // Menschen: `user_id` bleibt leer, `quelle` sagt, woher sie kam.
    const { logSecurityEvent } = require('../utils/auditLog');
    await logSecurityEvent({
      userId: null,
      action: 'license_activate',
      details: {
        quelle: 'lizenz-geraet.sh',
        success: ergebnis.success,
        tier: ergebnis.license?.tier,
        customer: ergebnis.license?.customer,
        error: ergebnis.error,
      },
    });
    if (!ergebnis.success) {
      return antworte({ ok: false, fehler: ergebnis.error || 'Lizenz abgelehnt' }, 1);
    }
    return antworte({ ok: true, stufe: ergebnis.license.tier });
  }

  if (befehl === 'entfernen') {
    // Bis hierher gab es das Zuruecknehmen nur an der Schnittstelle, und wer
    // per SSH eine Testlizenz eingespielt hatte, brauchte fuer den Rueckweg
    // doch wieder das Passwort des Kunden. Derselbe Dienst wie
    // `DELETE /api/license`, also dieselbe Wirkung: der Cache des laufenden
    // Backends haengt an der Datei und sieht sofort community.
    const { entfernt, license } = await licenseService.deactivateLicense();
    const { logSecurityEvent } = require('../utils/auditLog');
    await logSecurityEvent({
      userId: null,
      action: 'license_remove',
      details: { quelle: 'lizenz-geraet.sh', entfernt, tier: license.tier },
    });
    return antworte({ ok: true, entfernt, stufe: license.tier });
  }

  return antworte(
    {
      fehler: `Unbekannter Befehl ${JSON.stringify(befehl ?? '')}: fingerabdruck, status, einspielen, entfernen`,
    },
    2
  );
}

main(process.argv[2]).catch(fehler => {
  const befehl = process.argv[2];
  if (befehl === 'einspielen' || befehl === 'entfernen') {
    antworte({ ok: false, fehler: fehler.message }, 1);
  }
  antworte({ fehler: fehler.message }, 1);
});
