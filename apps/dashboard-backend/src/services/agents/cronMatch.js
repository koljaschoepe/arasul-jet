/**
 * Minimaler 5-Feld-Cron-Matcher (Plan 010, Schritt 7).
 *
 * Standard-Cron: Minute Stunde Tag-des-Monats Monat Wochentag.
 * Unterstützt pro Feld: Sternchen, Sternchen-mit-Schritt (jede-n-te, z. B. alle
 * 5 Minuten), einzelne Zahl, Bereich a-b, Bereich-mit-Schritt und Kommalisten
 * davon. Bewusst KEIN Namens-Alias (JAN, MON …) — reine Zahlen, das reicht für
 * „kurzes Intervall setzen" und hält die Fläche klein/testbar.
 * Kein externes cron-Paket → keine neue Dependency.
 *
 * Standard-Semantik für Tag-des-Monats/Wochentag: sind BEIDE eingeschränkt
 * (kein `*`), matcht der Tag, wenn EINES von beiden passt (Cron-Konvention).
 */

const RANGES = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6], // day of week (0 = Sonntag)
];

function matchField(expr, value, min, max) {
  for (const partRaw of String(expr).split(',')) {
    const part = partRaw.trim();
    if (!part) {
      continue;
    }
    if (part === '*') {
      return true;
    }
    // range-or-star with optional step: "a-b/step", "*/step", "a/step"
    const [rangePart, stepPart] = part.split('/');
    const step = stepPart ? parseInt(stepPart, 10) : 1;
    if (!Number.isInteger(step) || step <= 0) {
      continue;
    }
    let lo;
    let hi;
    if (rangePart === '*') {
      lo = min;
      hi = max;
    } else if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-').map(n => parseInt(n, 10));
      if (!Number.isInteger(a) || !Number.isInteger(b)) {
        continue;
      }
      lo = a;
      hi = b;
    } else {
      const a = parseInt(rangePart, 10);
      if (!Number.isInteger(a)) {
        continue;
      }
      lo = a;
      hi = a;
    }
    if (value < lo || value > hi || value < min || value > max) {
      continue;
    }
    if ((value - lo) % step === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Zerlegt einen Cron-Ausdruck in genau 5 Felder oder gibt null zurück.
 * @param {string} expr
 * @returns {string[]|null}
 */
function parseCron(expr) {
  if (typeof expr !== 'string') {
    return null;
  }
  const fields = expr.trim().split(/\s+/);
  return fields.length === 5 ? fields : null;
}

/**
 * Ist der Cron-Ausdruck syntaktisch gültig (5 Felder, alle jeweils gegen ihren
 * Wertebereich matchbar)?
 * @param {string} expr
 * @returns {boolean}
 */
function isValidCron(expr) {
  const fields = parseCron(expr);
  if (!fields) {
    return false;
  }
  // Jedes Feld muss für mindestens einen Wert seines Bereichs matchen.
  return fields.every((f, i) => {
    const [min, max] = RANGES[i];
    for (let v = min; v <= max; v++) {
      if (matchField(f, v, min, max)) {
        return true;
      }
    }
    return false;
  });
}

/**
 * Passt `date` (Minutengenauigkeit) auf den Cron-Ausdruck?
 * @param {string} expr
 * @param {Date} date
 * @returns {boolean}
 */
function cronMatches(expr, date) {
  const fields = parseCron(expr);
  if (!fields) {
    return false;
  }
  const values = [
    date.getMinutes(),
    date.getHours(),
    date.getDate(),
    date.getMonth() + 1,
    date.getDay(),
  ];
  const [fMin, fHour, fDom, fMonth, fDow] = fields;
  const minuteOk = matchField(fMin, values[0], 0, 59);
  const hourOk = matchField(fHour, values[1], 0, 23);
  const monthOk = matchField(fMonth, values[3], 1, 12);
  if (!minuteOk || !hourOk || !monthOk) {
    return false;
  }
  const domStar = fDom.trim() === '*';
  const dowStar = fDow.trim() === '*';
  const domOk = matchField(fDom, values[2], 1, 31);
  const dowOk = matchField(fDow, values[4], 0, 6);
  // Beide eingeschränkt → ODER; sonst gilt das nicht-* Feld (bzw. beide *).
  if (!domStar && !dowStar) {
    return domOk || dowOk;
  }
  return domOk && dowOk;
}

module.exports = { cronMatches, isValidCron, parseCron, _internals: { matchField } };
