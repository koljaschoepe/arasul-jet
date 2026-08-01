/**
 * multer-latin1-Reparatur (Sweep 2026-08-01): UTF-8-Dateinamen kommen aus
 * multer als latin1-Mojibake an ("invoice·automation.md" → "invoiceÂ·automation.md").
 */
const { dekodiereUploadName, mitNamensReparatur } = require('../../src/utils/uploadName');

describe('dekodiereUploadName', () => {
  test('repariert den Live-Fall: Â· → ·', () => {
    expect(dekodiereUploadName('1784729766865_invoiceÂ·automation.md')).toBe(
      '1784729766865_invoice·automation.md'
    );
  });

  test('repariert Umlaute (Ã¤Ã¶Ã¼ → äöü)', () => {
    expect(dekodiereUploadName('BroschÃ¼re Ã¼ber BÃ¤ume.pdf')).toBe('Broschüre über Bäume.pdf');
  });

  test('ASCII bleibt unangetastet', () => {
    expect(dekodiereUploadName('report_2026.pdf')).toBe('report_2026.pdf');
  });

  test('bereits korrektes UTF-8 bleibt unangetastet (idempotent)', () => {
    // "Bäume.md" latin1-kodiert ergäbe ungültiges UTF-8 (0xE4 allein) → U+FFFD
    // → die Funktion erkennt das und lässt den Namen in Ruhe.
    expect(dekodiereUploadName('Bäume.md')).toBe('Bäume.md');
    expect(dekodiereUploadName(dekodiereUploadName('BÃ¤ume.md'))).toBe('Bäume.md');
  });

  test('leere/fehlende Werte werfen nicht', () => {
    expect(dekodiereUploadName('')).toBe('');
    expect(dekodiereUploadName(undefined)).toBe('');
  });
});

describe('mitNamensReparatur', () => {
  test('repariert im fileFilter und ruft den Original-Filter danach', () => {
    const gesehen = [];
    const optionen = mitNamensReparatur({
      fileFilter: (req, file, cb) => {
        gesehen.push(file.originalname);
        cb(null, true);
      },
    });
    const file = { originalname: 'Ã¼bersicht.md' };
    let ergebnis = null;
    optionen.fileFilter({}, file, (err, ok) => {
      ergebnis = { err, ok };
    });
    expect(file.originalname).toBe('übersicht.md');
    expect(gesehen).toEqual(['übersicht.md']);
    expect(ergebnis).toEqual({ err: null, ok: true });
  });

  test('ohne Original-Filter wird akzeptiert', () => {
    const optionen = mitNamensReparatur({});
    const file = { originalname: 'plain.txt' };
    let ok = null;
    optionen.fileFilter({}, file, (_e, o) => {
      ok = o;
    });
    expect(ok).toBe(true);
  });
});
