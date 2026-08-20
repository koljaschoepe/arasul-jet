/**
 * Sandbox Service
 * Manages sandbox project lifecycle: create, list, start, stop, commit.
 * Each project gets a persistent Docker container with a bind-mounted workspace.
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const { docker } = require('../core/docker');
const { ValidationError, NotFoundError, ForbiddenError } = require('../../utils/errors');
const path = require('path');
const fs = require('fs');
const {
  CONTAINER_PREFIX,
  DEFAULT_IMAGE,
  NETWORK_NAME,
  SANDBOX_DATA_DIR,
  DEFAULT_RESOURCE_LIMITS,
  getHostDataDir,
  getHostToolsDir,
  getHostRepoDir,
  getHostProjectsDir,
  getDevTemplatesDir,
  getDockerSockGid,
  parseMemoryLimit,
} = require('./sandboxShared');

// Gültige Netzwerkmodi (CHECK-Constraint aus Migration 100).
// 'infrastructure' mountet Plattform-Repo (rw) + Docker-Socket — nur Admin.
const VALID_NETWORK_MODES = ['isolated', 'internal', 'infrastructure'];

// Gültige Sandbox-Typen (CHECK-Constraint aus Migration 115).
const VALID_WORKSPACE_TYPES = ['standard', 'erweiterungs-werkstatt'];

/**
 * Autorisierungs-Gate für den Infrastruktur-Modus: Rollenmodell ist
 * admin_users.role ('admin' | künftig 'viewer', Migration 068) — nur die
 * Admin-Rolle darf Infrastruktur-Projekte anlegen oder ein Projekt darauf
 * umstellen (Plan 001 §8: bewusst ohne zusätzliche Bestätigungs-Hürde).
 */
function assertInfrastructureAllowed(networkMode, userRole) {
  if (networkMode === 'infrastructure' && userRole !== 'admin') {
    throw new ForbiddenError('Der Infrastruktur-Modus ist Administratoren vorbehalten');
  }
}
const { checkIdleContainers, startIdleChecker, stopIdleChecker } = require('./sandboxIdleChecker');
const externalCredentialsService = require('./externalCredentialsService');

// ============================================================================
// Project CRUD
// ============================================================================

/**
 * Create a new sandbox project
 */
async function createProject({
  name,
  description,
  icon,
  color,
  baseImage,
  resourceLimits,
  environment,
  network_mode,
  workspaceType,
  project_id,
  userId,
  userRole,
}) {
  if (!userId) {
    throw new ValidationError('User-ID ist erforderlich');
  }
  if (!name || !name.trim()) {
    throw new ValidationError('Projektname ist erforderlich');
  }
  if (name.trim().length > 100) {
    throw new ValidationError('Projektname darf maximal 100 Zeichen lang sein');
  }

  // Build host path base (absolute path for Docker bind mounts)
  const hostBaseDir = await getHostDataDir();

  // Merge resource limits with defaults
  const limits = { ...DEFAULT_RESOURCE_LIMITS, ...(resourceLimits || {}) };

  // Validate network_mode — default is 'isolated' (bridge, no access to backend services)
  const netMode = VALID_NETWORK_MODES.includes(network_mode) ? network_mode : 'isolated';
  assertInfrastructureAllowed(netMode, userRole);

  // Validate workspace_type — default 'standard' (Plan 012 Phase E · Schritt 13).
  const wsType = VALID_WORKSPACE_TYPES.includes(workspaceType) ? workspaceType : 'standard';

  // Projektablage-Anschluss: nur an existierende Projekte — wirft NotFound bei
  // Geistern (und legt den Ablage-Ordner gleich an).
  if (project_id) {
    await require('../projects/ablageService').projektOrdner(project_id);
  }

  // Plan 008 Schritt 13: der Workspace-INSERT und die Anlage seines EINEN
  // unsichtbaren Wissensraums laufen atomar in einer Transaktion. Entweder der
  // Workspace bekommt seinen verknüpften Space (RAG-Scoping der Agenten) — oder
  // das Anlegen schlägt sauber fehl. So entsteht nie ein Space-loser Workspace,
  // dessen Agent mangels Scope über ALLE Wissensräume suchen (Isolation
  // fail-open) würde.
  const project = await db.transaction(async client => {
    // Generate slug via database function
    const slugResult = await client.query('SELECT generate_sandbox_slug($1) AS slug', [
      name.trim(),
    ]);
    const slug = slugResult.rows[0].slug;
    const hostPath = path.join(hostBaseDir, slug);

    const result = await client.query(
      `INSERT INTO sandbox_projects
        (name, slug, description, icon, color, base_image, host_path, container_path, resource_limits, environment, network_mode, workspace_type, project_id, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '/workspace', $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        name.trim(),
        slug,
        description || '',
        icon || 'terminal',
        color || '#45ADFF',
        baseImage || DEFAULT_IMAGE,
        hostPath,
        JSON.stringify(limits),
        JSON.stringify(environment || {}),
        netMode,
        wsType,
        project_id || null,
        userId,
      ]
    );
    const proj = result.rows[0];

    // Genau EIN unsichtbarer Wissensraum pro Workspace. is_system=TRUE schützt
    // ihn vor manuellem Löschen; is_workspace=TRUE blendet ihn aus der
    // Dokumenten-UI aus. Der Slug ist über generate_space_slug() garantiert
    // eindeutig (und nie leer, dank des 'workspace-'-Präfixes).
    const spaceSlugResult = await client.query('SELECT generate_space_slug($1) AS slug', [
      `workspace-${slug}`,
    ]);
    const spaceSlug = spaceSlugResult.rows[0].slug;
    // name ist VARCHAR(100) — den Präfix mit einrechnen.
    const spaceName = `Workspace: ${proj.name}`.slice(0, 100);
    const spaceDescription = `Automatischer Wissensraum für Workspace ${proj.name}`;

    const spaceResult = await client.query(
      `INSERT INTO knowledge_spaces
        (name, slug, description, icon, color, is_workspace, is_system)
       VALUES ($1, $2, $3, 'terminal', $4, TRUE, TRUE)
       RETURNING id`,
      [spaceName, spaceSlug, spaceDescription, proj.color || '#45ADFF']
    );
    const spaceId = spaceResult.rows[0].id;

    const updated = await client.query(
      `UPDATE sandbox_projects SET space_id = $1 WHERE id = $2 RETURNING *`,
      [spaceId, proj.id]
    );
    return updated.rows[0];
  });

  const slug = project.slug;

  // Audit: Anlage eines Infrastruktur-Projekts ist sicherheitsrelevant
  // (Repo rw + Docker-Socket beim Container-Start) — bewusst als warn.
  if (netMode === 'infrastructure') {
    logger.warn(
      `AUDIT: Infrastruktur-Sandbox-Projekt angelegt: "${project.name}" (${slug}) durch User ${userId}, Repo-rw- und Docker-Socket-Mount beim Container-Start`
    );
  }

  // Create project directory via container-local mount path
  const localPath = path.join(SANDBOX_DATA_DIR, slug);
  try {
    fs.mkdirSync(localPath, { recursive: true });
    logger.info(`Sandbox project created: ${project.name} (${slug})`);
  } catch (err) {
    logger.warn(`Could not create project dir ${localPath}: ${err.message}`);
  }

  // Erweiterungs-Werkstatt: mit Referenz-/Template-Wissen bestücken, damit
  // externe Agenten sofort wissen, wie man eine Arasul-Erweiterung baut
  // (Plan 012 Phase E · Schritt 13). Best-effort — ein fehlendes Template-
  // Verzeichnis (z. B. lokal ohne den ro-Mount) darf die Anlage nicht brechen.
  if (wsType === 'erweiterungs-werkstatt') {
    seedWerkstattTemplates(localPath);
  }

  return project;
}

/**
 * Kopiert die Werkstatt-Templates (ANLEITUNG.md + Beispiel-App/-Flow/-Tool)
 * rekursiv in einen frisch angelegten Sandbox-Ordner. Best-effort und
 * idempotent-freundlich: existierende Dateien werden nicht überschrieben.
 */
function seedWerkstattTemplates(targetDir) {
  const src = getDevTemplatesDir();
  try {
    if (!fs.existsSync(src)) {
      logger.warn(`Werkstatt-Templates nicht gefunden (${src}), Sandbox bleibt leer`);
      return;
    }
    fs.cpSync(src, targetDir, { recursive: true, force: false, errorOnExist: false });
    logger.info(`Werkstatt-Templates kopiert: ${src} → ${targetDir}`);
  } catch (err) {
    logger.warn(
      `Konnte Werkstatt-Templates nicht kopieren (${src} → ${targetDir}): ${err.message}`
    );
  }
}

/**
 * Container für ein Workspace-Projekt nachschlagen oder atomar anlegen+koppeln
 * (Plan 018: Projekt-Vereinheitlichung). Das Terminal leitet seinen Container
 * ab jetzt aus dem aktiven Workspace-Projekt ab — statt aus einer separaten
 * Projektauswahl. Existiert bereits ein aktiver, gekoppelter Container, wird er
 * zurückgegeben; sonst wird EINER angelegt (Netz-Default 'internal', damit der
 * Coder/RAG die Plattform-Dienste erreicht) und über `project_id` gekoppelt.
 *
 * Race-fest: der partielle Unique-Index auf sandbox_projects(project_id)
 * (Migration 139) verhindert zwei Container je Projekt; der Verlierer eines
 * Doppelklicks fängt 23505 ab und liest den Gewinner nach.
 */
async function ensureProjectContainer(workspaceProjectId, { userId, userRole } = {}) {
  const ref = String(workspaceProjectId || '').trim();
  if (!ref) {
    throw new ValidationError('project_id ist erforderlich');
  }
  // Workspace-Projekt muss existieren (404 bei Geistern) — nutzt dieselbe
  // Projekt-Ebene wie Explorer/Flows, damit Kopplung nie ins Leere zeigt.
  const wsProject = await require('../rag/projectService').getProject(ref);

  const lookup = async () => {
    const res = await db.query(
      `SELECT sp.*,
         au.username AS created_by,
         (SELECT COUNT(*) FROM sandbox_terminal_sessions st
          WHERE st.project_id = sp.id AND st.status = 'active') AS active_sessions
       FROM sandbox_projects sp
       LEFT JOIN admin_users au ON au.id = sp.user_id
       WHERE sp.project_id = $1 AND sp.status = 'active'
       LIMIT 1`,
      [ref]
    );
    return res.rows[0] || null;
  };

  const existing = await lookup();
  if (existing) {
    return { project: existing, created: false };
  }

  try {
    const project = await createProject({
      name: wsProject.name,
      network_mode: 'internal',
      project_id: ref,
      userId,
      userRole,
    });
    // createProject liefert die frische Zeile ohne die Join-Felder (created_by,
    // active_sessions) — für ein einheitliches Shape nachladen.
    const withMeta = await getProject(project.id);
    return { project: withMeta, created: true };
  } catch (err) {
    // Doppelklick-Race: der Unique-Index hat den zweiten Container verhindert.
    if (err.code === '23505') {
      const after = await lookup();
      if (after) {
        return { project: after, created: false };
      }
    }
    throw err;
  }
}

/**
 * List all projects with optional filters.
 * Plan 017 Schritt 1: Projekte sind geräteweit — KEIN Besitz-Filter mehr.
 * `created_by` (Username des Anlegers) bleibt zur Anzeige erhalten.
 */
async function listProjects({ status, search, limit = 50, offset = 0 } = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (status) {
    conditions.push(`sp.status = $${idx++}`);
    params.push(status);
  } else {
    // Default: only active projects
    conditions.push(`sp.status = 'active'`);
  }

  if (search) {
    conditions.push(`(sp.name ILIKE $${idx} OR sp.description ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db.query(
    `SELECT COUNT(*) FROM sandbox_projects sp ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count);

  const boundedLimit = Math.min(Math.max(1, parseInt(limit) || 50), 100);
  const boundedOffset = Math.max(0, parseInt(offset) || 0);

  const result = await db.query(
    `SELECT sp.*,
       au.username AS created_by,
       (SELECT COUNT(*) FROM sandbox_terminal_sessions st
        WHERE st.project_id = sp.id AND st.status = 'active') AS active_sessions
     FROM sandbox_projects sp
     LEFT JOIN admin_users au ON au.id = sp.user_id
     ${whereClause}
     ORDER BY sp.last_accessed_at DESC NULLS LAST, sp.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    [...params, boundedLimit, boundedOffset]
  );

  return { projects: result.rows, total, limit: boundedLimit, offset: boundedOffset };
}

/**
 * Get a single project by ID.
 * Geräteweit (Plan 017 Schritt 1): jeder angemeldete Nutzer darf jedes Projekt
 * öffnen — der frühere Besitz-Filter entfällt.
 */
async function getProject(projectId) {
  const result = await db.query(
    `SELECT sp.*,
       au.username AS created_by,
       (SELECT COUNT(*) FROM sandbox_terminal_sessions st
        WHERE st.project_id = sp.id AND st.status = 'active') AS active_sessions
     FROM sandbox_projects sp
     LEFT JOIN admin_users au ON au.id = sp.user_id
     WHERE sp.id = $1`,
    [projectId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Projekt nicht gefunden');
  }

  return result.rows[0];
}

/**
 * Update project metadata
 */
async function updateProject(
  projectId,
  { name, description, icon, color, environment, resourceLimits, network_mode, project_id },
  userId,
  userRole
) {
  // Verify project exists (geräteweit — userId dient nur noch dem Audit-Log)
  await getProject(projectId);

  const setClauses = ['updated_at = NOW()'];
  const params = [];
  let idx = 1;

  if (name !== undefined) {
    if (!name.trim()) {
      throw new ValidationError('Projektname darf nicht leer sein');
    }
    if (name.trim().length > 100) {
      throw new ValidationError('Projektname darf maximal 100 Zeichen lang sein');
    }
    setClauses.push(`name = $${idx++}`);
    params.push(name.trim());
  }
  if (description !== undefined) {
    setClauses.push(`description = $${idx++}`);
    params.push(description);
  }
  if (icon !== undefined) {
    setClauses.push(`icon = $${idx++}`);
    params.push(icon);
  }
  if (color !== undefined) {
    setClauses.push(`color = $${idx++}`);
    params.push(color);
  }
  if (environment !== undefined) {
    setClauses.push(`environment = $${idx++}`);
    params.push(JSON.stringify(environment));
  }
  if (resourceLimits !== undefined) {
    const limits = { ...DEFAULT_RESOURCE_LIMITS, ...resourceLimits };
    setClauses.push(`resource_limits = $${idx++}`);
    params.push(JSON.stringify(limits));
  }
  if (network_mode !== undefined) {
    if (!VALID_NETWORK_MODES.includes(network_mode)) {
      throw new ValidationError(`Ungültiger Netzwerkmodus: ${network_mode}`);
    }
    assertInfrastructureAllowed(network_mode, userRole);
    if (network_mode === 'infrastructure') {
      logger.warn(
        `AUDIT: Sandbox-Projekt ${projectId} auf Infrastruktur-Modus umgestellt durch User ${userId}, Repo-rw- und Docker-Socket-Mount beim nächsten Container-Start`
      );
    }
    setClauses.push(`network_mode = $${idx++}`);
    params.push(network_mode);
  }
  if (project_id !== undefined) {
    // Anschluss wechseln oder (null) trennen. Der Mount greift beim nächsten
    // Container-Start — ein laufender Container behält seine Binds.
    if (project_id) {
      await require('../projects/ablageService').projektOrdner(project_id);
    }
    setClauses.push(`project_id = $${idx++}`);
    params.push(project_id || null);
  }

  const result = await db.query(
    `UPDATE sandbox_projects SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    [...params, projectId]
  );

  return result.rows[0];
}

/**
 * Delete (archive) a project
 */
async function deleteProject(projectId) {
  const project = await getProject(projectId);

  // Stop container if running
  if (project.container_status === 'running') {
    await stopContainer(projectId);
  }

  // Remove container if it exists
  if (project.container_id) {
    try {
      const container = docker.getContainer(project.container_id);
      await container.remove({ force: true });
      logger.info(`Sandbox container removed: ${project.container_name}`);
    } catch (err) {
      if (err.statusCode !== 404) {
        logger.warn(`Could not remove container: ${err.message}`);
      }
    }
  }

  // Archive the project (soft delete)
  await db.query(
    `UPDATE sandbox_projects
     SET status = 'archived', container_id = NULL, container_name = NULL, container_status = 'none'
     WHERE id = $1`,
    [projectId]
  );

  logger.info(`Sandbox project archived: ${project.name}`);
  return { success: true, id: projectId };
}

// ============================================================================
// Container Lifecycle
// ============================================================================

/**
 * Start (or create) the container for a project.
 * Plan 017 Schritt 1: der Status-Wechsel nach 'creating' ist ein atomarer
 * bedingter UPDATE — zwei gleichzeitige Start-Klicks können den Container
 * nicht mehr doppelt anlegen; der Verlierer bekommt eine freundliche
 * "läuft schon"-Antwort statt eines error-Status.
 */
async function startContainer(projectId) {
  // Existenz-Check (404 bei unbekanntem Projekt) — der eigentliche Claim folgt atomar.
  await getProject(projectId);

  const claim = await db.query(
    `UPDATE sandbox_projects SET container_status = 'creating'
     WHERE id = $1 AND container_status NOT IN ('running', 'creating', 'committing')
     RETURNING *`,
    [projectId]
  );
  if (claim.rows.length === 0) {
    return { success: true, message: 'Container läuft bereits oder wird gerade verarbeitet' };
  }
  const project = claim.rows[0];

  try {
    // If container exists (was stopped), just start it
    if (project.container_id) {
      try {
        const existing = docker.getContainer(project.container_id);
        const info = await existing.inspect();

        if (info.State.Status === 'exited' || info.State.Status === 'created') {
          await existing.start();
          await db.query(
            `UPDATE sandbox_projects
             SET container_status = 'running', last_accessed_at = NOW()
             WHERE id = $1`,
            [projectId]
          );
          // Plan 008 Schritt 14: einmal eingeloggten Claude-Login wieder in den
          // Container spielen, sobald er läuft. Best-effort — ein Restore-Fehler
          // darf den Start nie blockieren.
          await externalCredentialsService.restoreClaudeLoginBestEffort(project.user_id, {
            container_id: project.container_id,
            container_name: project.container_name,
          });
          // Zentralen KI-Zugang in den (wieder-)gestarteten Container spielen.
          await externalCredentialsService.applyCentralAuthBestEffort(project.user_id, {
            container_id: project.container_id,
            container_name: project.container_name,
          });

          logger.info(`Sandbox container started: ${project.container_name}`);
          return { success: true, message: 'Container gestartet' };
        }

        if (info.State.Status === 'running') {
          await db.query(`UPDATE sandbox_projects SET container_status = 'running' WHERE id = $1`, [
            projectId,
          ]);
          return { success: true, message: 'Container läuft bereits' };
        }
      } catch (err) {
        if (err.statusCode === 404) {
          // Container was removed externally, create a new one
          logger.info(`Container ${project.container_id} not found, creating new one`);
        } else {
          throw err;
        }
      }
    }

    // Create new container
    const containerName = `${CONTAINER_PREFIX}${project.slug}`;
    const limits = project.resource_limits || DEFAULT_RESOURCE_LIMITS;

    // Determine image: use committed image if available, otherwise base_image
    let image = project.committed_image || project.base_image || DEFAULT_IMAGE;

    // Verify committed image still exists (may have been pruned)
    if (project.committed_image) {
      try {
        await docker.getImage(image).inspect();
      } catch (imgErr) {
        if (imgErr.statusCode === 404) {
          logger.warn(
            `Committed image ${image} not found, falling back to ${project.base_image || DEFAULT_IMAGE}`
          );
          image = project.base_image || DEFAULT_IMAGE;
          await db.query('UPDATE sandbox_projects SET committed_image = NULL WHERE id = $1', [
            projectId,
          ]);
        }
      }
    }

    // Ensure project directory exists via container-local path
    const hostPath = project.host_path;
    const localPath = path.join(SANDBOX_DATA_DIR, project.slug);
    try {
      fs.mkdirSync(localPath, { recursive: true });
    } catch (err) {
      logger.warn(`Could not create dir ${localPath}: ${err.message}`);
    }

    // Build environment array
    const envVars = [`SANDBOX_PROJECT=${project.slug}`];
    // Default Ollama endpoint for local agents (open-ara). Only reachable with
    // network_mode 'internal'; in 'isolated' mode the call fails cleanly.
    // Project-level environment (SANDBOX_ENV_JSON, exported by entrypoint.sh)
    // can override it per shell session.
    envVars.push('ARASUL_OLLAMA_URL=http://llm-service:11434');
    // Default-Coder-Modell für den lokalen Agenten (open-ara/Preflight). Per
    // Projekt-Env (SANDBOX_ENV_JSON) oder ARASUL_MODEL im Shell override-bar.
    envVars.push('ARASUL_MODEL=qwen3-coder:30b');
    if (project.environment && typeof project.environment === 'object') {
      envVars.push(`SANDBOX_ENV_JSON=${JSON.stringify(project.environment)}`);
    }

    // Zentraler KI-Zugang (Plan 013): einmal in den Einstellungen hinterlegtes
    // Abo-Token / API-Key als Umgebungsvariable in JEDE Sandbox — so ist `claude`
    // im Terminal sofort angemeldet, ohne interaktiven Login. `docker exec`-Shells
    // erben diese Container-Env.
    try {
      const authEnv = await externalCredentialsService.getCentralAuthEnv(project.user_id);
      for (const [k, v] of Object.entries(authEnv)) {
        envVars.push(`${k}=${v}`);
      }
    } catch (err) {
      logger.warn(`Zentralen KI-Zugang nicht ermittelt: ${err.message}`);
    }

    // Remove existing container with same name (zombie cleanup)
    try {
      const zombie = docker.getContainer(containerName);
      await zombie.remove({ force: true });
    } catch (err) {
      // Ignore 404 — no zombie
    }

    // Determine network mode: 'isolated' (bridge, default), 'internal' oder
    // 'infrastructure' (Netz wie internal + Repo-/Socket-Mounts, nur Admin).
    const isInfrastructure = project.network_mode === 'infrastructure';
    const networkMode =
      project.network_mode === 'internal' || isInfrastructure ? NETWORK_NAME : 'bridge';

    // Read-only tool sources (e.g. open-ara) — sibling of the projects dir
    const hostToolsDir = await getHostToolsDir();

    const binds = [`${hostPath}:/workspace`, `${hostToolsDir}:/opt/tools:ro`];

    // Projektablage-Anschluss: der Ablage-Ordner des verbundenen Projekts wird
    // rw als /workspace/projekt eingebunden — was der Agent dort baut, liegt
    // sofort in data/projects/<uuid> und damit im Explorer.
    if (project.project_id) {
      try {
        // Ordner container-lokal sicherstellen (sonst legte Docker ihn als
        // root an) — projektOrdner validiert zugleich, dass es das Projekt
        // noch gibt.
        await require('../projects/ablageService').projektOrdner(project.project_id);
        const hostProjectsDir = await getHostProjectsDir();
        binds.push(`${hostProjectsDir}/${project.project_id}:/workspace/projekt:rw`);
      } catch (err) {
        // Verwaister Anschluss (Projekt gelöscht): Container ohne Mount starten,
        // statt die ganze Sandbox zu blockieren.
        logger.warn(`Sandbox "${project.slug}": Projektablage-Mount übersprungen: ${err.message}`);
      }
    }
    const hostConfig = {
      Binds: binds,
      NetworkMode: networkMode,
      RestartPolicy: { Name: 'unless-stopped' },
      Memory: parseMemoryLimit(limits.memory),
      NanoCpus: Math.round(parseFloat(limits.cpus || '2') * 1e9),
      PidsLimit: parseInt(limits.pids || '128'),
      // Härtung gilt für ALLE Modi — auch 'infrastructure' wird nicht
      // gelockert: Docker-Socket-Zugriff braucht keine Caps, nur die
      // Gruppenmitgliedschaft der Socket-GID (GroupAdd unten).
      SecurityOpt: ['no-new-privileges:true'],
      CapDrop: ['ALL'],
      CapAdd: ['NET_BIND_SERVICE'],
      Tmpfs: { '/tmp': 'noexec,nosuid,size=256M' },
    };

    if (isInfrastructure) {
      const hostRepoDir = await getHostRepoDir();
      const sockGid = getDockerSockGid();
      binds.push(`${hostRepoDir}:/workspace/repo:rw`);
      binds.push('/var/run/docker.sock:/var/run/docker.sock');
      hostConfig.GroupAdd = [String(sockGid)];
      logger.warn(
        `AUDIT: Infrastruktur-Container startet für Projekt "${project.name}" (${project.slug}): Repo ${hostRepoDir} rw + Docker-Socket (GID ${sockGid})`
      );
    }

    const containerConfig = {
      Image: image,
      name: containerName,
      Hostname: `sandbox-${project.slug}`,
      Env: envVars,
      WorkingDir: '/workspace',
      HostConfig: hostConfig,
    };

    const container = await docker.createContainer(containerConfig);
    await container.start();

    await db.query(
      `UPDATE sandbox_projects
       SET container_id = $1, container_name = $2, container_status = 'running', last_accessed_at = NOW()
       WHERE id = $3`,
      [container.id, containerName, projectId]
    );

    // Plan 008 Schritt 14: gespeicherten Claude-Login in den frischen Container
    // spielen (best-effort — blockiert den Start nie).
    await externalCredentialsService.restoreClaudeLoginBestEffort(project.user_id, {
      container_id: container.id,
      container_name: containerName,
    });
    // Zentralen KI-Zugang zusätzlich als gesourcte Profildatei ablegen (belt &
    // suspenders neben der Container-Env; wirkt auch nach einem Env-Reset).
    await externalCredentialsService.applyCentralAuthBestEffort(project.user_id, {
      container_id: container.id,
      container_name: containerName,
    });

    logger.info(`Sandbox container created and started: ${containerName}`);
    return { success: true, containerId: container.id, containerName };
  } catch (err) {
    await db.query(`UPDATE sandbox_projects SET container_status = 'error' WHERE id = $1`, [
      projectId,
    ]);
    logger.error(`Sandbox container start failed for ${project.slug}: ${err.message}`);
    throw err;
  }
}

/**
 * Stop the container for a project (preserves container state)
 */
async function stopContainer(projectId) {
  const project = await getProject(projectId);

  if (
    !project.container_id ||
    project.container_status === 'stopped' ||
    project.container_status === 'none'
  ) {
    return { success: true, message: 'Container ist bereits gestoppt' };
  }

  try {
    const container = docker.getContainer(project.container_id);
    await container.stop({ t: 10 });
  } catch (err) {
    if (err.statusCode === 304) {
      // Already stopped
    } else if (err.statusCode === 404) {
      // Container gone
      await db.query(
        `UPDATE sandbox_projects SET container_id = NULL, container_name = NULL, container_status = 'none' WHERE id = $1`,
        [projectId]
      );
      return { success: true, message: 'Container existiert nicht mehr' };
    } else {
      throw err;
    }
  }

  // Close all active terminal sessions (in-memory WebSocket/stream cleanup + DB update)
  // Lazy require to avoid circular dependency (terminalService requires sandboxService)
  const terminalService = require('./terminalService');
  await terminalService.closeProjectSessions(projectId);
  await db.query(
    `UPDATE sandbox_terminal_sessions SET status = 'closed', ended_at = NOW()
     WHERE project_id = $1 AND status = 'active'`,
    [projectId]
  );

  await db.query(`UPDATE sandbox_projects SET container_status = 'stopped' WHERE id = $1`, [
    projectId,
  ]);

  logger.info(`Sandbox container stopped: ${project.container_name}`);
  return { success: true };
}

/**
 * Commit container state as a new image (preserves installed packages)
 */
async function commitContainer(projectId) {
  const project = await getProject(projectId);

  if (!project.container_id) {
    throw new ValidationError('Kein Container vorhanden zum Speichern');
  }

  await db.query(`UPDATE sandbox_projects SET container_status = 'committing' WHERE id = $1`, [
    projectId,
  ]);

  try {
    const container = docker.getContainer(project.container_id);
    const imageName = `arasul-sandbox-${project.slug}`;
    const tag = 'latest';

    await container.commit({
      repo: imageName,
      tag,
      comment: `Sandbox snapshot for project: ${project.name}`,
    });

    // Restore previous status
    const info = await container.inspect();
    const newStatus = info.State.Running ? 'running' : 'stopped';

    await db.query(
      `UPDATE sandbox_projects SET committed_image = $1, container_status = $2 WHERE id = $3`,
      [`${imageName}:${tag}`, newStatus, projectId]
    );

    logger.info(`Sandbox container committed: ${imageName}:${tag}`);
    return { success: true, image: `${imageName}:${tag}` };
  } catch (err) {
    // Restore status on error
    await db.query(
      `UPDATE sandbox_projects SET container_status = 'running' WHERE id = $1 AND container_status = 'committing'`,
      [projectId]
    );
    throw err;
  }
}

/**
 * Get live container status from Docker (not just DB)
 */
async function getContainerStatus(projectId) {
  const project = await getProject(projectId);

  if (!project.container_id) {
    return { status: 'none', running: false };
  }

  try {
    const container = docker.getContainer(project.container_id);
    const info = await container.inspect();

    const status = {
      running: info.State.Running,
      status: info.State.Status,
      startedAt: info.State.StartedAt,
      pid: info.State.Pid,
      exitCode: info.State.ExitCode,
    };

    // Sync DB if status diverged
    const dbStatus = info.State.Running ? 'running' : 'stopped';
    if (
      project.container_status !== dbStatus &&
      project.container_status !== 'creating' &&
      project.container_status !== 'committing'
    ) {
      await db.query(`UPDATE sandbox_projects SET container_status = $1 WHERE id = $2`, [
        dbStatus,
        projectId,
      ]);
    }

    return status;
  } catch (err) {
    if (err.statusCode === 404) {
      await db.query(
        `UPDATE sandbox_projects SET container_id = NULL, container_name = NULL, container_status = 'none' WHERE id = $1`,
        [projectId]
      );
      return { status: 'none', running: false };
    }
    throw err;
  }
}

/**
 * Get sandbox statistics
 */
async function getStatistics() {
  const result = await db.query('SELECT * FROM get_sandbox_statistics()');
  return result.rows[0];
}

// Der Leerlaufprüfer startete früher hier, beim Laden des Moduls. Das hieß: jede
// Testdatei, die irgendwo über die Routen an dieses Modul kam, legte eine eigene
// Uhr an, und die feuerte danach in einer abgebauten Umgebung. Gestartet wird
// jetzt beim Hochfahren des Servers, wie beim Ordner-Abgleich auch (index.js).
// Der Prüfer lädt `stopContainer` weiterhin verzögert aus diesem Modul.

/**
 * Lädt einen aktiven Workspace per Id oder Slug. Geräteweit (Plan 017
 * Schritt 1): das frühere Owner-or-Admin-Gate entfällt — jeder angemeldete
 * Nutzer darf jeden Workspace auflösen. Auth (requireAuth) bleibt Pflicht;
 * nutzergebundene Dinge (KI-Zugänge, WS-Tickets) bleiben pro Nutzer.
 */
const WORKSPACE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadWorkspace(workspaceRef) {
  const ref = String(workspaceRef || '').trim();
  if (!ref) {
    throw new NotFoundError('Workspace nicht gefunden');
  }
  const byId = WORKSPACE_UUID_RE.test(ref);
  const result = await db.query(
    `SELECT * FROM sandbox_projects
     WHERE ${byId ? 'id' : 'slug'} = $1 AND status = 'active'
     LIMIT 1`,
    [ref]
  );
  const project = result.rows[0];
  if (!project) {
    throw new NotFoundError(`Workspace "${workspaceRef}" nicht gefunden`);
  }
  return project;
}

module.exports = {
  loadWorkspace,
  createProject,
  ensureProjectContainer,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
  startContainer,
  stopContainer,
  commitContainer,
  getContainerStatus,
  getStatistics,
  checkIdleContainers,
  startIdleChecker,
  stopIdleChecker,
  CONTAINER_PREFIX,
  DEFAULT_IMAGE,
};
