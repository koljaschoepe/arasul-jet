/**
 * ZUGFeRD/Factur-X-XML (Plan 014, Phase 5) — EN-16931-konformes CII-XML.
 *
 * Erzeugt über node-zugferd (Profil BASIC — laut Factur-X-Spezifikation das
 * Minimum für deutsche Rechnungen). `strict: false` schaltet NUR die
 * Java-XSD-Validierung der Bibliothek ab (kein Java auf dem Gerät); die
 * zod-Feldprüfung der Bibliothek läuft trotzdem, und die fachliche Prüfung
 * übernimmt validierung.js. Extern nachgewiesen wird die Konformität per
 * Mustang-Validator (Plan §6).
 *
 * ALLE Beträge kommen aus summen.js (Code) — das Modell liefert nie Zahlen
 * in dieses XML.
 */

const { zugferd } = require('node-zugferd');
const { BASIC } = require('node-zugferd/profile/basic');

const invoicer = zugferd({ profile: BASIC, strict: false });

/** Einheiten-Codes (UN/ECE Rec 20) für die üblichen Fälle. */
const EINHEIT_CODES = new Map([
  ['stück', 'C62'],
  ['stunde', 'HUR'],
  ['stunden', 'HUR'],
  ['tag', 'DAY'],
  ['tage', 'DAY'],
  ['pauschale', 'C62'],
  ['monat', 'MON'],
  ['kilometer', 'KMT'],
  ['km', 'KMT'],
]);

function einheitCode(einheit) {
  return EINHEIT_CODES.get(String(einheit || '').toLowerCase()) || 'C62';
}

/**
 * Baut das Factur-X-XML aus Verkäufer, Käufer, Positionen und Code-Summen.
 *
 * @param {object} p
 * @param {string} p.nummer - Die gezogene Rechnungsnummer.
 * @param {Date} p.datum
 * @param {object} p.verkaeufer - {name, land, ust_id, plz?, ort?, strasse?}
 * @param {object} p.kaeufer - {name, land, plz?, ort?, strasse?}
 * @param {object} p.summen - Ergebnis von berechneSummen().
 * @param {string} [p.leistungsdatum] - ISO-Datum (Liefer-/Leistungsdatum).
 * @returns {Promise<string>} Das CII-XML.
 */
async function erzeugeXml({ nummer, datum, verkaeufer, kaeufer, summen, leistungsdatum }) {
  const data = {
    number: nummer,
    typeCode: '380',
    issueDate: datum,
    transaction: {
      line: summen.positionen.map((z, i) => ({
        identifier: String(i + 1),
        tradeProduct: { name: z.bezeichnung },
        tradeAgreement: { netTradePrice: { chargeAmount: (z.einzelpreis_cent / 100).toFixed(2) } },
        tradeDelivery: {
          billedQuantity: { amount: String(z.menge), unitMeasureCode: einheitCode(z.einheit) },
        },
        tradeSettlement: {
          tradeTax: {
            typeCode: 'VAT',
            categoryCode: z.ust_satz === 0 ? 'Z' : 'S',
            rateApplicablePercent: String(z.ust_satz),
          },
          monetarySummation: { lineTotalAmount: (z.zeilensumme_cent / 100).toFixed(2) },
        },
      })),
      tradeAgreement: {
        seller: {
          name: verkaeufer.name,
          postalAddress: {
            countryCode: verkaeufer.land || 'DE',
            ...(verkaeufer.plz ? { postCode: verkaeufer.plz } : {}),
            ...(verkaeufer.ort ? { city: verkaeufer.ort } : {}),
            ...(verkaeufer.strasse ? { line1: verkaeufer.strasse } : {}),
          },
          taxRegistration: { vatIdentifier: verkaeufer.ust_id },
        },
        buyer: {
          name: kaeufer.name,
          postalAddress: {
            countryCode: kaeufer.land || 'DE',
            ...(kaeufer.plz ? { postCode: kaeufer.plz } : {}),
            ...(kaeufer.ort ? { city: kaeufer.ort } : {}),
            ...(kaeufer.strasse ? { line1: kaeufer.strasse } : {}),
          },
        },
      },
      tradeDelivery: {
        ...(leistungsdatum ? { information: { deliveryDate: new Date(leistungsdatum) } } : {}),
      },
      tradeSettlement: {
        currencyCode: 'EUR',
        vatBreakdown: summen.ust_saetze.map(u => ({
          calculatedAmount: (u.betrag_cent / 100).toFixed(2),
          typeCode: 'VAT',
          basisAmount: (u.basis_cent / 100).toFixed(2),
          categoryCode: u.satz === 0 ? 'Z' : 'S',
          rateApplicablePercent: String(u.satz),
        })),
        monetarySummation: {
          lineTotalAmount: (summen.netto_cent / 100).toFixed(2),
          taxBasisTotalAmount: (summen.netto_cent / 100).toFixed(2),
          taxTotal: { amount: (summen.ust_cent / 100).toFixed(2), currencyCode: 'EUR' },
          grandTotalAmount: (summen.brutto_cent / 100).toFixed(2),
          duePayableAmount: (summen.brutto_cent / 100).toFixed(2),
        },
      },
    },
  };

  return invoicer.create(data).toXML();
}

module.exports = { erzeugeXml, einheitCode };
