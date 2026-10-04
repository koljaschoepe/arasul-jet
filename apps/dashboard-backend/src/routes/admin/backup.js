/**
 * Sichern, auflisten, wiederherstellen (Phase C9 des Umbaus vom 26.08.2026).
 *
 * BIS HIERHER WAR DAS EIN PLATZHALTER. `POST /trigger` warf
 * `NotImplementedError` und verwies auf den Zeitplan, `GET /history` zaehlte
 * Ordner auf einer externen SSD, die es an keinem Geraet gab, und
 * wiederherstellen liess sich ueber die Schnittstelle gar nichts. Fuer eine
 * Abnahme, die nur ueber einen Tunnel messen kann, war damit nichts messbar.
 *
 * Jetzt beantwortet dieser Router vier Fragen, und jede davon aus dem Geraet
 * und nicht aus einer Absichtserklaerung:
 *
 *   GET  /api/backup/status              Sichert dieses Geraet wirklich? Wann
 *                                        lag zuletzt eine Kopie AUSSERHALB?
 *   GET  /api/backup/sicherungen         Was liegt da, wie gross, wie alt?
 *   GET  /api/backup/extern/inhalt       Was liegt auf dem Datentraeger? (J37)
 *   GET  /api/backup/staende             Die Staende zum Zurueckholen: Zeitpunkt,
 *                                        Inhalt (Apps, Bereiche), Stand davor.
 *   POST /api/backup/sicherung           Jetzt sichern.
 *   POST /api/backup/wiederherstellung   Zurueck -- und danach laufen die Apps
 *                                        wieder, aus ihren gesicherten Paketen
 *                                        neu gebaut.
 *   POST /api/backup/wiederherstellung/app/:id
 *                                        Nur die Daten EINER App (J35), ohne
 *                                        den Rest des Geraets anzufassen.
 *   POST /api/backup/wiederherstellung/bereich/:kennung
 *                                        Nur die Dateien EINES Bereichs des
 *                                        Firmenordners (M5).
 *   POST /api/backup/test                Der Wiederherstellungstest, ohne den
 *                                        Betrieb anzufassen.
 *
 * WER DARF DAS: `admin`. Eine Wiederherstellung ersetzt die ganze Datenbank;
 * das ist kein Knopf fuer einen Mitarbeiter.
 *
 * JEDES ZURUECKHOLEN (Auftrag sicherung-zurueckholen, M5, 04.10.2026)
 * verlangt das PASSWORT des angemeldeten Administrators und sichert vorher den
 * jetzigen Stand (`sicherungsdienst.sichereVorher`): mit ihm laesst sich das
 * Zurueckholen selbst rueckgaengig machen. Ein falsches Passwort ist ein 403
 * mit `PASSWORT_FALSCH`, und je Mensch gehen zehn Versuche in 15 Minuten.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const { createUserRateLimiter } = require('../../middleware/rateLimit');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateBody, validateParams, validateQuery } = require('../../middleware/validate');
const { logSecurityEvent } = require('../../utils/auditLog');
const logger = require('../../utils/logger');
const sicherungsdienst = require('../../services/betrieb/sicherungsdienst');
const { bestaetigeMitProtokoll } = require('../../services/auth/passwortBestaetigung');
const {
  WiederherstellungBody,
  AppWiederherstellungParams,
  AppWiederherstellungBody,
  BereichWiederherstellungParams,
  BereichWiederherstellungBody,
  StaendeQuery,
} = require('../../schemas/admin-backup');
const { ValidationError } = require('../../utils/errors');

/**
 * Zehn Versuche je Mensch und Viertelstunde fuer alles, was zurueckholt. Ein
 * Zurueckholen dauert Minuten; wer zehnmal in 15 Minuten ansetzt, raet ein
 * Passwort und holt nichts zurueck.
 */
const zurueckholenDrossel = createUserRateLimiter(10, 15 * 60 * 1000);

/**
 * Das Passwort pruefen und einen Fehlversuch ins Sicherheitsprotokoll
 * schreiben -- das Passwort selbst nie.
 */
function passwortBestaetigt(req, action) {
  return bestaetigeMitProtokoll({
    userId: req.user.id,
    passwort: req.body.passwort,
    action,
    ipAddress: req.ip,
    requestId: req.headers['x-request-id'],
  });
}

/**
 * GET /api/backup/status
 *
 * Zwei verschiedene Dinge, die hier bis zum 23.08.2026 eines waren.
 * `backupEnabled` stand auf „haengt eine externe Platte dran". Auf dem Orin
 * gemessen: keine Platte angesteckt, Antwort `false` -- und gleichzeitig 38
 * Postgres-Sicherungen, 4,9 GB, letzte Sicherung drei Stunden alt. Das Geraet
 * sicherte also, und der Endpunkt sagte das Gegenteil.
 *
 * Seit Phase C9 sind es endgueltig zwei getrennte Angaben: `sichertWirklich`
 * (hat es gesichert) und `ausserhalb` (liegt eine Kopie ausser Haus). Die
 * zweite ist leer, solange noch nie eine entstanden ist -- und sagt das,
 * statt zu schweigen.
 */
router.get(
  '/status',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    res.json({ data: await sicherungsdienst.status(), timestamp: new Date().toISOString() });
  })
);

/**
 * GET /api/backup/sicherungen
 *
 * Gelesen wird die Platte, nicht der Bericht der letzten Nacht: der Bericht
 * sagt, was getan wurde, die Platte sagt, was heute noch zurueckspielbar ist.
 */
router.get(
  '/sicherungen',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const liste = await sicherungsdienst.sicherungen();
    res.json({
      data: liste,
      anzahl: liste.length,
      bytes: liste.reduce((summe, s) => summe + s.bytes, 0),
      ordner: sicherungsdienst.SICHERUNGS_ORDNER,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/backup/extern/inhalt
 *
 * Was liegt auf dem angesteckten Datentraeger (J37): das Verzeichnis
 * (`MANIFEST.json`) des neuesten Tagesordners. Ohne Datentraeger
 * `angesteckt: false` und sonst nichts -- kein Fehler, denn ein Stick, der
 * nicht steckt, ist ein Zustand.
 */
router.get(
  '/extern/inhalt',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    res.json({ data: await sicherungsdienst.externInhalt(), timestamp: new Date().toISOString() });
  })
);

/**
 * GET /api/backup/staende?quelle=lokal|extern
 *
 * Die Staende zum Zurueckholen, neueste zuerst (Auftrag
 * sicherung-zurueckholen, M5): Zeitpunkt, ob er vor einem Zurueckholen
 * entstand und wofuer, und was darin steht -- Apps und Bereiche des
 * Firmenordners mit ihren Namen. Die Kennung `id` nennt den Stand beim
 * Zurueckholen; ein Mensch waehlt nach Datum und Uhrzeit.
 */
router.get(
  '/staende',
  requireAuth,
  requireRole('admin'),
  validateQuery(StaendeQuery),
  asyncHandler(async (req, res) => {
    const staende = await sicherungsdienst.staendeZumZurueckholen(req.query.quelle);
    res.json({
      data: staende,
      anzahl: staende.length,
      quelle: req.query.quelle,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/backup/sicherung
 *
 * Sichert JETZT. Die Antwort kommt erst, wenn es durch ist -- am Jetson sind
 * das Minuten. Das ist Absicht: ein `202 angenommen` mit einem Zustand zum
 * Nachfragen waere ein zweiter Zustandsautomat fuer einen Vorgang, der ohnehin
 * hoechstens einmal am Tag laeuft, und die Abnahme muesste ihn abfragen,
 * statt eine Antwort zu lesen.
 */
router.post(
  '/sicherung',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    logger.info(`Sicherung von Hand angestoßen von ${req.user.username}`);
    const ergebnis = await sicherungsdienst.sichereJetzt();

    logSecurityEvent({
      userId: req.user.id,
      action: 'sicherung_angestossen',
      details: { erfolg: ergebnis.erfolg },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });

    res.status(ergebnis.erfolg ? 200 : 500).json({
      data: {
        erfolg: ergebnis.erfolg,
        bericht: ergebnis.bericht,
        ausgabe: ergebnis.ausgabe,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/backup/wiederherstellung
 *
 * Der Weg zurueck. Zwei Schritte in einem Aufruf: das Skript im
 * Sicherungs-Container holt Datenbank, App-Pakete und Flow-Dateien zurueck,
 * danach baut das Backend jeden App-Stand aus seinem Paket neu.
 *
 * OHNE `bestaetigung` PASSIERT NICHTS. Das ist der Aufruf, der die ganze
 * Datenbank ersetzt; ein Tippfehler in einem Skript darf ihn nicht ausloesen.
 */
router.post(
  '/wiederherstellung',
  requireAuth,
  requireRole('admin'),
  zurueckholenDrossel,
  validateBody(WiederherstellungBody),
  asyncHandler(async (req, res) => {
    const { datei, stand, bestaetigung, quelle, wiederherstellungscode } = req.body;
    await passwortBestaetigt(req, 'wiederherstellung');

    logger.warn(
      `Wiederherstellung angestoßen von ${req.user.username} (${
        stand ? `Stand ${stand}` : datei || 'neueste Sicherung'
      })`
    );
    logSecurityEvent({
      userId: req.user.id,
      action: 'wiederherstellung_angestossen',
      // Der Code selbst steht nie im Protokoll, nur ob einer mitkam.
      details: {
        datei: datei ?? null,
        stand: stand ?? null,
        bestaetigung,
        quelle,
        mit_code: Boolean(wiederherstellungscode),
      },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });

    const ergebnis = await sicherungsdienst.stelleWiederHer({
      datei,
      stand,
      durch: req.user.id,
      quelle,
      wiederherstellungscode,
      vorherSichern: true,
    });

    res.status(ergebnis.erfolg ? 200 : 500).json({
      data: {
        erfolg: ergebnis.erfolg,
        bericht: ergebnis.bericht,
        apps: ergebnis.apps,
        vorher: ergebnis.vorher
          ? {
              erfolg: ergebnis.vorher.erfolg,
              id: ergebnis.vorher.id,
              zeitpunkt: ergebnis.vorher.zeitpunkt,
            }
          : null,
        ausgabe: ergebnis.ausgabe,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/backup/wiederherstellung/app/:id
 *
 * Die Daten einer App aus einem Stand, und nur sie (J35), dazu ihr Paket. Geht
 * auch, wenn die App gerade entfernt ist: dann liegen die Daten bereit, und
 * das naechste Einspielen findet sie vor.
 *
 * Bestaetigt mit dem Passwort; `stand_id` waehlt den Zeitpunkt (sonst der
 * neueste). Vorher entsteht ein Stand des ganzen Geraets (M5). Die alte
 * Bestaetigung mit der Kennung (`bestaetigung`) geht weiter, muss dann aber
 * stimmen.
 */
router.post(
  '/wiederherstellung/app/:id',
  requireAuth,
  requireRole('admin'),
  zurueckholenDrossel,
  validateParams(AppWiederherstellungParams),
  validateBody(AppWiederherstellungBody),
  asyncHandler(async (req, res) => {
    const appId = req.params.id;
    if (req.body.bestaetigung !== undefined && req.body.bestaetigung !== appId) {
      throw new ValidationError(
        `Zum Bestätigen muss \`bestaetigung\` die Kennung der App enthalten ("${appId}"). ` +
          'Dieser Aufruf ersetzt ihre Daten durch die der letzten Sicherung.'
      );
    }
    await passwortBestaetigt(req, 'app_daten_wiederhergestellt');
    logger.warn(`Daten der App ${appId} werden zurückgeholt, von ${req.user.username}`);
    logSecurityEvent({
      userId: req.user.id,
      action: 'app_daten_wiederhergestellt',
      details: {
        app_id: appId,
        stand: req.body.stand ?? null,
        stand_id: req.body.stand_id ?? null,
        quelle: req.body.quelle,
        paket: req.body.paket,
        mit_code: Boolean(req.body.wiederherstellungscode),
      },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });

    const ergebnis = await sicherungsdienst.stelleAppWiederHer({
      appId,
      stand: req.body.stand ?? null,
      standId: req.body.stand_id ?? null,
      quelle: req.body.quelle,
      paket: req.body.paket,
      wiederherstellungscode: req.body.wiederherstellungscode,
      durch: req.user.id,
      vorherSichern: true,
    });
    res.status(ergebnis.erfolg ? 200 : 500).json({
      data: ergebnis,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/backup/wiederherstellung/bereich/:kennung
 *
 * Die Dateien EINES Bereichs des Firmenordners auf den Stand `stand_id`
 * (Auftrag sicherung-zurueckholen, M5): was seitdem dazukam, geht, was fehlt,
 * kommt wieder, Geaendertes bekommt den Inhalt von damals. Kein anderer
 * Bereich, keine Rechte. Bestaetigt mit dem Passwort, vorher ein Stand des
 * ganzen Geraets.
 */
router.post(
  '/wiederherstellung/bereich/:kennung',
  requireAuth,
  requireRole('admin'),
  zurueckholenDrossel,
  validateParams(BereichWiederherstellungParams),
  validateBody(BereichWiederherstellungBody),
  asyncHandler(async (req, res) => {
    const { kennung } = req.params;
    await passwortBestaetigt(req, 'bereich_wiederhergestellt');
    logger.warn(`Bereich ${kennung} wird zurückgeholt, von ${req.user.username}`);
    logSecurityEvent({
      userId: req.user.id,
      action: 'bereich_wiederhergestellt',
      details: {
        bereich: kennung,
        stand_id: req.body.stand_id ?? null,
        quelle: req.body.quelle,
        mit_code: Boolean(req.body.wiederherstellungscode),
      },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });
    const ergebnis = await sicherungsdienst.stelleBereichWiederHer({
      kennung,
      standId: req.body.stand_id ?? null,
      quelle: req.body.quelle,
      wiederherstellungscode: req.body.wiederherstellungscode,
      vorherSichern: true,
    });
    res.status(ergebnis.erfolg ? 200 : 500).json({
      data: ergebnis,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/backup/test
 *
 * Der Wiederherstellungstest: eine Wegwerf-Datenbank, die neueste Sicherung
 * hinein, nachzaehlen. Er faellt nicht ueber den Betrieb her und beantwortet
 * die Frage, die ein Zeitplan sonst nur einmal in der Woche stellt.
 */
router.post(
  '/test',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const ergebnis = await sicherungsdienst.testeWiederherstellung();
    res.status(ergebnis.erfolg ? 200 : 500).json({
      data: { erfolg: ergebnis.erfolg, bericht: ergebnis.bericht, ausgabe: ergebnis.ausgabe },
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
