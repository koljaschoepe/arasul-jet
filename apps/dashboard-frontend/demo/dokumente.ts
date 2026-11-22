/**
 * Die Beispieldateien der Demo (J54, M7): PDF und Zeichnung, erzeugt aus dem
 * Eintrag, an dem sie hängen. Kein fremdes Material, keine Bibliothek: ein
 * kleiner PDF-Schreiber mit den Standardschriften (Helvetica, WinAnsi) und
 * SVG für Zeichnung und Foto. Jede Datei trägt den Namen der Firma und unten
 * den Satz, dass sie ein Beispiel mit erfundenen Angaben ist.
 *
 * Erzeugt wird im Service Worker beim Öffnen, nicht beim Bau: so passt die
 * Datei zu dem, was der Besucher geändert oder eben angelegt hat.
 */
import { txt, type AppKennung, type Eintrag } from './bestand';
import { FIRMA, auftrag, kunde, lieferant, maschine, name, person, ARTIKEL } from './firma';

type Sprache = 'de' | 'en';

// ── PDF ─────────────────────────────────────────────────────────────────────

const WINANSI: Record<string, number> = {
  '€': 0x80,
  '‚': 0x82,
  '„': 0x84,
  '…': 0x85,
  '–': 0x96,
  '—': 0x97,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '−': 0x2d,
  '\u00a0': 0x20,
  '\u202f': 0x20,
};

function kodieren(text: string): string {
  let aus = '';
  for (const z of text.normalize('NFC')) {
    let code = WINANSI[z] ?? z.charCodeAt(0);
    if (z === 'ı') code = 0x69;
    if (code > 255) code = 0x3f;
    const c = String.fromCharCode(code);
    aus += c === '(' || c === ')' || c === '\\' ? `\\${c}` : c;
  }
  return aus;
}

/** Ungefähre Breite in Helvetica, reicht zum rechtsbündigen Setzen. */
function breite(text: string, groesse: number): number {
  let b = 0;
  for (const z of text) {
    if (/[0-9€]/.test(z)) b += 0.556;
    else if (/[.,: ]/.test(z)) b += 0.278;
    else if (/[A-ZÄÖÜ]/.test(z)) b += 0.667;
    else if (/[il]/.test(z)) b += 0.222;
    else b += 0.52;
  }
  return b * groesse;
}

class Seite {
  befehle: string[] = [];
  text(x: number, y: number, t: string, groesse = 10, fett = false, grau = 0.12) {
    this.befehle.push(
      `BT ${grau} g /${fett ? 'F2' : 'F1'} ${groesse} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${kodieren(t)}) Tj ET`
    );
  }
  rechts(x: number, y: number, t: string, groesse = 10, fett = false) {
    this.text(x - breite(t, groesse), y, t, groesse, fett);
  }
  linie(x1: number, y1: number, x2: number, y2: number, staerke = 0.5, farbe = '0.75 0.75 0.75') {
    this.befehle.push(`${farbe} RG ${staerke} w ${x1} ${y1} m ${x2} ${y2} l S`);
  }
  flaeche(x: number, y: number, b: number, h: number, farbe = '0.94 0.95 0.97') {
    this.befehle.push(`${farbe} rg ${x} ${y} ${b} ${h} re f`);
  }
}

const BLAU = '0.13 0.33 0.62';

function pdfBauen(seite: Seite): Uint8Array<ArrayBuffer> {
  const inhalt = seite.befehle.join('\n');
  const objekte = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${inhalt.length} >>\nstream\n${inhalt}\nendstream`,
  ];
  let aus = '%PDF-1.4\n%âãÏÓ\n';
  const stellen: number[] = [];
  objekte.forEach((o, i) => {
    stellen.push(aus.length);
    aus += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = aus.length;
  aus += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n`;
  for (const s of stellen) aus += `${String(s).padStart(10, '0')} 00000 n \n`;
  aus += `trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(aus.length);
  for (let i = 0; i < aus.length; i += 1) bytes[i] = aus.charCodeAt(i) & 0xff;
  return bytes;
}

const L = 56;
const R = 539;

function briefkopf(s: Seite, absender: string, zeile: string) {
  s.flaeche(0, 826, 595, 16, BLAU);
  s.text(L, 790, absender, 16, true);
  s.text(L, 774, zeile, 8.5, false, 0.4);
  s.linie(L, 764, R, 764, 0.8, BLAU);
}

function fuss(s: Seite, sp: Sprache) {
  s.linie(L, 62, R, 62);
  s.text(
    L,
    48,
    `${FIRMA.name} · ${FIRMA.strasse} · ${FIRMA.plz} ${FIRMA.ort} · ${FIRMA.telefon}`,
    8,
    false,
    0.4
  );
  s.text(
    L,
    36,
    sp === 'en'
      ? 'Sample document from the Arasul demo. Company, people and figures are made up.'
      : 'Beispieldokument aus der Arasul-Demo. Firma, Personen und Zahlen sind erfunden.',
    8,
    false,
    0.4
  );
}

/** Schlüssel und Wert untereinander, in zwei Spalten. */
function angaben(
  s: Seite,
  y: number,
  paare: [string, string][],
  x = L,
  schluesselBreite = 92
): number {
  for (const [k, v] of paare) {
    s.text(x, y, k, 9, false, 0.45);
    s.text(x + schluesselBreite, y, v, 9.5);
    y -= 15;
  }
  return y;
}

interface Spalte {
  titel: string;
  x: number;
  rechts?: boolean;
}

function tabelle(s: Seite, y: number, spalten: Spalte[], zeilen: string[][]): number {
  s.flaeche(L, y - 6, R - L, 20);
  for (const sp of spalten) {
    if (sp.rechts) s.rechts(sp.x, y, sp.titel, 9, true);
    else s.text(sp.x, y, sp.titel, 9, true);
  }
  y -= 22;
  for (const z of zeilen) {
    z.forEach((wert, i) => {
      const sp = spalten[i]!;
      if (sp.rechts) s.rechts(sp.x, y, wert, 9.5);
      else s.text(sp.x, y, wert, 9.5);
    });
    s.linie(L, y - 7, R, y - 7, 0.3);
    y -= 20;
  }
  return y;
}

const ort = (sp: Sprache) => (sp === 'en' ? 'en-GB' : 'de-DE');
const euro = (n: number, sp: Sprache) =>
  new Intl.NumberFormat(ort(sp), { style: 'currency', currency: 'EUR' }).format(n);
const datum = (iso: string | null | undefined, sp: Sprache) =>
  iso
    ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(ort(sp), {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '–';

const zeile = () => `${FIRMA.strasse} · ${FIRMA.plz} ${FIRMA.ort} · ${FIRMA.web}`;
const W = (sp: Sprache, de: string, en: string) => (sp === 'en' ? en : de);

function angebotPdf(e: Eintrag, sp: Sprache): Seite {
  const s = new Seite();
  const f = e.felder;
  const k = kunde(Number(f.kunde));
  briefkopf(s, FIRMA.name, zeile());
  s.text(L, 735, k.name, 10.5);
  s.text(L, 720, W(sp, `z. Hd. ${k.ansprechpartner}`, `Attn. ${k.ansprechpartner}`), 10);
  s.text(L, 705, k.ort, 10);
  angaben(
    s,
    735,
    [
      [W(sp, 'Angebot', 'Quote'), e.nr],
      [W(sp, 'Datum', 'Date'), datum(String(f.datum), sp)],
      [W(sp, 'Gültig bis', 'Valid until'), datum(String(f.gueltig), sp)],
      [W(sp, 'Bearbeitet von', 'Prepared by'), name(Number(f.bearbeiter))],
    ],
    340,
    86
  );
  s.text(L, 650, `${W(sp, 'Angebot', 'Quote')}: ${txt(f.betreff, sp)}`, 13, true);
  s.text(
    L,
    630,
    W(
      sp,
      'Sehr geehrte Damen und Herren, gern bieten wir Ihnen wie folgt an:',
      'Dear Sir or Madam, we are pleased to quote as follows:'
    ),
    10
  );
  const betrag = Number(f.betrag) || 0;
  const anteile: [string, string, number][] = [
    [
      W(sp, 'Konstruktion und Werkstattzeichnungen', 'Design and shop drawings'),
      W(sp, '1 psch.', '1 lot'),
      0.12,
    ],
    [
      W(sp, 'Material und Fertigung im Werk', 'Material and fabrication'),
      W(sp, '1 psch.', '1 lot'),
      0.53,
    ],
    [
      W(sp, 'Oberfläche: feuerverzinkt bzw. beschichtet', 'Finish: galvanised or coated'),
      W(sp, '1 psch.', '1 lot'),
      0.13,
    ],
    [
      W(sp, 'Lieferung und Montage vor Ort', 'Delivery and installation on site'),
      W(sp, '1 psch.', '1 lot'),
      0.22,
    ],
  ];
  let y = tabelle(
    s,
    600,
    [
      { titel: W(sp, 'Pos.', 'Item'), x: L + 6 },
      { titel: W(sp, 'Leistung', 'Description'), x: L + 40 },
      { titel: W(sp, 'Menge', 'Qty'), x: 380 },
      { titel: W(sp, 'Betrag', 'Amount'), x: R - 6, rechts: true },
    ],
    anteile.map(([was, menge, anteil], i) => [
      String(i + 1),
      was,
      menge,
      euro(Math.round(betrag * anteil), sp),
    ])
  );
  const rabatt = Number(f.rabatt) || 0;
  const netto = betrag * (1 - rabatt / 100);
  y -= 6;
  const summe = (t: string, wert: string, fett = false) => {
    s.text(340, y, t, 10, fett);
    s.rechts(R - 6, y, wert, 10, fett);
    y -= 16;
  };
  summe(W(sp, 'Summe', 'Subtotal'), euro(betrag, sp));
  if (rabatt)
    summe(W(sp, `Rabatt ${rabatt} %`, `Discount ${rabatt}%`), `− ${euro(betrag - netto, sp)}`);
  summe(W(sp, 'Netto', 'Net'), euro(netto, sp));
  summe(W(sp, 'MwSt. 19 %', 'VAT 19%'), euro(netto * 0.19, sp));
  s.linie(340, y + 10, R, y + 10, 0.6, '0.2 0.2 0.2');
  summe(W(sp, 'Gesamt', 'Total'), euro(netto * 1.19, sp), true);
  y -= 14;
  for (const satz of [
    W(
      sp,
      'Lieferzeit: etwa 4 bis 6 Wochen nach Freigabe der Werkstattzeichnungen.',
      'Lead time: about 4 to 6 weeks after approval of the shop drawings.'
    ),
    W(
      sp,
      'Ausführung nach EN 1090, Ausführungsklasse EXC2. Zahlung 14 Tage netto.',
      'Execution to EN 1090, execution class EXC2. Payment 14 days net.'
    ),
    W(sp, 'Wir freuen uns auf Ihren Auftrag.', 'We look forward to your order.'),
  ]) {
    s.text(L, y, satz, 10);
    y -= 15;
  }
  s.text(L, y - 18, W(sp, 'Mit freundlichen Grüßen', 'Kind regards'), 10);
  s.text(L, y - 50, name(Number(f.bearbeiter)), 10, true);
  s.text(L, y - 64, FIRMA.name, 9, false, 0.4);
  fuss(s, sp);
  return s;
}

function lieferscheinPdf(e: Eintrag, sp: Sprache): Seite {
  const s = new Seite();
  const f = e.felder;
  const l = lieferant(Number(f.lieferant));
  const a = ARTIKEL.find(x => x.nr === f.artikel);
  briefkopf(s, l.name, `${l.ort} · ${txt(l.was, sp)}`);
  s.text(L, 735, FIRMA.name, 10.5);
  s.text(L, 720, W(sp, 'Warenannahme, Tor 2', 'Goods receipt, gate 2'), 10);
  s.text(L, 705, `${FIRMA.strasse}, ${FIRMA.plz} ${FIRMA.ort}`, 10);
  angaben(
    s,
    735,
    [
      [W(sp, 'Lieferschein', 'Delivery note'), String(f.lieferschein ?? '–')],
      [W(sp, 'Ihre Bestellung', 'Your order'), String(f.bestellung ?? '–')],
      [W(sp, 'Lieferdatum', 'Delivery date'), datum(String(f.eingang ?? f.erwartet), sp)],
      [W(sp, 'Kommission', 'Reference'), String(f.auftrag ?? '–')],
    ],
    340,
    86
  );
  s.text(L, 650, W(sp, 'Lieferschein', 'Delivery note'), 14, true);
  let y = tabelle(
    s,
    620,
    [
      { titel: W(sp, 'Artikel', 'Item no.'), x: L + 6 },
      { titel: W(sp, 'Bezeichnung', 'Description'), x: L + 74 },
      { titel: W(sp, 'Menge', 'Qty'), x: R - 6, rechts: true },
    ],
    [[String(f.artikel), a ? a.name[sp] : '', `${f.menge} ${a ? a.einheit[sp] : ''}`]]
  );
  y -= 10;
  s.text(
    L,
    y,
    W(sp, 'Ware vollständig und unbeschädigt erhalten:', 'Goods received complete and undamaged:'),
    10
  );
  s.linie(L, y - 40, 260, y - 40, 0.6, '0.3 0.3 0.3');
  s.text(
    L,
    y - 54,
    W(sp, `Unterschrift, ${name(Number(f.pruefer))}`, `Signature, ${name(Number(f.pruefer))}`),
    8.5,
    false,
    0.4
  );
  fuss(s, sp);
  return s;
}

function wartungPdf(e: Eintrag, sp: Sprache): Seite {
  const s = new Seite();
  const f = e.felder;
  const m = maschine(String(f.maschine));
  briefkopf(s, FIRMA.name, W(sp, 'Instandhaltung', 'Maintenance'));
  s.text(L, 735, `${W(sp, 'Wartungsprotokoll', 'Service report')} ${e.nr}`, 14, true);
  let y = angaben(
    s,
    708,
    [
      [W(sp, 'Maschine', 'Machine'), `${m.id} · ${m.name[sp]} · ${m.ort[sp]}`],
      [W(sp, 'Aufgabe', 'Task'), txt(f.aufgabe, sp)],
      [W(sp, 'Fällig', 'Due'), datum(String(f.faellig), sp)],
      [W(sp, 'Erledigt am', 'Done on'), datum(f.erledigt_am ? String(f.erledigt_am) : null, sp)],
      [
        W(sp, 'Ausgeführt von', 'Carried out by'),
        f.extern ? lieferant(Number(f.extern)).name : name(Number(f.zustaendig)),
      ],
    ],
    L,
    100
  );
  y = tabelle(
    s,
    y - 16,
    [
      { titel: W(sp, 'Prüfpunkt', 'Check'), x: L + 6 },
      { titel: W(sp, 'Ergebnis', 'Result'), x: R - 6, rechts: true },
    ],
    [
      [
        W(sp, 'Schutzeinrichtungen und Not-Halt', 'Guards and emergency stop'),
        W(sp, 'i. O.', 'OK'),
      ],
      [W(sp, 'Schmierung und Füllstände', 'Lubrication and levels'), W(sp, 'i. O.', 'OK')],
      [W(sp, 'Filter, Schläuche, Leitungen', 'Filters, hoses, lines'), W(sp, 'i. O.', 'OK')],
      [W(sp, 'Verschleißteile', 'Wear parts'), W(sp, 'ersetzt', 'replaced')],
      [W(sp, 'Probelauf', 'Test run'), W(sp, 'i. O.', 'OK')],
    ]
  );
  if (f.notiz) s.text(L, y - 10, `${W(sp, 'Bemerkung', 'Note')}: ${txt(f.notiz, sp)}`, 9.5);
  s.linie(L, y - 70, 260, y - 70, 0.6, '0.3 0.3 0.3');
  s.text(
    L,
    y - 84,
    `${W(sp, 'Unterschrift', 'Signature')}, ${name(Number(f.zustaendig))}`,
    8.5,
    false,
    0.4
  );
  fuss(s, sp);
  return s;
}

function pruefungPdf(e: Eintrag, sp: Sprache): Seite {
  const s = new Seite();
  const f = e.felder;
  const au = auftrag(String(f.auftrag));
  briefkopf(s, FIRMA.name, W(sp, 'Qualitätssicherung', 'Quality assurance'));
  s.text(L, 735, `${W(sp, 'Prüfprotokoll', 'Inspection report')} ${e.nr}`, 14, true);
  const ergebnis =
    f.ergebnis === 'io'
      ? W(sp, 'in Ordnung', 'passed')
      : f.ergebnis === 'nio'
        ? W(sp, 'nicht in Ordnung', 'failed')
        : f.ergebnis === 'auflage'
          ? W(sp, 'mit Auflage', 'passed with condition')
          : W(sp, 'offen', 'open');
  let y = angaben(
    s,
    708,
    [
      [W(sp, 'Auftrag', 'Order'), `${f.auftrag}${au ? ` · ${au.gegenstand[sp]}` : ''}`],
      [W(sp, 'Kunde', 'Customer'), au ? kunde(au.kunde).name : '–'],
      [W(sp, 'Bauteil', 'Part'), txt(f.bauteil, sp)],
      [W(sp, 'Prüfung', 'Inspection'), pruefartText(String(f.pruefart), sp)],
      [W(sp, 'Datum', 'Date'), datum(String(f.datum), sp)],
      [W(sp, 'Prüfer', 'Inspector'), name(Number(f.pruefer))],
    ],
    L,
    100
  );
  const zeilen: string[][] = [
    [W(sp, 'Grundlage', 'Basis'), W(sp, 'Zeichnung, EN 1090 EXC2', 'Drawing, EN 1090 EXC2'), ''],
    [
      W(sp, 'Schweißnähte Sichtprüfung', 'Visual weld check'),
      W(sp, 'Bewertungsgruppe C', 'Quality level C'),
      f.ergebnis === 'nio' ? W(sp, 'n. i. O.', 'fail') : W(sp, 'i. O.', 'OK'),
    ],
    [
      W(sp, 'Hauptmaße', 'Main dimensions'),
      '± 2 mm',
      f.messwert !== null && f.pruefart === 'mass' ? `${f.messwert} mm` : W(sp, 'i. O.', 'OK'),
    ],
    [
      W(sp, 'Schichtdicke', 'Coating thickness'),
      '≥ 80 µm'.replace('≥', '>='),
      f.pruefart === 'schicht' && f.messwert !== null ? `${f.messwert} µm` : '–',
    ],
  ];
  y = tabelle(
    s,
    y - 16,
    [
      { titel: W(sp, 'Merkmal', 'Characteristic'), x: L + 6 },
      { titel: W(sp, 'Sollwert', 'Target'), x: 280 },
      { titel: W(sp, 'Befund', 'Finding'), x: R - 6, rechts: true },
    ],
    zeilen
  );
  s.text(L, y - 10, `${W(sp, 'Ergebnis', 'Result')}: ${ergebnis}`, 12, true);
  if (f.notiz) s.text(L, y - 30, `${W(sp, 'Bemerkung', 'Note')}: ${txt(f.notiz, sp)}`, 9.5);
  s.linie(L, y - 90, 260, y - 90, 0.6, '0.3 0.3 0.3');
  s.text(
    L,
    y - 104,
    `${W(sp, 'Prüfer', 'Inspector')}: ${name(Number(f.pruefer))}`,
    8.5,
    false,
    0.4
  );
  if (e.stand === 'freigegeben') {
    s.linie(320, y - 90, R, y - 90, 0.6, '0.3 0.3 0.3');
    s.text(320, y - 104, `${W(sp, 'Freigabe', 'Approval')}: Miriam Kerschner`, 8.5, false, 0.4);
  }
  fuss(s, sp);
  return s;
}

export function pruefartText(art: string, sp: Sprache): string {
  const texte: Record<string, [string, string]> = {
    sicht: ['Sichtprüfung Schweißnähte', 'Visual weld inspection'],
    mass: ['Maßprüfung nach Zeichnung', 'Dimensional check to drawing'],
    schicht: ['Schichtdicke Beschichtung', 'Coating thickness'],
    abnahme: ['Abnahme vor Ort', 'On-site acceptance'],
  };
  const t = texte[art];
  return t ? (sp === 'en' ? t[1] : t[0]) : art;
}

function antragPdf(e: Eintrag, sp: Sprache): Seite {
  const s = new Seite();
  const f = e.felder;
  const p = person(Number(f.person));
  briefkopf(s, FIRMA.name, W(sp, 'Personal', 'Human resources'));
  s.text(L, 735, `${W(sp, 'Urlaubsantrag', 'Leave request')} ${e.nr}`, 14, true);
  angaben(
    s,
    708,
    [
      [W(sp, 'Name', 'Name'), `${p.vorname} ${p.nachname}`],
      [W(sp, 'Aufgabe', 'Role'), p.aufgabe[sp]],
      [W(sp, 'Zeitraum', 'Period'), `${datum(String(f.von), sp)} – ${datum(String(f.bis), sp)}`],
      [W(sp, 'Arbeitstage', 'Working days'), String(f.tage)],
      [W(sp, 'Vertretung', 'Cover'), name(Number(f.vertretung))],
      [
        W(sp, 'Stand', 'Status'),
        e.stand === 'genehmigt'
          ? W(sp, 'genehmigt', 'approved')
          : e.stand === 'abgelehnt'
            ? W(sp, 'abgelehnt', 'declined')
            : W(sp, 'beantragt', 'requested'),
      ],
    ],
    L,
    100
  );
  s.linie(L, 560, 260, 560, 0.6, '0.3 0.3 0.3');
  s.text(L, 546, W(sp, 'Antragsteller', 'Applicant'), 8.5, false, 0.4);
  s.linie(320, 560, R, 560, 0.6, '0.3 0.3 0.3');
  s.text(
    320,
    546,
    W(sp, 'Genehmigt: Miriam Kerschner', 'Approved: Miriam Kerschner'),
    8.5,
    false,
    0.4
  );
  fuss(s, sp);
  return s;
}

// ── SVG ─────────────────────────────────────────────────────────────────────

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Eine einfache Werkstattzeichnung: Treppenwange mit Maßketten und Schriftfeld. */
function zeichnungSvg(e: Eintrag, app: AppKennung, sp: Sprache): string {
  const titel = app === 'angebote' ? txt(e.felder.betreff, sp) : txt(e.felder.bauteil, sp);
  const stufen = 8 + (e.id % 5);
  let treppe = '';
  for (let i = 0; i < stufen; i += 1) {
    const x = 120 + i * 48;
    const y = 470 - i * 34;
    treppe += `<path d="M${x} ${y} h48 v-34" fill="none" stroke="#1d2a3a" stroke-width="2"/>`;
  }
  const ende = 120 + stufen * 48;
  const oben = 470 - stufen * 34;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 640" width="900" height="640">
<rect width="900" height="640" fill="#fbfaf7"/>
<rect x="20" y="20" width="860" height="600" fill="none" stroke="#1d2a3a" stroke-width="1.5"/>
<g stroke="#e3e1db" stroke-width="1">${Array.from({ length: 17 }, (_, i) => `<line x1="${40 + i * 50}" y1="40" x2="${40 + i * 50}" y2="520"/>`).join('')}</g>
<path d="M100 490 L${ende + 20} ${oben - 10}" stroke="#1d2a3a" stroke-width="3" fill="none"/>
<path d="M100 520 L${ende + 20} ${oben + 20}" stroke="#1d2a3a" stroke-width="3" fill="none"/>
${treppe}
<g stroke="#2a5aa0" stroke-width="1" fill="#2a5aa0" font-family="Helvetica, Arial, sans-serif" font-size="14">
<line x1="120" y1="560" x2="${ende}" y2="560"/><line x1="120" y1="552" x2="120" y2="568"/><line x1="${ende}" y1="552" x2="${ende}" y2="568"/>
<text x="${(120 + ende) / 2 - 30}" y="552" stroke="none">${stufen * 270} mm</text>
<line x1="${ende + 50}" y1="470" x2="${ende + 50}" y2="${oben}"/><line x1="${ende + 42}" y1="470" x2="${ende + 58}" y2="470"/><line x1="${ende + 42}" y1="${oben}" x2="${ende + 58}" y2="${oben}"/>
<text x="${ende + 58}" y="${(470 + oben) / 2}" stroke="none">${stufen * 180} mm</text>
</g>
<g font-family="Helvetica, Arial, sans-serif" fill="#1d2a3a">
<rect x="560" y="530" width="300" height="70" fill="#fff" stroke="#1d2a3a"/>
<text x="572" y="552" font-size="15" font-weight="bold">${esc(FIRMA.name)}</text>
<text x="572" y="572" font-size="12">${esc(titel).slice(0, 44)}</text>
<text x="572" y="590" font-size="11">${esc(e.nr)} · ${sp === 'en' ? 'Scale' : 'Maßstab'} 1:20 · ${sp === 'en' ? 'Sample, made up' : 'Beispiel, erfunden'}</text>
</g>
</svg>`;
}

/** Ein „Foto" als Zeichnung: Palette mit verbogener Blechtafel. */
function fotoSvg(e: Eintrag, sp: Sprache): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600" width="900" height="600">
<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9dde2"/><stop offset="1" stop-color="#9aa3ad"/></linearGradient></defs>
<rect width="900" height="600" fill="#5d6670"/>
<rect y="420" width="900" height="180" fill="#4a525b"/>
<rect x="200" y="400" width="500" height="40" fill="#b08a5a"/><rect x="220" y="440" width="40" height="30" fill="#8a6a40"/><rect x="430" y="440" width="40" height="30" fill="#8a6a40"/><rect x="640" y="440" width="40" height="30" fill="#8a6a40"/>
<path d="M190 400 L710 400 L700 330 L200 330 Z" fill="url(#b)" stroke="#6f7781"/>
<path d="M200 330 L700 330 L690 300 L620 296 L600 270 L560 300 L210 300 Z" fill="#c4cad1" stroke="#6f7781"/>
<circle cx="600" cy="285" r="46" fill="none" stroke="#e8b400" stroke-width="5"/>
<rect x="24" y="24" width="${sp === 'en' ? 330 : 360}" height="34" rx="6" fill="rgba(0,0,0,.55)"/>
<text x="38" y="47" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#fff">${esc(e.nr)} · ${sp === 'en' ? 'Photo, sample drawing' : 'Foto, Beispielzeichnung'}</text>
<text x="38" y="570" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#e6e8eb">${esc(FIRMA.name)} · ${sp === 'en' ? 'Goods receipt, gate 2' : 'Wareneingang, Tor 2'}</text>
</svg>`;
}

/** Eine Datei als Bytes, oder `null`, wenn es die Vorlage nicht gibt. */
export function dateiErzeugen(
  app: AppKennung,
  e: Eintrag,
  vorlage: string,
  sp: Sprache
): { bytes: Uint8Array<ArrayBuffer>; typ: string } | null {
  const pdf = (s: Seite) => ({ bytes: pdfBauen(s), typ: 'application/pdf' });
  const svg = (t: string) => ({
    bytes: new TextEncoder().encode(t) as Uint8Array<ArrayBuffer>,
    typ: 'image/svg+xml',
  });
  switch (vorlage) {
    case 'angebot':
      return pdf(angebotPdf(e, sp));
    case 'lieferschein':
      return pdf(lieferscheinPdf(e, sp));
    case 'wartung':
      return pdf(wartungPdf(e, sp));
    case 'pruefung':
      return pdf(pruefungPdf(e, sp));
    case 'antrag':
      return pdf(antragPdf(e, sp));
    case 'zeichnung':
      return svg(zeichnungSvg(e, app, sp));
    case 'foto':
      return svg(fotoSvg(e, sp));
    default:
      return null;
  }
}
