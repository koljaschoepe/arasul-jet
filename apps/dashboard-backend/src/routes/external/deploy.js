/**
 * Der Weg des Ara-Kits auf das Geraet (Phase C5 des Umbaus vom 26.08.2026).
 *
 * Vier Endpunkte und ein Kontrakt, alle unter `/api/v1/external`:
 *
 *   GET    /contract              was dieses Geraet verspricht
 *   POST   /apps                  ein Paket einspielen -> Teststand
 *   GET    /apps/:id              was das Geraet ueber diese App weiss
 *   POST   /apps/:id/schalten     live schalten oder zurueck
 *   DELETE /apps/:id              App weg, samt Volumes, nach Rueckfrage
 *
 * WARUM HIER UND NICHT UNTER `/api/apps`: der Aufrufer ist kein Mensch mit
 * einer Sitzung, sondern ein Programm mit einem Schluessel (Entscheidung Kolja
 * vom 27.08.2026). `/api/apps` verlangt ein Cookie und einen CSRF-Kopf, und
 * beides gibt es in einem Kit-Lauf nicht; `/api/v1/external` ist genau der
 * Bereich, der mit `X-API-Key` arbeitet.
 *
 * ES IST TROTZDEM NUR EINE LOGIK. Jede dieser Routen ruft denselben Dienst,
 * den auch die Sitzungsroute aus C3 ruft (`services/app/appStore.js`); der
 * Unterschied zwischen den beiden Wegen endet bei der Anmeldung. Zwei
 * Einspiel-Logiken waeren zwei Verhalten, und der Betreiber saehe je nach Weg
 * ein anderes Geraet.
 *
 * WER DARF: ein Schluessel mit dem Bereich `app:deploy`
 * (`middleware/apiKeyAuth.js`). Den legt der Installer am Geraet an
 * (`scripts/util/kit-schluessel.sh`), er wird einmal ausgegeben und ist vom
 * Administrator widerrufbar. Die Schluessel, die das Geraet den Apps selbst
 * mitgibt (C4), tragen ihn NICHT -- keine App ersetzt eine andere.
 *
 * `GET /contract` steht bewusst nicht dahinter: es genuegt irgendein gueltiger
 * Schluessel. Der Kontrakt ist die Beschreibung einer Schnittstelle und kein
 * Geheimnis; ihn hinter dem Bereich zu verstecken hiesse, dass eine App nicht
 * nachlesen darf, wie sie mit dem Geraet redet, in dem sie laeuft.
 */

const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const router = express.Router();
const { requireApiKey, requireEndpoint } = require('../../middleware/apiKeyAuth');
const { uploadLimiter } = require('../../middleware/rateLimit');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateBody, validateParams, validateQuery } = require('../../middleware/validate');
const { AppParams, SchaltenBody, EntfernenQuery } = require('../../schemas/apps');
const { ValidationError } = require('../../utils/errors');
const appPaket = require('../../services/app/appPaket');
const appStore = require('../../services/app/appStore');
const appKontrakt = require('../../services/app/appKontrakt');
const { logSecurityEvent } = require('../../utils/auditLog');

/**
 * Das Archiv landet auf der Platte, nicht im Speicher.
 *
 * Die uebrigen Uploads dieses Routers sind Dokumente von wenigen Megabyte und
 * gehen durch `multer.memoryStorage()`. Ein App-Paket darf zweihundert sein,
 * und zweihundert Megabyte im Speicher eines Geraets, das nebenher ein
 * Sprachmodell auf der GPU haelt, sind keine gute Idee -- zumal der naechste
 * Schritt ohnehin ein `tar.x` von der Platte ist.
 *
 * Er liegt im Eingang unter `APPS_DIR` und nicht in `/tmp`: von dort wandert
 * das ausgepackte Verzeichnis mit einem `rename` an seinen Platz, und das geht
 * nur innerhalb eines Dateisystems (`services/app/appPaket.js`).
 */
const ablage = multer.diskStorage({
  destination: (req, datei, weiter) => {
    const ordner = appPaket.eingangsOrdner();
    fs.mkdir(ordner, { recursive: true }, fehler => weiter(fehler, ordner));
  },
  filename: (req, datei, weiter) => {
    // Der Name des Aufrufers wird NICHT uebernommen. Er landete sonst als
    // Dateiname am Geraet, und ein Dateiname aus der Ferne ist die aelteste
    // aller Fallen. Was drin ist, sagt das Manifest im Archiv.
    weiter(null, `paket-${crypto.randomBytes(8).toString('hex')}.tgz`);
  },
});

const paketUpload = multer({
  storage: ablage,
  limits: { fileSize: appPaket.MAX_ARCHIV_BYTES, files: 1 },
  fileFilter: (req, datei, weiter) => {
    const name = (datei.originalname || '').toLowerCase();
    if (name.endsWith('.tar.gz') || name.endsWith('.tgz')) {
      weiter(null, true);
      return;
    }
    weiter(
      new ValidationError(
        `Ein App-Paket ist ein .tar.gz (oder .tgz), nicht "${datei.originalname}". ` +
          'Gepackt wird der INHALT des Ordners: tar czf paket.tgz -C <ordner> .'
      )
    );
  },
});

/**
 * GET /api/v1/external/contract — der Vertrag zwischen Geraet und Kit.
 *
 * Die einzige Quelle, gegen die das Kit seine Vorlage prueft, und der Weg, auf
 * dem es merkt, dass es zu einem Geraet nicht passt. Was darin steht und
 * warum, erklaert `services/app/appKontrakt.js`.
 */
router.get(
  '/contract',
  requireApiKey,
  asyncHandler((req, res) => {
    res.json({ data: appKontrakt.kontrakt(), timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/v1/external/apps — ein Paket einspielen.
 *
 * Multipart mit dem Feld `paket`. Rollt IMMER in den Teststand; einen
 * Parameter dafuer gibt es nicht (siehe `services/app/appPaket.js`).
 *
 * Die Drossel ist `uploadLimiter` und nicht die des Schluessels: die zaehlt
 * Aufrufe je Minute und weiss nichts davon, dass hinter diesem einen ein Bau
 * steht, der Minuten dauert.
 */
router.post(
  '/apps',
  requireApiKey,
  requireEndpoint('app:deploy'),
  uploadLimiter,
  paketUpload.single('paket'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ValidationError(
        'Kein Paket dabei. Erwartet wird ein Multipart-Feld `paket` mit einem .tar.gz.'
      );
    }
    const stand = await appPaket.nimmAn({
      archivPfad: path.resolve(req.file.path),
      durch: req.apiKey.userId ?? null,
    });
    logSecurityEvent({
      userId: req.apiKey.userId ?? null,
      action: 'app_paket_eingespielt',
      details: {
        app_id: stand.app_id,
        version: stand.version,
        stand: stand.stand,
        schluessel: req.apiKey.prefix,
      },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.status(201).json({ data: stand, timestamp: new Date().toISOString() });
  })
);

/**
 * GET /api/v1/external/apps/:id — was das Geraet ueber diese App weiss.
 *
 * Das Kit braucht die Antwort nach jedem Schritt: welche Version steht im
 * Teststand, welche im Livestand, welche lag vorher live, laeuft der
 * Container. Ohne sie muesste es raten oder einen Menschen fragen.
 */
router.get(
  '/apps/:id',
  requireApiKey,
  requireEndpoint('app:deploy'),
  validateParams(AppParams),
  asyncHandler(async (req, res) => {
    const data = await appStore.holeApp(req.params.id);
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/v1/external/apps/:id/schalten — den Livestand setzen.
 *
 * `{"ziel":"live"}` nimmt die Version aus dem Teststand, `{"ziel":"zurueck"}`
 * die, die vorher live war. Beides in `appStore.schalte`, samt der Begruendung,
 * warum `zurueck` ein Tausch und keine Einbahnstrasse ist.
 */
router.post(
  '/apps/:id/schalten',
  requireApiKey,
  requireEndpoint('app:deploy'),
  validateParams(AppParams),
  validateBody(SchaltenBody),
  asyncHandler(async (req, res) => {
    const data = await appStore.schalte({
      appId: req.params.id,
      ziel: req.body.ziel,
      durch: req.apiKey.userId ?? null,
    });
    logSecurityEvent({
      userId: req.apiKey.userId ?? null,
      action: 'app_geschaltet',
      details: {
        app_id: req.params.id,
        ziel: req.body.ziel,
        version: data.version,
        schluessel: req.apiKey.prefix,
      },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

/**
 * DELETE /api/v1/external/apps/:id — die App entfernen, nach Rueckfrage.
 *
 * Die Rueckfrage einer Schnittstelle ist kein Dialog, sondern ein Wort, das
 * der Aufrufer abtippen muss: `?bestaetigung=<id>`. Wer die Kennung
 * hinschreibt, hat gelesen, was er loescht -- und ein `DELETE`, das jemand aus
 * der Befehlszeile wiederholt hat, ohne den Pfad zu lesen, geht damit nicht
 * durch.
 *
 * Was faellt: beide Container mitsamt ihren Volumes (`remove({v: true})`),
 * beide Staende, alle Freigaben, die Schluessel der App. Mit `?dateien=true`
 * zusaetzlich die Ordner unter `/arasul/apps/<id>/`.
 */
router.delete(
  '/apps/:id',
  requireApiKey,
  requireEndpoint('app:deploy'),
  validateParams(AppParams),
  validateQuery(EntfernenQuery),
  asyncHandler(async (req, res) => {
    if (req.query.bestaetigung !== req.params.id) {
      throw new ValidationError(
        `Rueckfrage: haenge \`?bestaetigung=${req.params.id}\` an, wenn diese App wirklich weg soll. ` +
          'Beide Container und ihre Volumes fallen dabei.'
      );
    }
    const data = await appStore.entferneApp(req.params.id, { dateien: req.query.dateien });
    logSecurityEvent({
      userId: req.apiKey.userId ?? null,
      action: 'app_entfernt',
      details: {
        app_id: req.params.id,
        dateien: req.query.dateien,
        schluessel: req.apiKey.prefix,
      },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

module.exports = router;
