/**
 * Flow-Agenten-Routengruppe (Plan 010) — gemountet unter /api/agents.
 *
 * Bewusst getrennt von den Datei-Agenten (Plan 008, unter /api/sandbox/...):
 * eigene v2 mit eigenen DB-Tabellen und Routen.
 *
 * Schritt 1: nur die Admin-Provider-Key-Verwaltung. Agent-/Fluss-CRUD, Run-
 * und Trigger-Routen folgen in späteren Schritten und werden hier gemountet.
 */

const express = require('express');
const router = express.Router();

// Provider-Keys ZUERST mounten: das spezifischere Präfix darf nicht vom
// '/:id'-Muster des CRUD-Routers verschluckt werden.
router.use('/provider-keys', require('./providerKeys'));
router.use('/', require('./flowAgents'));

module.exports = router;
