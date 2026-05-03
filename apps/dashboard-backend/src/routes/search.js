/**
 * Globale Suche (Phase 3.6)
 *
 * Aggregiert über Chats, Documents, Knowledge-Spaces und Settings-Pages.
 * Respektiert Multi-User-ACL aus Phase 1.1.
 *
 * GET /api/search?q=... → { chats: [], documents: [], spaces: [], settings: [] }
 */

const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { listAccessibleSpaceIds } = require('../middleware/requireOwnership');

const SETTINGS_INDEX = [
  { id: 'general', label: 'Allgemein', tab: 'general', keywords: ['allgemein', 'system', 'theme'] },
  {
    id: 'ai-profile',
    label: 'KI-Profil',
    tab: 'ai-profile',
    keywords: ['ki', 'profil', 'firma', 'unternehmen', 'persona'],
  },
  {
    id: 'security',
    label: 'Sicherheit',
    tab: 'security',
    keywords: ['sicherheit', 'passwort', 'login'],
  },
  {
    id: 'users',
    label: 'Benutzerverwaltung',
    tab: 'users',
    keywords: ['benutzer', 'user', 'mitarbeiter', 'rollen'],
  },
  {
    id: 'privacy',
    label: 'Datenschutz',
    tab: 'privacy',
    keywords: ['datenschutz', 'dsgvo', 'export', 'löschung'],
  },
  {
    id: 'compliance',
    label: 'Compliance',
    tab: 'compliance',
    keywords: ['compliance', 'telegram', 'transparenz', 'whitelist', 'n8n'],
  },
  {
    id: 'services',
    label: 'Services',
    tab: 'services',
    keywords: ['services', 'docker', 'neustart'],
  },
  {
    id: 'remote-access',
    label: 'Fernzugriff',
    tab: 'remote-access',
    keywords: ['tailscale', 'fernzugriff', 'remote', 'vpn'],
  },
  {
    id: 'n8n',
    label: 'n8n Integration',
    tab: 'n8n',
    keywords: ['n8n', 'workflow', 'integration', 'api-key'],
  },
  { id: 'updates', label: 'Updates', tab: 'updates', keywords: ['update', 'version', 'patches'] },
  {
    id: 'selfhealing',
    label: 'Self-Healing',
    tab: 'selfhealing',
    keywords: ['self-healing', 'autonom', 'agent'],
  },
];

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.json({
        query: q,
        chats: [],
        documents: [],
        spaces: [],
        settings: [],
        timestamp: new Date().toISOString(),
      });
    }
    const like = `%${q}%`;
    const isAdmin = req.user.role === 'admin';

    // 1. Chats — user-scoped
    const chatQuery = isAdmin
      ? `SELECT id, title, project_id, updated_at, message_count
           FROM chat_conversations
           WHERE deleted_at IS NULL AND title ILIKE $1
           ORDER BY updated_at DESC LIMIT 8`
      : `SELECT id, title, project_id, updated_at, message_count
           FROM chat_conversations
           WHERE deleted_at IS NULL AND user_id = $2 AND title ILIKE $1
           ORDER BY updated_at DESC LIMIT 8`;
    const chatParams = isAdmin ? [like] : [like, req.user.id];
    const chatResult = await db.query(chatQuery, chatParams);

    // 2. Documents — owner-scoped
    const docQuery = isAdmin
      ? `SELECT id, filename, title, status, uploaded_at, space_id
           FROM documents
           WHERE deleted_at IS NULL AND (filename ILIKE $1 OR title ILIKE $1)
           ORDER BY uploaded_at DESC LIMIT 8`
      : `SELECT id, filename, title, status, uploaded_at, space_id
           FROM documents
           WHERE deleted_at IS NULL AND owner_id = $2 AND (filename ILIKE $1 OR title ILIKE $1)
           ORDER BY uploaded_at DESC LIMIT 8`;
    const docParams = isAdmin ? [like] : [like, req.user.id];
    const docResult = await db.query(docQuery, docParams);

    // 3. Knowledge-Spaces — via ACL
    const accessibleSpaceIds = await listAccessibleSpaceIds(req.user);
    let spaceResult = { rows: [] };
    if (accessibleSpaceIds === null) {
      // Admin sees all
      spaceResult = await db.query(
        `SELECT id, name, slug, description FROM knowledge_spaces
         WHERE name ILIKE $1 OR description ILIKE $1
         ORDER BY name ASC LIMIT 8`,
        [like]
      );
    } else if (accessibleSpaceIds.length > 0) {
      spaceResult = await db.query(
        `SELECT id, name, slug, description FROM knowledge_spaces
         WHERE id = ANY($1::uuid[]) AND (name ILIKE $2 OR description ILIKE $2)
         ORDER BY name ASC LIMIT 8`,
        [accessibleSpaceIds, like]
      );
    }

    // 4. Settings — keyword-search local
    const qLower = q.toLowerCase();
    const settings = SETTINGS_INDEX.filter(
      s =>
        s.label.toLowerCase().includes(qLower) ||
        s.keywords.some(kw => kw.includes(qLower) || qLower.includes(kw))
    ).slice(0, 6);

    res.json({
      query: q,
      chats: chatResult.rows,
      documents: docResult.rows,
      spaces: spaceResult.rows,
      settings,
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
