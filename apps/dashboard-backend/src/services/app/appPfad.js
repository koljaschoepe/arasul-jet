/**
 * Pfade unter `/apps/<id>/`, bevor `routes/appAusliefern.js` eine Datei
 * ausliefert. Aus der Route hierher gezogen (M5, Auftrag jet-fehlerklassen):
 * Routen fangen keine Fehler.
 */

const { NotFoundError, ValidationError } = require('../../utils/errors');
const { resolveRealWithinRoots } = require('../flows/pathSafe');

/**
 * Sicherstellen, dass `rest` im Ordner der App bleibt -- auch ueber Symlinks.
 *
 * `sendFile` schuetzt vor `..`, folgt aber einem Symlink im Ordner bis an sein
 * Ziel. Ein Paket darf keine Symlinks enthalten (`appPaket.entpacke`), doch
 * was danach am Geraet in den Ordner gelegt wird, prueft dort niemand. Darum
 * geht jeder Pfad ein zweites Mal durch dieselbe Sperre wie die Dateien der
 * Flows. `rest` kommt kodiert aus `req.path`; geprueft wird, was `send`
 * danach tatsaechlich oeffnet, also der dekodierte Pfad.
 *
 * Wer den Ordner verlaesst, bekommt dieselbe 404 wie fuer eine Datei, die es
 * nicht gibt: ob ausserhalb etwas liegt, erfaehrt er nicht.
 */
function imOrdnerHalten(verzeichnis, rest, was) {
  let dekodiert;
  try {
    dekodiert = decodeURIComponent(rest);
  } catch {
    throw new NotFoundError(`${was} gibt es nicht`);
  }
  try {
    resolveRealWithinRoots([verzeichnis], dekodiert || 'index.html');
  } catch (err) {
    if (err instanceof ValidationError) {
      throw new NotFoundError(`${was} gibt es nicht`);
    }
    throw err;
  }
}

module.exports = { imOrdnerHalten };
