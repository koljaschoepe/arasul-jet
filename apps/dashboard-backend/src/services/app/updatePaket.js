/**
 * Dateiarbeit rund um ein Update-Paket fuer `routes/admin/update.js`.
 *
 * Aus der Route hierher gezogen (M5, Auftrag jet-fehlerklassen): Routen
 * fangen keine Fehler.
 */

const fs = require('fs').promises;
const { NotFoundError, ValidationError } = require('../../utils/errors');

/** Wirft 404 mit `meldung`, wenn es die Datei nicht gibt. */
async function paketMussDaSein(dateiPfad, meldung) {
  try {
    await fs.access(dateiPfad);
  } catch {
    throw new NotFoundError(meldung);
  }
}

/**
 * Die Signatur neben dem Paket auf dem USB-Stick mitkopieren. Fehlt sie,
 * wird die schon kopierte Paketdatei wieder entfernt (Best-Effort) und 400
 * geworfen.
 */
async function usbSignaturMitkopieren(quelle, ziel) {
  const sigPath = `${quelle}.sig`;
  try {
    await fs.access(sigPath);
    await fs.copyFile(sigPath, `${ziel}.sig`);
  } catch {
    // fire-and-forget: best-effort cleanup, file may not exist
    await fs.unlink(ziel).catch(() => {});
    throw new ValidationError(
      'Signature file (.sig) not found alongside update package on USB device'
    );
  }
}

module.exports = { paketMussDaSein, usbSignaturMitkopieren };
