/**
 * Rechnungs-Summen (Plan 014, Phase 5) — Zahlen rechnet CODE, nie das Modell.
 *
 * Aus strukturierten Positionen (Menge × Einzelpreis netto, USt-Satz je
 * Position) entstehen deterministisch: Zeilensummen, Netto-Gesamt, die
 * USt-Aufschlüsselung je Satz und Brutto. Gerechnet wird in GANZEN CENT
 * (Integer) — keine Gleitkomma-Drift; gerundet wird kaufmännisch je
 * Zeilensumme und je USt-Satz-Summe (übliche Praxis nach §14 UStG).
 */

const { ValidationError } = require('../../../utils/errors');

/**
 * Euro-Betrag (Zahl oder String mit . oder ,) → ganze Cent. STRING-basiert,
 * nie über Float-Multiplikation (1.005 * 100 === 100.4999… — der Klassiker):
 * höchstens 2 Nachkommastellen sind erlaubt; mehr wird ehrlich abgewiesen
 * statt still gerundet.
 */
function zuCent(wert, feld) {
  const roh = String(wert ?? '')
    .trim()
    .replace(',', '.');
  const m = roh.match(/^(\d{1,10})(?:\.(\d{1,2}))?$/);
  if (!m) {
    throw new ValidationError(
      `Rechnung: "${feld}" ist kein gültiger Betrag (${wert}), erwartet z. B. 1200 oder 1200.50 (max. 2 Nachkommastellen)`
    );
  }
  return Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0') || 0);
}

/**
 * Menge → ganze Tausendstel (STRING-basiert, max. 3 Nachkommastellen) — damit
 * Zeilensummen als reine Integer-Arithmetik laufen.
 */
function zuTausendstel(wert, feld) {
  const roh = String(wert ?? '')
    .trim()
    .replace(',', '.');
  const m = roh.match(/^(\d{1,7})(?:\.(\d{1,3}))?$/);
  if (!m) {
    throw new ValidationError(
      `Rechnung: "${feld}" ist keine gültige Menge (${wert}), erwartet z. B. 2 oder 1.5 (max. 3 Nachkommastellen)`
    );
  }
  const tausendstel = Number(m[1]) * 1000 + Number((m[2] || '').padEnd(3, '0') || 0);
  if (tausendstel <= 0) {
    throw new ValidationError(`Rechnung: "${feld}" muss größer als 0 sein`);
  }
  return tausendstel;
}

/** Cent → "1234.56" (Punkt-Dezimal, wie EN 16931 es erwartet). */
function centZuBetrag(cent) {
  return (cent / 100).toFixed(2);
}

/**
 * Rechnet alle Summen einer Rechnung aus den Positionen.
 *
 * @param {Array<{bezeichnung:string, menge:number|string, einzelpreis_netto:number|string, ust_satz:number|string}>} positionen
 * @returns {{positionen: object[], netto_cent:number, brutto_cent:number,
 *   ust_saetze: {satz:number, basis_cent:number, betrag_cent:number}[],
 *   api: object}} `api` trägt alles als "1234.56"-Strings fürs XML/PDF.
 */
function berechneSummen(positionen) {
  if (!Array.isArray(positionen) || positionen.length === 0) {
    throw new ValidationError('Rechnung: mindestens eine Position ist erforderlich');
  }
  if (positionen.length > 100) {
    throw new ValidationError('Rechnung: höchstens 100 Positionen');
  }

  const zeilen = positionen.map((p, i) => {
    const bezeichnung = String(p.bezeichnung || '').trim();
    if (!bezeichnung) {
      throw new ValidationError(`Rechnung: Position ${i + 1} hat keine Bezeichnung`);
    }
    const mengeTausendstel = zuTausendstel(p.menge, `Position ${i + 1}: menge`);
    const einzelCent = zuCent(p.einzelpreis_netto, `Position ${i + 1}: einzelpreis_netto`);
    const satz = Number(String(p.ust_satz ?? '').replace(',', '.'));
    if (![0, 7, 19].includes(satz)) {
      throw new ValidationError(
        `Rechnung: Position ${i + 1} hat einen unbekannten USt-Satz (${p.ust_satz}), erlaubt: 0, 7, 19`
      );
    }
    // Zeilensumme: reine Integer-Arithmetik (Tausendstel × Cent / 1000),
    // kaufmännisch auf ganze Cent gerundet.
    const zeileCent = Math.round((mengeTausendstel * einzelCent) / 1000);
    return {
      bezeichnung,
      menge: mengeTausendstel / 1000,
      einheit: String(p.einheit || 'Stück').trim() || 'Stück',
      einzelpreis_cent: einzelCent,
      ust_satz: satz,
      zeilensumme_cent: zeileCent,
    };
  });

  const nettoCent = zeilen.reduce((s, z) => s + z.zeilensumme_cent, 0);

  // USt je Satz auf der SATZ-Basis gerundet (nicht je Zeile) — EN-16931-Muster.
  const jeSatz = new Map();
  for (const z of zeilen) {
    jeSatz.set(z.ust_satz, (jeSatz.get(z.ust_satz) || 0) + z.zeilensumme_cent);
  }
  const ustSaetze = [...jeSatz.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([satz, basisCent]) => ({
      satz,
      basis_cent: basisCent,
      betrag_cent: Math.round((basisCent * satz) / 100),
    }));

  const ustCent = ustSaetze.reduce((s, u) => s + u.betrag_cent, 0);
  const bruttoCent = nettoCent + ustCent;

  return {
    positionen: zeilen,
    netto_cent: nettoCent,
    ust_cent: ustCent,
    brutto_cent: bruttoCent,
    ust_saetze: ustSaetze,
    api: {
      netto: centZuBetrag(nettoCent),
      umsatzsteuer: centZuBetrag(ustCent),
      brutto: centZuBetrag(bruttoCent),
      ust_saetze: ustSaetze.map(u => ({
        satz: u.satz,
        basis: centZuBetrag(u.basis_cent),
        betrag: centZuBetrag(u.betrag_cent),
      })),
      positionen: zeilen.map(z => ({
        bezeichnung: z.bezeichnung,
        menge: z.menge,
        einheit: z.einheit,
        einzelpreis: centZuBetrag(z.einzelpreis_cent),
        ust_satz: z.ust_satz,
        zeilensumme: centZuBetrag(z.zeilensumme_cent),
      })),
    },
  };
}

module.exports = { berechneSummen, zuCent, centZuBetrag };
