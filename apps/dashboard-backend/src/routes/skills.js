/**
 * Skill-Verwaltung (Plan 011, Schritt 5).
 *
 * Skills sind Markdown-Dateien unter `data/skills/` — es gibt keine Tabelle.
 * Diese Routen sind eine dünne Schicht über der Registry: auflisten, lesen,
 * anlegen, ändern, löschen. Jede Änderung wird gegen das Schema geprüft, BEVOR
 * geschrieben wird (in `saveSkill`), damit ein fehlerhafter Skill gar nicht
 * erst entstehen kann.
 *
 * Es gibt bewusst keine Rechteprüfung: die Anwendung kennt nur einen Admin
 * (Plan 011, §8).
 */

const express = require('express');
const router = express.Router();
const pool = require('../database');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody, validateParams } = require('../middleware/validate');
const {
  CreateSkillBody,
  SaveSkillBody,
  SkillNameParams,
  VALID_TOOLS,
} = require('../schemas/skills');
const registry = require('../services/skills/skillRegistry');
const { serializeSkillFile, parseSkillFile } = require('../services/skills/skillFile');
const { implementedTools } = require('../services/skills/toolRegistry');

/**
 * Formt eine interne Definition in die API-Antwort um. `systemPrompt` heißt
 * nach außen `prompt` — im Chat und im Dialog ist das schlicht "der Prompt".
 */
function toApi(skill) {
  const { systemPrompt, ...rest } = skill;
  return { ...rest, prompt: systemPrompt };
}

/** Baut aus einem API-Body die interne Definition (Gegenrichtung zu `toApi`). */
function fromApi(name, body) {
  const { prompt, ...rest } = body;
  return { ...rest, name, systemPrompt: prompt };
}

// GET /api/skills — alle Skills auflisten.
// Fehlerhafte Dateien lassen die Liste NICHT scheitern, sondern werden separat
// gemeldet: ein kaputter Skill darf nicht das ganze Slash-Menü lahmlegen.
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { skills, fehlerhaft } = await registry.listSkills();
    res.json({
      data: skills.map(toApi),
      fehlerhaft,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/skills/werkzeuge — die verfügbaren Werkzeugnamen.
// Speist die Ankreuzfelder im Anlege-Dialog, damit die Liste nicht im Frontend
// dupliziert wird und dort veralten kann.
//
// `verfuegbar` sagt, ob das Werkzeug heute schon etwas tut. Ein Skill darf auch
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

// GET /api/skills/sammlungen — die auswählbaren Wissensbasen.
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

// GET /api/skills/:name — einen Skill laden.
router.get(
  '/:name',
  requireAuth,
  validateParams(SkillNameParams),
  asyncHandler(async (req, res) => {
    const skill = await registry.loadSkill(req.params.name);
    res.json({ data: toApi(skill), timestamp: new Date().toISOString() });
  })
);

// GET /api/skills/:name/datei — die rohe Markdown-Datei.
// Der Bearbeiten-Dialog zeigt sie als Vorschau; sie ist die Wahrheit, nicht das
// Formular.
router.get(
  '/:name/datei',
  requireAuth,
  validateParams(SkillNameParams),
  asyncHandler(async (req, res) => {
    const skill = await registry.loadSkill(req.params.name);
    res.type('text/markdown').send(serializeSkillFile(skill));
  })
);

// POST /api/skills/vorschau — Markdown-Vorschau OHNE zu speichern.
// Damit der Anlege-Dialog live zeigen kann, welche Datei entstehen würde —
// inklusive der Fehlermeldung, wenn die Eingaben (noch) ungültig sind.
router.post(
  '/vorschau',
  requireAuth,
  validateBody(CreateSkillBody),
  asyncHandler(async (req, res) => {
    const definition = fromApi(req.body.name, req.body);
    // Über die Registry-Prüfung laufen lassen, ohne zu schreiben: serialisieren
    // und zurückparsen ist genau das, was `saveSkill` vor dem Schreiben tut.
    const text = serializeSkillFile(definition);
    parseSkillFile(text, { name: req.body.name });
    res.json({ data: { datei: text }, timestamp: new Date().toISOString() });
  })
);

// POST /api/skills — einen Skill anlegen (schlägt fehl, wenn er existiert).
router.post(
  '/',
  requireAuth,
  validateBody(CreateSkillBody),
  asyncHandler(async (req, res) => {
    const saved = await registry.saveSkill(fromApi(req.body.name, req.body), { overwrite: false });
    res.status(201).json({ data: toApi(saved), timestamp: new Date().toISOString() });
  })
);

// PUT /api/skills/:name — einen bestehenden Skill ändern.
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
  validateParams(SkillNameParams),
  validateBody(SaveSkillBody),
  asyncHandler(async (req, res) => {
    // Wirft 404, wenn es den Skill nicht gibt — kein stilles Anlegen.
    const bestehend = await registry.loadSkill(req.params.name);
    // Nur tatsächlich gesetzte Felder übernehmen. Zod führt optionale Schlüssel
    // auch dann im Ergebnis, wenn sie im Body fehlten — dann stehen sie auf
    // `undefined` und würden beim Zusammenführen den Bestandswert überschreiben.
    const gesetzt = Object.fromEntries(
      Object.entries(req.body).filter(([, wert]) => wert !== undefined)
    );
    const zusammengefuehrt = { ...toApi(bestehend), ...gesetzt };
    const saved = await registry.saveSkill(fromApi(req.params.name, zusammengefuehrt), {
      overwrite: true,
    });
    res.json({ data: toApi(saved), timestamp: new Date().toISOString() });
  })
);

// DELETE /api/skills/:name — einen Skill löschen.
router.delete(
  '/:name',
  requireAuth,
  validateParams(SkillNameParams),
  asyncHandler(async (req, res) => {
    await registry.deleteSkill(req.params.name);
    res.json({ deleted: true, timestamp: new Date().toISOString() });
  })
);

module.exports = router;
