/**
 * Das Backend einer App als Container (Phase C3 des Umbaus vom 26.08.2026).
 *
 * Je App und Stand genau ein Container: `arasul-app-<id>-live` und
 * `arasul-app-<id>-test`. Erreichbar ist er ueber Traefik unter
 * `/apps/<id>/api/` beziehungsweise `/apps/<id>/test/api/`, sonst nirgends —
 * es gibt keinen veroeffentlichten Port am Host. Eine App, die eine zweite Tuer
 * neben Traefik haette, waere in Phase C4 nicht mehr zu schliessen.
 *
 * Der Weg zu Docker geht ueber `docker-proxy` (`services/core/docker.js`),
 * nicht ueber den Socket. Das Backend darf damit Container anlegen, starten,
 * stoppen und loeschen und sonst nichts.
 */

const path = require('path');
const tar = require('tar');
const logger = require('../../utils/logger');
const { docker } = require('../core/docker');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const { KOPF_BENUTZER, KOPF_ROLLE } = require('./appZugang');

// Compose stellt dem Netznamen den Projektnamen voran. Traefik haengt in
// genau diesem Netz; ein App-Container in einem anderen waere gestartet und
// unerreichbar.
const NETZ = process.env.DOCKER_NETWORK || 'arasul-platform_arasul-backend';

// Wohin Traefik die Forward-Auth schickt (Phase C4). Ausgeschrieben und nicht
// aus der Umgebung: dieselbe Adresse steht schon in
// `config/traefik/dynamic/middlewares.yml` (Middleware `forward-auth`), und
// zwei Stellschrauben fuer denselben Dienstnamen waeren eine mehr als noetig.
// Der Aufruf geht von Traefik AN das Backend, also am Router `/api` vorbei --
// die Drossel und die Kopfzeilen daran gelten fuer ihn nicht.
const BACKEND = 'http://dashboard-backend:3001';

/** Der Containername je App und Stand. Eine Zeile, damit es eine Regel bleibt. */
function containerName(appId, stand) {
  return `arasul-app-${appId}-${stand}`;
}

/** Der Pfad, unter dem Traefik das Backend dieses Standes veroeffentlicht. */
function apiPfad(appId, stand) {
  return stand === 'test' ? `/apps/${appId}/test/api` : `/apps/${appId}/api`;
}

/**
 * Die Traefik-Beschriftung eines App-Backends.
 *
 * Der Teststand bekommt den laengeren Pfad UND die hoehere Zahl: Traefik
 * entscheidet bei gleicher Zahl nach Regellaenge, aber sich darauf zu
 * verlassen hiesse, eine Reihenfolge zu erben statt sie zu setzen. Beide
 * liegen ueber dem Router `apps-frontend` aus `config/traefik/dynamic/routes.yml`
 * (Zahl 30), der alles unter `/apps` an Arasul gibt — sonst bekaeme der
 * Besucher die statische Seite, wo er die Schnittstelle gerufen hat.
 */
function beschriftung(manifest, stand) {
  const router = `app-${manifest.id}-${stand}`;
  const pfad = apiPfad(manifest.id, stand);
  return {
    'arasul.app': manifest.id,
    'arasul.stand': stand,
    'arasul.version': manifest.version,
    'traefik.enable': 'true',
    'traefik.docker.network': NETZ,
    [`traefik.http.routers.${router}.rule`]: `PathPrefix(\`${pfad}\`)`,
    [`traefik.http.routers.${router}.priority`]: stand === 'test' ? '45' : '40',
    [`traefik.http.routers.${router}.entrypoints`]: 'websecure',
    [`traefik.http.routers.${router}.tls`]: 'true',
    // Die Reihenfolge ist die Aussage: erst die Anmeldung, dann das Abschneiden
    // des Praefixes. Wer nicht freigegeben ist, kommt nie bis zum Container.
    [`traefik.http.routers.${router}.middlewares`]: `${router}-zugang@docker,${router}-strip@docker,security-headers@file`,
    // Die App-Anmeldung (Phase C4). Traefik fragt vor JEDER Anfrage an dieses
    // Backend beim Dashboard nach, ob der Aufrufer diese App in diesem Stand
    // haben darf, und reicht die Antwort bei 401/403/404 unveraendert an den
    // Browser durch.
    //
    // Kennung und Stand stehen als Suchparameter fest im Etikett, statt sie
    // aus `X-Forwarded-Uri` zu lesen: der Container weiss, wer er ist, und ein
    // Pfad, den erst jemand zerlegen muss, ist eine Stelle mehr, an der die
    // Zuordnung schiefgehen kann.
    [`traefik.http.middlewares.${router}-zugang.forwardauth.address`]: `${BACKEND}/api/apps/${manifest.id}/zugang?stand=${stand}`,
    // Nur diese zwei gehen HIN. Die Sitzung steckt im Cookie `arasul_session`
    // oder im Bearer-Token; alles andere geht die Anmeldung nichts an.
    [`traefik.http.middlewares.${router}-zugang.forwardauth.authRequestHeaders`]:
      'Cookie,Authorization',
    // Und diese zwei kommen ZURUECK. Der entscheidende Teil steht in Traefiks
    // Quelle: fuer jeden Namen in dieser Liste wird der Kopf zuerst aus der
    // eingehenden Anfrage GELOESCHT und danach aus der Antwort der Anmeldung
    // neu gesetzt. Ein Aufrufer, der `X-Arasul-User: chef` mitschickt, kommt
    // damit nicht durch -- ohne diese Liste waere sein Kopf einfach
    // durchgereicht worden.
    [`traefik.http.middlewares.${router}-zugang.forwardauth.authResponseHeaders`]: `${KOPF_BENUTZER},${KOPF_ROLLE}`,
    // Die App sieht ihre eigenen Pfade, nicht die der Plattform: aus
    // `/apps/urlaub/api/antraege` wird `/antraege`. Ein App-Backend soll nicht
    // wissen muessen, unter welchem Praefix es haengt.
    [`traefik.http.middlewares.${router}-strip.stripprefix.prefixes`]: pfad,
    [`traefik.http.services.${router}.loadbalancer.server.port`]: String(manifest.ports.backend),
  };
}

/** Speichergrenze aus dem Manifest (`512m`, `2g`) in Bytes. */
function speicherInBytes(wert) {
  const treffer = String(wert).match(/^(\d+(?:\.\d+)?)([kmg])$/i);
  if (!treffer) {
    return undefined;
  }
  const faktor = { k: 1024, m: 1024 ** 2, g: 1024 ** 3 }[treffer[2].toLowerCase()];
  return Math.round(parseFloat(treffer[1]) * faktor);
}

/**
 * Die Containerbeschreibung aus dem Manifest.
 *
 * Was hier NICHT drinsteht, ist die eigentliche Aussage: keine Bind-Mounts vom
 * Host, keine veroeffentlichten Ports, keine zusaetzlichen Rechte. Eine App ist
 * ein Programm, das der Partner geschrieben hat; sie bekommt ein Netz, eine
 * Grenze und sonst nichts. Braucht sie einen Ordner, ist das ein eigener
 * Beschluss und keine Zeile in ihrem eigenen Manifest.
 */
function containerBeschreibung(manifest, stand, umgebung = {}) {
  const alleUmgebung = { ...(manifest.backend.umgebung || {}), ...umgebung };
  return {
    name: containerName(manifest.id, stand),
    Image: manifest.backend.image,
    Hostname: containerName(manifest.id, stand),
    Env: Object.entries(alleUmgebung).map(([k, v]) => `${k}=${v}`),
    ExposedPorts: { [`${manifest.ports.backend}/tcp`]: {} },
    Labels: beschriftung(manifest, stand),
    ...(manifest.backend.gesundheit
      ? {
          Healthcheck: {
            Test: [
              'CMD-SHELL',
              `wget -q -O /dev/null http://127.0.0.1:${manifest.ports.backend}${manifest.backend.gesundheit} || exit 1`,
            ],
            Interval: 30e9,
            Timeout: 5e9,
            Retries: 3,
            StartPeriod: 15e9,
          },
        }
      : {}),
    HostConfig: {
      NetworkMode: NETZ,
      RestartPolicy: { Name: 'unless-stopped' },
      Memory: speicherInBytes(manifest.ressourcen.speicher),
      NanoCpus: Math.round(manifest.ressourcen.cpus * 1e9),
      PidsLimit: 256,
      SecurityOpt: ['no-new-privileges:true'],
      CapDrop: ['ALL'],
      LogConfig: { Type: 'json-file', Config: { 'max-size': '20m', 'max-file': '3' } },
    },
  };
}

/** Den Zustand eines App-Containers, oder `null`, wenn es ihn nicht gibt. */
async function zustand(appId, stand) {
  try {
    const info = await docker.getContainer(containerName(appId, stand)).inspect();
    return {
      laeuft: info.State.Running === true,
      status: info.State.Status,
      gesundheit: info.State.Health?.Status || null,
      seit: info.State.StartedAt || null,
      image: info.Config?.Image || null,
    };
  } catch (err) {
    if (err.statusCode === 404) {
      return null;
    }
    throw err;
  }
}

/** Container weg, falls da. Idempotent: was es nicht gibt, ist schon weg. */
async function entferne(appId, stand) {
  try {
    await docker.getContainer(containerName(appId, stand)).remove({ force: true, v: true });
    logger.info(`App-Container entfernt: ${containerName(appId, stand)}`);
    return true;
  } catch (err) {
    if (err.statusCode === 404) {
      return false;
    }
    throw err;
  }
}

/**
 * Die am Geraet gebauten Images einer App wegwerfen (Phase C6).
 *
 * Bis hierher nahm `DELETE /api/v1/external/apps/:id` die Zeile, beide
 * Container samt Volumes, die Freigaben und auf Wunsch die Dateien -- und
 * liess die Images liegen. Am Orin waren das am 27.08.2026 je Version 228 MB
 * auf einem Geraet, das fuenf Jahre unbeaufsichtigt laufen soll. Wer eine App
 * aus der Ferne einspielen kann, muss sie aus der Ferne ganz loswerden
 * koennen; sonst waechst das Geraet mit jeder verworfenen Version.
 *
 * WOHER DIE NAMEN KOMMEN, und warum aus drei Quellen und nicht aus einem
 * Muster: der Name eines Images steht im Manifest (`backend.image`) und ist
 * dort freier Text. `arasul-<id>:<version>` ist die Gewohnheit der
 * Beispielapp, keine Regel -- nach ihr zu loeschen hiesse, ein fremdes Image
 * zu treffen, das sich nur aehnlich nennt. Gefragt werden deshalb die
 * Stellen, an denen der Name wirklich steht:
 *
 *   1. die beiden Staende in `app_staende.manifest` (was gerade laeuft),
 *   2. jedes `app.json` unter `/arasul/apps/<id>/<version>/` (jede Version,
 *      die je eingespielt wurde und deren Ordner noch da ist),
 *   3. jedes Image mit dem Etikett `arasul.app=<id>` (seit C6 vergibt es
 *      `baueImage`; es findet auch, was 1 und 2 nicht mehr kennen).
 *
 * Ein Image, das noch ein Container benutzt, weist Docker mit 409 ab. Das ist
 * kein Fehler dieses Aufrufs, sondern eine Auskunft: der Aufrufer hat die
 * Container vorher entfernt, und wenn trotzdem einer haengt, gehoert er einer
 * ANDEREN App, die dasselbe Image benutzt. Sie darf es behalten.
 *
 * @param {string} appId
 * @param {string[]} [ausManifesten] Image-Namen, die der Aufrufer schon kennt
 * @returns {Promise<string[]>} die Images, die wirklich weg sind
 */
async function entferneImages(appId, ausManifesten = []) {
  const namen = new Set(ausManifesten.filter(Boolean));

  let etikettiert = [];
  try {
    etikettiert = await docker.listImages({ filters: { label: [`arasul.app=${appId}`] } });
  } catch (err) {
    logger.warn(`App-Images von ${appId}: Docker gibt keine Liste her: ${err.message}`);
  }
  for (const eintrag of etikettiert) {
    for (const tag of eintrag.RepoTags || []) {
      if (tag !== '<none>:<none>') {
        namen.add(tag);
      }
    }
  }

  const weg = [];
  for (const name of namen) {
    try {
      await docker.getImage(name).remove();
      weg.push(name);
    } catch (err) {
      if (err.statusCode === 404) {
        continue; // schon weg
      }
      if (err.statusCode === 409) {
        logger.info(`App-Image ${name} bleibt: ein anderer Container benutzt es`);
        continue;
      }
      throw err;
    }
  }
  if (weg.length > 0) {
    logger.info(`App-Images entfernt (${appId}): ${weg.join(', ')}`);
  }
  return weg;
}

/**
 * Das Image holen, wenn es am Geraet fehlt.
 *
 * Ist es schon da, wird NICHT gezogen. Der Partner baut sein Image am Geraet
 * (C5) oder laedt es dorthin; eine Registry, die es haette, gibt es im
 * Zielbild nicht, und ein Geraet ohne Internet soll seine Apps trotzdem
 * starten koennen.
 */
async function holeImageFallsNoetig(image) {
  try {
    await docker.getImage(image).inspect();
    return false;
  } catch (err) {
    if (err.statusCode !== 404) {
      throw err;
    }
  }
  logger.info(`App-Image nicht am Geraet, wird geholt: ${image}`);
  await new Promise((auf, ab) => {
    docker.pull(image, (fehler, strom) => {
      if (fehler) {
        ab(fehler);
        return;
      }
      docker.modem.followProgress(strom, pullFehler => (pullFehler ? ab(pullFehler) : auf()));
    });
  });
  return true;
}

/**
 * Das Image einer App am Geraet bauen (Phase C5).
 *
 * Der Bau-Kontext geht als Tar-Strom an den Docker-Dienst, nicht als Pfad:
 * das Backend spricht ueber `docker-proxy` (TCP) mit einem Dienst, der ein
 * anderes Dateisystem sieht als dieser Container. Ein Pfad waere dort ein
 * Pfad ins Leere -- und zwar einer, der je nach Host zufaellig doch etwas
 * traefe.
 *
 * `noCache` gibt es hier bewusst nicht. Ein Partner, der dieselbe Version
 * zweimal rollt, hat etwas geaendert und will das Ergebnis sehen; die Ebenen,
 * die Docker wiederverwendet, sind genau die, an denen sich nichts geaendert
 * hat. Das ist der Unterschied zwischen „schnell" und „falsch", und Docker
 * kennt ihn besser als eine Kennzahl von uns.
 *
 * @param {object} manifest das gepruefte `app.json`
 * @param {string} kontextPfad der Ordner, der als Kontext geht (absolut)
 * @returns {Promise<string>} der Name des gebauten Images
 */
async function baueImage(manifest, kontextPfad) {
  const image = manifest.backend.image;
  const dockerfile = manifest.backend.bauen.dockerfile;
  logger.info(`App-Image wird am Geraet gebaut: ${image} aus ${kontextPfad} (${dockerfile})`);

  const kontext = tar.c({ cwd: kontextPfad, gzip: false, portable: true }, ['.']);
  const strom = await docker.buildImage(kontext, {
    t: image,
    dockerfile,
    forcerm: true,
    // Dieselben Etiketten wie am Container. Sie sind der Weg, auf dem
    // `entferneImages` ein Image WIEDERFINDET, dessen Manifest es nicht mehr
    // gibt -- und der Weg, auf dem der Werksreset die Bauergebnisse eines
    // Kunden von den Images der Plattform unterscheidet.
    labels: { 'arasul.app': manifest.id, 'arasul.version': manifest.version },
  });

  // Die letzten Zeilen der Bauausgabe, damit ein Fehlschlag etwas sagt.
  // Docker meldet den Grund im Strom und nicht im Fehler -- ohne sie stuende
  // im Protokoll „build failed" und der Partner duerfte raten.
  const ausgabe = [];
  await new Promise((auf, ab) => {
    docker.modem.followProgress(
      strom,
      fehler => {
        if (!fehler) {
          auf();
          return;
        }
        const grund = typeof fehler === 'string' ? fehler : fehler.message || String(fehler);
        ab(
          new ValidationError(`Das Image ${image} liess sich am Geraet nicht bauen: ${grund}`, {
            ausgabe: ausgabe.slice(-25),
          })
        );
      },
      schritt => {
        const zeile = (schritt.stream || schritt.status || '').trim();
        if (zeile) {
          ausgabe.push(zeile);
        }
      }
    );
  });

  logger.info(`App-Image gebaut: ${image}`);
  return image;
}

/**
 * Dafuer sorgen, dass das Image dieser Version da ist.
 *
 * Zwei Wege, und das Manifest sagt welcher: mit `backend.bauen` baut das
 * Geraet aus dem Paket (C5), ohne erwartet es ein fertiges Image und holt es
 * notfalls (C3, der Weg ueber SSH).
 *
 * Gebaut wird nur, wenn das Image FEHLT. Der Schalter nach live spielt
 * dieselbe Version noch einmal ein, die im Teststand schon laeuft; ihn einen
 * Bau kosten zu lassen hiesse, den Livestand fuer Minuten von einem
 * Bauergebnis abhaengig zu machen, das schon da ist.
 *
 * Der Deploy eines Pakets baut deshalb SELBST, bevor er hierher kommt
 * (`services/app/appPaket.js`): wer dieselbe Versionsnummer noch einmal
 * schickt, hat etwas geaendert und will das Ergebnis sehen. Danach findet
 * dieser Aufruf das Image vor und tut nichts.
 *
 * @param {object} manifest das gepruefte `app.json`
 * @param {string} versionsPfad `/arasul/apps/<id>/<version>` (absolut)
 */
async function sorgeFuerImage(manifest, versionsPfad) {
  if (!manifest.backend.bauen) {
    await holeImageFallsNoetig(manifest.backend.image);
    return;
  }
  try {
    await docker.getImage(manifest.backend.image).inspect();
    return;
  } catch (err) {
    if (err.statusCode !== 404) {
      throw err;
    }
  }
  await baueImage(manifest, path.join(versionsPfad, manifest.backend.bauen.verzeichnis));
}

/**
 * Das Backend eines Standes starten. Ein vorhandener Container wird ersetzt,
 * nicht neu gestartet: das Manifest kann eine andere Grenze, ein anderes Image
 * oder einen anderen Port nennen, und ein `restart` uebernaehme davon nichts.
 */
async function starte(manifest, stand, umgebung = {}, versionsPfad = null) {
  if (versionsPfad) {
    await sorgeFuerImage(manifest, versionsPfad);
  } else {
    await holeImageFallsNoetig(manifest.backend.image);
  }
  await entferne(manifest.id, stand);
  const container = await docker.createContainer(containerBeschreibung(manifest, stand, umgebung));
  await container.start();
  logger.info(
    `App-Container gestartet: ${containerName(manifest.id, stand)} (${manifest.backend.image})`
  );
  return containerName(manifest.id, stand);
}

/** Die letzten Zeilen des Containerprotokolls. */
async function logs(appId, stand, zeilen = 200) {
  try {
    const rohe = await docker.getContainer(containerName(appId, stand)).logs({
      stdout: true,
      stderr: true,
      tail: zeilen,
      timestamps: true,
    });
    return rohe.toString('utf8');
  } catch (err) {
    if (err.statusCode === 404) {
      throw new NotFoundError(`Kein Container fuer ${appId} im Stand ${stand}`);
    }
    throw err;
  }
}

/**
 * Alle App-Container entfernen. Der Werksreset braucht das: die Zeilen in
 * `apps` sind danach weg, und ein Container, der weiterlaeuft, waere ein
 * Rest des alten Kunden auf einem Geraet, das als frisch gilt.
 */
async function entferneAlle() {
  const liste = await docker.listContainers({
    all: true,
    filters: { label: ['arasul.app'] },
  });
  let entfernt = 0;
  for (const eintrag of liste) {
    try {
      await docker.getContainer(eintrag.Id).remove({ force: true, v: true });
      entfernt += 1;
    } catch (err) {
      if (err.statusCode !== 404) {
        throw err;
      }
    }
  }
  if (entfernt > 0) {
    logger.info(`Werksreset: ${entfernt} App-Container entfernt`);
  }

  // Und die Bauergebnisse dazu (C6). Ein Image ist der Quelltext des Partners
  // in ausgefuehrter Form; es auf einem Geraet stehen zu lassen, das als
  // fabrikneu gilt, waere derselbe Rest des alten Kunden wie ein laufender
  // Container. Gesucht wird ueber das Etikett, das `baueImage` vergibt -- eine
  // Kennung braucht es dafuer nicht, weil hier ALLE Apps gemeint sind.
  let bilder = 0;
  try {
    const liste = await docker.listImages({ filters: { label: ['arasul.app'] } });
    for (const eintrag of liste) {
      for (const tag of eintrag.RepoTags || []) {
        if (tag === '<none>:<none>') {
          continue;
        }
        try {
          await docker.getImage(tag).remove();
          bilder += 1;
        } catch (err) {
          if (err.statusCode !== 404 && err.statusCode !== 409) {
            throw err;
          }
        }
      }
    }
  } catch (err) {
    logger.warn(`Werksreset: App-Images nicht aufraeumbar: ${err.message}`);
  }
  if (bilder > 0) {
    logger.info(`Werksreset: ${bilder} App-Image(s) entfernt`);
  }

  return entfernt;
}

module.exports = {
  containerName,
  apiPfad,
  holeImageFallsNoetig,
  baueImage,
  entferneImages,
  sorgeFuerImage,
  beschriftung,
  containerBeschreibung,
  speicherInBytes,
  zustand,
  starte,
  entferne,
  entferneAlle,
  logs,
};
