/**
 * Echte Umlaute in allem, was ein Mensch liest (M5, Beschluss 02.10.2026).
 *
 * `fuer`, `ueber`, `Geraet`, `hoechstens` und `laeuft` stehen weder in einer
 * Meldung, die das Backend an eine Person oder einen Entwickler schickt, noch
 * in der Prosa des Kontrakts (`appKontrakt.js`), noch im Admin-Handbuch. Das
 * Frontend prüft `begriffe.test.ts` (sichtbare Texte aus dem Syntaxbaum); dies
 * ist die Hälfte fürs Backend und die Dokumente.
 *
 * Was Prosa ist: eine Zeichenkette mit einem Leerzeichen, die kein SQL ist.
 * Ein einzelnes Wort ist ein Feldname, eine Kennung oder ein Statuswert
 * (`aenderungstext`, `laeuft`) und bleibt, wie es ist: Kits bauen gegen diese
 * Namen. Dazu gehören auch Schlüssel von Objekten und Importpfade. Kommentare
 * sind keine Texte, die jemand liest, der das Produkt benutzt.
 *
 * Die Stammliste ist dieselbe wie in `begriffe.test.ts` (eine Liste von
 * Stämmen und keine Regel „ae, oe, ue", die fände „Quelle" und „neue"); wer
 * eine Zeile ergänzt, ergänzt beide.
 */
const fs = require('fs');
const path = require('path');
const espree = require('espree');
const { umschriebeneWoerter } = require('../helpers/umlaute');

const WURZEL = path.join(__dirname, '..', '..', '..', '..');
const SRC = path.join(WURZEL, 'apps', 'dashboard-backend', 'src');
const HANDBUCH = path.join(WURZEL, 'docs', 'ops', 'ADMIN_HANDBUCH.md');

// SQL erkennt man an seinen Schlüsselwörtern; ein Spaltenname mit Umlaut wäre ein
// Fehler am Gerät (am 04.10.2026 brach so die Anmeldung: „column kürzel does not
// exist"), die Tests mit Attrappe der Datenbank merken es nicht.
const SQL =
  /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM|CREATE (TABLE|INDEX)|ALTER TABLE|WHERE|ON CONFLICT|IS (NOT )?NULL|AS [a-z_]+)\b/;
/\b(SELECT|INSERT INTO|UPDATE|DELETE FROM|CREATE (TABLE|INDEX)|ALTER TABLE|WHERE|ON CONFLICT)\b/;

function dateien(ordner) {
  return fs.readdirSync(ordner, { withFileTypes: true }).flatMap(e => {
    const voll = path.join(ordner, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : dateien(voll);
    return e.name.endsWith('.js') ? [voll] : [];
  });
}

function prosaTexte(datei) {
  const quelle = fs.readFileSync(datei, 'utf8');
  const baum = espree.parse(quelle, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    loc: true,
    allowReturnOutsideFunction: true,
  });
  const funde = [];
  const nimm = (text, zeile) => {
    if (!text.includes(' ') || SQL.test(text)) return;
    funde.push({ text, zeile });
  };
  (function besuche(n, eltern) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'Literal' && typeof n.value === 'string') {
      const schluessel = eltern && eltern.type === 'Property' && eltern.key === n;
      const pfad = eltern && eltern.type === 'CallExpression' && eltern.callee.name === 'require';
      if (!schluessel && !pfad) nimm(n.value, n.loc.start.line);
    } else if (n.type === 'TemplateLiteral') {
      // Als Ganzes: ein `Name` in Rückticks kann über einen Ausdruck hinweg stehen.
      const ganz = n.quasis.map(q => q.value.cooked).join('${}');
      nimm(ganz, n.loc.start.line);
    }
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(x => besuche(x, n));
      else if (v && typeof v === 'object') besuche(v, n);
    }
  })(baum, null);
  return funde;
}

describe('Umlaute im Backend und im Handbuch', () => {
  it('erkennt eine Umschreibung und lässt Namen und echte Wörter in Ruhe', () => {
    const wo = text => umschriebeneWoerter(text).map(w => w.text);
    expect(wo('Das Geraet laeuft hoechstens fuer eine Stunde')).toEqual([
      'Geraet',
      'laeuft',
      'hoechstens',
      'fuer',
    ]);
    // Wörter, die ae/oe/ue nur zufällig enthalten
    expect(wo('Die neue Quelle bleibt, der Steuer-Betrag auch')).toEqual([]);
    // Namen: `Code`, "Anführung", Bezeichner mit Unterstrich, Feldnamen, GROSSBUCHSTABEN
    expect(wo('Das Feld `bestaetigung` und "zurueck" und wiederhole_ueber')).toEqual([]);
    expect(wo('aenderungstext ist leer')).toEqual([]);
    expect(wo('AUSSCHLIESSLICH wenn nötig')).toEqual([]);
    // Ein Dokument liest Anführungen als Beschriftung
    expect(umschriebeneWoerter('Knopf "Zurueck" druecken', true).map(w => w.text)).toEqual([
      'Zurueck',
      'druecken',
    ]);
  });

  const dateiListe = dateien(SRC);

  it('findet überhaupt Texte (sonst misst der Wächter nichts)', () => {
    const alle = dateiListe.flatMap(prosaTexte);
    expect(alle.length).toBeGreaterThan(500);
  });

  it('schreibt ä, ö, ü und ß in Meldungen und im Kontrakt aus', () => {
    const befunde = dateiListe.flatMap(datei =>
      prosaTexte(datei)
        .filter(f => umschriebeneWoerter(f.text).length > 0)
        .map(
          f =>
            `${path.relative(WURZEL, datei)}:${f.zeile}  ${umschriebeneWoerter(f.text)[0].text} in „${f.text
              .trim()
              .slice(0, 80)}“`
        )
    );
    expect(befunde).toEqual([]);
  });

  it('schreibt ä, ö, ü und ß im Admin-Handbuch aus (ohne Code und Befehle)', () => {
    let imBlock = false;
    const befunde = [];
    fs.readFileSync(HANDBUCH, 'utf8')
      .split('\n')
      .forEach((zeile, i) => {
        if (zeile.trimStart().startsWith('```')) {
          imBlock = !imBlock;
          return;
        }
        if (imBlock) return;
        const lesbar = zeile.replace(/`[^`]*`/g, ' ').replace(/\]\([^)]*\)/g, ']');
        const w = umschriebeneWoerter(lesbar, true);
        if (w.length)
          befunde.push(
            `ADMIN_HANDBUCH.md:${i + 1}  ${w[0].text} in „${zeile.trim().slice(0, 80)}“`
          );
      });
    expect(befunde).toEqual([]);
  });

  it('hat im Handbuch nur Sprungmarken, die es als Überschrift gibt', () => {
    const text = fs.readFileSync(HANDBUCH, 'utf8').split('\n');
    const marken = new Set(
      text
        .filter(z => /^#{1,6} /.test(z))
        .map(z =>
          z
            .replace(/^#+ /, '')
            .toLowerCase()
            .replace(/[^\p{L}\p{N} _-]/gu, '')
            .replace(/ /g, '-')
        )
    );
    const fehlen = text
      .flatMap(z => [...z.matchAll(/\]\(#([^)]*)\)/g)].map(m => m[1]))
      .filter(a => !marken.has(a));
    expect(fehlen).toEqual([]);
  });
});
