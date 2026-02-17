/**
 * Manual mock for pdfkit module.
 * pdfkit is a large native dependency used only by pdfService for PDF generation.
 * This mock prevents test failures for all suites that transitively import server.js.
 */

function PDFDocument() {
  this._endCb = null;
}

const chainMethods = [
  'font', 'fontSize', 'fillColor', 'strokeColor', 'lineWidth',
  'moveTo', 'lineTo', 'stroke', 'text', 'rect', 'fill', 'addPage',
];

chainMethods.forEach(method => {
  PDFDocument.prototype[method] = function () { return this; };
});

PDFDocument.prototype.on = function (event, cb) {
  if (event === 'end') this._endCb = cb;
  if (event === 'data') this._dataCb = cb;
  return this;
};

PDFDocument.prototype.end = function () {
  if (this._endCb) this._endCb();
};

PDFDocument.prototype.heightOfString = function () { return 10; };

module.exports = PDFDocument;
