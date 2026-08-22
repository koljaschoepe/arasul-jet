/**
 * Flow-Verwaltung (Plan 011, Schritt 5).
 *
 * Flows sind Markdown-Dateien unter `data/flows/` — es gibt keine Tabelle.
 * Diese Routen sind eine dünne Schicht über der Registry: auflisten, lesen,
 * anlegen, ändern, löschen. Jede Änderung wird gegen das Schema geprüft, BEVOR
 * geschrieben wird (in `saveFlow`), damit ein fehlerhafter Flow gar nicht
 * erst entstehen kann.
 *
 * Es gibt bewusst keine Rechteprüfung: die Anwendung kennt nur einen Admin
 * (Plan 011, §8).
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../database');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody, validateParams, validateQuery } = require('../middleware/validate');
const {
  CreateFlowBody,
  SaveFlowBody,
  FlowNameParams,
  VorlageNameParams,
  RunIdParams,
  FlowAntwortBody,
  WiederholenBody,
  ListRunsQuery,
  StartRunBody,
  FlowProjektQuery,
  VALID_TOOLS,
} = require('../schemas/flows');
const projectService = require('../services/rag/projectService');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { llmLimiter, uploadLimiter } = require('../middleware/rateLimit');
const { mitNamensReparatur } = require('../utils/uploadName');
const logger = require('../utils/logger');
const registry = require('../services/flows/flowRegistry');
const runStore = require('../services/flows/runStore');
const flowRunner = require('../services/flows/flowRunner');
const frageStore = require('../services/flows/frageStore');
const { resolveArguments } = require('../services/flows/runFlow');
const { berechneVorabErgebnisse } = require('../services/flows/stepExecutor');
const { serializeFlowFile } = require('../services/flows/flowFile');
const { implementedTools } = require('../services/flows/toolRegistry');
const vorlagenStore = require('../services/flows/vorlagenStore');
const beispielKatalog = require('../services/flows/beispielKatalog');
const { initSSE, trackConnection } = require('../utils/sseHelper');

// Upload für Stilvorlagen (Word/PDF/Markdown/Text/HTML, max. 20 MB).
const vorlagenUpload = multer(
  mitNamensReparatur({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const erlaubt = ['.docx', '.pdf', '.md', '.markdown', '.txt', '.html', '.htm'];
      const ext = '.' + (file.originalname.split('.').pop() || '').toLowerCase();
      if (erlaubt.includes(ext)) {
        cb(null, true);
      } else {
        cb(
          new ValidationError(
            `Vorlagenformat ${ext} nicht unterstützt (erlaubt: ${erlaubt.join(', ')})`
          )
        );
      }
    },
  })
);

/**
 * Formt eine interne Definition in die API-Antwort um. `systemPrompt` heißt
 * nach außen `prompt` — im Chat und im Dialog ist das schlicht "der Prompt".
 */
function toApi(flow) {
  const { systemPrompt, ...rest } = flow;
  return { ...rest, prompt: systemPrompt };
}

/** Baut aus einem API-Body die interne Definition (Gegenrichtung zu `toApi`). */
function fromApi(name, body) {
  const { prompt, ...rest } = body;
  return { ...rest, name, systemPrompt: prompt };
}

// GET /api/flows — alle Flows auflisten: die globalen plus die
// projektgebundenen aus den `flows/`-Ordnern aller Projekte (Plan 014,
// Phase 1). Jeder Eintrag trägt `projekt` (null = global), damit das Frontend
// gruppieren und das Chat-Menü nach aktivem Projekt filtern kann.
// Fehlerhafte Dateien lassen die Liste NICHT scheitern, sondern werden separat
// gemeldet: ein kaputter Flow darf nicht das ganze Slash-Menü lahmlegen.
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { flows, fehlerhaft } = await registry.listFlows();
    const data = flows.map(f => ({ ...toApi(f), projekt: null }));
    const alleFehler = [...fehlerhaft];

    const projekte = await projectService.listProjects();
    for (const p of projekte) {
      const projektErgebnis = await registry.listFlows({ projektId: p.id });
      for (const f of projektErgebnis.flows) {
        data.push({ ...toApi(f), projekt: { id: p.id, name: p.name } });
      }
      for (const fehler of projektErgebnis.fehlerhaft) {
        alleFehler.push({ ...fehler, projekt: { id: p.id, name: p.name } });
      }
    }

    res.json({
      data,
      fehlerhaft: alleFehler,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/flows/werkzeuge — die verfügbaren Werkzeugnamen.
// Speist die Ankreuzfelder im Anlege-Dialog, damit die Liste nicht im Frontend
// dupliziert wird und dort veralten kann.
//
// `verfuegbar` sagt, ob das Werkzeug heute schon etwas tut. Ein Flow darf auch
// ein noch nicht gebautes Werkzeug deklarieren (Terminal, Web, Subagent folgen
// in den Schritten 7, 8 und 11) — der Dialog kann es dann als "kommt noch"
// kennzeichnen, statt dem Nutzer eine funktionierende Fähigkeit vorzugaukeln.
router.get(
  '/werkzeuge',
  requireAuth,
  asyncHandler(async (req, res) => {
    const nutzbar = new Set(implementedTools());
    res.json({
      data: VALID_TOOLS.map(name => ({ name, verfuegbar: nutzbar.has(name) })),
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/flows/sammlungen — die auswählbaren Wissensbasen.
// Braucht der Argumenttyp `wissensbasis`. Workspace-interne Räume
// (is_workspace = TRUE) sind unsichtbar und deshalb ausgeblendet.
router.get(
  '/sammlungen',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT id, name, slug, description
         FROM knowledge_spaces
        WHERE is_workspace = FALSE
        ORDER BY name ASC`
    );
    res.json({ data: result.rows, timestamp: new Date().toISOString() });
  })
);

// --- Beispiele (Plan 023 B4) ------------------------------------------------
// BEWUSST vor `/:name` registriert, sonst finge die Flow-Route "/beispiele" als
// vermeintlichen Flow-Namen ab.
//
// Ab Werk ist kein Flow enthalten (Entscheidung E6). Die fünf mitgelieferten
// Vorlagen werden deshalb nicht mehr angelegt, sondern angeboten: der
// Anlege-Dialog füllt sein Formular daraus, angelegt wird erst beim Speichern.

// GET /api/flows/beispiele — die mitgelieferten Startpunkte.
router.get(
  '/beispiele',
  requireAuth,
  asyncHandler(async (req, res) => {
    const beispiele = await beispielKatalog.listeBeispiele();
    res.json({
      data: beispiele.map(({ name, beschreibung }) => ({ name, beschreibung })),
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/flows/beispiele/:name — ein Beispiel als fertige Flow-Definition.
router.get(
  '/beispiele/:name',
  requireAuth,
  asyncHandler(async (req, res) => {
    const definition = await beispielKatalog.ladeBeispiel(req.params.name);
    if (!definition) {
      throw new NotFoundError(`Kein Beispiel mit dem Namen "${req.params.name}"`);
    }
    // Ueber toApi, damit das Beispiel genauso aussieht wie ein geladener Flow:
    // das Formular im Frontend fuellt sich aus beiden mit demselben Code.
    res.json({ data: toApi(definition), timestamp: new Date().toISOString() });
  })
);

// --- Stilvorlagen (Flows-Umbau 2026-08-02) ----------------------------------
// BEWUSST vor `/:name` registriert (wie /laeufe), sonst finge die Flow-Route
// "/vorlagen" als vermeintlichen Flow-Namen ab.

// GET /api/flows/vorlagen — die hochgeladenen Stilvorlagen.
router.get(
  '/vorlagen',
  requireAuth,
  asyncHandler(async (req, res) => {
    const vorlagen = await vorlagenStore.listVorlagen();
    res.json({ data: vorlagen, timestamp: new Date().toISOString() });
  })
);

// POST /api/flows/vorlagen — eine Stilvorlage hochladen (multipart, Feld "datei").
// Für PDF/Word wird der Text sofort extrahiert; scheitert das, kommt ein 400 —
// eine Vorlage ohne lesbaren Text wäre zur Laufzeit wirkungslos.
router.post(
  '/vorlagen',
  requireAuth,
  uploadLimiter,
  vorlagenUpload.single('datei'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ValidationError('Keine Datei hochgeladen (multipart-Feld "datei")');
    }
    const gespeichert = await vorlagenStore.saveVorlage({
      name: req.file.originalname,
      buffer: req.file.buffer,
    });
    res.status(201).json({ data: gespeichert, timestamp: new Date().toISOString() });
  })
);

// DELETE /api/flows/vorlagen/:name — eine Stilvorlage löschen.
router.delete(
  '/vorlagen/:name',
  requireAuth,
  validateParams(VorlageNameParams),
  asyncHandler(async (req, res) => {
    await vorlagenStore.deleteVorlage(req.params.name);
    res.json({ deleted: true, timestamp: new Date().toISOString() });
  })
);

// --- Läufe (Plan 011, Schritt 9) -------------------------------------------
// BEWUSST vor `/:name` registriert: Sonst finge die Flow-Route "/laeufe" als
// vermeintlichen Flow-Namen ab. Express nimmt die erste passende Route.

// GET /api/flows/laeufe — die neuesten Läufe des Nutzers (ohne Schritte).
router.get(
  '/laeufe',
  requireAuth,
  validateQuery(ListRunsQuery),
  asyncHandler(async (req, res) => {
    const runs = await runStore.listRuns({
      userId: req.user.id,
      limit: req.query.limit,
      conversationId: req.query.conversation_id ?? null,
      status: req.query.status ?? null,
      flowName: req.query.flow ?? null,
    });
    res.json({ data: runs, timestamp: new Date().toISOString() });
  })
);

// POST /api/flows/laeufe — einen Lauf LOSGELÖST starten. Antwortet SOFORT mit
// der Lauf-ID; der Lauf läuft serverseitig weiter (Schritt 12). Der Client
// öffnet danach den Ereignis-Strom unter /laeufe/:id/stream.
router.post(
  '/laeufe',
  requireAuth,
  // Ein Lauf ist ein teurer GPU-Vorgang. Früher bremste die synchrone
  // Ausführung von selbst (der Aufruf hing am Modell); jetzt kehrt der Start
  // sofort zurück, deshalb hier ein Limiter gegen zu viele Läufe hintereinander.
  llmLimiter,
  validateBody(StartRunBody),
  asyncHandler(async (req, res) => {
    // FRÜH prüfen, solange der Request noch da ist: Flow-Existenz UND Argumente.
    // Sonst käme ein Tippfehler (fehlendes Pflicht-Argument, unbekannter Flow)
    // erst asynchron als gescheiterter Lauf zurück — der Aufrufer soll ihn aber
    // sofort als 400/404 sehen. loadFlow wirft NotFound, resolveArguments wirft
    // ValidationError; beide werden zu einer sauberen Fehlerantwort.
    const projektId = req.body.projekt ?? null;
    const flow = await registry.loadFlow(req.body.flow, { projektId });
    resolveArguments(flow.argumente, req.body.args);

    const { runId } = await flowRunner.starten({
      flowName: req.body.flow,
      args: req.body.args,
      userId: req.user.id,
      conversationId: req.body.conversation_id ?? null,
      ordnerZiel: req.body.ordner_ziel ?? null,
      projektId,
    });
    res.status(202).json({ data: { runId }, timestamp: new Date().toISOString() });
  })
);

// GET /api/flows/laeufe/:id/stream — der Ereignis-Strom eines Laufs (SSE).
// Beim Verbinden wird ZUERST der gespeicherte Verlauf gesendet (Wiederverbinden:
// der Browser sieht sofort alles bis hierher), dann hängt sich der Strom an die
// Live-Ereignisse. Ist der Lauf schon beendet, kommt nur der Verlauf und der
// Strom schließt. Ein Verbindungsabbruch beendet den LAUF NICHT.
router.get(
  '/laeufe/:id/stream',
  requireAuth,
  validateParams(RunIdParams),
  asyncHandler(async (req, res) => {
    const runId = req.params.id;
    // Eigentümer-geprüft: getRun wirft NotFound bei fremd/unbekannt.
    const run = await runStore.getRun({ runId, userId: req.user.id });

    initSSE(res);
    const verbindung = trackConnection(res);

    const sende = evt => {
      if (verbindung.isConnected() && !res.writableEnded) {
        try {
          res.write(`data: ${JSON.stringify(evt)}\n\n`);
        } catch (err) {
          logger.debug(`Flow-Stream ${runId}: Schreibfehler: ${err.message}`);
        }
      }
    };

    // 1. Verlauf zuerst — der Wiederverbinden-Fall.
    sende({ type: 'verlauf', run });

    // 2. Ist der Lauf schon beendet, gibt es nichts Live mehr.
    if (run.status !== 'laeuft') {
      sende({ type: 'ende', status: run.status });
      res.end();
      return;
    }

    // 3. An die Live-Ereignisse hängen. Läuft der Lauf gar nicht mehr aktiv im
    //    Speicher (Nachlauf verpasst), ist er aber laut DB noch 'laeuft', dann
    //    ist er verwaist — sauber schließen statt ewig offen zu halten.
    let beendet = false;
    const schliessen = () => {
      if (beendet) {
        return;
      }
      beendet = true;
      if (typeof abmelden === 'function') {
        abmelden();
      }
      if (!res.writableEnded) {
        res.end();
      }
    };
    const abmelden = flowRunner.abonnieren(runId, evt => {
      sende(evt);
      if (evt.type === 'ende') {
        schliessen();
      }
    });

    if (!abmelden) {
      sende({ type: 'ende', status: run.status, hinweis: 'Lauf nicht mehr aktiv im Speicher' });
      res.end();
      return;
    }

    // WICHTIG (Wettlauf schließen): Zwischen dem ersten getRun oben und dem
    // Abonnieren gerade eben kann der Lauf fertig geworden sein — dann ist sein
    // 'ende'-Ereignis schon durch, bevor wir zuhörten, und der Bus feuert es nie
    // wieder (EventEmitter wiederholt nichts). Ohne die folgende Nachprüfung
    // hinge die Verbindung für immer. Deshalb JETZT — nach dem Abonnieren — den
    // Status noch einmal lesen: Ist er terminal, schließen wir selbst. Feuerte
    // 'ende' hingegen NACH dem Abonnieren, hat der Handler oben es bekommen.
    runStore
      .getRun({ runId, userId: req.user.id })
      .then(aktuell => {
        if (aktuell.status !== 'laeuft') {
          sende({ type: 'ende', status: aktuell.status });
          schliessen();
        }
      })
      .catch(err => {
        logger.debug(`Flow-Stream ${runId}: Nachprüfung fehlgeschlagen: ${err.message}`);
      });

    // Verbindungsabbruch: abmelden, aber den LAUF weiterlaufen lassen.
    verbindung.onClose(() => {
      if (typeof abmelden === 'function') {
        abmelden();
      }
    });
  })
);

// GET /api/flows/laeufe/:id — ein Lauf samt Schritten. `?raw=1` liefert auch
// die Rohdaten der Schritte (für die Nachschau; sie können groß sein).
router.get(
  '/laeufe/:id',
  requireAuth,
  validateParams(RunIdParams),
  asyncHandler(async (req, res) => {
    const run = await runStore.getRun({
      runId: req.params.id,
      userId: req.user.id,
      includeRaw: req.query.raw === '1' || req.query.raw === 'true',
    });
    res.json({ data: run, timestamp: new Date().toISOString() });
  })
);

// POST /api/flows/laeufe/:id/abbrechen — einen laufenden Lauf abbrechen.
// Über den Lauf-Verwalter: Er setzt den DB-Status UND das Abbruch-Signal, damit
// ein serverseitig laufender Lauf wirklich aufhört (Schritt 12), nicht nur in
// der DB als abgebrochen steht, während er heimlich weiterrechnet.
router.post(
  '/laeufe/:id/abbrechen',
  requireAuth,
  validateParams(RunIdParams),
  asyncHandler(async (req, res) => {
    const run = await flowRunner.abbrechen({ runId: req.params.id, userId: req.user.id });
    if (!run) {
      // Entweder gibt es den Lauf nicht (fremd/unbekannt) oder er läuft nicht
      // mehr. In beiden Fällen NotFound — die Existenz fremder Läufe wird nicht
      // verraten, und ein bereits beendeter Lauf ist nichts zum Abbrechen.
      throw new NotFoundError(`Kein laufender Flow-Lauf ${req.params.id}`);
    }
    res.json({ data: run, timestamp: new Date().toISOString() });
  })
);

// GET /api/flows/laeufe/:id/frage — die offene Rückfrage eines Laufs (I3).
// Für den Fall, dass der Nutzer die Seite neu lädt, während der Flow wartet:
// der Live-Kanal ist dann weg, die Frage nicht.
router.get(
  '/laeufe/:id/frage',
  requireAuth,
  validateParams(RunIdParams),
  asyncHandler(async (req, res) => {
    // `getRun` wirft NotFound, wenn der Lauf nicht diesem Nutzer gehört. Ohne
    // diesen Schritt verriete die Frage eines fremden Laufs ihren Inhalt.
    await runStore.getRun({ runId: req.params.id, userId: req.user.id });
    res.json({
      data: frageStore.offeneFrage(req.params.id),
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/flows/laeufe/:id/antwort — eine Rückfrage beantworten (I3).
router.post(
  '/laeufe/:id/antwort',
  requireAuth,
  validateParams(RunIdParams),
  validateBody(FlowAntwortBody),
  asyncHandler(async (req, res) => {
    await runStore.getRun({ runId: req.params.id, userId: req.user.id });
    const data = frageStore.beantworte(req.params.id, req.body.antwort);
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

// POST /api/flows/laeufe/:id/wiederholen — einen FEHLGESCHLAGENEN Lauf eines
// Flows mit deklarierter Schritt-Kette ab dem ersten gescheiterten Schritt
// wiederholen. Startet einen NEUEN Lauf desselben Flows mit denselben
// Argumenten; die Ausgaben der erfolgreichen Schritte des alten Laufs werden
// übernommen (im Protokoll als Schritte mit Vermerk), erst ab dem Fehler wird
// echt ausgeführt. Nur für den deterministischen Pfad — beim modellgetriebenen
// Lauf gibt es keine feste Kette, an der man wieder aufsetzen könnte.
router.post(
  '/laeufe/:id/wiederholen',
  requireAuth,
  // Wie beim Start: ein neuer Lauf ist ein teurer GPU-Vorgang.
  llmLimiter,
  validateParams(RunIdParams),
  validateBody(WiederholenBody),
  asyncHandler(async (req, res) => {
    // Eigentümer-geprüft (getRun wirft NotFound bei fremd/unbekannt), samt
    // Schritten — aus ihnen wird die Übernahme berechnet.
    const alt = await runStore.getRun({ runId: req.params.id, userId: req.user.id });
    if (alt.status !== 'fehler') {
      throw new ValidationError(
        `Nur fehlgeschlagene Läufe lassen sich wiederholen (Status: ${alt.status})`
      );
    }
    // Ein projektgebundener Lauf sucht seinen Flow wieder im selben Projekt.
    const altProjektId = alt.projekt_id ?? null;
    const flow = await registry.loadFlow(alt.flow_name, { projektId: altProjektId });
    if (!Array.isArray(flow.schritte) || flow.schritte.length === 0) {
      throw new ValidationError(
        'Wiederholen ab Fehler gibt es nur für Flows mit deklarierter Schritt-Kette'
      );
    }
    // Argumente FRÜH gegen die (womöglich inzwischen geänderte) Deklaration
    // prüfen — wie beim normalen Start soll ein Fehler sofort als 400 kommen,
    // nicht asynchron als gescheiterter Lauf.
    const args = alt.arguments || {};
    resolveArguments(flow.argumente, args);

    const vorabErgebnisse = berechneVorabErgebnisse(flow.schritte, alt.steps);
    const { runId } = await flowRunner.starten({
      flowName: alt.flow_name,
      args,
      userId: req.user.id,
      conversationId: alt.conversation_id ?? null,
      vorabErgebnisse,
      vorabQuelleLaufId: Number(alt.id),
      projektId: altProjektId,
    });
    res.status(202).json({
      data: { runId, uebernommeneSchritte: vorabErgebnisse.size },
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/flows/:name — einen Flow laden (`?projekt=<uuid>` = projektgebunden).
router.get(
  '/:name',
  requireAuth,
  validateParams(FlowNameParams),
  validateQuery(FlowProjektQuery),
  asyncHandler(async (req, res) => {
    const flow = await registry.loadFlow(req.params.name, { projektId: req.query.projekt });
    res.json({ data: toApi(flow), timestamp: new Date().toISOString() });
  })
);

// GET /api/flows/:name/datei — die rohe Markdown-Datei.
// Der Bearbeiten-Dialog zeigt sie als Vorschau; sie ist die Wahrheit, nicht das
// Formular.
router.get(
  '/:name/datei',
  requireAuth,
  validateParams(FlowNameParams),
  validateQuery(FlowProjektQuery),
  asyncHandler(async (req, res) => {
    const flow = await registry.loadFlow(req.params.name, { projektId: req.query.projekt });
    res.type('text/markdown').send(serializeFlowFile(flow));
  })
);

// POST /api/flows — einen Flow anlegen (schlägt fehl, wenn er existiert).
router.post(
  '/',
  requireAuth,
  validateBody(CreateFlowBody),
  asyncHandler(async (req, res) => {
    const saved = await registry.saveFlow(fromApi(req.body.name, req.body), { overwrite: false });
    res.status(201).json({ data: toApi(saved), timestamp: new Date().toISOString() });
  })
);

// PUT /api/flows/:name — einen bestehenden Flow ändern.
//
// Bewusst ZUSAMMENFÜHREND, nicht ersetzend: Im Body fehlende Felder behalten
// ihren bisherigen Wert. Ein reines Ersetzen wäre hier eine Falle — wer nur
// `{ prompt }` schickt, um einen Tippfehler zu beheben, hätte sonst still
// Werkzeuge, Rollen, Argumente, Ordner und Grenzen verloren, und zwar mit
// einer 200-Antwort. Wer ein Feld wirklich leeren will, schickt es explizit
// als leere Liste.
router.put(
  '/:name',
  requireAuth,
  validateParams(FlowNameParams),
  validateQuery(FlowProjektQuery),
  validateBody(SaveFlowBody),
  asyncHandler(async (req, res) => {
    const projektId = req.query.projekt ?? null;
    // Wirft 404, wenn es den Flow nicht gibt — kein stilles Anlegen.
    const bestehend = await registry.loadFlow(req.params.name, { projektId });
    // Nur tatsächlich gesetzte Felder übernehmen. Zod führt optionale Schlüssel
    // auch dann im Ergebnis, wenn sie im Body fehlten — dann stehen sie auf
    // `undefined` und würden beim Zusammenführen den Bestandswert überschreiben.
    const gesetzt = Object.fromEntries(
      Object.entries(req.body).filter(([, wert]) => wert !== undefined)
    );
    const zusammengefuehrt = { ...toApi(bestehend), ...gesetzt };
    const saved = await registry.saveFlow(fromApi(req.params.name, zusammengefuehrt), {
      overwrite: true,
      projektId,
    });
    res.json({ data: toApi(saved), timestamp: new Date().toISOString() });
  })
);

// DELETE /api/flows/:name — einen Flow löschen.
router.delete(
  '/:name',
  requireAuth,
  validateParams(FlowNameParams),
  validateQuery(FlowProjektQuery),
  asyncHandler(async (req, res) => {
    await registry.deleteFlow(req.params.name, { projektId: req.query.projekt });
    res.json({ deleted: true, timestamp: new Date().toISOString() });
  })
);

module.exports = router;
