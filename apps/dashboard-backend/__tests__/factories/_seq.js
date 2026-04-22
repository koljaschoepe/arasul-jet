/**
 * Per-process monotonically increasing sequence used to give each factory
 * call a unique id by default. Overrides always win.
 */
let counter = 1000;
function nextId() {
  return ++counter;
}

function resetSequence(value = 1000) {
  counter = value;
}

module.exports = { nextId, resetSequence };
