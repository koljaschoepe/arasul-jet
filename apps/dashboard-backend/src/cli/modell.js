/**
 * Modelle am Geraet laden, ohne Sitzung (Auftrag modelle-frei-herunterladbar, J4).
 *
 * Der Einstieg hinter `scripts/util/modell-geraet.sh`, nach dem Muster von
 * `cli/lizenz.js`: das Skript ruft ihn per `docker exec` im Backend-Container.
 * WARUM NICHT DIE SCHNITTSTELLE: `POST /api/models/download` verlangt eine
 * Sitzung als Administrator, und das Ara-Kit hat am Geraet SSH und einen
 * Schluessel mit `app:deploy`, aber kein Passwort des Kunden. Wer SSH hat, ist
 * ohnehin Herr des Geraets.
 *
 * Es ist DERSELBE Dienst wie hinter der Schnittstelle: `freiesModell.vorbereiten`
 * (Kennung lesen, Groesse gegen das Speicherbudget halten, mit Grund abweisen)
 * und danach `modelService.downloadModel`. Eine zweite Pruefung gibt es damit
 * nicht.
 *
 * DER VERTRAG NACH AUSSEN: jeder Aufruf gibt genau EINE Zeile JSON auf STDOUT
 * aus, auch im Fehlerfall. Der Fortschritt eines Ladevorgangs steht auf STDERR
 * (eine Zeile je zehn Prozent), damit STDOUT dem JSON gehoert.
 *
 *   laden <kennung>     {"ok":true,"modell":"<kennung>","gemessen":false,
 *                        "digest_vorab":false}
 *                       {"ok":false,"fehler":"...","grund":"ZU_GROSS",...}
 *                       mit Rueckgabe 1; `grund` und die Zahlen stehen nur
 *                       bei einer Abweisung nach Groesse
 *   liste               {"modelle":[{"id":"...","name":"...","gemessen":true,
 *                                    "groesse_bytes":123,"standard":false}]}
 *                       nur, was am Geraet liegt
 *   entfernen <kennung> {"ok":true,"modell":"<kennung>"}
 *                       oder {"ok":false,"fehler":"..."} mit Rueckgabe 1
 *
 * Ein unbekannter Befehl ist {"fehler":"..."} mit Rueckgabe 2.
 */

// STDOUT GEHOERT DEM JSON -- siehe `cli/lizenz.js`: erst der Logger, still.
const logger = require('../utils/logger');
logger.silent = true;
for (const t of logger.transports) {
  t.silent = true;
}

function antworte(objekt, code = 0) {
  process.stdout.write(`${JSON.stringify(objekt)}\n`);
  process.exit(code);
}

function fehlerAntwort(fehler) {
  return {
    ok: false,
    fehler: fehler.message,
    ...(fehler.details?.grund ? fehler.details : {}),
  };
}

async function main(befehl, kennung) {
  const modelService = require('../services/llm/modelService');
  const freiesModell = require('../services/llm/freiesModell');
  const database = require('../database');

  if (befehl === 'liste') {
    const { rows } = await database.query(
      `SELECT c.id, c.name, c.size_bytes, c.jetson_tested, c.frei_geladen, i.is_default
         FROM llm_installed_models i
         JOIN llm_model_catalog c ON c.id = i.id
        WHERE i.status = 'available'
        ORDER BY i.is_default DESC, c.name`
    );
    return antworte({
      modelle: rows.map(r => ({
        id: r.id,
        name: r.name,
        gemessen: r.jetson_tested === true && r.frei_geladen !== true,
        groesse_bytes: Number(r.size_bytes),
        standard: r.is_default === true,
      })),
    });
  }

  if (befehl === 'laden' || befehl === 'entfernen') {
    if (!kennung) {
      return antworte({ ok: false, fehler: `Aufruf: ${befehl} <kennung>` }, 2);
    }

    if (befehl === 'entfernen') {
      await modelService.deleteModel(kennung);
      return antworte({ ok: true, modell: kennung });
    }

    const vorbereitet = await freiesModell.vorbereiten(kennung);
    let letzterSchritt = -1;
    try {
      await modelService.downloadModel(vorbereitet.modelId, (fortschritt, status) => {
        const schritt = Math.floor((fortschritt || 0) / 10);
        if (schritt !== letzterSchritt) {
          letzterSchritt = schritt;
          process.stderr.write(`${vorbereitet.modelId}: ${fortschritt || 0} % ${status || ''}\n`);
        }
      });
    } catch (fehler) {
      if (vorbereitet.neu) {
        await freiesModell.nachFehlschlag(vorbereitet.modelId);
      }
      throw fehler;
    }
    return antworte({
      ok: true,
      modell: vorbereitet.modelId,
      gemessen: vorbereitet.gemessen,
      digest_vorab: vorbereitet.digestVorab,
    });
  }

  return antworte(
    { fehler: `Unbekannter Befehl ${JSON.stringify(befehl ?? '')}: laden, liste, entfernen` },
    2
  );
}

main(process.argv[2], process.argv[3]).catch(fehler => {
  const befehl = process.argv[2];
  if (befehl === 'laden' || befehl === 'entfernen') {
    antworte(fehlerAntwort(fehler), 1);
  }
  antworte({ fehler: fehler.message }, 1);
});
