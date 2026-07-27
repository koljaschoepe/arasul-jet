/**
 * Winziger 5-Feld-Cron-Auswerter (Plan 013, B8).
 *
 * Bewusst OHNE Bibliothek (Nutzer-Leitlinie „minimalistisch/wartbar zuerst",
 * dazu kein neuer Lockfile-Eintrag). Unterstützt die Felder, die ein
 * Appliance-Zeitplan realistisch braucht:
 *
 *   Minute  Stunde  Tag-des-Monats  Monat  Wochentag
 *     *       0-23/2    1,15          *      1-5
 *
 * Pro Feld erlaubt: Stern, Schrittweite (Stern-Schrägstrich-n), `a-b` (Bereich), `a,b,c`
 * (Liste) und exakte Zahlen — auch kombiniert (`1-5,15`). Wochentag: 0=Sonntag
 * … 6=Samstag (7 wird auch als Sonntag akzeptiert). Ausgewertet wird gegen die
 * LOKALE Zeit des Geräts (getHours/getDay …), damit „täglich um 8" auch 8 Uhr
 * vor Ort meint.
 *
 * Alle Funktionen sind rein und nehmen das Datum als Parameter — der Aufrufer
 * (scheduler.js) reicht `new Date()` herein, die Tests reichen feste Daten.
 */

const GRENZEN = {
  minute: [0, 59],
  stunde: [0, 23],
  tag: [1, 31],
  monat: [1, 12],
  wochentag: [0, 6],
};

/**
 * Parst EIN Cron-Feld zu der Menge erlaubter Zahlen.
 * @throws {Error} bei ungültiger Syntax (der Aufrufer prüft Cron beim Speichern).
 */
function feldMenge(feld, [min, max]) {
  const werte = new Set();
  for (const teil of String(feld).split(',')) {
    const stueck = teil.trim();
    if (stueck === '') {
      throw new Error(`Leeres Cron-Feld-Stück in „${feld}"`);
    }
    // Schrittweite: "*/n" oder "a-b/n".
    let schritt = 1;
    let basis = stueck;
    const schrittTeilung = stueck.split('/');
    if (schrittTeilung.length === 2) {
      basis = schrittTeilung[0];
      schritt = Number(schrittTeilung[1]);
      if (!Number.isInteger(schritt) || schritt < 1) {
        throw new Error(`Ungültige Schrittweite in „${stueck}"`);
      }
    } else if (schrittTeilung.length > 2) {
      throw new Error(`Mehrfaches „/" in „${stueck}"`);
    }

    let von = min;
    let bis = max;
    if (basis === '*') {
      // ganzer Bereich
    } else if (basis.includes('-')) {
      const [a, b] = basis.split('-');
      von = Number(a);
      bis = Number(b);
    } else {
      von = Number(basis);
      bis = Number(basis);
    }
    if (!Number.isInteger(von) || !Number.isInteger(bis) || von < min || bis > max || von > bis) {
      throw new Error(`Cron-Feld „${stueck}" außerhalb ${min}-${max}`);
    }
    for (let n = von; n <= bis; n += schritt) {
      werte.add(n);
    }
  }
  return werte;
}

/**
 * Parst einen 5-Feld-Cron-Ausdruck zu Mengen je Feld.
 * @returns {{minute:Set,stunde:Set,tag:Set,monat:Set,wochentag:Set}}
 * @throws {Error} bei falscher Feldzahl oder ungültigem Feld.
 */
function parseCron(ausdruck) {
  const felder = String(ausdruck).trim().split(/\s+/);
  if (felder.length !== 5) {
    throw new Error(`Cron braucht 5 Felder, hat ${felder.length}: „${ausdruck}"`);
  }
  const [minute, stunde, tag, monat, wochentag] = felder;
  // Wochentag mit Obergrenze 7 parsen, damit „7" (Sonntag) nicht abgewiesen
  // wird; danach 7 → 0 abbilden, sodass die Menge stets 0–6 führt.
  const wtMenge = feldMenge(wochentag, [0, 7]);
  if (wtMenge.has(7)) {
    wtMenge.add(0);
    wtMenge.delete(7);
  }
  return {
    minute: feldMenge(minute, GRENZEN.minute),
    stunde: feldMenge(stunde, GRENZEN.stunde),
    tag: feldMenge(tag, GRENZEN.tag),
    monat: feldMenge(monat, GRENZEN.monat),
    wochentag: wtMenge,
  };
}

/** Wahr, wenn `ausdruck` gültig ist (für die Schema-Prüfung). */
function istGueltig(ausdruck) {
  try {
    parseCron(ausdruck);
    return true;
  } catch {
    return false;
  }
}

/**
 * Passt der gegebene Zeitpunkt (auf die Minute genau) auf den Cron?
 *
 * Cron-Eigenheit, bewusst nachgebildet: Sind Tag-des-Monats UND Wochentag beide
 * eingeschränkt (keiner `*`), gilt ODER — der Lauf feuert, wenn EINES zutrifft
 * (so verhält sich Vixie-Cron). Ist eines `*`, zählt nur das andere.
 */
function passt(mengen, datum) {
  const tagFrei = mengen.tag.size === 32 - 1; // alle 1..31 → war "*"
  const wtFrei = mengen.wochentag.size >= 7; // alle 0..6 → war "*"
  const tagOk = mengen.tag.has(datum.getDate());
  const wtOk = mengen.wochentag.has(datum.getDay());
  let tagWtOk;
  if (tagFrei && wtFrei) {
    tagWtOk = true;
  } else if (tagFrei) {
    tagWtOk = wtOk;
  } else if (wtFrei) {
    tagWtOk = tagOk;
  } else {
    tagWtOk = tagOk || wtOk;
  }
  return (
    mengen.minute.has(datum.getMinutes()) &&
    mengen.stunde.has(datum.getHours()) &&
    mengen.monat.has(datum.getMonth() + 1) &&
    tagWtOk
  );
}

/**
 * Der nächste passende Zeitpunkt STRIKT nach `ab` (auf die Minute gerundet).
 *
 * Sucht minutenweise voran. Gedeckelt auf ~366 Tage: findet sich in einem Jahr
 * kein Treffer (z. B. „31. Februar"), kommt null zurück — der Aufrufer behandelt
 * das als „nie fällig" und deaktiviert den Auslöser nicht still.
 *
 * @param {string} ausdruck - 5-Feld-Cron.
 * @param {Date} ab - Startzeitpunkt (exklusiv).
 * @returns {Date|null}
 */
function naechsteFaelligkeit(ausdruck, ab) {
  const mengen = parseCron(ausdruck);
  // Auf die nächste volle Minute setzen (Sekunden/Millis weg, +1 Minute), damit
  // „strikt nach ab" gilt und wir nie denselben Tick doppelt treffen.
  const d = new Date(ab.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);

  const MAX_MINUTEN = 366 * 24 * 60;
  for (let i = 0; i < MAX_MINUTEN; i++) {
    if (passt(mengen, d)) {
      return new Date(d.getTime());
    }
    d.setMinutes(d.getMinutes() + 1);
  }
  return null;
}

module.exports = { parseCron, istGueltig, naechsteFaelligkeit, passt, feldMenge };
