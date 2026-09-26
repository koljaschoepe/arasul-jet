/**
 * Waechter ueber die Saetze, die das Backend einem Menschen schickt (J35,
 * 26.09.2026).
 *
 * Ein Administrator einer Kanzlei liest die Meldungen dieses Geraets in der
 * Oberflaeche. Ein Satz mit Skriptpfad, einem Befehl oder einem API-Weg darin
 * laesst das Geraet unfertig wirken -- das Technische gehoert ins Log. Und in
 * einem sichtbaren Satz steht ä, ö, ü, nicht ae, oe, ue.
 *
 * Gelesen wird jede Zeichenkette, die als Meldung eines Fehlers aus
 * `utils/errors.js` geworfen wird (`new ConflictError('…')`), und jede, die
 * unter einem Schluessel steht, den die Oberflaeche als Satz zeigt (`grund`,
 * `mangel`, `zweck`, `hinweis`, `satz`). Ausgenommen ist die Schnittstelle
 * fuer das Ara-Kit (`routes/external/`, `appKontrakt.js`): dort liest ein
 * Entwickler, und ein Pfad ist dort die Auskunft.
 */
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const SRC = path.join(__dirname, '..', '..', 'src');
const AUSGENOMMEN = [/routes[\\/]external[\\/]/, /appKontrakt\.js$/];

const FEHLER =
  /^(ValidationError|UnauthorizedError|ForbiddenError|NotFoundError|ConflictError|RateLimitError|ServiceUnavailableError|NotImplementedError|ApiError)$/;
const SATZ_SCHLUESSEL = new Set(['grund', 'mangel', 'zweck', 'hinweis', 'satz']);

const UMSCHRIEBEN =
  /(aender|aelter|uebersicht|ueber|fuer|zurueck|geraet|laeuf|laesst|pruef|moeglich|schluessel|loesch|waehl|spaeter|naechst|muess|koenn|groess|haeuf|oeffn|faell|haelt|traeg|zaehl|erklaer|bestaetig|fuehr|wuerd|duerf|noetig|taetig|verfueg|rueck|stueck|gruen|moecht|gehoer|stoer|zustaend|erhoeh|uebrig|aehnlich|gewaehr|zuverlaess|faehig|staend|raeum|waere|gaebe|haette|ungueltig|grossbuchst|\bgross\b|ausserhalb|heisst)/i;
const TECHNISCH = /(\bscripts\/|\bdocs\/|\.sh\b|\.\/arasul|\bdocker\s|\bsudo\b|\/api\/|config\/secrets)/;

function dateien(wurzel) {
  return fs.readdirSync(wurzel, { withFileTypes: true }).flatMap(e => {
    const p = path.join(wurzel, e.name);
    if (e.isDirectory()) return dateien(p);
    return e.name.endsWith('.js') ? [p] : [];
  });
}

/** Alle Zeichenketten (auch Teile von Vorlagen und `+`-Ketten) unter einem Knoten. */
function texte(knoten, aus = []) {
  if (!knoten || typeof knoten !== 'object') return aus;
  if (knoten.type === 'Literal' && typeof knoten.value === 'string') aus.push(knoten.value);
  else if (knoten.type === 'TemplateLiteral') aus.push(knoten.quasis.map(q => q.value.cooked).join('…'));
  else if (knoten.type === 'BinaryExpression' || knoten.type === 'ConditionalExpression' || knoten.type === 'LogicalExpression') {
    for (const k of ['left', 'right', 'consequent', 'alternate']) texte(knoten[k], aus);
  }
  return aus;
}

function saetze(datei) {
  const quelle = fs.readFileSync(datei, 'utf8');
  const baum = acorn.parse(quelle, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowHashBang: true });
  const funde = [];
  (function laufe(n) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'NewExpression' && n.callee.type === 'Identifier' && FEHLER.test(n.callee.name) && n.arguments[0]) {
      for (const t of texte(n.arguments[0])) funde.push({ zeile: n.loc.start.line, text: t });
    }
    if (n.type === 'Property' && !n.computed && SATZ_SCHLUESSEL.has(n.key.name || n.key.value)) {
      for (const t of texte(n.value)) funde.push({ zeile: n.loc.start.line, text: t });
    }
    for (const k of Object.keys(n)) {
      const w = n[k];
      if (Array.isArray(w)) w.forEach(laufe);
      else if (w && typeof w.type === 'string') laufe(w);
    }
  })(baum);
  return funde.map(f => ({ ...f, datei: path.relative(SRC, datei) }));
}

const ALLE = dateien(SRC)
  .filter(d => !AUSGENOMMEN.some(m => m.test(d)))
  .flatMap(saetze);

describe('Die Saetze des Backends an einen Menschen', () => {
  it('findet ueberhaupt Saetze (sonst misst der Waechter nichts)', () => {
    expect(ALLE.length).toBeGreaterThan(200);
  });

  it('nennen keinen Pfad, keinen Befehl und keinen API-Weg -- das steht im Log', () => {
    const befunde = ALLE.filter(f => TECHNISCH.test(f.text)).map(
      f => `${f.datei}:${f.zeile}  ${f.text.slice(0, 100)}`
    );
    expect(befunde).toEqual([]);
  });

  it('schreiben ä, ö und ü aus', () => {
    // Ein Feldname in Backticks ist eine Kennung und kein Wort (`bestaetigung`).
    const befunde = ALLE.filter(f => UMSCHRIEBEN.test(f.text.replace(/`[^`]*`/g, ''))).map(
      f => `${f.datei}:${f.zeile}  ${f.text.slice(0, 100)}`
    );
    expect(befunde).toEqual([]);
  });
});
