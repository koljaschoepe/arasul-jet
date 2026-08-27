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

const logger = require('../../utils/logger');
const { docker } = require('../core/docker');
const { NotFoundError } = require('../../utils/errors');

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
    [`traefik.http.middlewares.${router}-zugang.forwardauth.authResponseHeaders`]:
      'X-Arasul-User,X-Arasul-Role',
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
 * Das Backend eines Standes starten. Ein vorhandener Container wird ersetzt,
 * nicht neu gestartet: das Manifest kann eine andere Grenze, ein anderes Image
 * oder einen anderen Port nennen, und ein `restart` uebernaehme davon nichts.
 */
async function starte(manifest, stand, umgebung = {}) {
  await holeImageFallsNoetig(manifest.backend.image);
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
  return entfernt;
}

module.exports = {
  containerName,
  apiPfad,
  beschriftung,
  containerBeschreibung,
  speicherInBytes,
  zustand,
  starte,
  entferne,
  entferneAlle,
  logs,
};
