/**
 * Das Logo des Hauses als Datei prüfen (M5, Auftrag verwaltung-geraet-und-system).
 *
 * Die Oberfläche schickt das Bild als Daten-Adresse
 * (`data:image/png;base64,…`), so wie `FileReader.readAsDataURL` sie liefert.
 * Geprüft wird hier, was danach von derselben Herkunft wie die Oberfläche
 * ausgeliefert wird:
 *
 *   - die Art: PNG, JPEG oder WebP, und zwar nach den ersten Bytes der Datei,
 *     nicht nach dem, was die Adresse behauptet. Eine Datei, die sich als PNG
 *     ausgibt und keine ist, wird abgewiesen.
 *   - kein SVG: ein SVG kann Skript tragen.
 *   - die Größe: höchstens 256 KB. Das Logo steht in der Leiste 32 Pixel hoch.
 */
const { ValidationError } = require('./errors');

const LOGO_MAX_BYTES = 256 * 1024;

const ARTEN = {
  'image/png': b =>
    b.length >= 8 &&
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': b => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': b =>
    b.length >= 12 &&
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP',
};

/**
 * @param {string} datenAdresse `data:<typ>;base64,<inhalt>`
 * @returns {{ typ: string, inhalt: Buffer }}
 */
function logoAusDatenAdresse(datenAdresse) {
  const treffer = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
    datenAdresse || ''
  );
  if (!treffer) {
    throw new ValidationError(
      'Das Logo kam nicht als Bild an. Bitte eine PNG-, JPEG- oder WebP-Datei wählen.'
    );
  }
  const typ = treffer[1];
  const pruefe = ARTEN[typ];
  if (!pruefe) {
    throw new ValidationError('Das Logo muss eine PNG-, JPEG- oder WebP-Datei sein.');
  }
  const inhalt = Buffer.from(treffer[2], 'base64');
  if (inhalt.length === 0) {
    throw new ValidationError('Die Datei ist leer.');
  }
  if (inhalt.length > LOGO_MAX_BYTES) {
    throw new ValidationError('Das Logo darf höchstens 256 KB groß sein.');
  }
  if (!pruefe(inhalt)) {
    throw new ValidationError('Die Datei ist kein Bild der genannten Art.');
  }
  return { typ, inhalt };
}

module.exports = { logoAusDatenAdresse, LOGO_MAX_BYTES };
