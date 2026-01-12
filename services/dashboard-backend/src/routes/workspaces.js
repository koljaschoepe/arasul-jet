/**
 * Claude Code Workspaces API Routes
 * Manages dynamic workspace creation, listing, and configuration
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const db = require('../database');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

/**
 * GET /api/workspaces
 * List all active workspaces
 */
router.get('/', requireAuth, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT id, name, slug, description, host_path, container_path,
                   is_default, is_system, last_used_at, usage_count,
                   created_at, updated_at
            FROM claude_workspaces
            WHERE is_active = TRUE
            ORDER BY is_default DESC, usage_count DESC, name ASC
        `);

        res.json({
            workspaces: result.rows,
            total: result.rows.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error listing workspaces: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Laden der Workspaces',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/workspaces/:id
 * Get single workspace details
 */
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            SELECT id, name, slug, description, host_path, container_path,
                   is_default, is_system, last_used_at, usage_count,
                   created_at, updated_at
            FROM claude_workspaces
            WHERE (id = $1 OR slug = $1) AND is_active = TRUE
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Workspace nicht gefunden',
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            workspace: result.rows[0],
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error getting workspace: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Laden des Workspace',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/workspaces
 * Create a new workspace
 * Body: { name, description, hostPath }
 */
router.post('/', requireAuth, async (req, res) => {
    try {
        const { name, description, hostPath } = req.body;

        if (!name || !hostPath) {
            return res.status(400).json({
                error: 'Name und Host-Pfad sind erforderlich',
                timestamp: new Date().toISOString()
            });
        }

        // Validate name (alphanumeric, spaces, dashes, underscores)
        if (!/^[a-zA-Z0-9\s\-_äöüÄÖÜß]+$/.test(name)) {
            return res.status(400).json({
                error: 'Ungültiger Name. Nur Buchstaben, Zahlen, Leerzeichen und Bindestriche erlaubt.',
                timestamp: new Date().toISOString()
            });
        }

        // Generate slug from name
        const slug = name
            .toLowerCase()
            .replace(/[äöüß]/g, c => ({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' }[c]))
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

        if (slug.length < 2) {
            return res.status(400).json({
                error: 'Name ist zu kurz. Mindestens 2 Zeichen.',
                timestamp: new Date().toISOString()
            });
        }

        // Check if slug already exists
        const existingSlug = await db.query(
            'SELECT id FROM claude_workspaces WHERE slug = $1',
            [slug]
        );
        if (existingSlug.rows.length > 0) {
            return res.status(409).json({
                error: 'Ein Workspace mit diesem Namen existiert bereits',
                timestamp: new Date().toISOString()
            });
        }

        // Validate host path - must be absolute and start with allowed prefixes
        const allowedPrefixes = ['/home/arasul/', '/workspace/', '/tmp/'];
        const normalizedPath = path.normalize(hostPath);

        if (!path.isAbsolute(normalizedPath)) {
            return res.status(400).json({
                error: 'Host-Pfad muss ein absoluter Pfad sein',
                timestamp: new Date().toISOString()
            });
        }

        if (!allowedPrefixes.some(prefix => normalizedPath.startsWith(prefix))) {
            return res.status(400).json({
                error: `Host-Pfad muss mit einem der folgenden Präfixe beginnen: ${allowedPrefixes.join(', ')}`,
                timestamp: new Date().toISOString()
            });
        }

        // Check if path already exists or create it
        try {
            await fs.access(normalizedPath);
        } catch {
            // Create directory if it doesn't exist
            try {
                await fs.mkdir(normalizedPath, { recursive: true });
                logger.info(`Created workspace directory: ${normalizedPath}`);
            } catch (mkdirErr) {
                return res.status(400).json({
                    error: `Konnte Verzeichnis nicht erstellen: ${mkdirErr.message}`,
                    timestamp: new Date().toISOString()
                });
            }
        }

        // Container path follows pattern /workspace/{slug}
        const containerPath = `/workspace/${slug}`;

        // Insert workspace
        const result = await db.query(`
            INSERT INTO claude_workspaces (name, slug, description, host_path, container_path)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, name, slug, description, host_path, container_path,
                      is_default, is_system, created_at
        `, [name, slug, description || '', normalizedPath, containerPath]);

        logger.info(`Created workspace: ${name} (${slug}) -> ${normalizedPath}`);

        res.status(201).json({
            workspace: result.rows[0],
            message: 'Workspace erfolgreich erstellt',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error creating workspace: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Erstellen des Workspace',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * PUT /api/workspaces/:id
 * Update a workspace
 * Body: { name, description }
 */
router.put('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;

        // Check if workspace exists
        const existing = await db.query(
            'SELECT * FROM claude_workspaces WHERE id = $1 AND is_active = TRUE',
            [id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({
                error: 'Workspace nicht gefunden',
                timestamp: new Date().toISOString()
            });
        }

        const workspace = existing.rows[0];

        // System workspaces have limited updates
        if (workspace.is_system && name && name !== workspace.name) {
            return res.status(403).json({
                error: 'System-Workspaces können nicht umbenannt werden',
                timestamp: new Date().toISOString()
            });
        }

        // Update workspace
        const result = await db.query(`
            UPDATE claude_workspaces
            SET name = COALESCE($1, name),
                description = COALESCE($2, description)
            WHERE id = $3
            RETURNING id, name, slug, description, host_path, container_path,
                      is_default, is_system, updated_at
        `, [name, description, id]);

        logger.info(`Updated workspace: ${id}`);

        res.json({
            workspace: result.rows[0],
            message: 'Workspace aktualisiert',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error updating workspace: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Aktualisieren des Workspace',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * DELETE /api/workspaces/:id
 * Delete a workspace (soft delete)
 */
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if workspace exists and is not system
        const existing = await db.query(
            'SELECT * FROM claude_workspaces WHERE id = $1 AND is_active = TRUE',
            [id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({
                error: 'Workspace nicht gefunden',
                timestamp: new Date().toISOString()
            });
        }

        const workspace = existing.rows[0];

        if (workspace.is_system) {
            return res.status(403).json({
                error: 'System-Workspaces können nicht gelöscht werden',
                timestamp: new Date().toISOString()
            });
        }

        if (workspace.is_default) {
            return res.status(403).json({
                error: 'Der Standard-Workspace kann nicht gelöscht werden. Bitte zuerst einen anderen Standard setzen.',
                timestamp: new Date().toISOString()
            });
        }

        // Soft delete
        await db.query(
            'UPDATE claude_workspaces SET is_active = FALSE WHERE id = $1',
            [id]
        );

        logger.info(`Deleted workspace: ${id} (${workspace.name})`);

        res.json({
            success: true,
            message: 'Workspace gelöscht',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error deleting workspace: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Löschen des Workspace',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/workspaces/:id/default
 * Set workspace as default
 */
router.post('/:id/default', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if workspace exists
        const existing = await db.query(
            'SELECT * FROM claude_workspaces WHERE id = $1 AND is_active = TRUE',
            [id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({
                error: 'Workspace nicht gefunden',
                timestamp: new Date().toISOString()
            });
        }

        // Use the database function to set default
        await db.query('SELECT set_default_workspace($1)', [id]);

        logger.info(`Set default workspace: ${id}`);

        res.json({
            success: true,
            message: 'Standard-Workspace gesetzt',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error setting default workspace: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Setzen des Standard-Workspace',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/workspaces/:id/use
 * Mark workspace as used (increments usage count)
 */
router.post('/:id/use', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        await db.query('SELECT increment_workspace_usage($1)', [id]);

        res.json({
            success: true,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error incrementing workspace usage: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Aktualisieren der Nutzung',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/workspaces/volumes/list
 * Get list of volume bindings for all active workspaces
 * Used by appService to configure container mounts
 */
router.get('/volumes/list', requireAuth, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT host_path, container_path, slug
            FROM claude_workspaces
            WHERE is_active = TRUE
            ORDER BY id ASC
        `);

        const volumes = result.rows.map(row => ({
            name: row.host_path,
            containerPath: row.container_path,
            type: 'bind',
            slug: row.slug
        }));

        res.json({
            volumes,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error getting workspace volumes: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Laden der Volume-Konfiguration',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
