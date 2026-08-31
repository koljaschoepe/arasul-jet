/**
 * Die Proben fuer das Schaustueck der Dokumentanzeige.
 *
 * DAS PDF IST ECHT UND WIRD HIER GEBAUT, nicht als Datei eingecheckt: ein
 * einseitiges Dokument mit Querverweistabelle, deren Offsets beim Bauen
 * gezaehlt werden. Damit misst die Schauseite den ganzen Weg -- pdf.js als
 * eigener Brocken, der Worker gleicher Herkunft, die Standardschriften aus
 * `pdf-dateien/` (Helvetica ist absichtlich NICHT eingebettet) -- unter der
 * scharfen CSP des Geraets. Ein kaputtes Stueck dieses Wegs schreibt eine
 * Warnung in die Konsole, und genau danach fragt `schauseite.mjs`.
 *
 * DAS BILD IST EIN SVG OHNE FARBLITERAL IM SINNE DER PALETTE: `silver` und
 * `gray` sind Farbworte (ungesaettigt), keine Hex-Werte -- `bausteine.py`
 * liest Farbworte nicht, und Grau liegt in der Palette.
 */

const PDF_KOPF = '%PDF-1.4\n';

/** Ein gueltiges einseitiges PDF mit Text in Helvetica. */
export function probePdf(): Blob {
  const strom = 'BT /F1 20 Tf 48 130 Td (Arasul Dokumentanzeige) Tj ET';
  const objekte = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 320 240]/Contents 4 0 R' +
      '/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${strom.length}>>stream\n${strom}\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];

  let text = PDF_KOPF;
  const stellen: number[] = [];
  objekte.forEach((objekt, i) => {
    stellen.push(text.length);
    text += `${i + 1} 0 obj\n${objekt}\nendobj\n`;
  });
  const start = text.length;
  text +=
    `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n` +
    stellen.map(s => `${String(s).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<</Size ${objekte.length + 1}/Root 1 0 R>>\nstartxref\n${start}\n%%EOF`;
  return new Blob([text], { type: 'application/pdf' });
}

/** Dasselbe PDF als Datei, fuer die Vorschau der Dateiablage. */
export function probePdfDatei(): File {
  return new File([probePdf()], 'probe.pdf', { type: 'application/pdf' });
}

/** Ein kleines Bild: zwei graue Formen, 320 mal 200. */
export const PROBE_BILD =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200">' +
      '<rect width="320" height="200" fill="silver"/>' +
      '<circle cx="96" cy="84" r="44" fill="gray"/>' +
      '<rect x="168" y="52" width="104" height="64" rx="8" fill="gray"/>' +
      '</svg>'
  );
