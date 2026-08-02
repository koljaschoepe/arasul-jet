/**
 * Markdown → Word (.docx) (Flows-Umbau 2026-08-02).
 *
 * Nutzt denselben Block-/Inline-Parser wie der PDF-Renderer (markdownPdf.js)
 * und baut daraus ein Word-Dokument über das reine-JS-Paket `docx` — kein
 * natives Binary, läuft unverändert auf ARM64. Word ist der „zum
 * Weiterbearbeiten"-Ausweg: der Kunde bekommt ein Dokument, das er in seiner
 * gewohnten Umgebung anfassen kann.
 */

const {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  Footer,
} = require('docx');
const { parseBlocks, parseInline } = require('./markdownPdf');

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
];

function runsFor(text) {
  return parseInline(text).map(
    r =>
      new TextRun({
        text: r.text,
        bold: r.bold,
        italics: r.italic,
        font: r.code ? 'Courier New' : undefined,
      })
  );
}

/**
 * Rendert Markdown als .docx-Buffer.
 * @param {object} p
 * @param {string} p.markdown
 * @param {string} [p.titel] - Fußzeilen-Titel.
 * @returns {Promise<Buffer>}
 */
async function renderDocx({ markdown, titel = '' }) {
  const bloecke = parseBlocks(markdown);
  const children = [];

  for (const block of bloecke) {
    switch (block.art) {
      case 'heading':
        children.push(
          new Paragraph({
            heading: HEADINGS[block.ebene - 1],
            children: [new TextRun({ text: block.text.replace(/[*_`]/g, '') })],
            spacing: { before: 240, after: 120 },
          })
        );
        break;
      case 'absatz':
        children.push(new Paragraph({ children: runsFor(block.text), spacing: { after: 160 } }));
        break;
      case 'liste':
        for (const item of block.items) {
          children.push(
            new Paragraph({
              children: item.nummer
                ? [new TextRun({ text: `${item.nummer}. ` }), ...runsFor(item.text)]
                : runsFor(item.text),
              bullet: item.nummer ? undefined : { level: item.ebene },
              indent: item.nummer ? { left: 360 + item.ebene * 360 } : undefined,
              spacing: { after: 60 },
            })
          );
        }
        break;
      case 'code':
        for (const zeile of String(block.text).split('\n')) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: zeile || ' ', font: 'Courier New', size: 18 })],
              shading: { fill: 'F2F2F2' },
              spacing: { after: 0 },
            })
          );
        }
        children.push(new Paragraph({ children: [], spacing: { after: 120 } }));
        break;
      case 'zitat':
        children.push(
          new Paragraph({
            children: parseInline(block.text).map(
              r => new TextRun({ text: r.text, italics: true, color: '666666' })
            ),
            indent: { left: 360 },
            border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'CCCCCC' } },
            spacing: { after: 160 },
          })
        );
        break;
      case 'tabelle': {
        const zeile = (zellen, fett) =>
          new TableRow({
            children: zellen.map(
              z =>
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: z.replace(/[*_`]/g, ''), bold: fett })],
                    }),
                  ],
                })
            ),
          });
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [zeile(block.kopf, true), ...block.rows.map(r => zeile(r, false))],
          }),
          new Paragraph({ children: [], spacing: { after: 160 } })
        );
        break;
      }
      case 'hr':
        children.push(
          new Paragraph({
            children: [],
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' } },
            spacing: { after: 160 },
          })
        );
        break;
      default:
        break;
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: titel ? `${titel}  ·  ` : '', color: '666666', size: 16 }),
                  new TextRun({
                    children: ['Seite ', PageNumber.CURRENT],
                    color: '666666',
                    size: 16,
                  }),
                  new TextRun({
                    children: [' von ', PageNumber.TOTAL_PAGES],
                    color: '666666',
                    size: 16,
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

module.exports = { renderDocx };
