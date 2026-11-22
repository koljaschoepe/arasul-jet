/**
 * Was die Werkstatt ueber die Apps des Geraets wissen muss (J44, M7; bis J52
 * Entwickler-Cockpit).
 *
 * Eine Abfrage fuer zwei Ansichten der Werkstatt (nur mit dem Recht dazu):
 *
 *   Apps          je App die Fassung in Test und Live, zuletzt geaendert,
 *                 die Zahl offener Meldungen (neu und angenommen)
 *   Test nach Live  was in der Testfassung neuer ist als live: eine Fassung
 *                 im Teststand, die nicht die des Livestands ist, mit ihrem
 *                 Aenderungstext und der Zahl umgesetzter Meldungen
 *
 * Geschaltet wird nicht hier, sondern ueber denselben Weg wie in der
 * Verwaltung (`POST /api/apps/:id/schalten` -> `liveSchalten.js`): Sicherung
 * vorher, Rueckfall, ein Eintrag in `app_schaltungen`. Kein zweiter
 * Mechanismus.
 *
 * Gelesen wird ueber ALLE Apps des Geraets, nicht nur die freigegebenen: wer
 * das Recht in der Werkstatt hat (Kennzeichen Entwickler), baut die Apps
 * dieses Hauses. Die Pruefung des Rechts steht an der Route.
 */

const db = require('../../database');
const mitgeliefert = require('./mitgeliefert');

/** Ein Stand so, wie die Werkstatt ihn zeigt, oder `null`. */
function stand(version, eingespieltAm, aenderungstext, vorigeVersion = null) {
  if (!version) {
    return null;
  }
  return {
    version,
    eingespielt_am: eingespieltAm ?? null,
    aenderungstext: aenderungstext ?? null,
    // Wohin `{"ziel":"zurueck"}` fuehrte; `null`, wenn es kein Vorher gibt.
    vorige_version: vorigeVersion ?? null,
  };
}

/** Der spaetere von zwei Zeitpunkten, oder `null`. */
function spaeter(a, b) {
  if (!a) {
    return b ?? null;
  }
  if (!b) {
    return a;
  }
  return new Date(a) > new Date(b) ? a : b;
}

/**
 * Ist im Teststand etwas, das live noch fehlt? Eine Fassung im Test, die nicht
 * die des Livestands ist -- auch die erste, wenn es noch keinen Livestand
 * gibt. Nach dem Schalten stehen beide auf derselben Fassung, und die App
 * faellt aus der Liste.
 */
function testIstNeuer(live, test) {
  return Boolean(test) && (!live || live.version !== test.version);
}

/**
 * Die Apps fuer die Werkstatt, nach Namen. Die mitgelieferten stehen am Ende:
 * sie haben nur einen Livestand, kommen mit Arasul und werden nie geschaltet,
 * aber auch zu ihnen gibt es Meldungen.
 *
 * @returns {Promise<object[]>}
 */
async function apps() {
  const { rows } = await db.query(
    `SELECT a.id, a.name,
            l.version AS live_version, l.eingespielt_am AS live_am,
            l.aenderungstext AS live_text, l.manifest AS live_manifest,
            l.vorige_version AS live_vorige,
            t.version AS test_version, t.eingespielt_am AS test_am,
            t.aenderungstext AS test_text, t.manifest AS test_manifest,
            s.ergebnis AS schaltung_ergebnis, s.satz AS schaltung_satz,
            s.nach_version AS schaltung_nach, s.begonnen_am AS schaltung_am
       FROM public.apps a
       LEFT JOIN public.app_staende l ON l.app_id = a.id AND l.stand = 'live'
       LEFT JOIN public.app_staende t ON t.app_id = a.id AND t.stand = 'test'
       LEFT JOIN LATERAL (
         SELECT ergebnis, satz, nach_version, begonnen_am
           FROM public.app_schaltungen
          WHERE app_id = a.id
            AND (ergebnis <> 'laeuft' OR begonnen_am > NOW() - INTERVAL '30 minutes')
          ORDER BY begonnen_am DESC, id DESC
          LIMIT 1
       ) s ON true
      ORDER BY a.name`
  );

  // Die Zahlen je App in EINER Abfrage, auch fuer Apps, die es nicht mehr
  // gibt, und fuer die mitgelieferten (die stehen nicht in `apps`).
  const { rows: zahlen } = await db.query(
    `SELECT app_id,
            COUNT(*) FILTER (WHERE stand_meldung IN ('neu', 'angenommen'))::int AS offen,
            COUNT(*) FILTER (WHERE stand_meldung = 'neu')::int AS neu,
            COUNT(*) FILTER (WHERE stand_meldung = 'umgesetzt')::int AS umgesetzt,
            MAX(erstellt_am) AS letzte_meldung
       FROM public.rueckmeldungen
      GROUP BY app_id`
  );
  const jeApp = new Map(zahlen.map(z => [z.app_id, z]));
  const leer = { offen: 0, neu: 0, umgesetzt: 0, letzte_meldung: null };

  const liste = rows.map(z => {
    const live = stand(z.live_version, z.live_am, z.live_text, z.live_vorige);
    const test = stand(z.test_version, z.test_am, z.test_text);
    const m = jeApp.get(z.id) ?? leer;
    return {
      id: z.id,
      name: z.name,
      symbol: z.live_manifest?.symbol ?? z.test_manifest?.symbol ?? null,
      mitgeliefert: false,
      live,
      test,
      zuletzt_geaendert: spaeter(live?.eingespielt_am, test?.eingespielt_am),
      test_neuer: testIstNeuer(live, test),
      meldungen: { offen: m.offen, neu: m.neu, umgesetzt: m.umgesetzt },
      letzte_schaltung: z.schaltung_ergebnis
        ? {
            ergebnis: z.schaltung_ergebnis,
            satz: z.schaltung_satz ?? null,
            nach_version: z.schaltung_nach,
            am: z.schaltung_am,
          }
        : null,
    };
  });

  for (const appId of Object.keys(mitgeliefert.BEKANNT)) {
    const manifest = mitgeliefert.manifest(appId);
    const m = jeApp.get(appId) ?? leer;
    liste.push({
      id: appId,
      name: manifest?.name ?? mitgeliefert.BEKANNT[appId].name,
      symbol: manifest?.symbol ?? mitgeliefert.BEKANNT[appId].symbol,
      mitgeliefert: true,
      live: manifest ? stand(manifest.version, null, null) : null,
      test: null,
      zuletzt_geaendert: null,
      test_neuer: false,
      meldungen: { offen: m.offen, neu: m.neu, umgesetzt: m.umgesetzt },
      letzte_schaltung: null,
    });
  }
  return liste;
}

module.exports = { apps, testIstNeuer };
