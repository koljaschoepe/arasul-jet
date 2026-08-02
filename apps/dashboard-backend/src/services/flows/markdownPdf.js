/**
 * Markdown → PDF (Flows-Umbau 2026-08-02).
 *
 * Rendert das Ergebnis-Markdown eines Flow-Laufs als sauberes Geschäfts-PDF:
 * Überschriften, Absätze, Listen, Codeblöcke, Zitate, einfache Tabellen und
 * Trennlinien, dazu eine Fußzeile mit Titel und Seitenzahlen. Bewusst ein
 * kleiner, handgeschriebener Renderer auf pdfkit (liegt schon als Dependency
 * vor) statt einer Browser-Engine: auf dem Jetson zählt jedes Megabyte, und
 * für Berichte reicht genau dieser Umfang.
 *
 * Nicht unterstütztes Markdown (Bilder, verschachtelte Tabellen, HTML) wird
 * als normaler Text gerendert — der Inhalt geht nie verloren.
 */

const PDFDocument = require('pdfkit');

const SEITENRAND = 56; // pt ≈ 2 cm
const FUSS_HOEHE = 24;

const FARBEN = {
  text: '#1a1a1a',
  leise: '#666666',
  linie: '#cccccc',
  codeHintergrund: '#f2f2f2',
};

const GROESSEN = {
  h1: 22,
  h2: 16,
  h3: 13,
  h4: 11.5,
  text: 10.5,
  code: 9,
  fuss: 8.5,
};

/**
 * Zerlegt eine Zeile mit Inline-Markdown (**fett**, *kursiv*, `code`) in Runs.
 * @returns {{text:string, bold:boolean, italic:boolean, code:boolean}[]}
 */
function parseInline(text) {
  const runs = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|__([^_]+)__|_([^_]+)_|`([^`]+)`)/g;
  let last = 0;
  for (const m of String(text).matchAll(re)) {
    if (m.index > last) {
      runs.push({ text: text.slice(last, m.index), bold: false, italic: false, code: false });
    }
    if (m[2] != null || m[4] != null) {
      runs.push({ text: m[2] ?? m[4], bold: true, italic: false, code: false });
    } else if (m[3] != null || m[5] != null) {
      runs.push({ text: m[3] ?? m[5], bold: false, italic: true, code: false });
    } else {
      runs.push({ text: m[6], bold: false, italic: false, code: true });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    runs.push({ text: text.slice(last), bold: false, italic: false, code: false });
  }
  // Links [text](url) → nur der Text (URLs in Klammern wären im Druck Rauschen).
  return runs.map(r => ({ ...r, text: r.text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') }));
}

function fontFor(run) {
  if (run.code) {
    return 'Courier';
  }
  if (run.bold && run.italic) {
    return 'Helvetica-BoldOblique';
  }
  if (run.bold) {
    return 'Helvetica-Bold';
  }
  if (run.italic) {
    return 'Helvetica-Oblique';
  }
  return 'Helvetica';
}

/** Schreibt Inline-Runs fortgesetzt (continued) an die aktuelle Position. */
function schreibeRuns(doc, runs, opts = {}) {
  const size = opts.size ?? GROESSEN.text;
  if (runs.length === 0) {
    doc.moveDown(0.5);
    return;
  }
  runs.forEach((run, i) => {
    doc
      .font(fontFor(run))
      .fontSize(run.code ? size - 1 : size)
      .fillColor(opts.color ?? FARBEN.text)
      .text(run.text, {
        continued: i < runs.length - 1,
        ...(i === 0 ? opts.textOptions || {} : {}),
        lineGap: 2.5,
      });
  });
}

/** Block-Parser: zerlegt Markdown in Blöcke (heading, para, list, code, …). */
function parseBlocks(markdown) {
  const zeilen = String(markdown).replace(/\r\n/g, '\n').split('\n');
  const bloecke = [];
  let i = 0;
  while (i < zeilen.length) {
    const zeile = zeilen[i];

    if (!zeile.trim()) {
      i++;
      continue;
    }

    // Codeblock ```
    const fence = zeile.match(/^\s*```/);
    if (fence) {
      const code = [];
      i++;
      while (i < zeilen.length && !/^\s*```/.test(zeilen[i])) {
        code.push(zeilen[i]);
        i++;
      }
      i++; // schließendes ```
      bloecke.push({ art: 'code', text: code.join('\n') });
      continue;
    }

    // Überschrift
    const h = zeile.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      bloecke.push({ art: 'heading', ebene: Math.min(h[1].length, 4), text: h[2].trim() });
      i++;
      continue;
    }

    // Trennlinie
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(zeile)) {
      bloecke.push({ art: 'hr' });
      i++;
      continue;
    }

    // Tabelle (| a | b |) — Kopf + Trennzeile + Zeilen
    if (
      /^\s*\|.*\|\s*$/.test(zeile) &&
      i + 1 < zeilen.length &&
      /^\s*\|[\s\-:|]+\|\s*$/.test(zeilen[i + 1])
    ) {
      const parseRow = z =>
        z
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map(c => c.trim());
      const kopf = parseRow(zeile);
      i += 2;
      const rows = [];
      while (i < zeilen.length && /^\s*\|.*\|\s*$/.test(zeilen[i])) {
        rows.push(parseRow(zeilen[i]));
        i++;
      }
      bloecke.push({ art: 'tabelle', kopf, rows });
      continue;
    }

    // Liste (ununterbrochene Folge von Listenzeilen; Einrückung = Ebene)
    const listItem = zeile.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (listItem) {
      const items = [];
      while (i < zeilen.length) {
        const m = zeilen[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (!m) {
          break;
        }
        items.push({
          ebene: Math.min(Math.floor(m[1].length / 2), 3),
          nummer: /\d/.test(m[2]) ? m[2].replace(/[.)]/, '') : null,
          text: m[3],
        });
        i++;
      }
      bloecke.push({ art: 'liste', items });
      continue;
    }

    // Zitat
    if (/^\s*>\s?/.test(zeile)) {
      const teile = [];
      while (i < zeilen.length && /^\s*>\s?/.test(zeilen[i])) {
        teile.push(zeilen[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      bloecke.push({ art: 'zitat', text: teile.join('\n') });
      continue;
    }

    // Absatz: Zeilen bis zur Leerzeile zusammenziehen
    const teile = [zeile];
    i++;
    while (
      i < zeilen.length &&
      zeilen[i].trim() &&
      !/^(#{1,6})\s/.test(zeilen[i]) &&
      !/^\s*```/.test(zeilen[i]) &&
      !/^(\s*)([-*+]|\d+[.)])\s+/.test(zeilen[i]) &&
      !/^\s*>/.test(zeilen[i]) &&
      !/^\s*\|.*\|\s*$/.test(zeilen[i])
    ) {
      teile.push(zeilen[i]);
      i++;
    }
    bloecke.push({ art: 'absatz', text: teile.join(' ') });
  }
  return bloecke;
}

/** Erster H1/H2 des Dokuments — wird zum Fußzeilen-Titel. */
function findeTitel(bloecke, fallback) {
  const h = bloecke.find(b => b.art === 'heading' && b.ebene <= 2);
  return h ? h.text.replace(/[*_`]/g, '') : fallback;
}

/**
 * Rendert Markdown als PDF.
 * @param {object} p
 * @param {string} p.markdown - Der Dokumentinhalt.
 * @param {string} [p.titel] - Fußzeilen-Titel (Fallback: erste Überschrift).
 * @returns {Promise<Buffer>}
 */
function renderPdf({ markdown, titel = '' }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: {
        top: SEITENRAND,
        bottom: SEITENRAND + FUSS_HOEHE,
        left: SEITENRAND,
        right: SEITENRAND,
      },
      bufferPages: true,
      info: { Title: titel || 'Dokument' },
    });

    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const bloecke = parseBlocks(markdown);
    const fussTitel = titel || findeTitel(bloecke, 'Dokument');

    for (const block of bloecke) {
      switch (block.art) {
        case 'heading': {
          const size = [GROESSEN.h1, GROESSEN.h2, GROESSEN.h3, GROESSEN.h4][block.ebene - 1];
          doc.moveDown(block.ebene === 1 ? 0.6 : 0.9);
          doc
            .font('Helvetica-Bold')
            .fontSize(size)
            .fillColor(FARBEN.text)
            .text(block.text.replace(/[*_`]/g, ''), { lineGap: 3 });
          doc.moveDown(0.25);
          break;
        }
        case 'absatz':
          schreibeRuns(doc, parseInline(block.text));
          doc.moveDown(0.5);
          break;
        case 'liste': {
          for (const item of block.items) {
            const einzug = SEITENRAND + item.ebene * 14;
            const marker = item.nummer ? `${item.nummer}.` : '•';
            doc
              .font('Helvetica')
              .fontSize(GROESSEN.text)
              .fillColor(FARBEN.text)
              .text(marker, einzug, doc.y, { continued: false, width: 16, lineGap: 2.5 });
            // Marker und Text nebeneinander: Text in eigener Spalte.
            doc.moveUp();
            const runs = parseInline(item.text);
            const breite = doc.page.width - SEITENRAND - (einzug + 18);
            runs.forEach((run, j) => {
              doc
                .font(fontFor(run))
                .fontSize(run.code ? GROESSEN.text - 1 : GROESSEN.text)
                .fillColor(FARBEN.text)
                .text(run.text, einzug + 18, doc.y, {
                  continued: j < runs.length - 1,
                  width: breite,
                  lineGap: 2.5,
                });
            });
            doc.moveDown(0.15);
          }
          doc.x = SEITENRAND;
          doc.moveDown(0.35);
          break;
        }
        case 'code': {
          const codeText = block.text || '';
          const hoehe = doc.heightOfString(codeText, {
            width: doc.page.width - 2 * SEITENRAND - 16,
          });
          // Hintergrund-Kasten (bricht bei Seitenüberlauf schlicht ohne Kasten um).
          if (doc.y + hoehe < doc.page.height - SEITENRAND - FUSS_HOEHE) {
            doc
              .rect(SEITENRAND, doc.y - 2, doc.page.width - 2 * SEITENRAND, hoehe + 12)
              .fill(FARBEN.codeHintergrund);
            doc.fillColor(FARBEN.text);
            doc.y += 4;
          }
          doc
            .font('Courier')
            .fontSize(GROESSEN.code)
            .fillColor(FARBEN.text)
            .text(codeText, SEITENRAND + 8, doc.y, {
              width: doc.page.width - 2 * SEITENRAND - 16,
              lineGap: 1.5,
            });
          doc.x = SEITENRAND;
          doc.moveDown(0.6);
          break;
        }
        case 'zitat': {
          const startY = doc.y;
          doc
            .font('Helvetica-Oblique')
            .fontSize(GROESSEN.text)
            .fillColor(FARBEN.leise)
            .text(block.text, SEITENRAND + 14, doc.y, {
              width: doc.page.width - 2 * SEITENRAND - 14,
              lineGap: 2.5,
            });
          doc
            .moveTo(SEITENRAND + 4, startY)
            .lineTo(SEITENRAND + 4, doc.y)
            .lineWidth(2)
            .strokeColor(FARBEN.linie)
            .stroke();
          doc.x = SEITENRAND;
          doc.moveDown(0.5);
          break;
        }
        case 'tabelle': {
          const spalten = block.kopf.length;
          const breite = (doc.page.width - 2 * SEITENRAND) / Math.max(spalten, 1);
          const zeile = (zellen, fett) => {
            const y = doc.y;
            let maxH = 0;
            zellen.slice(0, spalten).forEach((zelle, s) => {
              doc
                .font(fett ? 'Helvetica-Bold' : 'Helvetica')
                .fontSize(GROESSEN.text - 0.5)
                .fillColor(FARBEN.text)
                .text(zelle.replace(/[*_`]/g, ''), SEITENRAND + s * breite + 2, y, {
                  width: breite - 6,
                  lineGap: 1.5,
                });
              maxH = Math.max(maxH, doc.y - y);
            });
            doc.y = y + maxH + 4;
            doc.x = SEITENRAND;
            doc
              .moveTo(SEITENRAND, doc.y - 2)
              .lineTo(doc.page.width - SEITENRAND, doc.y - 2)
              .lineWidth(0.5)
              .strokeColor(FARBEN.linie)
              .stroke();
          };
          doc.moveDown(0.25);
          zeile(block.kopf, true);
          for (const row of block.rows) {
            zeile(row, false);
          }
          doc.moveDown(0.5);
          break;
        }
        case 'hr':
          doc.moveDown(0.4);
          doc
            .moveTo(SEITENRAND, doc.y)
            .lineTo(doc.page.width - SEITENRAND, doc.y)
            .lineWidth(0.75)
            .strokeColor(FARBEN.linie)
            .stroke();
          doc.moveDown(0.6);
          break;
        default:
          break;
      }
    }

    // Fußzeile auf jeder Seite: Titel links, „Seite X von Y" rechts.
    const range = doc.bufferedPageRange();
    for (let p = range.start; p < range.start + range.count; p++) {
      doc.switchToPage(p);
      // Unteren Rand fürs Fußzeilen-Schreiben aufheben — sonst löst Text
      // unterhalb des Rands pdfkits automatischen Seitenumbruch aus und die
      // Seitenzahl landet auf einer eigenen, leeren Folgeseite.
      doc.page.margins.bottom = 0;
      const y = doc.page.height - SEITENRAND + 6;
      doc
        .font('Helvetica')
        .fontSize(GROESSEN.fuss)
        .fillColor(FARBEN.leise)
        .text(fussTitel, SEITENRAND, y, {
          width: doc.page.width - 2 * SEITENRAND - 90,
          height: FUSS_HOEHE,
          ellipsis: true,
          lineBreak: false,
        })
        .text(
          `Seite ${p - range.start + 1} von ${range.count}`,
          doc.page.width - SEITENRAND - 90,
          y,
          {
            width: 90,
            align: 'right',
            lineBreak: false,
          }
        );
    }

    doc.end();
  });
}

module.exports = { renderPdf, parseBlocks, parseInline };
