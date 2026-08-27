/**
 * Die Apps am Geraet (Phase C3 des Umbaus vom 26.08.2026).
 *
 * Hier laufen die drei Wahrheiten zusammen, aus denen eine App besteht:
 *
 *   die Platte      `/arasul/apps/<id>/<version>/` — was da ist  (appManifest.js)
 *   die Datenbank   `apps` und `app_staende`      — was gilt
 *   Docker          `arasul-app-<id>-<stand>`     — was laeuft   (appContainer.js)
 *
 * Keine davon ist Kopie einer anderen. Die Datenbank sagt nicht, ob ein
 * Container laeuft (das weiss Docker), und Docker sagt nicht, welche Version
 * live ist (das weiss die Datenbank). Der alte AppStore fuehrte beides in einer
 * Spalte `status` mit zehn Werten mit; sie stand regelmaessig auf `running`,
 * waehrend es den Container nicht mehr gab.
 *
 * Zwei Staende je App: `live` ist der Stand fuer alle Freigegebenen,
 * `test` der fuer die Tester. Umgeschaltet wird mit `schalte` (Phase C5).
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const { ConflictError, NotFoundError } = require('../../utils/errors');
const appManifest = require('./appManifest');
const appContainer = require('./appContainer');
const appSchluessel = require('./appSchluessel');
const appFlows = require('./appFlows');

/** Die Staende einer App, als `{ test, live }` mit `null`, wo keiner ist. */
async function staendeVon(appId) {
  const result = await db.query(
    `SELECT stand, version, vorige_version, manifest, eingespielt_am, eingespielt_von
       FROM public.app_staende WHERE app_id = $1`,
    [appId]
  );
  const staende = { test: null, live: null };
  for (const zeile of result.rows) {
    staende[zeile.stand] = zeile;
  }
  return staende;
}

/**
 * Alle Apps mit ihren beiden Staenden.
 *
 * Der Zustand der Container kommt aus Docker und wird je Stand einzeln
 * geholt. Bei einem Geraet mit einer Handvoll Apps sind das eine Handvoll
 * Abfragen an den Docker-Proxy; sie zwischenzuspeichern hiesse, eine gestorbene
 * App noch eine Minute lang als laufend zu melden.
 */
async function listeApps() {
  const result = await db.query(
    `SELECT a.id, a.name, a.beschreibung, a.angelegt_am, a.geaendert_am,
            s.stand, s.version, s.manifest, s.eingespielt_am
       FROM public.apps a
       LEFT JOIN public.app_staende s ON s.app_id = a.id
      ORDER BY a.id, s.stand`
  );

  const apps = new Map();
  for (const zeile of result.rows) {
    if (!apps.has(zeile.id)) {
      apps.set(zeile.id, {
        id: zeile.id,
        name: zeile.name,
        beschreibung: zeile.beschreibung,
        angelegt_am: zeile.angelegt_am,
        geaendert_am: zeile.geaendert_am,
        staende: { test: null, live: null },
      });
    }
    if (zeile.stand) {
      apps.get(zeile.id).staende[zeile.stand] = {
        version: zeile.version,
        eingespielt_am: zeile.eingespielt_am,
        backend: zeile.manifest.backend ? await appContainer.zustand(zeile.id, zeile.stand) : null,
      };
    }
  }
  return [...apps.values()];
}

/**
 * Eine App mit allem, was das Geraet ueber sie weiss: beide Staende, die
 * Versionen auf der Platte, ob die geforderten Modelle da sind und welche
 * Flows in welchem Stand registriert sind.
 */
async function holeApp(appId) {
  const zeile = await db.query('SELECT * FROM public.apps WHERE id = $1', [appId]);
  if (zeile.rows.length === 0) {
    throw new NotFoundError(`App ${appId} gibt es am Geraet nicht`);
  }
  const staende = await staendeVon(appId);
  const ergebnis = {
    ...zeile.rows[0],
    versionen: await appManifest.listeVersionen(appId),
    staende: { test: null, live: null },
  };
  for (const stand of ['test', 'live']) {
    if (!staende[stand]) {
      continue;
    }
    const manifest = staende[stand].manifest;
    ergebnis.staende[stand] = {
      version: staende[stand].version,
      vorige_version: staende[stand].vorige_version,
      eingespielt_am: staende[stand].eingespielt_am,
      eingespielt_von: staende[stand].eingespielt_von,
      manifest,
      pfad: manifest.frontend
        ? stand === 'test'
          ? `/apps/${appId}/test/`
          : `/apps/${appId}/`
        : null,
      api: manifest.backend ? `${appContainer.apiPfad(appId, stand)}/` : null,
      backend: manifest.backend ? await appContainer.zustand(appId, stand) : null,
      modelle: await modellStand(manifest.modelle),
      // Die Flows dieses Standes -- registriert, nicht gefordert (C6). Bis C5
      // stand hier die Antwort auf "liegt der Flow, den das Manifest nennt,
      // am Geraet"; seit C6 bringt das Paket sie mit, und die Frage stellt
      // sich nicht mehr.
      flows: await appFlows.liste({ appId, stand }),
    };
  }
  return ergebnis;
}

/**
 * Welche der im Manifest genannten Modelle am Geraet installiert sind.
 *
 * Nachinstalliert wird nichts: ein Deploy, der nebenbei sieben Gigabyte laedt,
 * ist keine Installation mehr, sondern ein Abend. Das Geraet sagt, was fehlt;
 * der Administrator holt es ueber die Modellverwaltung.
 */
async function modellStand(namen) {
  if (!namen || namen.length === 0) {
    return [];
  }
  const result = await db.query(
    `SELECT id FROM public.llm_installed_models
      WHERE id = ANY($1::text[]) AND status = 'available'`,
    [namen]
  );
  const da = new Set(result.rows.map(r => r.id));
  return namen.map(name => ({ name, vorhanden: da.has(name) }));
}

/**
 * Eine Version in einen Stand einspielen.
 *
 * Die Reihenfolge ist die vorsichtige: erst lesen und pruefen, was auf der
 * Platte liegt, dann den Container starten, erst danach den STAND schreiben.
 * Ein Stand, der in der Datenbank steht, ist damit einer, der wirklich
 * hochgekommen ist. Andersherum haette ein kaputtes Image eine Zeile
 * hinterlassen, die eine App verspricht, die es nicht gibt.
 *
 * Die Zeile in `apps` selbst ist seit C4 die eine Ausnahme davon, und sie hat
 * einen Grund: der API-Schluessel der App haengt als Fremdschluessel an ihr,
 * und er muss im Container stehen, bevor der startet. Scheitert der Start,
 * wird sie wieder weggeraeumt -- aber nur, wenn dieser Aufruf sie angelegt
 * hat.
 *
 * Der Container wird ersetzt, nicht neu gestartet — die Begruendung steht in
 * `appContainer.starte`.
 */
async function spieleEin({ appId, version, stand, durch }) {
  const manifest = await appManifest.leseManifest(appId, version);
  const neueApp = await pruefeAppGrenze(manifest.id);
  if (manifest.frontend) {
    await appManifest.frontendVerzeichnis(manifest);
  }

  // Das Image, bevor irgendetwas Bestehendes angefasst wird (Phase C4).
  // `starte` sorgt ohnehin dafuer, aber erst nachdem der Schluessel schon
  // gewechselt ist -- und ein Image, das nicht kommt, haette dann einer
  // laufenden App den Schluessel unter den Fuessen weggezogen. Der zweite
  // Aufruf in `starte` findet es dann da und tut nichts.
  //
  // Seit C5 kann „sorgen fuer" heissen: hier bauen. Welcher der beiden Wege
  // gilt, sagt das Manifest (`backend.bauen`), nicht der Aufrufer.
  const versionsPfad = appManifest.verzeichnisFuer(manifest.id, manifest.version);
  if (manifest.backend) {
    await appContainer.sorgeFuerImage(manifest, versionsPfad);
  }

  // Die Zeile in `apps` muss VOR den Schluessel: der haengt als
  // Fremdschluessel an ihr (Migration 171).
  await db.query(
    `INSERT INTO public.apps (id, name, beschreibung)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            beschreibung = EXCLUDED.beschreibung,
            geaendert_am = NOW()`,
    [manifest.id, manifest.name, manifest.beschreibung ?? null]
  );

  try {
    if (manifest.backend) {
      // Je Stand ein frischer Schluessel, und er geht nur in EINE Richtung:
      // in die Umgebung dieses Containers. Danach gibt es ihn nur noch als
      // bcrypt-Abdruck (`services/app/appSchluessel.js`).
      const schluessel = await appSchluessel.erneuere({ appId: manifest.id, stand, durch });
      await appContainer.starte(
        manifest,
        stand,
        appSchluessel.umgebungFuer(schluessel),
        versionsPfad
      );
    }
  } catch (fehler) {
    // Was nur wegen dieses Versuchs entstanden ist, faellt wieder weg: eine
    // App, die es vorher nicht gab, wuerde sonst als leere Zeile stehen
    // bleiben und dauerhaft einen Platz der Lizenzgrenze belegen. Der DELETE
    // nimmt ueber ON DELETE CASCADE auch den eben angelegten Schluessel mit.
    if (neueApp) {
      await db.query('DELETE FROM public.apps WHERE id = $1', [manifest.id]);
    }
    throw fehler;
  }

  // `vorige_version` (Migration 172) entsteht HIER und nicht im Schalter: sie
  // gilt fuer jeden Weg, auf dem sich ein Stand aendert -- Deploy, Schalter,
  // Sitzungsroute -- und eine Buchfuehrung, die nur einer der drei Wege
  // fuehrt, waere beim naechsten Weg falsch. Nur wenn sich die Version
  // wirklich aendert: dieselbe Version noch einmal einzuspielen (der Schalter
  // nach live tut genau das) darf die Erinnerung nicht ueberschreiben.
  const gespeichert = await db.query(
    `INSERT INTO public.app_staende (app_id, stand, version, manifest, eingespielt_von)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (app_id, stand) DO UPDATE
        SET version = EXCLUDED.version,
            vorige_version = CASE
              WHEN public.app_staende.version <> EXCLUDED.version
                THEN public.app_staende.version
              ELSE public.app_staende.vorige_version
            END,
            manifest = EXCLUDED.manifest,
            eingespielt_am = NOW(),
            eingespielt_von = EXCLUDED.eingespielt_von
     RETURNING app_id, stand, version, vorige_version, eingespielt_am`,
    [manifest.id, stand, manifest.version, manifest, durch ?? null]
  );

  // Die Flows dieses Standes (C6). NACH dem Stand und nicht davor: sie
  // gehoeren zu einer Version, die wirklich eingespielt ist. Waere es
  // andersherum, haette ein Container, der nicht hochkommt, die Flows der
  // neuen Fassung hinterlassen und den Stand der alten -- und der naechste
  // Aufruf haette den Flow einer Version gestartet, die nirgends laeuft.
  //
  // Die Ueberschreibungen des Administrators (`flow_settings`) fasst das
  // NICHT an. Genau dafuer stehen sie in einer eigenen Tabelle.
  //
  // Auch OHNE `flows` im Manifest wird registriert -- dann mit einem leeren
  // Ergebnis. Der Aufruf raeumt damit weg, was eine VORIGE Version in diesem
  // Stand mitgebracht hat; ohne ihn blieben Flows startbar, die die laufende
  // Fassung nicht mehr kennt.
  const flows = await appFlows.registriere({
    appId: manifest.id,
    stand,
    version: manifest.version,
    manifest,
    versionsPfad,
  });

  logger.info(
    `App eingespielt: ${appId} ${version} nach ${stand}` +
      `${flows.length ? ` (${flows.length} Flow(s))` : ''}`
  );
  return { ...gespeichert.rows[0], flows };
}

/**
 * Den Livestand schalten (Phase C5).
 *
 * Zwei Richtungen, ein Vorgang:
 *
 *   `live`     die Version aus dem Teststand wird die Version des Livestandes
 *   `zurueck`  die Version, die vor der jetzigen live war, wird es wieder
 *
 * Beides geht durch `spieleEin` und nicht an ihm vorbei. Ein Schalter, der
 * nur eine Zeile in `app_staende` umschriebe, haette einen Livestand
 * versprochen, dessen Container noch die alte Version faehrt -- und der
 * API-Schluessel des Standes gehoerte weiter zum Container, der eben ersetzt
 * wurde. „Schalten" heisst: diese Version laeuft jetzt im Livestand, mit
 * allem, was dazugehoert.
 *
 * `zurueck` ist ein TAUSCH und keine Einbahnstrasse: was live war, wird die
 * vorige Version, und wer ein zweites Mal `zurueck` ruft, ist wieder da, wo er
 * angefangen hat. Die Alternative -- die Erinnerung nach dem Zurueckschalten
 * zu loeschen -- haette den Fall „ich habe zu frueh zurueckgeschaltet"
 * unumkehrbar gemacht, und genau in diesem Fall drueckt jemand hastig Knoepfe.
 *
 * @param {{appId: string, ziel: 'live'|'zurueck', durch: number|string|null}} was
 */
async function schalte({ appId, ziel, durch }) {
  const staende = await staendeVon(appId);
  if (ziel === 'live') {
    if (!staende.test) {
      throw new ConflictError(
        `App ${appId} hat keinen Teststand. Erst ein Paket einspielen, dann live schalten.`
      );
    }
    const eingespielt = await spieleEin({
      appId,
      version: staende.test.version,
      stand: 'live',
      durch,
    });
    logger.info(`App ${appId} live geschaltet: ${staende.test.version}`);
    return eingespielt;
  }

  if (!staende.live) {
    throw new ConflictError(`App ${appId} hat keinen Livestand, es gibt nichts zurueckzunehmen.`);
  }
  if (!staende.live.vorige_version) {
    throw new ConflictError(
      `Im Livestand von ${appId} lief nie eine andere Version als ${staende.live.version}.`
    );
  }
  const eingespielt = await spieleEin({
    appId,
    version: staende.live.vorige_version,
    stand: 'live',
    durch,
  });
  logger.info(
    `App ${appId} zurueckgeschaltet: ${staende.live.version} -> ${staende.live.vorige_version}`
  );
  return eingespielt;
}

/**
 * Die Lizenzgrenze fuer die Zahl der Apps.
 *
 * Sie greift nur bei einer NEUEN App: eine neue Version einer App, die schon
 * am Geraet ist, aendert die Zahl nicht, und ein abgelaufener Schluessel darf
 * kein Update blockieren, das vielleicht genau den Fehler behebt, wegen dem
 * jemand anruft.
 *
 * `maxApps` ist die einzige Zahl aus `FEATURE_TIERS`, hinter der ein Riegel
 * steht. Die anderen sind Angaben; diese ist eine Zusage.
 *
 * @returns {Promise<boolean>} ob die App neu ist. `spieleEin` braucht die
 *   Antwort, um bei einem Fehlschlag zu wissen, ob es die Zeile in `apps`
 *   wieder wegraeumen darf -- sie an zweiter Stelle noch einmal zu erfragen
 *   waere dieselbe Abfrage und ein Fenster dazwischen.
 */
async function pruefeAppGrenze(appId) {
  const vorhanden = await db.query('SELECT 1 FROM public.apps WHERE id = $1', [appId]);
  if (vorhanden.rows.length > 0) {
    return false;
  }
  const { rows } = await db.query('SELECT count(*)::int AS n FROM public.apps');
  const licenseService = require('./licenseService');
  const grenze = await licenseService.checkLimit('maxApps', rows[0].n);
  if (!grenze.allowed) {
    throw new ConflictError(
      `Die Lizenz dieses Geraets erlaubt ${grenze.limit} Apps, es sind ${grenze.current}. ` +
        'Eine App entfernen oder die Lizenz erweitern.'
    );
  }
  return true;
}

/**
 * Die Namen aller Images, die zu dieser App gehoeren koennen.
 *
 * Gefragt werden die beiden Stellen, an denen der Name WIRKLICH steht: die
 * Manifeste der beiden Staende (was gerade laeuft) und jedes `app.json` auf
 * der Platte (jede Version, die je eingespielt wurde). Eine dritte Quelle --
 * die Etiketten der Images selbst -- fragt `appContainer.entferneImages`
 * daneben ab; sie findet, was diese beiden nicht mehr kennen.
 *
 * Ein kaputtes oder fehlendes `app.json` einer alten Version haelt das
 * Entfernen NICHT auf: es ist ein Grund, dieses eine Image stehen zu lassen,
 * und keiner, die App zu behalten.
 */
async function imageNamenVon(appId, staende) {
  const namen = new Set();
  for (const stand of ['test', 'live']) {
    const image = staende[stand]?.manifest?.backend?.image;
    if (image) {
      namen.add(image);
    }
  }
  for (const version of await appManifest.listeVersionen(appId)) {
    try {
      const manifest = await appManifest.leseManifest(appId, version);
      if (manifest.backend?.image) {
        namen.add(manifest.backend.image);
      }
    } catch (fehler) {
      logger.warn(`App ${appId} ${version}: app.json nicht lesbar (${fehler.message})`);
    }
  }
  return [...namen];
}

/**
 * Eine App entfernen: beide Container mitsamt ihren Volumes, die am Geraet
 * gebauten Images, beide Staende, alle Freigaben, die Zeile.
 *
 * Die Ordner unter `/arasul/apps/<id>/` bleiben liegen, wenn niemand etwas
 * anderes sagt: wer eine App entfernt, will sie ueblicherweise gleich wieder
 * einspielen, und die Dateien wegzuwerfen hiesse, den naechsten Deploy zum
 * vollen Deploy zu machen. Aufraeumen tut sonst der Werksreset.
 *
 * `dateien: true` nimmt sie mit. Der Deploy-Endpunkt aus C5 hat sie selbst
 * dorthin gelegt, und ein Kit, das aus der Ferne einspielen kann, muss auch
 * aus der Ferne aufraeumen koennen -- sonst waechst das Geraet mit jeder
 * verworfenen Version, ohne dass jemand ohne SSH etwas dagegen tun kann.
 *
 * DIE IMAGES GEHEN IMMER MIT, auch ohne `dateien` (Phase C6). Sie sind nicht
 * die Quelle, aus der sich ein zweiter Deploy bedient -- das ist der Ordner --
 * sondern ihr Ergebnis, und ein Ergebnis ohne App ist Belegung ohne Nutzen.
 * Am Orin waren das je Version 228 MB.
 *
 * DIE REIHENFOLGE: erst lesen, was weg soll, dann entfernen. Die Namen der
 * Images stehen in den Manifesten, und `dateien: true` wirft die Manifeste
 * weg -- wer erst loescht, weiss danach nicht mehr, was er gebaut hat.
 *
 * @param {string} appId
 * @param {{dateien?: boolean}} [wie]
 */
async function entferneApp(appId, { dateien = false } = {}) {
  const vorhanden = await db.query('SELECT id FROM public.apps WHERE id = $1', [appId]);
  if (vorhanden.rows.length === 0) {
    throw new NotFoundError(`App ${appId} gibt es am Geraet nicht`);
  }
  const images = await imageNamenVon(appId, await staendeVon(appId));

  for (const stand of ['test', 'live']) {
    await appContainer.entferne(appId, stand);
  }
  // Erst der Container, dann sein Image: andersherum weist Docker mit 409 ab.
  const entfernteImages = await appContainer.entferneImages(appId, images);

  // `app_staende`, `app_members`, `app_flows`, `flow_settings` und die
  // App-Schluessel haengen mit ON DELETE CASCADE daran: wer eine App
  // entfernt, entfernt sie ganz.
  await db.query('DELETE FROM public.apps WHERE id = $1', [appId]);
  let versionen = [];
  if (dateien) {
    versionen = await appManifest.entferneDateien(appId);
  }
  logger.info(
    `App entfernt: ${appId}` +
      `${dateien ? ` (samt ${versionen.length} Version(en))` : ''}` +
      `${entfernteImages.length ? `, ${entfernteImages.length} Image(s)` : ''}`
  );
  return {
    id: appId,
    dateien_entfernt: dateien ? versionen : null,
    images_entfernt: entfernteImages,
  };
}

/**
 * Die Apps, die dieser Mensch sehen darf, mit dem Stand, der fuer ihn gilt.
 *
 * Das ist die Liste aus der Vision: „Mitarbeiter melden sich an und sehen die
 * Apps, die ein Admin ihnen freigegeben hat." Eine App ohne Livestand steht
 * nicht darin — freigegeben zu sein heisst nichts, wenn nichts laeuft; ein
 * Tester sieht zusaetzlich den Teststand, wenn es einen gibt.
 */
async function appsFuerNutzer(benutzerId) {
  const result = await db.query(
    `SELECT a.id, a.name, a.beschreibung, f.stand AS freigegeben_bis,
            l.version AS live_version, t.version AS test_version
       FROM public.app_members f
       JOIN public.apps a ON a.id = f.app_id
       LEFT JOIN public.app_staende l ON l.app_id = a.id AND l.stand = 'live'
       LEFT JOIN public.app_staende t ON t.app_id = a.id AND t.stand = 'test'
      WHERE f.user_id = $1
      ORDER BY a.name`,
    [benutzerId]
  );
  return result.rows
    .map(z => ({
      id: z.id,
      name: z.name,
      beschreibung: z.beschreibung,
      live: z.live_version ? { version: z.live_version, pfad: `/apps/${z.id}/` } : null,
      test:
        z.freigegeben_bis === 'test' && z.test_version
          ? { version: z.test_version, pfad: `/apps/${z.id}/test/` }
          : null,
    }))
    .filter(a => a.live || a.test);
}

/**
 * Welche Version in diesem Stand ausgeliefert wird, samt Ordner der statischen
 * Dateien. `null`, wenn es den Stand nicht gibt oder die App kein Frontend hat.
 */
async function ausliefernAus(appId, stand) {
  const result = await db.query(
    'SELECT version, manifest FROM public.app_staende WHERE app_id = $1 AND stand = $2',
    [appId, stand]
  );
  if (result.rows.length === 0) {
    return null;
  }
  const { version, manifest } = result.rows[0];
  if (!manifest.frontend) {
    return null;
  }
  return {
    version,
    verzeichnis: require('path').join(
      appManifest.verzeichnisFuer(appId, version),
      manifest.frontend.verzeichnis
    ),
  };
}

module.exports = {
  listeApps,
  holeApp,
  spieleEin,
  schalte,
  entferneApp,
  appsFuerNutzer,
  ausliefernAus,
  staendeVon,
};
