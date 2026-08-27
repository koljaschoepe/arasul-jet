/**
 * Das Paket, mit dem eine App auf das Geraet kommt (Phase C5 des Umbaus vom
 * 26.08.2026).
 *
 * Bis C4 lag eine Version schon am Geraet, weil das Kit sie ueber SSH dorthin
 * kopiert hatte; `POST /api/apps/:id/einspielen` nahm sie von der Platte. Ein
 * Partner brauchte dafuer einen Zugang zum Betriebssystem des Kunden. Seit C5
 * schickt er ein Paket an die Schnittstelle, und das Geraet macht den Rest:
 * auspacken, pruefen, bauen, starten, versionieren.
 *
 * DIE REIHENFOLGE IST DIE VORSICHTIGE, und sie ist der Kern dieser Datei:
 * alles, was schiefgehen kann, passiert im Eingang -- auspacken, Manifest
 * lesen, Inhalt pruefen, Image bauen. Erst wenn das alles durch ist, wandert
 * der Ordner mit einem `rename` an seinen Platz und die Plattform uebernimmt.
 * Bricht es vorher ab, ist der Eingang weg und am Geraet hat sich nichts
 * geaendert.
 *
 * DAS PAKET IST EIN `.tar.gz` MIT DEM MANIFEST IM WURZELVERZEICHNIS:
 *
 *     app.json                 das Manifest, Fassung 1 (`schemas/apps.js`)
 *     frontend/…               die FERTIGEN Dateien, gebaut im Kit
 *     backend/Dockerfile       der Bauplan, gebaut am Geraet
 *     backend/…                sein Kontext
 *     flows/*.md               die Flows der App (C6), YAML-Kopf + Rumpf
 *
 * `frontend`, `backend` und `flows` heissen so, weil das Manifest es sagt
 * (`frontend.verzeichnis`, `backend.bauen.verzeichnis`, `flows.verzeichnis`);
 * wer andere Namen will, schreibt sie dort hinein.
 *
 * KEIN IMAGE-TAR (Entscheidung Kolja vom 27.08.2026). Ein fertiges Image ist
 * ein Dateisystem, das niemand mehr liest, bevor es laeuft, und es ist fuer
 * eine Architektur gebaut -- ein Partner mit einem x86-Laptop haette fuer
 * einen ARM64-Jetson etwas Unbrauchbares geschickt, ohne es zu merken. Ein
 * Dockerfile mit seinem Kontext ist ein Bauplan, und das Ergebnis entsteht auf
 * dem Geraet, auf dem es laufen soll.
 *
 * DER DEPLOY ROLLT IMMER IN DEN TESTSTAND. Es gibt keinen Schalter am
 * Endpunkt, mit dem ein Partner direkt live gehen koennte. Live schaltet ein
 * Mensch (`appStore.schalte`), und das ist keine Bequemlichkeitsfrage: der
 * Livestand ist das, womit die Belegschaft arbeitet, und wer ihn aendert, hat
 * vorher etwas ausprobiert.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const tar = require('tar');

const logger = require('../../utils/logger');
const { ConflictError, ValidationError } = require('../../utils/errors');
const { AppManifest } = require('../../schemas/apps');
const appManifest = require('./appManifest');
const appContainer = require('./appContainer');
const appStore = require('./appStore');
const appFlows = require('./appFlows');

/**
 * Der Eingang: hierhin laedt multer das Archiv, hierhin wird ausgepackt.
 *
 * Er liegt UNTER `APPS_DIR` und nicht in `/tmp`, und das ist der ganze Trick:
 * das fertige Verzeichnis wandert am Ende mit einem `rename` an seinen Platz,
 * und `rename` gibt es nur innerhalb eines Dateisystems. Ueber die Grenze
 * hinweg waere es ein Kopieren, und ein Kopieren kann auf halber Strecke
 * abbrechen -- dann laege unter `<id>/<version>/` eine halbe App, die das
 * Geraet fuer eine ganze haelt.
 *
 * Der Punkt im Namen ist kein Schmuck: `listeVersionen` nimmt nur Ordner, die
 * als Version durchgehen, und `.eingang` faengt nicht mit einem Buchstaben
 * oder einer Ziffer an -- er kann also nie als App-Kennung oder Version
 * missverstanden werden.
 */
function eingangsOrdner() {
  return path.join(appManifest.APPS_DIR, '.eingang');
}

/** Hoechstens so gross darf das Archiv sein, bevor multer abbricht. */
const MAX_ARCHIV_BYTES = 200 * 1024 * 1024;

/**
 * Und so gross hoechstens das Ausgepackte. Ein Archiv von wenigen Megabyte
 * kann sich zu Gigabyte entfalten; ohne diese Grenze waere der Deploy-Endpunkt
 * der bequemste Weg, ein Geraet vollzuschreiben, das fuenf Jahre laufen soll.
 */
const MAX_ENTPACKT_BYTES = 500 * 1024 * 1024;

/** Und so viele Eintraege. Zehntausende winziger Dateien sind dieselbe Falle. */
const MAX_EINTRAEGE = 20000;

/**
 * Ein Archiv auspacken -- und dabei nichts glauben, was darin steht.
 *
 * Erlaubt sind genau zwei Arten von Eintraegen: Dateien und Ordner. Alles
 * andere wird nicht still uebersprungen, sondern gemeldet und der ganze Deploy
 * abgewiesen:
 *
 * - **Symlinks und Hardlinks** koennen aus dem Zielordner herauszeigen. Ein
 *   `frontend/geheim -> /arasul/config/.env` waere eine Datei, die Arasul
 *   anschliessend jedem Freigegebenen unter `/apps/<id>/geheim` ausliefert.
 * - **Geraetedateien, Sockets, FIFOs** haben in einem App-Paket keinen
 *   denkbaren Zweck.
 *
 * Uebersprungen statt abgewiesen waere hier das Falsche: der Partner bekaeme
 * eine App, die laeuft und der etwas fehlt, und suchte den Fehler in seinem
 * Quelltext.
 *
 * Absolute Pfade und `..` entfernt `tar` selbst (`preservePaths: false`, die
 * Voreinstellung); die Pruefung hier steht trotzdem daneben, weil eine
 * Voreinstellung eine Voreinstellung ist.
 */
async function entpacke(archivPfad, zielOrdner) {
  const abgewiesen = [];
  let ueberGrenze = null;
  let bytes = 0;
  let eintraege = 0;

  await tar.x({
    file: archivPfad,
    cwd: zielOrdner,
    strict: true,
    preservePaths: false,
    filter: (eintragPfad, eintrag) => {
      if (eintrag.type !== 'File' && eintrag.type !== 'Directory') {
        abgewiesen.push(`${eintragPfad} (${eintrag.type})`);
        return false;
      }
      if (path.isAbsolute(eintragPfad) || eintragPfad.split(/[/\\]/).includes('..')) {
        abgewiesen.push(`${eintragPfad} (fuehrt aus dem Paket heraus)`);
        return false;
      }
      eintraege += 1;
      bytes += eintrag.size || 0;
      // NICHT werfen, sondern ab hier nichts mehr auf die Platte lassen und den
      // Grund merken. Ein Fehler aus einem Filter heraus faellt mitten in
      // tars Entpackschleife an und laesst je nach Zeitpunkt einen halb
      // geschriebenen Ordner zurueck; `return false` ist die Bremse, die tar
      // selbst vorsieht. Die Zaehler laufen aus den KOEPFEN
      // des Archivs, also merkt die Bremse schon vor dem Schreiben, dass es zu
      // viel wird -- eine Tar-Bombe entfaltet sich nicht doch noch.
      if (!ueberGrenze && eintraege > MAX_EINTRAEGE) {
        ueberGrenze =
          `Das Paket hat mehr als ${MAX_EINTRAEGE} Eintraege. ` +
          'Gehoert der Ordner mit den Abhaengigkeiten wirklich hinein?';
      }
      if (!ueberGrenze && bytes > MAX_ENTPACKT_BYTES) {
        ueberGrenze = `Das Paket entfaltet sich auf mehr als ${Math.round(
          MAX_ENTPACKT_BYTES / 1024 / 1024
        )} MB.`;
      }
      return !ueberGrenze;
    },
  });

  if (ueberGrenze) {
    throw new ValidationError(ueberGrenze);
  }
  if (abgewiesen.length > 0) {
    throw new ValidationError(
      'Das Paket enthaelt Eintraege, die ein App-Paket nicht enthalten darf: ' +
        abgewiesen.slice(0, 10).join(', '),
      { abgewiesen: abgewiesen.slice(0, 50) }
    );
  }
  return { eintraege, bytes };
}

/**
 * Das Manifest aus dem ausgepackten Ordner lesen und pruefen.
 *
 * Es liegt im WURZELVERZEICHNIS des Pakets. Ein Paket mit einem Ordner
 * obendrueber (`tar czf paket.tgz meineapp/`) wird abgewiesen, statt dass das
 * Geraet raet, welcher der Ordner der richtige ist -- die Fehlermeldung sagt,
 * was stattdessen zu tun ist.
 *
 * `leseManifest` aus `appManifest.js` geht hier nicht: das liest aus
 * `<APPS_DIR>/<id>/<version>/` und prueft die Kennung GEGEN den Pfad. Hier
 * gibt es den Pfad noch nicht -- was `id` und `version` sind, sagt erst das
 * Manifest. Die Pruefung „Manifest passt zum Ordner" holt `spieleEin` am Ende
 * trotzdem nach, wenn es aus dem endgueltigen Pfad liest.
 */
async function leseManifestAusPaket(ordner) {
  let roh;
  try {
    roh = await fs.readFile(path.join(ordner, 'app.json'), 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
    const gefunden = (await fs.readdir(ordner)).slice(0, 10);
    throw new ValidationError(
      'Im Paket liegt kein app.json im Wurzelverzeichnis. Gefunden: ' +
        (gefunden.length ? gefunden.join(', ') : '(leer)') +
        '. Gepackt wird der INHALT des Ordners: tar czf paket.tgz -C <ordner> .'
    );
  }

  let gelesen;
  try {
    gelesen = JSON.parse(roh);
  } catch (err) {
    throw new ValidationError(`app.json im Paket ist kein gueltiges JSON: ${err.message}`);
  }

  const geprueft = AppManifest.safeParse(gelesen);
  if (!geprueft.success) {
    const erste = geprueft.error.issues[0];
    throw new ValidationError(
      `app.json im Paket: ${erste.message}` +
        (erste.path.length ? ` (Feld ${erste.path.join('.')})` : '')
    );
  }
  return geprueft.data;
}

/**
 * Was im Paket liegen muss, damit das Manifest keine Zusage macht, die das
 * Geraet nicht halten kann: die Seite, der Bauplan und seit C6 die Flows.
 *
 * Alles drei wird HIER geprueft und nicht erst beim Bauen oder beim ersten
 * Besucher: ein Deploy, der mit „201 eingespielt" antwortet und dessen App
 * eine leere Seite zeigt, ist die schlechteste aller Antworten.
 */
async function pruefePaketInhalt(manifest, ordner) {
  // Die Flows zuerst, weil sie am billigsten scheitern: eine kaputte
  // YAML-Kopfzeile findet sich in Millisekunden, und der Bau des Images
  // dauert am Jetson Minuten. Ein Partner, der beides falsch hat, soll die
  // Antwort zum Flow bekommen, bevor er zehn Minuten wartet.
  //
  // `leseAusPaket` ist derselbe Aufruf, den `appFlows.registriere` spaeter
  // gegen den fertigen Versionsordner macht. Zwei Pruefungen mit
  // unterschiedlicher Strenge waeren zwei Meinungen darueber, was ein
  // gueltiger Flow ist.
  await appFlows.leseAusPaket(manifest, ordner);

  if (manifest.frontend) {
    const seite = path.join(ordner, manifest.frontend.verzeichnis, 'index.html');
    try {
      await fs.access(seite);
    } catch {
      throw new ValidationError(
        `Das Manifest verspricht ein Frontend, im Paket fehlt ${manifest.frontend.verzeichnis}/index.html. ` +
          'Das Kit baut das Frontend, das Geraet liefert es nur aus.'
      );
    }
  }

  if (!manifest.backend) {
    return;
  }
  if (!manifest.backend.bauen) {
    throw new ValidationError(
      'Ein Paket bringt seinen Bauplan mit: `backend.bauen` fehlt im Manifest. ' +
        'Fertige Images nimmt dieser Weg nicht an -- gebaut wird am Geraet, fuer das Geraet.'
    );
  }
  const bauplan = path.join(
    ordner,
    manifest.backend.bauen.verzeichnis,
    manifest.backend.bauen.dockerfile
  );
  try {
    await fs.access(bauplan);
  } catch {
    throw new ValidationError(
      `Das Manifest nennt den Bauplan ${manifest.backend.bauen.verzeichnis}/` +
        `${manifest.backend.bauen.dockerfile}, im Paket liegt er nicht.`
    );
  }
}

/**
 * Ein Paket annehmen: auspacken, pruefen, ablegen, bauen, in den Teststand.
 *
 * Die Reihenfolge ist die vorsichtige. Alles, was schiefgehen kann, ohne dass
 * jemand es merkt, passiert im Eingang -- am Bestand der App wird erst
 * gearbeitet, wenn das Paket vollstaendig, lesbar und stimmig ist. Bricht es
 * vorher ab, ist der Eingang weg und am Geraet hat sich nichts geaendert.
 *
 * DAS ARCHIV GEHOERT AB HIER DIESEM BAUSTEIN und wird am Ende geloescht, ob
 * es geklappt hat oder nicht. Es liegt sonst weiter im Eingang, und die Route
 * koennte es nicht aufraeumen, ohne ein `try/catch` zu bauen, das es in diesem
 * Backend nicht geben soll (`apps/dashboard-backend/CLAUDE.md`).
 *
 * @param {{archivPfad: string, durch: number|string|null}} was
 * @returns {Promise<object>} der eingespielte Stand
 */
async function nimmAn({ archivPfad, durch }) {
  const lauf = crypto.randomBytes(8).toString('hex');
  const ordner = path.join(eingangsOrdner(), lauf);
  await fs.mkdir(ordner, { recursive: true });

  try {
    const mass = await entpacke(archivPfad, ordner);
    const manifest = await leseManifestAusPaket(ordner);
    await pruefePaketInhalt(manifest, ordner);

    // Eine Version, die gerade LIVE ist, wird nicht ueberschrieben. Der Deploy
    // rollt in den Teststand, aber die Dateien liegen je Version und nicht je
    // Stand -- dieselbe Nummer noch einmal zu schicken hiesse, die Seite zu
    // tauschen, mit der die Belegschaft in diesem Augenblick arbeitet, ohne
    // dass jemand geschaltet haette. Eine neue Fassung bekommt eine neue
    // Nummer; dafuer sind Versionsnummern da.
    const staende = await appStore.staendeVon(manifest.id);
    if (staende.live && staende.live.version === manifest.version) {
      throw new ConflictError(
        `Version ${manifest.version} von ${manifest.id} ist der Livestand. ` +
          'Eine neue Fassung braucht eine neue Versionsnummer.'
      );
    }

    // Gebaut wird VOR dem Umbenennen, aus dem Eingang heraus. Zwei Gruende, und
    // beide sind wichtiger als die zwei Zeilen, die es kostet:
    //
    // 1. Ein Bau, der scheitert, hinterlaesst nichts. Waere erst umbenannt
    //    worden, laege unter `<id>/<version>/` eine Version, die es am Geraet
    //    nie gegeben hat.
    // 2. Der Deploy baut IMMER. `appContainer.sorgeFuerImage` baut nur, wenn
    //    das Image fehlt -- richtig fuer den Schalter, der dieselbe Version
    //    noch einmal einspielt, und falsch hier: wer dieselbe Nummer noch
    //    einmal schickt, hat etwas geaendert und will das Ergebnis sehen.
    //    Danach findet `spieleEin` das Image vor und tut nichts.
    if (manifest.backend) {
      await appContainer.baueImage(manifest, path.join(ordner, manifest.backend.bauen.verzeichnis));
    }

    const ziel = appManifest.verzeichnisFuer(manifest.id, manifest.version);
    await fs.mkdir(path.dirname(ziel), { recursive: true });
    // Erst weg, dann hin: `rename` auf ein vorhandenes VERZEICHNIS schlaegt
    // fehl (ENOTEMPTY), und ein Deploy derselben Testversion ist der Normalfall
    // beim Entwickeln.
    await fs.rm(ziel, { recursive: true, force: true });
    await fs.rename(ordner, ziel);

    logger.info(
      `App-Paket angenommen: ${manifest.id} ${manifest.version} ` +
        `(${mass.eintraege} Eintraege, ${Math.round(mass.bytes / 1024)} kB) -> ${ziel}`
    );

    // Ab hier arbeitet die Plattform mit ihren eigenen Regeln -- derselbe
    // Dienst, den auch die Sitzungsroute aus C3 ruft. Zwei Wege in das Geraet,
    // eine Logik dahinter.
    return await appStore.spieleEin({
      appId: manifest.id,
      version: manifest.version,
      stand: 'test',
      durch,
    });
  } finally {
    // Was noch im Eingang liegt, gehoert niemandem mehr: entweder ist es
    // weitergewandert (dann ist der Ordner ohnehin fort) oder der Deploy ist
    // gescheitert.
    await fs.rm(ordner, { recursive: true, force: true });
    await fs.rm(archivPfad, { force: true });
  }
}

module.exports = {
  MAX_ARCHIV_BYTES,
  MAX_ENTPACKT_BYTES,
  MAX_EINTRAEGE,
  eingangsOrdner,
  entpacke,
  leseManifestAusPaket,
  pruefePaketInhalt,
  nimmAn,
};
