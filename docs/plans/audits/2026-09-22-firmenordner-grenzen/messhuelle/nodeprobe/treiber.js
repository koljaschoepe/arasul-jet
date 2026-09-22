/**
 * DER CODE DES GERAETS GEGEN DEN ECHTEN DIENST, ohne das Produkt anzufassen.
 *
 * `ordnerdienst.js` liegt hier unveraendert daneben (kopiert, nicht
 * nachgebaut) und wird mit denselben Umgebungswerten gefahren wie im Backend.
 * Gemessen wird also die Funktion, die nachher am Geraet laeuft -- und nicht
 * eine Kette von `curl`-Aufrufen, von der jemand behauptet, sie sei dasselbe.
 *
 *   node treiber.js raum-weg <raum-id>
 *   node treiber.js ordner-weg <raum-id> <pfad>
 */
const dienst = require('./src/services/firmenordner/ordnerdienst');

async function main() {
  const [was, ...rest] = process.argv.slice(2);
  const anfang = Date.now();
  if (was === 'raum-weg') {
    await dienst.loescheRaum(rest[0]);
    console.log(`loescheRaum kam durch nach ${((Date.now() - anfang) / 1000).toFixed(1)} s`);
    console.log('steht er noch in der Liste?', await dienst.raumSteht(rest[0]));
  } else if (was === 'ordner-weg') {
    await dienst.loescheOrdner(rest[0], rest[1]);
    console.log(`loescheOrdner kam durch nach ${((Date.now() - anfang) / 1000).toFixed(1)} s`);
  } else {
    throw new Error(`unbekannt: ${was}`);
  }
}

main().catch(err => {
  console.log('GEWORFEN:', err.message);
  process.exit(1);
});
