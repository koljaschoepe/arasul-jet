const { attachmentHeader } = require('../../src/utils/contentDisposition');

describe('contentDisposition.attachmentHeader', () => {
  it('trägt ASCII-Namen unverändert in filename und filename*', () => {
    const h = attachmentHeader('export.tar.gz');
    expect(h).toContain('filename="export.tar.gz"');
    expect(h).toContain("filename*=UTF-8''export.tar.gz");
  });

  it('kodiert Unicode RFC-5987; der ASCII-Fallback bleibt reines ASCII', () => {
    const h = attachmentHeader('Δelta ☕ Ümlaut.tar.gz');
    const fn = h.match(/filename="([^"]*)"/);
    expect(fn).toBeTruthy();
    // eslint-disable-next-line no-control-regex
    expect(/^[\x20-\x7e]*$/.test(fn[1])).toBe(true);
    expect(h).toMatch(/filename\*=UTF-8''/);
    expect(h).toContain('%C3%9C'); // Ü als UTF-8-Prozentkodierung
  });

  it('entschärft Anführungszeichen und Backslash im ASCII-Fallback', () => {
    const h = attachmentHeader('a"b\\c.txt');
    expect(h).toContain('filename="a_b_c.txt"');
  });

  it('erzeugt einen reinen ASCII-Header (kein ERR_INVALID_CHAR)', () => {
    const h = attachmentHeader('naïve—Ordner 名前.tar.gz');
    // eslint-disable-next-line no-control-regex
    expect(/^[\x20-\x7e]*$/.test(h)).toBe(true);
  });
});
