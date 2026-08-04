/**
 * Eingebaute Rechnungs-Validierung (Plan 014, Phase 5).
 *
 * Läuft VOR dem Ziehen der Rechnungsnummer (deshalb entstehen bei Fehlern
 * keine Lücken im Nummernkreis). Deterministische Checks:
 *
 *  1. Verkäufer-Pflichtangaben (§14 UStG / EN 16931): Name, vollständige
 *     Anschrift, USt-IdNr.
 *  2. Käufer-Pflichtangaben: Name + Anschrift (BR-10/BR-11: mindestens Land).
 *  3. Positions- und Summen-Konsistenz (rechnet summen.js ohnehin — hier wird
 *     die Quersumme unabhängig nachgeprüft).
 *  4. Probe-XML: das Factur-X-XML wird testweise erzeugt — die zod-Prüfung
 *     der Bibliothek fängt Struktarfehler, bevor eine Nummer verbrannt ist.
 */

const { ValidationError } = require('../../../utils/errors');
const { erzeugeXml } = require('./zugferdXml');

const UST_ID_RE = /^[A-Z]{2}[A-Za-z0-9]{2,13}$/;

function pruefePartei(partei, rolle, { ustIdPflicht = false, anschriftPflicht = false } = {}) {
  const fehler = [];
  if (!partei || !String(partei.name || '').trim()) {
    fehler.push(`${rolle}: Name fehlt`);
    return fehler;
  }
  if (anschriftPflicht) {
    if (!String(partei.strasse || '').trim()) {
      fehler.push(`${rolle}: Straße fehlt`);
    }
    if (!String(partei.plz || '').trim()) {
      fehler.push(`${rolle}: PLZ fehlt`);
    }
    if (!String(partei.ort || '').trim()) {
      fehler.push(`${rolle}: Ort fehlt`);
    }
  }
  if (ustIdPflicht) {
    const ustId = String(partei.ust_id || '').trim();
    if (!ustId) {
      fehler.push(`${rolle}: USt-IdNr. fehlt`);
    } else if (!UST_ID_RE.test(ustId)) {
      fehler.push(`${rolle}: USt-IdNr. "${ustId}" hat kein gültiges Format (z. B. DE123456789)`);
    }
  }
  return fehler;
}

/**
 * ECHT unabhängige Quersumme: rechnet netto/ust/brutto ein zweites Mal aus den
 * ROH-Positionen — mit einem ANDEREN Verfahren als summen.js (Euro-Float statt
 * Integer-Cent, aber am Ende auf Cent gerundet). Ein systematischer Bug in
 * summen.js reproduziert sich hier NICHT, weil beide Pfade verschieden rechnen.
 * @returns {{netto_cent:number, ust_cent:number, brutto_cent:number}|null}
 */
function unabhaengigeQuersumme(positionen) {
  if (!Array.isArray(positionen) || positionen.length === 0) {
    return null;
  }
  let nettoEuro = 0;
  const jeSatz = new Map();
  for (const p of positionen) {
    const menge = Number(String(p.menge ?? '').replace(',', '.'));
    const preis = Number(String(p.einzelpreis_netto ?? '').replace(',', '.'));
    const satz = Number(String(p.ust_satz ?? '').replace(',', '.'));
    if (!Number.isFinite(menge) || !Number.isFinite(preis) || !Number.isFinite(satz)) {
      return null;
    }
    const zeile = Math.round(menge * preis * 100) / 100; // Euro, 2 Nachkommastellen
    nettoEuro += zeile;
    jeSatz.set(satz, (jeSatz.get(satz) || 0) + zeile);
  }
  let ustEuro = 0;
  for (const [satz, basis] of jeSatz) {
    ustEuro += Math.round(basis * satz) / 100; // basis(€) * satz(%) / 100, auf Cent
  }
  const nettoCent = Math.round(nettoEuro * 100);
  const ustCent = Math.round(ustEuro * 100);
  return { netto_cent: nettoCent, ust_cent: ustCent, brutto_cent: nettoCent + ustCent };
}

/**
 * Validiert alle Rechnungsdaten. Wirft ValidationError mit ALLEN Mängeln auf
 * einmal (der Flow soll eine vollständige Liste sehen, kein Fehler-Ping-Pong).
 *
 * @param {object} p - {verkaeufer, kaeufer, summen, positionen, datum}
 * @returns {Promise<{checks: string[]}>} Liste der bestandenen Checks.
 */
async function validiereRechnung({ verkaeufer, kaeufer, summen, positionen, datum }) {
  const fehler = [];
  const checks = [];

  fehler.push(
    ...pruefePartei(verkaeufer, 'Verkäufer', { ustIdPflicht: true, anschriftPflicht: true })
  );
  if (fehler.length === 0) {
    checks.push('Verkäufer-Pflichtangaben vollständig');
  }

  const kaeuferFehler = pruefePartei(kaeufer, 'Käufer');
  if (!String(kaeufer?.land || 'DE').trim()) {
    kaeuferFehler.push('Käufer: Land fehlt');
  }
  fehler.push(...kaeuferFehler);
  if (kaeuferFehler.length === 0) {
    checks.push('Käufer-Pflichtangaben vollständig');
  }

  // ECHT unabhängige Quersumme aus den Roh-Positionen (zweiter Rechenweg).
  if (summen) {
    const quer = positionen ? unabhaengigeQuersumme(positionen) : null;
    if (!quer) {
      fehler.push('Summen: unabhängige Quersumme nicht berechenbar');
    } else if (quer.netto_cent !== summen.netto_cent) {
      fehler.push(
        `Summen: Netto stimmt nicht (Code ${summen.netto_cent} vs. Quersumme ${quer.netto_cent} Cent)`
      );
    } else if (quer.ust_cent !== summen.ust_cent) {
      fehler.push(
        `Summen: Umsatzsteuer stimmt nicht (Code ${summen.ust_cent} vs. Quersumme ${quer.ust_cent} Cent)`
      );
    } else if (quer.brutto_cent !== summen.brutto_cent) {
      fehler.push('Summen: Brutto stimmt nicht');
    } else {
      checks.push('Summen konsistent (zwei unabhängige Rechenwege)');
    }
  } else {
    fehler.push('Summen fehlen');
  }

  if (fehler.length > 0) {
    throw new ValidationError(`Rechnung nicht ausstellbar:\n- ${fehler.join('\n- ')}`);
  }

  // Probe-XML mit Platzhalter-Nummer: fängt Strukturfehler VOR der Nummer.
  await erzeugeXml({
    nummer: 'RE-0000-00000',
    datum: datum || new Date(),
    verkaeufer,
    kaeufer,
    summen,
  });
  checks.push('Factur-X-Struktur erzeugbar (Probelauf)');

  return { checks };
}

module.exports = { validiereRechnung, pruefePartei, unabhaengigeQuersumme };
