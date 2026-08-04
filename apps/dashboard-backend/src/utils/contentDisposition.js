/**
 * Baut einen `Content-Disposition: attachment`-Header, der auch Unicode-
 * Dateinamen (Umlaute, CJK, Emoji) und Anführungszeichen sicher trägt.
 *
 * Der handgebaute `filename="…"`-Header warf für Codepoints ≥ U+0100 einen
 * `ERR_INVALID_CHAR` (Node-Header-Validierung) → 500. Diese Funktion liefert
 * einen ASCII-`filename`-Fallback PLUS ein RFC-5987-`filename*` (UTF-8,
 * prozentkodiert) — genau wie das `content-disposition`-Paket, aber ohne
 * eigene (nur transitiv vorhandene) Abhängigkeit.
 *
 * @param {string} dateiname
 * @returns {string} Header-Wert für `Content-Disposition`.
 */
function attachmentHeader(dateiname) {
  const name = String(dateiname == null ? '' : dateiname);
  // ASCII-Fallback: Nicht-druckbares/Nicht-ASCII → '_', Quote/Backslash entschärfen.
  // eslint-disable-next-line no-control-regex
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  // RFC 5987: prozentkodiert; encodeURIComponent lässt ' ( ) * roh — die für
  // die ext-value verboten sind, also zusätzlich kodieren.
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    c => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

module.exports = { attachmentHeader };
