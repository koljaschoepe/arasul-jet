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
 *   POST /api/backup/sicherung           Jetzt sichern.
 *   POST /api/backup/wiederherstellung   Zurueck -- und danach laufen die Apps
 *                                        wieder, aus ihren gesicherten Paketen
 *                                        neu gebaut.
 *   POST /api/backup/test                Der Wiederherstellungstest, ohne den
 *                                        Betrieb anzufassen.
 *
 * WER DARF DAS: `admin`. Eine Wiederherstellung ersetzt die ganze Datenbank;
 * das ist kein Knopf fuer einen Mitarbeiter.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateBody } = require('../../middleware/validate');
const { logSecurityEvent } = require('../../utils/auditLog');
const logger = require('../../utils/logger');
const sicherungsdienst = require('../../services/betrieb/sicherungsdienst');
const { WiederherstellungBody } = require('../../schemas/admin-backup');

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
    logger.info(`Sicherung von Hand angestossen von ${req.user.username}`);
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
  validateBody(WiederherstellungBody),
  asyncHandler(async (req, res) => {
    const { datei, bestaetigung } = req.body;

    logger.warn(
      `Wiederherstellung angestossen von ${req.user.username} (${datei || 'neueste Sicherung'})`
    );
    logSecurityEvent({
      userId: req.user.id,
      action: 'wiederherstellung_angestossen',
      details: { datei: datei ?? null, bestaetigung },
      ipAddress: req.ip,
      requestId: req.headers['x-request-id'],
    });

    const ergebnis = await sicherungsdienst.stelleWiederHer({ datei, durch: req.user.id });

    res.status(ergebnis.erfolg ? 200 : 500).json({
      data: {
        erfolg: ergebnis.erfolg,
        bericht: ergebnis.bericht,
        apps: ergebnis.apps,
        ausgabe: ergebnis.ausgabe,
      },
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
