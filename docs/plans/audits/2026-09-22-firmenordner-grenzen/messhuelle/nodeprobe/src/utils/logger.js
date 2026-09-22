// Der Stummel fuer die Messung: `ordnerdienst.js` will einen Logger, und was
// er sagt, soll hier auf dem Bildschirm stehen.
module.exports = {
  info: (...a) => console.log('info ', ...a),
  warn: (...a) => console.log('warn ', ...a),
  error: (...a) => console.log('error', ...a),
  debug: () => {},
};
