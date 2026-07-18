/**
 * Workspace-Apps: An-/Abschalten der kuratierten Kern-Apps (n8n,
 * Datenbank) in der Workspace-Shell. Persistenz in platform_apps
 * (Migration 100). Deaktivierte Apps verschwinden aus ActivityBar und
 * Tab-Angebot — die Dienste selbst laufen weiter (reine UI-Sichtbarkeit).
 *
 * Bewusst getrennt vom Container-AppStore (/apps, services/app/appService):
 * dort geht es um installierbare Container-Apps, hier um Sichtbarkeit der
 * eingebauten Plattform-Apps.
 */

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validate');
const { NotFoundError } = require('../utils/errors');

/** Kuratierte Apps mit UI-Metadaten (Manifest-Grundstein für spätere Dritt-Apps). */
const APP_MANIFEST = [
  {
    id: 'n8n',
    name: 'n8n Automationen',
    description: 'Workflows und KI-Agenten — läuft inline als Automationen-Tab.',
    tab: 'automationen',
  },
];

const UpdateAppBody = z.object({ enabled: z.boolean() });

/** GET /api/workspace-apps — Manifest + Aktivierungszustand. */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await db.query('SELECT id, enabled FROM platform_apps');
    const stateById = new Map(result.rows.map(r => [r.id, r.enabled]));
    const apps = APP_MANIFEST.map(app => ({
      ...app,
      // Fehlende Zeile = aktiviert (Seeds legen die Zeilen an; defensiv true)
      enabled: stateById.has(app.id) ? stateById.get(app.id) === true : true,
    }));
    res.json({ apps });
  })
);

/** PUT /api/workspace-apps/:id — App aktivieren/deaktivieren. */
router.put(
  '/:id',
  requireAuth,
  validateBody(UpdateAppBody),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!APP_MANIFEST.some(app => app.id === id)) {
      throw new NotFoundError(`Unbekannte App: ${id}`);
    }
    const { enabled } = req.body;
    await db.query(
      `INSERT INTO platform_apps (id, enabled, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()`,
      [id, enabled]
    );
    res.json({ app: { id, enabled } });
  })
);

module.exports = router;
