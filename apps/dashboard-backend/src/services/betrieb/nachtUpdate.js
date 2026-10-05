/**
 * Aktualisierung nachts auf Wunsch (M5, 04.10.2026, Auftrag update-nachts).
 *
 * Ist der Schalter an (`system_settings.update_nachts`, aus als Vorgabe) und
 * liegt eine neuere Fassung bereit, spielt das Gerät sie in einem festen
 * Nachtfenster ein. Das Einspielen selbst ist der Weg, den es schon gibt
 * (`fassungsdienst.spieleEin`): Paket holen und prüfen, VORHER sichern, die neue
 * Fassung bauen, die Gesundheit prüfen, bei einem Fehler auf die vorige Fassung
 * zurück. Hier steht nur, WANN und was der Admin am Morgen davon sieht.
 *
 * DIE REGELN, und jede steht auch im Admin-Handbuch:
 *
 *   FESTES FENSTER. Von 02:00 bis 04:00 Uhr in der Zeit des Geräts (`TZ`,
 *     Vorgabe Europe/Berlin). Es beginnt mit dem ersten Takt ab 02:00; wer um
 *     03:50 erst zurückkommt, startet nichts mehr.
 *   GENAU EINMAL JE NACHT. Das Fenster ist eine Zeile in `update_nacht_laeufe`
 *     (Datum des Beginns); wer sie anlegt, führt die Nacht aus. Ein Neustart des
 *     Backends mitten in der Nacht, die Rückkehr der Uhr bei der Zeitumstellung
 *     finden sie vor.
 *   KEINE SICHERUNG, KEIN UPDATE. Scheitert die Sicherung vorher, ändert sich
 *     nichts, und der Morgen sagt es (übersprungen).
 *   ERGEBNIS NACH DEM NEUSTART. Das Einspielen schaltet dieses Backend ab; das
 *     Ergebnis kennt erst das neue (oder, nach einem Rückfall, das alte), und es
 *     liest es aus `status.json` des Laufs. Deshalb schließt jeder Takt zuerst
 *     offene Nächte ab und prüft erst danach das Fenster.
 *   TROCKENLAUF. Prüft alles, was ein echter Lauf vorher prüft, und berichtet;
 *     er spielt nichts ein, sichert nichts und belegt das Fenster nicht.
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const { ApiError } = require('../../utils/errors');
const zeitplan = require('../flows/zeitplan');
const fassungsdienst = require('./fassungsdienst');
const sicherungsdienst = require('./sicherungsdienst');

const { MIN, ZEITZONE } = zeitplan;

const TAKT_MS = 60 * 1000;
/** Das Fenster: ab BEGINN_STUNDE (einschließlich) bis ENDE_STUNDE (ausschließlich). */
const BEGINN_STUNDE = 2;
const ENDE_STUNDE = 4;
/** Ein Lauf, der so lange nichts meldet, gilt als abgebrochen. */
const KEIN_ERGEBNIS_MS = 3 * 60 * MIN;
/** So lange steht ein Ergebnis als Hinweis auf der Startseite. */
const HINWEIS_TAGE = 3;

const zwei = n => String(n).padStart(2, '0');

/** Liegt der Zeitpunkt im Fenster? Dann das Fenster als Datum seines Beginns, sonst `null`. */
function fensterVon(ms, zone = ZEITZONE) {
  const w = zeitplan.wand(ms, zone);
  if (w.stunde < BEGINN_STUNDE || w.stunde >= ENDE_STUNDE) {
    return null;
  }
  return `${w.jahr}-${zwei(w.monat)}-${zwei(w.tag)}`;
}

/**
 * Wann das nächste Fenster beginnt und endet (ms). Liegt `ab` mitten im
 * Fenster, ist es das laufende. Gesucht wird im Viertelstundentakt: Beginn und
 * Ende liegen auf vollen Stunden, und jede Zeitzone liegt auf Viertelstunden.
 */
function naechstesFenster(ab = Date.now(), zone = ZEITZONE) {
  const viertel = 15 * MIN;
  let t = Math.floor(ab / viertel) * viertel;
  // Mitten im Fenster: zurück bis zu seinem Beginn.
  if (fensterVon(t, zone)) {
    while (fensterVon(t - viertel, zone)) {
      t -= viertel;
    }
  } else {
    t += viertel;
    // Höchstens 26 Stunden voraus; mehr braucht ein Tag samt Umstellung nie.
    for (let i = 0; i < 26 * 4 && !fensterVon(t, zone); i++) {
      t += viertel;
    }
  }
  let ende = t;
  while (fensterVon(ende, zone)) {
    ende += viertel;
  }
  return { beginn: t, ende };
}

/**
 * Die Beschreibung des Fensters, wie die Oberfläche sie zeigt. `beginn` und
 * `ende` sind IMMER das nächste Fenster, das noch nicht begonnen hat, nie eine
 * Zeit in der Vergangenheit (am 05.10.2026 um 03:02 stand dort 02:00 desselben
 * Tages). Mitten im Fenster ist `laeuftGerade` wahr und `laufendBis` das Ende
 * des laufenden Fensters: der Admin muss wissen, dass JETZT eingespielt werden
 * könnte, und wann es wieder ruhig ist; das folgende Fenster steht daneben.
 */
function fensterBeschreibung(jetzt = Date.now()) {
  const aktuell = naechstesFenster(jetzt);
  const laeuft = aktuell.beginn <= jetzt;
  const n = laeuft ? naechstesFenster(aktuell.ende) : aktuell;
  return {
    von: `${zwei(BEGINN_STUNDE)}:00`,
    bis: `${zwei(ENDE_STUNDE)}:00`,
    zeitzone: ZEITZONE,
    beginn: new Date(n.beginn).toISOString(),
    ende: new Date(n.ende).toISOString(),
    laeuftGerade: laeuft,
    laufendBis: laeuft ? new Date(aktuell.ende).toISOString() : null,
  };
}

// ---------------------------------------------------------------------------
// Schalter und Protokoll
// ---------------------------------------------------------------------------

async function istAn(datenbank = db) {
  const { rows } = await datenbank.query('SELECT update_nachts FROM system_settings WHERE id = 1');
  return rows[0]?.update_nachts === true;
}

async function setzeAn(an, datenbank = db) {
  await datenbank.query('UPDATE system_settings SET update_nachts = $1 WHERE id = 1', [
    an === true,
  ]);
  return an === true;
}

const SPALTEN = `id, fenster::text AS fenster, trocken, ergebnis, grund, von, nach, lauf, gestartet, beendet, gesehen_am`;

async function letzterLauf(datenbank = db) {
  const { rows } = await datenbank.query(
    `SELECT ${SPALTEN} FROM public.update_nacht_laeufe ORDER BY gestartet DESC, id DESC LIMIT 1`
  );
  return rows[0] || null;
}

/**
 * Was der Admin am Morgen sehen soll: das jüngste Ergebnis einer echten Nacht,
 * das noch nicht weggeklickt ist. „Nichts zu tun" und Trockenläufe sind keine
 * Nachricht.
 */
async function hinweis(datenbank = db) {
  const { rows } = await datenbank.query(
    `SELECT ${SPALTEN} FROM public.update_nacht_laeufe
      WHERE NOT trocken
        AND ergebnis IN ('eingespielt', 'uebersprungen', 'zurueckgefallen', 'fehlgeschlagen')
        AND gesehen_am IS NULL
        AND gestartet > NOW() - ($1 || ' days')::interval
      ORDER BY gestartet DESC, id DESC LIMIT 1`,
    [String(HINWEIS_TAGE)]
  );
  return rows[0] || null;
}

async function hinweisGesehen(datenbank = db) {
  await datenbank.query(
    `UPDATE public.update_nacht_laeufe SET gesehen_am = NOW()
      WHERE NOT trocken AND gesehen_am IS NULL AND ergebnis <> 'laeuft'`
  );
}

async function stand({ jetzt = Date.now(), datenbank = db } = {}) {
  const [aktiv, letzter, mitteilung] = await Promise.all([
    istAn(datenbank),
    letzterLauf(datenbank),
    hinweis(datenbank),
  ]);
  return { aktiv, fenster: fensterBeschreibung(jetzt), letzter, hinweis: mitteilung };
}

// ---------------------------------------------------------------------------
// Was ein Lauf prüft und tut
// ---------------------------------------------------------------------------

/**
 * Eine Vorprüfung, die wirft, als Ergebnis der Nacht: „nichts zu tun" ist kein
 * Fehler, alles andere ein Grund, in dieser Nacht nichts einzuspielen.
 */
function ergebnisAusFehler(fehler) {
  if (fehler instanceof ApiError) {
    return fehler.details?.keinBedarf
      ? { ergebnis: 'nichts_zu_tun', grund: fehler.message }
      : { ergebnis: 'uebersprungen', grund: fehler.message };
  }
  logger.error(`Aktualisierung nachts: unerwarteter Fehler: ${fehler.message}`);
  return {
    ergebnis: 'fehlgeschlagen',
    grund: 'Beim Prüfen ist etwas Unerwartetes schiefgegangen. Das Protokoll des Geräts nennt es.',
  };
}

/**
 * Der Trockenlauf des Ablaufs: dieselbe Vorprüfung wie das echte Einspielen,
 * dazu die Frage, ob eine Sicherung vorher möglich ist. Verändert nichts.
 *
 * @returns {Promise<{ergebnis: string, grund: string, von?: string, nach?: string}>}
 */
async function pruefeAblauf() {
  let vor;
  try {
    vor = await fassungsdienst.vorpruefung();
  } catch (fehler) {
    return ergebnisAusFehler(fehler);
  }
  const sicherung = await sicherungsdienst.status();
  if (sicherung.laeuftGerade) {
    return {
      ergebnis: 'uebersprungen',
      grund: `Es läuft gerade: ${sicherung.laeuftGerade}. Die Sicherung vorher käme nicht an die Reihe.`,
      von: vor.aktuell,
      nach: vor.ziel,
    };
  }
  if (sicherung.letzteSicherung?.status !== 'completed') {
    return {
      ergebnis: 'uebersprungen',
      grund:
        'Die letzte Sicherung ist nicht gelungen. Solange das so ist, wäre die Sicherung vor dem Einspielen unsicher, und ohne sie wird nichts eingespielt.',
      von: vor.aktuell,
      nach: vor.ziel,
    };
  }
  return {
    ergebnis: 'trockenlauf',
    grund: `Eingespielt würde ${vor.ziel} (jetzt ${vor.aktuell}); vorher würde gesichert. Es wurde nichts verändert.`,
    von: vor.aktuell,
    nach: vor.ziel,
  };
}

/** Ein Trockenlauf auf Wunsch, im Protokoll mit dem Vermerk `trocken`. */
async function trockenlauf({ datenbank = db } = {}) {
  const r = await pruefeAblauf();
  const { rows } = await datenbank.query(
    `INSERT INTO public.update_nacht_laeufe (fenster, trocken, ergebnis, grund, von, nach, beendet)
     VALUES (CURRENT_DATE, true, $1, $2, $3, $4, NOW())
     RETURNING ${SPALTEN}`,
    [r.ergebnis, r.grund, r.von ?? null, r.nach ?? null]
  );
  return rows[0];
}

async function schliesse(id, teil, datenbank = db) {
  await datenbank.query(
    `UPDATE public.update_nacht_laeufe
        SET ergebnis = $2, grund = $3, nach = COALESCE($4, nach), beendet = NOW()
      WHERE id = $1`,
    [id, teil.ergebnis, teil.grund ?? null, teil.nach ?? null]
  );
}

/** Eine Nacht ausführen, deren Zeile schon angelegt ist (`id`). */
async function fuehreAus(id, datenbank = db) {
  let vor;
  try {
    vor = await fassungsdienst.vorpruefung();
  } catch (fehler) {
    const r = ergebnisAusFehler(fehler);
    await schliesse(id, r, datenbank);
    return r.ergebnis;
  }
  try {
    const gestartet = await fassungsdienst.spieleEin({ fassung: vor.ziel, durch: 'nachts' });
    await datenbank.query(
      'UPDATE public.update_nacht_laeufe SET lauf = $2, von = $3, nach = $4 WHERE id = $1',
      [id, gestartet.lauf, gestartet.von, gestartet.nach]
    );
    logger.info(`Aktualisierung nachts: ${gestartet.von} -> ${gestartet.nach} gestartet`);
    return 'laeuft';
  } catch (fehler) {
    const r = ergebnisAusFehler(fehler);
    await schliesse(id, { ...r, nach: vor.ziel }, datenbank);
    return r.ergebnis;
  }
}

/**
 * Das Ergebnis eines Laufs aus dem Stand des Geräts. `null`, solange er läuft.
 * Ein Lauf, der vor dem Übergeben scheiterte (Paket, Sicherung), hat nichts
 * verändert und zählt als übersprungen, nicht als Fehlschlag.
 */
function ergebnisAusLauf(lauf) {
  switch (lauf.status) {
    case 'laeuft':
      return null;
    case 'fertig':
      return { ergebnis: 'eingespielt', grund: lauf.meldung || null, nach: lauf.nach };
    case 'zurueckgerollt':
      return {
        ergebnis: 'zurueckgefallen',
        grund:
          lauf.meldung ||
          'Die neue Fassung wurde nicht gesund; das Gerät läuft wieder mit der vorigen.',
        nach: lauf.nach,
      };
    case 'fehlgeschlagen':
      return ['herunterladen', 'sichern'].includes(lauf.schritt)
        ? { ergebnis: 'uebersprungen', grund: lauf.meldung || null, nach: lauf.nach }
        : { ergebnis: 'fehlgeschlagen', grund: lauf.meldung || null, nach: lauf.nach };
    default:
      return {
        ergebnis: 'fehlgeschlagen',
        grund: lauf.meldung || 'Der Lauf hat kein Ergebnis gemeldet.',
        nach: lauf.nach,
      };
  }
}

/** Offene Nächte abschließen, sobald das Gerät ihr Ergebnis kennt. */
async function schliesseOffeneAb({ jetzt = Date.now(), datenbank = db } = {}) {
  const { rows } = await datenbank.query(
    `SELECT id, lauf, gestartet FROM public.update_nacht_laeufe
      WHERE ergebnis = 'laeuft' ORDER BY id`
  );
  for (const zeile of rows) {
    const alt = jetzt - new Date(zeile.gestartet).getTime();
    if (!zeile.lauf) {
      // Der Aufruf, der den Lauf startet, schreibt die Kennung gleich danach.
      if (alt > 30 * MIN) {
        await schliesse(
          zeile.id,
          { ergebnis: 'fehlgeschlagen', grund: 'Die Nacht wurde nicht zu Ende geführt.' },
          datenbank
        );
      }
      continue;
    }
    const geraet = await fassungsdienst.stand();
    const lauf = geraet.lauf;
    if (!lauf || lauf.lauf !== zeile.lauf) {
      if (alt > KEIN_ERGEBNIS_MS) {
        await schliesse(
          zeile.id,
          { ergebnis: 'fehlgeschlagen', grund: 'Der Lauf hat kein Ergebnis hinterlassen.' },
          datenbank
        );
      }
      continue;
    }
    const r = ergebnisAusLauf(lauf);
    if (r) {
      await schliesse(zeile.id, r, datenbank);
      logger.info(`Aktualisierung nachts: ${r.ergebnis} (${lauf.von} -> ${lauf.nach})`);
    }
  }
}

/**
 * Ein Takt. Zuerst offene Nächte abschließen, dann: im Fenster, an und noch
 * nicht belegt -> die Nacht ausführen.
 *
 * @returns {Promise<string|null>} das Ergebnis dieses Takts, `null` wenn nichts anlag
 */
async function takt({ jetzt = Date.now(), datenbank = db } = {}) {
  await schliesseOffeneAb({ jetzt, datenbank });
  const fenster = fensterVon(jetzt);
  if (!fenster || !(await istAn(datenbank))) {
    return null;
  }
  const { rows } = await datenbank.query(
    `INSERT INTO public.update_nacht_laeufe (fenster, ergebnis)
     VALUES ($1, 'laeuft')
     ON CONFLICT (fenster) WHERE NOT trocken DO NOTHING
     RETURNING id`,
    [fenster]
  );
  if (rows.length === 0) {
    return null;
  }
  return fuehreAus(rows[0].id, datenbank);
}

let laeuft = false;

/** Den Takt starten; gibt den Zeitgeber für das geordnete Beenden zurück. */
function starten() {
  const einmal = async () => {
    if (laeuft) {
      return;
    }
    laeuft = true;
    try {
      await takt();
    } catch (fehler) {
      logger.warn(`Aktualisierung nachts: Takt gescheitert: ${fehler.message}`);
    } finally {
      laeuft = false;
    }
  };
  const zeitgeber = setInterval(einmal, TAKT_MS);
  const erster = setTimeout(einmal, 20_000);
  erster.unref?.();
  zeitgeber.unref?.();
  return zeitgeber;
}

module.exports = {
  stand,
  istAn,
  setzeAn,
  hinweisGesehen,
  trockenlauf,
  takt,
  starten,
  // fuer Tests
  fensterVon,
  naechstesFenster,
  fensterBeschreibung,
  ergebnisAusLauf,
  schliesseOffeneAb,
  BEGINN_STUNDE,
  ENDE_STUNDE,
};
