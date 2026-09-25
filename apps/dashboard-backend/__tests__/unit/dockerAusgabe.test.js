/**
 * Die Ausgabe eines `docker exec` als Text (J35, 25.09.2026).
 *
 * Der Fund vom Orin: Sicherung und Rueckspielen zeigten vor jeder Zeile ein
 * fremdes Zeichen. Es war das letzte Byte des Vorspanns, den Docker jedem
 * Block voranstellt -- die Laenge des Blocks, und die ist fast immer
 * druckbar. Das Filtern von Steuerzeichen liess sie stehen.
 */

const { entflechter, ohneSteuerzeichen } = require('../../src/utils/dockerAusgabe');

/** Ein Block des Docker-Stroms: Kennung, drei Nullbytes, Laenge, Nutzdaten. */
function block(text, kennung = 1) {
  const nutz = Buffer.from(text, 'utf8');
  const kopf = Buffer.alloc(8);
  kopf[0] = kennung;
  kopf.writeUInt32BE(nutz.length, 4);
  return Buffer.concat([kopf, nutz]);
}

function lies(...stuecke) {
  const e = entflechter();
  stuecke.forEach(s => e.schreibe(s));
  return e.text();
}

describe('entflechter', () => {
  it('laesst von einer Zeile mit 65 Byte kein „A" davor stehen', () => {
    const zeile = `[20260925_120000] PostgreSQL backup completed (${'x'.repeat(16)})\n`;
    expect(Buffer.byteLength(zeile)).toBe(65); // 65 ist „A"
    expect(lies(block(zeile))).toBe(zeile);
  });

  it('nimmt stdout und stderr in ihrer Reihenfolge', () => {
    const strom = Buffer.concat([
      block('[..] Starting backup...\n'),
      block('pg_dump: warnung\n', 2),
      block('[..] Fertig.\n'),
    ]);
    expect(lies(strom)).toBe('[..] Starting backup...\npg_dump: warnung\n[..] Fertig.\n');
  });

  it('setzt Bloecke zusammen, die ueber mehrere data-Ereignisse reichen', () => {
    const strom = Buffer.concat([block('erste Zeile\n'), block('zweite Zeile\n', 2)]);
    // Jedes Byte einzeln: der Vorspann faellt mitten durch, ebenso die Zeilen.
    const stuecke = Array.from(strom).map(b => Buffer.from([b]));
    expect(lies(...stuecke)).toBe('erste Zeile\nzweite Zeile\n');
  });

  it('haelt ein Umlaut-Zeichen ganz, das ueber eine Blockgrenze faellt', () => {
    const umlaut = Buffer.from('ü', 'utf8'); // zwei Byte
    const kopf = n => {
      const k = Buffer.alloc(8);
      k[0] = 1;
      k.writeUInt32BE(n, 4);
      return k;
    };
    const strom = Buffer.concat([
      kopf(2),
      Buffer.from('Gr'),
      kopf(1),
      umlaut.subarray(0, 1),
      kopf(4),
      umlaut.subarray(1),
      Buffer.from('n\n\n'),
    ]);
    expect(lies(strom)).toBe('Grün\n\n');
  });

  it('reicht einen Strom ohne Vorspann (mit Terminal) roh durch', () => {
    expect(lies('Fertig in 42s.')).toBe('Fertig in 42s.');
  });

  it('wirft ANSI-Farben als Ganzes weg, nicht nur das ESC', () => {
    const ESC = String.fromCharCode(27);
    expect(lies(block(`${ESC}[31mFehler${ESC}[0m: kaputt\n`))).toBe('Fehler: kaputt\n');
  });

  it('haelt den Speicher, behaelt aber das Ende', () => {
    const e = entflechter({ grenze: 100 });
    for (let i = 0; i < 50; i++) e.schreibe(block(`Zeile ${i}\n`));
    const text = e.text();
    expect(text.endsWith('Zeile 49\n')).toBe(true);
    expect(text).not.toContain('Zeile 0\n');
  });
});

describe('ohneSteuerzeichen', () => {
  it('laesst Zeilenumbruch und Tabulator stehen, sonst nichts unter 32', () => {
    const text = `a\tb\nc${String.fromCharCode(0, 1, 13, 127)}d`;
    expect(ohneSteuerzeichen(text)).toBe('a\tb\ncd');
  });
});
