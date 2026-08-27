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
 * `test` der fuer die Tester. Umgeschaltet wird in Phase C5.
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const { ConflictError, NotFoundError } = require('../../utils/errors');
const appManifest = require('./appManifest');
const appContainer = require('./appContainer');
const appSchluessel = require('./appSchluessel');

/** Die Staende einer App, als `{ test, live }` mit `null`, wo keiner ist. */
async function staendeVon(appId) {
  const result = await db.query(
    `SELECT stand, version, manifest, eingespielt_am, eingespielt_von
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
 * Versionen auf der Platte und die Antwort auf die zwei Fragen, die ein
 * Manifest stellt und die die Plattform beantworten kann — ist das Modell da,
 * ist der Flow da.
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
      flows: await flowStand(manifest.flows),
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

/** Welche der im Manifest genannten Flows am Geraet liegen. */
async function flowStand(namen) {
  if (!namen || namen.length === 0) {
    return [];
  }
  const { listFlows } = require('../flows/flowRegistry');
  const da = new Set((await listFlows()).map(f => f.name));
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
  // `starte` holt es ohnehin, aber erst nachdem der Schluessel schon
  // gewechselt ist -- und ein Image, das nicht kommt, haette dann einer
  // laufenden App den Schluessel unter den Fuessen weggezogen. Der zweite
  // Aufruf in `starte` findet es dann da und tut nichts.
  if (manifest.backend) {
    await appContainer.holeImageFallsNoetig(manifest.backend.image);
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
      await appContainer.starte(manifest, stand, appSchluessel.umgebungFuer(schluessel));
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

  const gespeichert = await db.query(
    `INSERT INTO public.app_staende (app_id, stand, version, manifest, eingespielt_von)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (app_id, stand) DO UPDATE
        SET version = EXCLUDED.version,
            manifest = EXCLUDED.manifest,
            eingespielt_am = NOW(),
            eingespielt_von = EXCLUDED.eingespielt_von
     RETURNING app_id, stand, version, eingespielt_am`,
    [manifest.id, stand, manifest.version, manifest, durch ?? null]
  );

  logger.info(`App eingespielt: ${appId} ${version} nach ${stand}`);
  return gespeichert.rows[0];
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
 * Eine App entfernen: beide Container, beide Staende, die Zeile.
 *
 * Die Ordner unter `/arasul/apps/<id>/` bleiben liegen. Das Verzeichnis ist
 * schreibgeschuetzt eingehaengt, und wer eine App entfernt, will sie
 * ueblicherweise gleich wieder einspielen; die Dateien wegzuwerfen hiesse, den
 * naechsten Deploy zum vollen Deploy zu machen. Aufraeumen tut der Werksreset.
 */
async function entferneApp(appId) {
  const vorhanden = await db.query('SELECT id FROM public.apps WHERE id = $1', [appId]);
  if (vorhanden.rows.length === 0) {
    throw new NotFoundError(`App ${appId} gibt es am Geraet nicht`);
  }
  for (const stand of ['test', 'live']) {
    await appContainer.entferne(appId, stand);
  }
  // `app_staende` und `app_members` haengen mit ON DELETE CASCADE daran.
  await db.query('DELETE FROM public.apps WHERE id = $1', [appId]);
  logger.info(`App entfernt: ${appId}`);
  return { id: appId };
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
  entferneApp,
  appsFuerNutzer,
  ausliefernAus,
  staendeVon,
};
