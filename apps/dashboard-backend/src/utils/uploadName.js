/**
 * Reparatur für multer-Dateinamen (latin1-Falle).
 *
 * Multer dekodiert den Multipart-Header `filename` als latin1. Ein UTF-8-Name
 * wie "invoice·automation.md" (·: 0xC2 0xB7) kommt dadurch als
 * "invoiceÂ·automation.md" an — jedes Nicht-ASCII-Zeichen wird zu Mojibake.
 *
 * `dekodiereUploadName` macht das rückgängig, aber nur wenn es sicher ist:
 * Reine ASCII-Namen bleiben unangetastet, und wenn die Rück-Dekodierung
 * ungültige UTF-8-Sequenzen ergäbe (U+FFFD), war der Name bereits korrekt
 * und bleibt ebenfalls unverändert. Dadurch ist die Funktion idempotent.
 */

/**
 * @param {string} name - multer file.originalname
 * @returns {string} korrekt dekodierter Name
 */
function dekodiereUploadName(name) {
  const s = String(name || '');
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7F]/.test(s)) {
    return s; // reines ASCII — nichts zu reparieren
  }
  const dekodiert = Buffer.from(s, 'latin1').toString('utf8');
  // U+FFFD heißt: die Bytes waren kein gültiges UTF-8 — der Name war schon richtig.
  if (dekodiert.includes('�')) {
    return s;
  }
  return dekodiert;
}

/**
 * Wickelt multer-Optionen so ein, dass jeder Dateiname vor allen weiteren
 * Prüfungen (fileFilter, Storage-Namen) repariert wird:
 * `multer(mitNamensReparatur({ ... }))`.
 */
function mitNamensReparatur(options = {}) {
  const originalFilter = options.fileFilter;
  return {
    ...options,
    fileFilter(req, file, cb) {
      file.originalname = dekodiereUploadName(file.originalname);
      if (originalFilter) {
        return originalFilter(req, file, cb);
      }
      cb(null, true);
    },
  };
}

module.exports = { dekodiereUploadName, mitNamensReparatur };
