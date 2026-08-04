/**
 * Rechnungs-PDF (Plan 014, Phase 5) — echtes PDF/A-3b mit eingebettetem
 * Factur-X-XML, komplett in Node (im Spike per Mustang/VeraPDF auf dem
 * Jetson als valide nachgewiesen).
 *
 * Drei Bausteine, die pdfkit selbst nicht komplett mitbringt:
 *  1. `subset: 'PDF/A-3b'` + EINGEBETTETE Schrift (Liberation Sans, SIL OFL —
 *     die Standard-14-Helvetica ist in PDF/A verboten).
 *  2. Eigene Filespec fürs XML mit `AFRelationship: Alternative` plus dem
 *     `/AF`-Eintrag im Katalog (pdfkits `file()` kennt beides nicht).
 *  3. Das Factur-X-XMP samt PDF/A-Extension-Schema via `doc.metadata.append`.
 */

const path = require('path');
const PDFDocument = require('pdfkit');

const FONTS = path.join(__dirname, 'fonts');

/** Cent → deutsche Betragsdarstellung „1.234,56 €". */
function euro(cent) {
  return (
    (cent / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    ' €'
  );
}

/** Hängt das Factur-X-XML PDF/A-3-konform an (Filespec + /AF + XMP). */
function haengeFacturXAn(doc, xml) {
  const xmlBuffer = Buffer.from(xml, 'utf8');
  const efRef = doc.ref({
    Type: 'EmbeddedFile',
    Subtype: 'application#2Fxml',
    Params: { ModDate: new Date(), Size: xmlBuffer.length },
  });
  efRef.end(xmlBuffer);
  const filespec = doc.ref({
    Type: 'Filespec',
    F: new String('factur-x.xml'), // eslint-disable-line no-new-wrappers
    UF: new String('factur-x.xml'), // eslint-disable-line no-new-wrappers
    Desc: new String('Factur-X Rechnung'), // eslint-disable-line no-new-wrappers
    AFRelationship: 'Alternative',
    EF: { F: efRef, UF: efRef },
  });
  filespec.end();
  doc.addNamedEmbeddedFile('factur-x.xml', filespec);
  doc._root.data.AF = [filespec];

  doc.metadata.append(`
        <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
            <fx:DocumentType>INVOICE</fx:DocumentType>
            <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
            <fx:Version>1.0</fx:Version>
            <fx:ConformanceLevel>BASIC</fx:ConformanceLevel>
        </rdf:Description>
        <rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
            <pdfaExtension:schemas>
                <rdf:Bag>
                    <rdf:li rdf:parseType="Resource">
                        <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
                        <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
                        <pdfaSchema:prefix>fx</pdfaSchema:prefix>
                        <pdfaSchema:property>
                            <rdf:Seq>
                                <rdf:li rdf:parseType="Resource">
                                    <pdfaProperty:name>DocumentFileName</pdfaProperty:name>
                                    <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                                    <pdfaProperty:category>external</pdfaProperty:category>
                                    <pdfaProperty:description>Name of the embedded XML invoice file</pdfaProperty:description>
                                </rdf:li>
                                <rdf:li rdf:parseType="Resource">
                                    <pdfaProperty:name>DocumentType</pdfaProperty:name>
                                    <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                                    <pdfaProperty:category>external</pdfaProperty:category>
                                    <pdfaProperty:description>INVOICE</pdfaProperty:description>
                                </rdf:li>
                                <rdf:li rdf:parseType="Resource">
                                    <pdfaProperty:name>Version</pdfaProperty:name>
                                    <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                                    <pdfaProperty:category>external</pdfaProperty:category>
                                    <pdfaProperty:description>The actual version of the standard applying to the embedded XML document</pdfaProperty:description>
                                </rdf:li>
                                <rdf:li rdf:parseType="Resource">
                                    <pdfaProperty:name>ConformanceLevel</pdfaProperty:name>
                                    <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                                    <pdfaProperty:category>external</pdfaProperty:category>
                                    <pdfaProperty:description>The conformance level of the embedded XML document</pdfaProperty:description>
                                </rdf:li>
                            </rdf:Seq>
                        </pdfaSchema:property>
                    </rdf:li>
                </rdf:Bag>
            </pdfaExtension:schemas>
        </rdf:Description>`);
}

/**
 * Rendert die Rechnung als PDF/A-3b mit eingebettetem Factur-X-XML.
 *
 * @param {object} p
 * @param {string} p.nummer
 * @param {Date} p.datum
 * @param {object} p.verkaeufer - {name, strasse?, plz?, ort?, ust_id, email?, telefon?}
 * @param {object} p.kaeufer - {name, strasse?, plz?, ort?}
 * @param {object} p.summen - Ergebnis von berechneSummen().
 * @param {string} p.xml - Das Factur-X-XML.
 * @param {string} [p.leistungsdatum]
 * @param {number} [p.zahlungszielTage]
 * @param {string} [p.schlussText]
 * @returns {Promise<Buffer>}
 */
function erzeugePdf({
  nummer,
  datum,
  verkaeufer,
  kaeufer,
  summen,
  xml,
  leistungsdatum,
  zahlungszielTage = 14,
  schlussText,
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 56, bottom: 70, left: 56, right: 56 },
      subset: 'PDF/A-3b',
      pdfVersion: '1.7',
      tagged: true,
      displayTitle: true,
      info: { Title: `Rechnung ${nummer}` },
      // Auto-Seitenumbruch am unteren Rand ist hier gewollt (lange Tabellen).
    });
    doc.registerFont('Sans', path.join(FONTS, 'LiberationSans-Regular.ttf'));
    doc.registerFont('Sans-Bold', path.join(FONTS, 'LiberationSans-Bold.ttf'));

    haengeFacturXAn(doc, xml);

    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const rechts = doc.page.width - doc.page.margins.right;
    const links = doc.page.margins.left;
    const breite = rechts - links;

    // Absender-Zeile + Empfänger-Block (Fensterumschlag-Logik light).
    const absenderZeile = [
      verkaeufer.name,
      verkaeufer.strasse,
      [verkaeufer.plz, verkaeufer.ort].filter(Boolean).join(' '),
    ]
      .filter(Boolean)
      .join(' · ');
    doc.font('Sans').fontSize(8).fillColor('#555555').text(absenderZeile, links, 56);
    doc.moveDown(1.2);
    doc.fontSize(11).fillColor('#000000');
    doc.text(kaeufer.name);
    if (kaeufer.strasse) {
      doc.text(kaeufer.strasse);
    }
    const kaeuferOrt = [kaeufer.plz, kaeufer.ort].filter(Boolean).join(' ');
    if (kaeuferOrt) {
      doc.text(kaeuferOrt);
    }

    // Kopf rechts: Nummer + Daten.
    doc.font('Sans').fontSize(10);
    const kopfY = 120;
    doc.text(`Rechnungsdatum: ${datum.toLocaleDateString('de-DE')}`, links, kopfY, {
      width: breite,
      align: 'right',
    });
    if (leistungsdatum) {
      doc.text(`Leistungsdatum: ${new Date(leistungsdatum).toLocaleDateString('de-DE')}`, {
        width: breite,
        align: 'right',
      });
    }
    if (verkaeufer.ust_id) {
      doc.text(`USt-IdNr.: ${verkaeufer.ust_id}`, { width: breite, align: 'right' });
    }

    // Titel.
    doc.font('Sans-Bold').fontSize(16).text(`Rechnung ${nummer}`, links, 200);
    doc.moveDown(0.8);

    // Positionstabelle.
    const spalten = [
      { titel: 'Pos.', b: 30, align: 'left' },
      { titel: 'Bezeichnung', b: breite - 30 - 60 - 80 - 45 - 85, align: 'left' },
      { titel: 'Menge', b: 60, align: 'right' },
      { titel: 'Einzelpreis', b: 80, align: 'right' },
      { titel: 'USt', b: 45, align: 'right' },
      { titel: 'Summe', b: 85, align: 'right' },
    ];
    const zeile = (werte, fett = false) => {
      const y = doc.y;
      let x = links;
      doc.font(fett ? 'Sans-Bold' : 'Sans').fontSize(9.5);
      let maxH = 0;
      werte.forEach((w, i) => {
        const sp = spalten[i];
        doc.text(String(w), x, y, { width: sp.b - 6, align: sp.align });
        maxH = Math.max(maxH, doc.heightOfString(String(w), { width: sp.b - 6 }));
        x += sp.b;
      });
      doc.y = y + maxH + 4;
    };

    zeile(
      spalten.map(s => s.titel),
      true
    );
    doc
      .moveTo(links, doc.y - 1)
      .lineTo(rechts, doc.y - 1)
      .lineWidth(0.7)
      .strokeColor('#333333')
      .stroke();
    doc.y += 3;

    summen.api.positionen.forEach((p, i) => {
      zeile([
        i + 1,
        p.bezeichnung,
        `${p.menge} ${p.einheit}`,
        euro(Math.round(Number(p.einzelpreis) * 100)),
        `${p.ust_satz} %`,
        euro(Math.round(Number(p.zeilensumme) * 100)),
      ]);
    });

    doc.y += 6;
    doc
      .moveTo(links + breite / 2, doc.y)
      .lineTo(rechts, doc.y)
      .lineWidth(0.5)
      .strokeColor('#999999')
      .stroke();
    doc.y += 6;

    // Summenblock rechts.
    const summenZeile = (label, cent, fett = false) => {
      const y = doc.y;
      doc.font(fett ? 'Sans-Bold' : 'Sans').fontSize(10);
      doc.text(label, links + breite / 2, y, { width: breite / 2 - 90, align: 'right' });
      doc.text(euro(cent), rechts - 88, y, { width: 88, align: 'right' });
      doc.y = y + 16;
    };
    summenZeile('Netto', summen.netto_cent);
    for (const u of summen.ust_saetze) {
      summenZeile(`USt ${u.satz} %`, u.betrag_cent);
    }
    summenZeile('Brutto', summen.brutto_cent, true);

    // Zahlungsziel + Zahlungshinweise (IBAN, falls im Firmenprofil gepflegt).
    doc.moveDown(1.5);
    doc
      .font('Sans')
      .fontSize(10)
      .text(
        `Zahlbar ohne Abzug innerhalb von ${zahlungszielTage} Tagen nach Rechnungsdatum.`,
        links,
        doc.y,
        { width: breite }
      );
    if (verkaeufer.iban) {
      doc
        .moveDown(0.3)
        .text(
          `Bitte überweisen Sie den Betrag unter Angabe der Rechnungsnummer ${nummer} auf: IBAN ${verkaeufer.iban}.`,
          { width: breite }
        );
    }
    if (schlussText) {
      doc.moveDown(0.5).text(schlussText, { width: breite });
    }

    // Fußzeile: Kontakt des Verkäufers. WICHTIG (Memory pdfkit-Falle): unteren
    // Rand vor dem Schreiben auf 0 setzen, sonst löst der Fußzeilentext einen
    // Auto-Seitenumbruch aus und es entsteht eine leere Extraseite.
    const fuss = [
      verkaeufer.email,
      verkaeufer.telefon,
      verkaeufer.ust_id ? `USt-IdNr. ${verkaeufer.ust_id}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    if (fuss) {
      doc.page.margins.bottom = 0;
      doc
        .font('Sans')
        .fontSize(8)
        .fillColor('#555555')
        .text(fuss, links, doc.page.height - 42, { width: breite, align: 'center' });
    }

    doc.end();
  });
}

module.exports = { erzeugePdf, haengeFacturXAn, FONTS };
