/**
 * Zeitplan-Ausdruecke lesen und auswerten (M5, 04.10.2026, Auftrag
 * zeitplaner-im-geraet).
 *
 * Reine Rechnung, ohne Datenbank und ohne Uhr: `zeitplaner.js` fragt, wann ein
 * Termin faellig ist, und startet dann den Lauf. Hier steht nur, WAS ein
 * Ausdruck bedeutet.
 *
 * FUENF FELDER wie in cron: Minute (0-59), Stunde (0-23), Tag (1-31), Monat
 * (1-12), Wochentag (0-7, 0 und 7 sind Sonntag). Jedes Feld ist eine Liste aus
 * `*`, einer Zahl, einem Bereich `a-b`, jeweils mit Schrittweite `/n`. Namen
 * (`MON`, `JAN`) gibt es nicht: das Schema (`schemas/flows.js`) laesst nur
 * Ziffern und `* / , -` zu. Sind Tag UND Wochentag eingeschraenkt (keines
 * beginnt mit `*`), genuegt EINES von beiden, wie in cron; sonst muessen alle
 * passen.
 *
 * ZEITZONE. Ein Ausdruck gilt in der Uhrzeit des Geraets (`ZEITZONE`, aus `TZ`,
 * sonst Europe/Berlin), nicht in UTC. Sommer- und Winterzeit regeln zwei
 * Saetze, und sie gelten fuer jede Zone:
 *
 *   - Eine Uhrzeit, die es in der Nacht der Umstellung auf Sommerzeit nicht
 *     gibt (02:30 springt auf 03:00), laeuft EINMAL, in der ersten Minute
 *     danach. Ein Zeitplan "30 2 * * *" faellt also nicht aus.
 *   - Eine Uhrzeit, die es in der Nacht zur Winterzeit ZWEIMAL gibt (02:30
 *     kommt zweimal), laeuft nur beim ERSTEN Mal. Ein Zeitplan laeuft nicht
 *     doppelt, weil die Uhr zurueckgestellt wurde.
 *
 * Gerechnet wird in ganzen Minuten seit 1970 (UTC, `ms`), die Uhrzeit der Zone
 * liest `Intl` ab. Eine eigene Zeitzonen-Tabelle gibt es nicht: die Regeln
 * stehen im Betriebssystem des Containers und aendern sich dort.
 */

const { ValidationError } = require('../../utils/errors');

const MIN = 60 * 1000;
const TAG = 24 * 60 * MIN;

/** Die Zeitzone, in der Zeitplaene gelten. */
const ZEITZONE = process.env.TZ || 'Europe/Berlin';

const GRENZEN = [
  { name: 'Minute', min: 0, max: 59 },
  { name: 'Stunde', min: 0, max: 23 },
  { name: 'Tag', min: 1, max: 31 },
  { name: 'Monat', min: 1, max: 12 },
  { name: 'Wochentag', min: 0, max: 7 },
];

/** Ein Feld in die Menge der erlaubten Werte aufloesen. */
function leseFeld(text, grenze) {
  const werte = new Set();
  for (const teil of text.split(',')) {
    const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(teil);
    if (!m) {
      throw new ValidationError(`${grenze.name}: "${teil}" ist kein gültiger Teil`);
    }
    const schritt = m[4] === undefined ? 1 : Number(m[4]);
    if (schritt < 1) {
      throw new ValidationError(`${grenze.name}: die Schrittweite ist mindestens 1`);
    }
    let von;
    let bis;
    if (m[1] === '*') {
      von = grenze.min;
      bis = grenze.max;
    } else {
      von = Number(m[2]);
      bis = m[3] === undefined ? (m[4] === undefined ? von : grenze.max) : Number(m[3]);
    }
    if (von < grenze.min || bis > grenze.max || von > bis) {
      throw new ValidationError(
        `${grenze.name}: "${teil}" liegt außerhalb von ${grenze.min} bis ${grenze.max}`
      );
    }
    for (let w = von; w <= bis; w += schritt) {
      werte.add(grenze.name === 'Wochentag' && w === 7 ? 0 : w);
    }
  }
  return werte;
}

/**
 * Einen Ausdruck lesen.
 *
 * @param {string} ausdruck fuenf Felder, durch ein Leerzeichen getrennt
 * @returns {{minute:Set<number>, stunde:Set<number>, tag:Set<number>,
 *   monat:Set<number>, wochentag:Set<number>, tagOderWochentag:boolean}}
 * @throws {ValidationError} mit der Stelle, die nicht stimmt
 */
function lese(ausdruck) {
  const felder = String(ausdruck).trim().split(/\s+/);
  if (felder.length !== 5) {
    throw new ValidationError('Ein Zeitplan hat fünf Felder: Minute Stunde Tag Monat Wochentag');
  }
  const [minute, stunde, tag, monat, wochentag] = felder.map((f, i) => leseFeld(f, GRENZEN[i]));
  return {
    minute,
    stunde,
    tag,
    monat,
    wochentag,
    tagOderWochentag: !felder[2].startsWith('*') && !felder[4].startsWith('*'),
    // Eine feste Uhrzeit (Minute UND Stunde ohne `*` vorn) laeuft in der
    // wiederholten Stunde nicht noch einmal; "jede Minute" oder "alle 30
    // Minuten in der Stunde 2" laufen durch, wie in cron.
    fest: !felder[0].startsWith('*') && !felder[1].startsWith('*'),
  };
}

const formate = new Map();
function formatFuer(zone) {
  if (!formate.has(zone)) {
    formate.set(
      zone,
      new Intl.DateTimeFormat('en-GB', {
        timeZone: zone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
      })
    );
  }
  return formate.get(zone);
}

/**
 * Die Uhrzeit der Zone zu einem Zeitpunkt.
 *
 * `lokal` ist die Wanduhr als "Minuten seit 1970, als waere sie UTC": zwei
 * aufeinanderfolgende Minuten unterscheiden sich um 1, ausser an einer
 * Umstellung (vorwaerts mehr, rueckwaerts weniger).
 */
function wand(ms, zone = ZEITZONE) {
  const t = {};
  for (const { type, value } of formatFuer(zone).formatToParts(new Date(ms))) {
    if (type !== 'literal') {
      t[type] = Number(value);
    }
  }
  const lokal = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute) / MIN;
  return {
    jahr: t.year,
    monat: t.month,
    tag: t.day,
    stunde: t.hour,
    minute: t.minute,
    wochentag: new Date(lokal * MIN).getUTCDay(),
    lokal,
  };
}

function passt(plan, w) {
  if (!plan.minute.has(w.minute) || !plan.stunde.has(w.stunde) || !plan.monat.has(w.monat)) {
    return false;
  }
  const tagOk = plan.tag.has(w.tag);
  const wochentagOk = plan.wochentag.has(w.wochentag);
  return plan.tagOderWochentag ? tagOk || wochentagOk : tagOk && wochentagOk;
}

/** Die Wanduhr zu einem "lokal" (Minuten seit 1970 als UTC) in Feldern. */
function ausLokal(lokal) {
  const d = new Date(lokal * MIN);
  return {
    jahr: d.getUTCFullYear(),
    monat: d.getUTCMonth() + 1,
    tag: d.getUTCDate(),
    stunde: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    wochentag: d.getUTCDay(),
    lokal,
  };
}

/** Zeigte die Wanduhr diese Minute in den drei Stunden davor schon einmal? */
function schonGewesen(t, lokal, zone) {
  for (let k = 1; k <= 180; k++) {
    if (wand(t - k * MIN, zone).lokal === lokal) {
      return true;
    }
  }
  return false;
}

/**
 * Welche der Termine in (von, bis] faellig sind, aufsteigend, als ganze Minuten.
 *
 * `von` zaehlt nicht mehr dazu, `bis` schon: wer bis 10:00 gesehen hat, fragt
 * danach ab 10:01. Beide muessen auf einer vollen Minute liegen.
 *
 * @param {object[]} plaene gelesene Ausdruecke (`lese`)
 * @returns {number[]} Zeitpunkte in ms
 */
function faellige(plaene, von, bis, zone = ZEITZONE) {
  const gefunden = [];
  let davor = wand(von, zone);
  for (let t = von + MIN; t <= bis; t += MIN) {
    const jetzt = wand(t, zone);
    const sprung = jetzt.lokal - davor.lokal;
    davor = jetzt;

    // Vorwaerts gestellt: die uebersprungenen Minuten gelten jetzt, einmal.
    let treffer = plaene.filter(p => passt(p, jetzt));
    for (let s = 1; treffer.length === 0 && s < sprung; s++) {
      treffer = plaene.filter(p => passt(p, ausLokal(jetzt.lokal - s)));
    }
    // Zurueckgestellt: diese Wanduhrzeit gab es kurz zuvor schon einmal.
    if (treffer.length > 0 && (treffer.some(p => !p.fest) || !schonGewesen(t, jetzt.lokal, zone))) {
      gefunden.push(t);
    }
  }
  return gefunden;
}

/** Der Versatz der Zone zu UTC in ms an einem Zeitpunkt. */
function versatz(ms, zone) {
  return wand(ms, zone).lokal * MIN - Math.floor(ms / MIN) * MIN;
}

/**
 * Die Zeitpunkte, an denen die Wanduhr `lokal` zeigt, aufsteigend. Meist einer;
 * in der Nacht zur Winterzeit zwei (die Stunde kommt zweimal); gibt es sie
 * nicht (uebersprungene Stunde), die erste Minute danach.
 */
function wandZuZeitpunkten(lokal, zone) {
  const roh = lokal * MIN;
  const kandidaten = [
    ...new Set(
      [roh - TAG, roh + TAG]
        .map(ref => roh - versatz(ref, zone))
        .filter(t => wand(t, zone).lokal === lokal)
    ),
  ].sort((a, b) => a - b);
  if (kandidaten.length > 0) {
    return kandidaten;
  }
  // Luecke: ab dort suchen, wo die Wanduhr `lokal` ueberschreitet.
  const mitte = roh - versatz(roh, zone);
  for (let t = mitte - 3 * 60 * MIN; t <= mitte + 3 * 60 * MIN; t += MIN) {
    if (wand(t, zone).lokal >= lokal) {
      return [t];
    }
  }
  return [mitte];
}

/**
 * Die naechste Wanduhr ab `w` (einschliesslich), die zum Plan passt, oder null,
 * wenn bis `ende` keine kommt.
 */
function naechsteWand(plan, w, ende) {
  let zaehler = 0;
  while (zaehler++ < 100000) {
    const tagLokal = Math.floor(w.lokal / 1440) * 1440;
    if (!plan.monat.has(w.monat)) {
      w = ausLokal(Date.UTC(w.jahr, w.monat, 1) / MIN);
    } else if (
      !(plan.tagOderWochentag
        ? plan.tag.has(w.tag) || plan.wochentag.has(w.wochentag)
        : plan.tag.has(w.tag) && plan.wochentag.has(w.wochentag))
    ) {
      w = ausLokal(tagLokal + 1440);
    } else if (!plan.stunde.has(w.stunde)) {
      w = ausLokal(w.lokal - w.minute + 60);
    } else if (!plan.minute.has(w.minute)) {
      w = ausLokal(w.lokal + 1);
    } else {
      return w;
    }
    if (w.lokal * MIN > ende + TAG) {
      return null;
    }
  }
  return null;
}

/**
 * Der naechste Termin nach `ab` (ohne `ab` selbst), oder null, wenn in den
 * naechsten vier Jahren keiner kommt (etwa "0 0 30 2 *").
 *
 * Springt ueber Monate, Tage und Stunden statt Minuten zu zaehlen: ein Zeitplan
 * "0 6 1 1 *" soll nicht eine halbe Million Schritte kosten.
 */
function naechster(plaene, ab, zone = ZEITZONE) {
  ab = Math.floor(ab / MIN) * MIN;
  let besten = null;
  const ende = ab + 4 * 366 * TAG;
  // Stellt die Uhr in den naechsten drei Stunden um, zaehlt dort Minute fuer
  // Minute dieselbe Regel wie im Zeitplaner (`faellige`): eine Wanduhr, die
  // zurueckspringt, findet die Suche nach Wanduhrzeit sonst nicht. Sonst nicht,
  // denn das kostet 180 Schritte je Plan und Anzeige.
  const umstellungBald = versatz(ab, zone) !== versatz(ab + 3 * 60 * MIN, zone);
  for (const plan of plaene) {
    if (!plan.fest && passt(plan, wand(ab + MIN, zone))) {
      besten = besten === null ? ab + MIN : Math.min(besten, ab + MIN);
      continue;
    }
    if (umstellungBald) {
      const t = faellige([plan], ab, ab + 3 * 60 * MIN, zone)[0];
      if (t !== undefined) {
        besten = besten === null ? t : Math.min(besten, t);
        continue;
      }
    }
    // Ab der Wanduhr nach `ab` suchen, und jede gefundene in einen Zeitpunkt
    // umrechnen. Liegt der nicht nach `ab`, war es die Wanduhrzeit vor einer
    // Rueckstellung: ein fester Plan lief da schon (nur beim ERSTEN Mal, wie
    // in `faellige`), also weiter zur naechsten; ein Plan mit Stern laeuft
    // auch beim zweiten Mal (Befund 11 der zweiten Pruefung, 05.10.2026: bis
    // dahin hiess es hier "in einer Minute").
    let w = ausLokal(wand(ab, zone).lokal + 1);
    for (let runde = 0; runde < 4 && w; runde++) {
      w = naechsteWand(plan, w, ende);
      if (!w) {
        break;
      }
      const zeitpunkte = wandZuZeitpunkten(w.lokal, zone);
      const t = (plan.fest ? zeitpunkte.slice(0, 1) : zeitpunkte).find(z => z > ab);
      if (t !== undefined) {
        if (t <= ende && (besten === null || t < besten)) {
          besten = t;
        }
        break;
      }
      w = ausLokal(w.lokal + 1);
    }
  }
  return besten;
}

module.exports = { MIN, ZEITZONE, lese, wand, faellige, naechster };
